package backend

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
)

type workAreaRect struct {
	Left   int
	Top    int
	Width  int
	Height int
}

func (a *App) BrowserInstancePinCenter(profileId string) error {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return fmt.Errorf("profile id is required")
	}

	a.reconcileBrowserProfileRuntimeStates()
	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists || profile == nil {
		a.browserMgr.Mutex.Unlock()
		return fmt.Errorf("profile not found")
	}
	if !profile.Running {
		a.browserMgr.Mutex.Unlock()
		return fmt.Errorf("实例未运行")
	}
	if profile.DebugPort <= 0 {
		a.browserMgr.Mutex.Unlock()
		return fmt.Errorf("实例调试端口不可用")
	}
	debugPort := profile.DebugPort
	pid := profile.Pid
	a.browserMgr.Mutex.Unlock()

	targetID, err := firstPageTargetID(debugPort)
	if err != nil {
		return err
	}
	windowInfo, err := cdpBrowserCallResult(debugPort, "Browser.getWindowForTarget", map[string]any{"targetId": targetID})
	if err != nil {
		return err
	}
	windowID, ok := numericResult(windowInfo["windowId"])
	if !ok {
		return fmt.Errorf("无法获取浏览器窗口 ID")
	}

	area := primaryWorkArea()
	width, height := browserWindowSizeFromBounds(windowInfo["bounds"], area)
	left := area.Left + int(math.Max(0, float64(area.Width-width))/2)
	top := area.Top + int(math.Max(0, float64(area.Height-height))/2)

	if _, err := cdpBrowserCallResult(debugPort, "Browser.setWindowBounds", map[string]any{
		"windowId": windowID,
		"bounds": map[string]any{
			"windowState": "normal",
			"left":        left,
			"top":         top,
			"width":       width,
			"height":      height,
		},
	}); err != nil {
		return err
	}
	_, _ = cdpCall(debugPort, "Page.bringToFront", nil)
	if pid > 0 {
		_ = setBrowserWindowsTopmostByPID(pid, left, top, width, height)
	}
	return nil
}

func firstPageTargetID(debugPort int) (string, error) {
	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/json", debugPort))
	if err != nil {
		return "", fmt.Errorf("CDP /json 请求失败: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var targets []cdpTarget
	if err := json.Unmarshal(body, &targets); err != nil || len(targets) == 0 {
		return "", fmt.Errorf("CDP targets 解析失败或为空")
	}
	for _, target := range targets {
		if target.Type == "page" && strings.TrimSpace(target.Id) != "" {
			return target.Id, nil
		}
	}
	for _, target := range targets {
		if strings.TrimSpace(target.Id) != "" {
			return target.Id, nil
		}
	}
	return "", fmt.Errorf("未找到可定位的浏览器页面")
}

func browserWindowSizeFromBounds(raw any, area workAreaRect) (int, int) {
	width := minInt(1280, maxInt(960, area.Width-120))
	height := minInt(820, maxInt(640, area.Height-100))
	bounds, ok := raw.(map[string]any)
	if !ok {
		return width, height
	}
	if value, ok := numericResult(bounds["width"]); ok && value >= 720 {
		width = minInt(value, area.Width)
	}
	if value, ok := numericResult(bounds["height"]); ok && value >= 520 {
		height = minInt(value, area.Height)
	}
	return width, height
}

func numericResult(value any) (int, bool) {
	switch v := value.(type) {
	case int:
		return v, true
	case int32:
		return int(v), true
	case int64:
		return int(v), true
	case float64:
		return int(v), true
	case float32:
		return int(v), true
	default:
		return 0, false
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
