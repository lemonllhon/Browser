package backend

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	switchProxyControlPath        = "/__trace_browser_switch_proxy_now"
	switchProxyControlTokenHeader = "X-Trace-Switch-Token"
)

type switchProxyControlResponse struct {
	OK        bool   `json:"ok"`
	ProxyID   string `json:"proxyId,omitempty"`
	ProxyName string `json:"proxyName,omitempty"`
	Error     string `json:"error,omitempty"`
}

func newSwitchProxyControlToken() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(raw[:])
}

func (a *App) profileSwitchBridgeRuntimeControl(profileID string) (string, string) {
	if a == nil {
		return "", ""
	}
	profileID = strings.TrimSpace(profileID)
	if profileID == "" {
		return "", ""
	}
	a.bridgeMu.Lock()
	bridge := a.switchBridgeRefs[profileID]
	a.bridgeMu.Unlock()
	if bridge == nil {
		return "", ""
	}
	return strings.TrimSpace(bridge.proxyURL), strings.TrimSpace(bridge.controlToken)
}

func (a *App) switchProfileProxyNowViaRuntimeBridge(profileID string) (*BrowserProfile, bool, error) {
	state, err := a.loadBrowserProfileRuntimeState(profileID)
	if err != nil || state == nil {
		return nil, false, nil
	}
	switchURL := strings.TrimSpace(state.SwitchProxyURL)
	token := strings.TrimSpace(state.SwitchProxyToken)
	if switchURL == "" || token == "" {
		return nil, false, nil
	}
	if !browserRuntimeStateLive(state) {
		return nil, true, fmt.Errorf("实例运行状态已失效，请刷新列表后重试")
	}

	resp, err := postSwitchProxyControl(switchURL, token)
	if err != nil {
		return nil, true, err
	}

	if strings.TrimSpace(resp.ProxyID) != "" {
		snapshot, _, err := a.saveProfileSwitchProxyID(profileID, resp.ProxyID)
		if err != nil {
			return nil, true, err
		}
		a.emitBrowserInstanceUpdated(snapshot)
		return snapshot, true, nil
	}

	a.refreshBrowserProfileConfigCacheFromStore()
	a.reconcileBrowserProfileRuntimeStates()
	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[profileID]
	if !exists || profile == nil {
		a.browserMgr.Mutex.Unlock()
		return nil, true, fmt.Errorf("profile not found")
	}
	snapshot := *profile
	a.browserMgr.Mutex.Unlock()
	a.emitBrowserInstanceUpdated(&snapshot)
	return &snapshot, true, nil
}

func postSwitchProxyControl(proxyURL string, token string) (switchProxyControlResponse, error) {
	parsed, err := url.Parse(strings.TrimSpace(proxyURL))
	if err != nil {
		return switchProxyControlResponse{}, fmt.Errorf("解析代理切换中转地址失败: %w", err)
	}
	if parsed.Scheme != "http" || strings.TrimSpace(parsed.Host) == "" {
		return switchProxyControlResponse{}, fmt.Errorf("代理切换中转地址无效: %s", proxyURL)
	}
	host := parsed.Hostname()
	if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
		if !strings.EqualFold(host, "localhost") {
			return switchProxyControlResponse{}, fmt.Errorf("代理切换中转地址不是本机地址: %s", parsed.Host)
		}
	}
	parsed.Path = switchProxyControlPath
	parsed.RawQuery = ""
	parsed.Fragment = ""

	req, err := http.NewRequest(http.MethodPost, parsed.String(), bytes.NewReader(nil))
	if err != nil {
		return switchProxyControlResponse{}, err
	}
	req.Header.Set(switchProxyControlTokenHeader, token)
	client := &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			Proxy: nil,
		},
	}
	httpResp, err := client.Do(req)
	if err != nil {
		return switchProxyControlResponse{}, fmt.Errorf("连接代理切换中转失败: %w", err)
	}
	defer httpResp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(httpResp.Body, 64*1024))
	var resp switchProxyControlResponse
	if len(body) > 0 {
		_ = json.Unmarshal(body, &resp)
	}
	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 || !resp.OK {
		msg := strings.TrimSpace(resp.Error)
		if msg == "" {
			msg = strings.TrimSpace(string(body))
		}
		if msg == "" {
			msg = httpResp.Status
		}
		return switchProxyControlResponse{}, fmt.Errorf("代理切换中转返回失败: %s", msg)
	}
	return resp, nil
}
