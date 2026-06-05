package backend

import (
	"fmt"
	"strings"
)

func (a *App) pinWindowSyncMasterTopLeft(masterProfileId string) error {
	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[masterProfileId]
	if !exists || profile == nil {
		a.browserMgr.Mutex.Unlock()
		return fmt.Errorf("主控实例不存在")
	}
	debugPort := profile.DebugPort
	a.browserMgr.Mutex.Unlock()

	targetID, err := firstPageTargetID(debugPort)
	if err != nil {
		return fmt.Errorf("主控窗口定位失败: %w", err)
	}
	windowInfo, err := cdpBrowserCallResult(debugPort, "Browser.getWindowForTarget", map[string]any{"targetId": targetID})
	if err != nil {
		return fmt.Errorf("主控窗口信息获取失败: %w", err)
	}
	windowID, ok := numericResult(windowInfo["windowId"])
	if !ok {
		return fmt.Errorf("无法获取主控窗口 ID")
	}

	area := primaryWorkArea()
	width, height := browserWindowSizeFromBounds(windowInfo["bounds"], area)
	left := area.Left
	top := area.Top

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
		return fmt.Errorf("主控窗口移动失败: %w", err)
	}
	_, _ = cdpCall(debugPort, "Page.bringToFront", nil)
	return nil
}

func (a *App) showWindowSyncProfile(profileId string) error {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return fmt.Errorf("profile id is required")
	}

	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists || profile == nil {
		a.browserMgr.Mutex.Unlock()
		return fmt.Errorf("实例不存在")
	}
	if !profile.Running || !profile.DebugReady || profile.DebugPort <= 0 {
		a.browserMgr.Mutex.Unlock()
		return fmt.Errorf("实例未运行或调试端口未就绪")
	}
	debugPort := profile.DebugPort
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

	bounds := windowSyncVisibleWindowBounds(windowInfo["bounds"])
	if _, err := cdpBrowserCallResult(debugPort, "Browser.setWindowBounds", map[string]any{
		"windowId": windowID,
		"bounds":   bounds,
	}); err != nil {
		return err
	}
	_, _ = cdpCall(debugPort, "Page.bringToFront", nil)
	return nil
}

func windowSyncVisibleWindowBounds(rawBounds any) map[string]any {
	bounds := map[string]any{"windowState": "normal"}
	values, ok := rawBounds.(map[string]any)
	if !ok {
		return bounds
	}
	for _, key := range []string{"left", "top", "width", "height"} {
		if value, ok := numericResult(values[key]); ok {
			bounds[key] = value
		}
	}
	return bounds
}
