package backend

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"ant-chrome/backend/internal/logger"

	"github.com/gorilla/websocket"
)

// ============================================================================
// Cookie 管理 API（通过 CDP）
// ============================================================================

// CookieInfo 表示单条浏览器 Cookie
type CookieInfo struct {
	Name     string  `json:"name"`
	Value    string  `json:"value"`
	Domain   string  `json:"domain"`
	Path     string  `json:"path"`
	Expires  float64 `json:"expires"`
	HttpOnly bool    `json:"httpOnly"`
	Secure   bool    `json:"secure"`
	SameSite string  `json:"sameSite"`
}

type CookieImportResult struct {
	Imported int `json:"imported"`
	Skipped  int `json:"skipped"`
}

// cdpTarget 表示 /json 接口返回的调试目标
type cdpTarget struct {
	Id                   string `json:"id"`
	Title                string `json:"title"`
	Url                  string `json:"url"`
	Attached             bool   `json:"attached"`
	WebSocketDebuggerUrl string `json:"webSocketDebuggerUrl"`
	Type                 string `json:"type"`
}

type cdpBrowserVersion struct {
	WebSocketDebuggerUrl string `json:"webSocketDebuggerUrl"`
}

// cdpMessage 是 CDP 协议消息结构
type cdpMessage struct {
	Id     int            `json:"id"`
	Method string         `json:"method,omitempty"`
	Params map[string]any `json:"params,omitempty"`
}

// cdpResponse 是 CDP 协议响应结构
type cdpResponse struct {
	Id     int            `json:"id"`
	Result map[string]any `json:"result,omitempty"`
	Error  *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// cdpCall 向指定 debugPort 发送单次 CDP 命令并返回 result 字段
func cdpCall(debugPort int, method string, params map[string]any) (map[string]any, error) {
	// 1. 获取 WebSocket 调试地址
	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/json", debugPort))
	if err != nil {
		return nil, fmt.Errorf("CDP /json 请求失败: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var targets []cdpTarget
	if err := json.Unmarshal(body, &targets); err != nil || len(targets) == 0 {
		return nil, fmt.Errorf("CDP targets 解析失败或为空")
	}

	wsURL := ""
	for _, t := range targets {
		if t.Type == "page" && t.WebSocketDebuggerUrl != "" {
			wsURL = t.WebSocketDebuggerUrl
			break
		}
	}
	if wsURL == "" && targets[0].WebSocketDebuggerUrl != "" {
		wsURL = targets[0].WebSocketDebuggerUrl
	}
	if wsURL == "" {
		return nil, fmt.Errorf("未找到可用的 WebSocket 调试地址")
	}

	// 2. 建立 WebSocket 连接
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("WebSocket 连接失败: %w", err)
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	// 3. 发送 CDP 命令
	msg := cdpMessage{Id: 1, Method: method, Params: params}
	if err := conn.WriteJSON(msg); err != nil {
		return nil, fmt.Errorf("CDP 命令发送失败: %w", err)
	}

	// 4. 等待响应
	var cdpResp cdpResponse
	if err := conn.ReadJSON(&cdpResp); err != nil {
		return nil, fmt.Errorf("CDP 响应读取失败: %w", err)
	}
	if cdpResp.Error != nil {
		return nil, fmt.Errorf("CDP 错误: %s", cdpResp.Error.Message)
	}
	return cdpResp.Result, nil
}

func cdpBrowserCall(debugPort int, method string, params map[string]any) error {
	_, err := cdpBrowserCallResult(debugPort, method, params)
	return err
}

func cdpBrowserCallResult(debugPort int, method string, params map[string]any) (map[string]any, error) {
	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/json/version", debugPort))
	if err != nil {
		return nil, fmt.Errorf("CDP /json/version 请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var version cdpBrowserVersion
	if err := json.Unmarshal(body, &version); err != nil {
		return nil, fmt.Errorf("CDP browser target 解析失败: %w", err)
	}
	wsURL := strings.TrimSpace(version.WebSocketDebuggerUrl)
	if wsURL == "" {
		return nil, fmt.Errorf("未找到浏览器级 WebSocket 调试地址")
	}

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("浏览器级 WebSocket 连接失败: %w", err)
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(3 * time.Second))

	msg := cdpMessage{Id: 1, Method: method, Params: params}
	if err := conn.WriteJSON(msg); err != nil {
		return nil, fmt.Errorf("浏览器级 CDP 命令发送失败: %w", err)
	}

	var cdpResp cdpResponse
	if err := conn.ReadJSON(&cdpResp); err != nil {
		// Browser.close 可能会直接关闭 websocket，视为成功。
		if strings.EqualFold(method, "Browser.close") {
			return nil, nil
		}
		return nil, fmt.Errorf("浏览器级 CDP 响应读取失败: %w", err)
	}
	if cdpResp.Error != nil {
		return nil, fmt.Errorf("浏览器级 CDP 错误: %s", cdpResp.Error.Message)
	}
	return cdpResp.Result, nil
}

// getDebugPort 获取运行中实例的调试端口
func (a *App) getDebugPort(profileId string) (int, error) {
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists {
		return 0, fmt.Errorf("profile not found: %s", profileId)
	}
	if !profile.Running {
		return 0, fmt.Errorf("实例未运行")
	}
	if profile.DebugPort == 0 || !profile.DebugReady {
		return 0, fmt.Errorf("实例调试接口尚未就绪，请稍后重试")
	}
	return profile.DebugPort, nil
}

// BrowserGetCookies 通过 CDP 获取实例所有 Cookie
func (a *App) BrowserGetCookies(profileId string) ([]CookieInfo, error) {
	debugPort, err := a.getDebugPort(profileId)
	if err != nil {
		return nil, err
	}

	result, err := cdpCall(debugPort, "Network.getAllCookies", nil)
	if err != nil {
		return nil, err
	}

	cookiesRaw, ok := result["cookies"]
	if !ok {
		return []CookieInfo{}, nil
	}

	// 通过 JSON 二次解析
	data, _ := json.Marshal(cookiesRaw)
	var cookies []CookieInfo
	if err := json.Unmarshal(data, &cookies); err != nil {
		return nil, fmt.Errorf("Cookie 解析失败: %w", err)
	}
	return cookies, nil
}

// BrowserClearCookies 清理实例 Cookie。
// 实例运行且调试接口就绪时通过 CDP 清除 Cookie；实例未运行时清空该实例用户数据目录。
func (a *App) BrowserClearCookies(profileId string) error {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return fmt.Errorf("profile id is required")
	}
	if a == nil || a.browserMgr == nil {
		return fmt.Errorf("browser manager is not initialized")
	}

	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists || profile == nil {
		a.browserMgr.Mutex.Unlock()
		return fmt.Errorf("profile not found: %s", profileId)
	}
	snapshot := *profile
	a.browserMgr.Mutex.Unlock()

	if !snapshot.Running {
		return a.clearStoppedProfileUserData(&snapshot)
	}

	debugPort, err := a.getDebugPort(profileId)
	if err != nil {
		return err
	}
	_, err = cdpCall(debugPort, "Network.clearBrowserCookies", nil)
	return err
}

func (a *App) clearStoppedProfileUserData(profile *BrowserProfile) error {
	userDataDir, err := a.safeProfileUserDataDir(profile)
	if err != nil {
		return err
	}
	if userDataDir == "" {
		return nil
	}
	if err := os.MkdirAll(userDataDir, 0755); err != nil {
		return fmt.Errorf("创建实例用户数据目录失败: %w", err)
	}
	entries, err := os.ReadDir(userDataDir)
	if err != nil {
		return fmt.Errorf("读取实例用户数据目录失败: %w", err)
	}
	for _, entry := range entries {
		target := filepath.Join(userDataDir, entry.Name())
		if err := os.RemoveAll(target); err != nil {
			return fmt.Errorf("清理实例用户数据失败: %w", err)
		}
	}
	if err := a.regenerateStoppedProfileFingerprint(profile.ProfileId); err != nil {
		return err
	}
	logger.New("Browser").Info("未运行实例用户数据目录已清空，指纹已重新生成", logger.F("profile_id", profile.ProfileId), logger.F("path", userDataDir))
	return nil
}

func (a *App) regenerateStoppedProfileFingerprint(profileId string) error {
	if a == nil || a.browserMgr == nil {
		return fmt.Errorf("browser manager is not initialized")
	}
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()

	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists || profile == nil {
		return fmt.Errorf("profile not found: %s", profileId)
	}
	if profile.Running {
		return fmt.Errorf("实例已运行，无法在清空用户数据目录后重置指纹")
	}
	var defaultFingerprintArgs []string
	if a.browserMgr.Config != nil {
		defaultFingerprintArgs = a.browserMgr.Config.Browser.DefaultFingerprintArgs
	}
	profile.FingerprintArgs = regenerateFingerprintArgsForProfileReset(profile.FingerprintArgs, defaultFingerprintArgs)
	profile.UpdatedAt = time.Now().Format(time.RFC3339)
	if err := a.browserMgr.SaveProfiles(); err != nil {
		return fmt.Errorf("保存重新生成的实例指纹失败: %w", err)
	}
	return nil
}

func parseNetscapeCookies(text string) ([]CookieInfo, int, error) {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	cookies := make([]CookieInfo, 0)
	skipped := 0
	for idx, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Split(raw, "\t")
		if len(parts) < 7 {
			parts = strings.Fields(raw)
		}
		if len(parts) < 7 {
			skipped++
			continue
		}

		expires := float64(0)
		if parts[4] != "" {
			var parsed int64
			if _, err := fmt.Sscanf(parts[4], "%d", &parsed); err != nil {
				return nil, skipped, fmt.Errorf("第 %d 行过期时间无效", idx+1)
			}
			expires = float64(parsed)
		}

		domain := strings.TrimSpace(parts[0])
		path := strings.TrimSpace(parts[2])
		name := strings.TrimSpace(parts[5])
		value := strings.Join(parts[6:], "\t")
		if domain == "" || path == "" || name == "" {
			skipped++
			continue
		}

		cookies = append(cookies, CookieInfo{
			Name:    name,
			Value:   value,
			Domain:  domain,
			Path:    path,
			Expires: expires,
			Secure:  strings.EqualFold(parts[3], "TRUE"),
		})
	}
	return cookies, skipped, nil
}

// BrowserImportCookies 导入 Netscape 格式 Cookie 文本
func (a *App) BrowserImportCookies(profileId string, content string) (CookieImportResult, error) {
	debugPort, err := a.getDebugPort(profileId)
	if err != nil {
		return CookieImportResult{}, err
	}
	cookies, skipped, err := parseNetscapeCookies(content)
	if err != nil {
		return CookieImportResult{}, err
	}
	if len(cookies) == 0 {
		return CookieImportResult{Skipped: skipped}, fmt.Errorf("未解析到可导入的 Cookie")
	}

	payload := make([]map[string]any, 0, len(cookies))
	now := float64(time.Now().Unix())
	for _, c := range cookies {
		item := map[string]any{
			"name":   c.Name,
			"value":  c.Value,
			"domain": c.Domain,
			"path":   c.Path,
			"secure": c.Secure,
		}
		if c.Expires > now {
			item["expires"] = c.Expires
		}
		payload = append(payload, item)
	}

	if _, err := cdpCall(debugPort, "Network.setCookies", map[string]any{"cookies": payload}); err != nil {
		return CookieImportResult{}, err
	}
	return CookieImportResult{Imported: len(payload), Skipped: skipped}, nil
}

// BrowserExportCookies 导出 Netscape 格式 Cookie 字符串
func (a *App) BrowserExportCookies(profileId string) (string, error) {
	cookies, err := a.BrowserGetCookies(profileId)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString("# Netscape HTTP Cookie File\n")
	sb.WriteString("# Generated by BrowserManager\n\n")

	for _, c := range cookies {
		includeSubdomains := "FALSE"
		if strings.HasPrefix(c.Domain, ".") {
			includeSubdomains = "TRUE"
		}
		secure := "FALSE"
		if c.Secure {
			secure = "TRUE"
		}
		expires := int64(c.Expires)
		if expires < 0 {
			expires = 0
		}
		sb.WriteString(fmt.Sprintf("%s\t%s\t%s\t%s\t%d\t%s\t%s\n",
			c.Domain, includeSubdomains, c.Path, secure, expires, c.Name, c.Value))
	}
	return sb.String(), nil
}
