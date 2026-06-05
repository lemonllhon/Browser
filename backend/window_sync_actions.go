package backend

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

func (a *App) WindowSyncBatchInputSame(input WindowSyncBatchInputSameInput) (*WindowSyncBatchInputResult, error) {
	state, err := a.requireWindowSyncState()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(input.Text) == "" {
		return nil, fmt.Errorf("请输入需要批量填充的文本")
	}
	texts := make(map[string]string, len(state.Windows))
	for _, item := range state.Windows {
		texts[item.ProfileId] = input.Text
	}
	return a.runWindowSyncBatchInput(state, texts)
}

func (a *App) WindowSyncBatchInputDifferent(input WindowSyncBatchInputDifferentInput) (*WindowSyncBatchInputResult, error) {
	state, err := a.requireWindowSyncState()
	if err != nil {
		return nil, err
	}
	if len(input.Items) != len(state.Windows) {
		return nil, fmt.Errorf("差异文本数量必须与当前同步窗口数量一致：需要 %d 个，当前提交 %d 个", len(state.Windows), len(input.Items))
	}
	known := make(map[string]WindowSyncCandidate, len(state.Windows))
	for _, item := range state.Windows {
		known[item.ProfileId] = item
	}
	texts := make(map[string]string, len(input.Items))
	for _, item := range input.Items {
		profileId := strings.TrimSpace(item.ProfileId)
		if profileId == "" {
			return nil, fmt.Errorf("差异文本存在缺少实例 ID 的窗口")
		}
		window, ok := known[profileId]
		if !ok {
			return nil, fmt.Errorf("差异文本包含不在当前同步会话中的窗口：%s", profileId)
		}
		if strings.TrimSpace(item.Text) == "" {
			name := strings.TrimSpace(window.ProfileName)
			if name == "" {
				name = profileId
			}
			return nil, fmt.Errorf("%s 的差异文本不能为空", name)
		}
		if _, exists := texts[profileId]; exists {
			return nil, fmt.Errorf("差异文本存在重复窗口：%s", profileId)
		}
		texts[profileId] = item.Text
	}
	for _, item := range state.Windows {
		if _, ok := texts[item.ProfileId]; !ok {
			return nil, fmt.Errorf("差异文本缺少窗口：%s", item.ProfileName)
		}
	}
	return a.runWindowSyncBatchInput(state, texts)
}

func (a *App) runWindowSyncBatchInput(state *WindowSyncState, texts map[string]string) (*WindowSyncBatchInputResult, error) {
	if state == nil || !state.Active {
		return nil, fmt.Errorf("窗口同步未启动")
	}
	result := &WindowSyncBatchInputResult{
		Total:   len(state.Windows),
		Results: make([]WindowSyncBatchInputResultItem, 0, len(state.Windows)),
	}
	for _, item := range orderedWindowSyncWindows(state) {
		entry := WindowSyncBatchInputResultItem{
			ProfileId:   item.ProfileId,
			ProfileName: item.ProfileName,
			Master:      item.Master,
		}
		text, ok := texts[item.ProfileId]
		if !ok {
			entry.Error = "缺少该窗口的输入内容"
		} else if strings.TrimSpace(text) == "" {
			entry.Error = "输入内容不能为空"
		} else if item.DebugPort <= 0 {
			entry.Error = "窗口调试端口不可用"
		} else if err := batchInputWindowSyncText(item.DebugPort, text); err != nil {
			entry.Error = err.Error()
		} else {
			entry.Success = true
			result.Success++
		}
		if !entry.Success {
			result.Failed++
		}
		result.Results = append(result.Results, entry)
	}
	return result, nil
}

func (a *App) WindowSyncCloseOtherTabs() (*WindowSyncActionResult, error) {
	state, err := a.requireWindowSyncState()
	if err != nil {
		return nil, err
	}
	master := findWindowSyncWindow(state.Windows, state.MasterProfileId)
	if master == nil || master.DebugPort <= 0 {
		return nil, fmt.Errorf("主控窗口不可用")
	}
	activeTarget, err := activeWindowSyncTargetForPort(master.DebugPort)
	if err != nil {
		return nil, err
	}
	result := a.runWindowSyncTabAction(state, func(item WindowSyncCandidate) error {
		return closeOtherWindowSyncTabs(item.DebugPort, activeTarget)
	})
	a.updateWindowSyncToolbar(state)
	return result, nil
}

func (a *App) WindowSyncCloseCurrentTab() (*WindowSyncActionResult, error) {
	state, err := a.requireWindowSyncState()
	if err != nil {
		return nil, err
	}
	master := findWindowSyncWindow(state.Windows, state.MasterProfileId)
	if master == nil || master.DebugPort <= 0 {
		return nil, fmt.Errorf("主控窗口不可用")
	}
	activeTarget, err := activeWindowSyncTargetForPort(master.DebugPort)
	if err != nil {
		return nil, err
	}
	result := a.runWindowSyncTabAction(state, func(item WindowSyncCandidate) error {
		return closeCurrentWindowSyncTab(item.DebugPort, activeTarget)
	})
	a.updateWindowSyncToolbar(state)
	return result, nil
}

func (a *App) WindowSyncCloseBlankTabs() (*WindowSyncActionResult, error) {
	state, err := a.requireWindowSyncState()
	if err != nil {
		return nil, err
	}
	result := a.runWindowSyncTabAction(state, func(item WindowSyncCandidate) error {
		return closeBlankWindowSyncTabs(item.DebugPort)
	})
	a.updateWindowSyncToolbar(state)
	return result, nil
}

func (a *App) WindowSyncOpenUrls(input WindowSyncOpenUrlsInput) (*WindowSyncActionResult, error) {
	state, err := a.requireWindowSyncState()
	if err != nil {
		return nil, err
	}
	urls, err := normalizeWindowSyncOpenUrls(input.Urls)
	if err != nil {
		return nil, err
	}
	result := a.runWindowSyncTabAction(state, func(item WindowSyncCandidate) error {
		return openWindowSyncUrls(item.DebugPort, urls)
	})
	a.updateWindowSyncToolbar(state)
	return result, nil
}

func (a *App) runWindowSyncTabAction(state *WindowSyncState, action func(WindowSyncCandidate) error) *WindowSyncActionResult {
	result := &WindowSyncActionResult{
		Total:   len(state.Windows),
		Results: make([]WindowSyncActionResultItem, 0, len(state.Windows)),
	}
	for _, item := range orderedWindowSyncWindows(state) {
		entry := WindowSyncActionResultItem{
			ProfileId:   item.ProfileId,
			ProfileName: item.ProfileName,
			Master:      item.Master,
		}
		if item.DebugPort <= 0 {
			entry.Error = "窗口调试端口不可用"
		} else if err := action(item); err != nil {
			entry.Error = err.Error()
		} else {
			entry.Success = true
			result.Success++
		}
		if !entry.Success {
			result.Failed++
		}
		result.Results = append(result.Results, entry)
	}
	return result
}

func dispatchWindowSyncEvent(debugPort int, event windowSyncEvent) error {
	targets, err := pageWebSocketTargets(debugPort)
	if err != nil {
		return err
	}
	if event.Type == "tabActivated" {
		target, err := ensureWindowSyncTargetForEvent(debugPort, targets, event)
		if err != nil {
			return err
		}
		return activateWindowSyncTarget(debugPort, target)
	}
	target := findWindowSyncTargetForEvent(targets, event)
	if strings.TrimSpace(target.WebSocketURL) != "" {
		return dispatchWindowSyncEventToTarget(target.WebSocketURL, event)
	}
	var lastErr error
	dispatched := 0
	for _, target := range targets {
		if err := dispatchWindowSyncEventToTarget(target.WebSocketURL, event); err != nil {
			lastErr = err
			continue
		}
		dispatched++
	}
	if dispatched == 0 && lastErr != nil {
		return lastErr
	}
	if dispatched == 0 {
		return fmt.Errorf("未找到可派发的页面")
	}
	return nil
}

func dispatchWindowSyncEventToTarget(wsURL string, event windowSyncEvent) error {
	switch event.Type {
	case "mouseDown", "mouseUp", "mouseMove":
		button := normalizeWindowSyncMouseButton(event.Button)
		cdpType := "mouseMoved"
		switch event.Type {
		case "mouseDown":
			cdpType = "mousePressed"
		case "mouseUp":
			cdpType = "mouseReleased"
		}
		params := map[string]any{
			"type":      cdpType,
			"x":         event.X,
			"y":         event.Y,
			"button":    button,
			"modifiers": event.Modifiers,
		}
		if event.Buttons > 0 {
			params["buttons"] = event.Buttons
		}
		if event.Type == "mouseDown" || event.Type == "mouseUp" {
			params["clickCount"] = 1
		}
		if _, err := cdpCallWebSocket(wsURL, "Input.dispatchMouseEvent", params); err != nil {
			return err
		}
		return nil
	case "wheel":
		_, err := cdpCallWebSocket(wsURL, "Input.dispatchMouseEvent", map[string]any{
			"type":      "mouseWheel",
			"x":         event.X,
			"y":         event.Y,
			"deltaX":    event.DeltaX,
			"deltaY":    event.DeltaY,
			"modifiers": event.Modifiers,
		})
		return err
	case "keyDown", "keyUp":
		cdpType := "keyDown"
		if event.Type == "keyUp" {
			cdpType = "keyUp"
		}
		params := map[string]any{
			"type":                  cdpType,
			"key":                   event.Key,
			"code":                  event.Code,
			"windowsVirtualKeyCode": windowSyncVirtualKeyCode(event),
			"nativeVirtualKeyCode":  windowSyncVirtualKeyCode(event),
			"modifiers":             event.Modifiers,
		}
		if event.Type == "keyDown" && strings.TrimSpace(event.Text) != "" {
			params["text"] = event.Text
			params["unmodifiedText"] = event.Text
		}
		_, err := cdpCallWebSocket(wsURL, "Input.dispatchKeyEvent", params)
		return err
	case "input":
		expression := fmt.Sprintf(`(() => {
  const el = document.activeElement;
  if (!el || !("value" in el)) return false;
  const value = %q;
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  try {
    if (typeof el.setSelectionRange === "function") el.setSelectionRange(value.length, value.length);
  } catch (_) {}
  return true;
})()`, event.Value)
		_, err := cdpCallWebSocket(wsURL, "Runtime.evaluate", map[string]any{"expression": expression, "awaitPromise": false})
		return err
	default:
		return nil
	}
}

func batchInputWindowSyncText(debugPort int, text string) error {
	targets, err := pageWebSocketTargets(debugPort)
	if err != nil {
		return err
	}
	_, target := activeWindowSyncTarget(targets)
	if strings.TrimSpace(target.WebSocketURL) == "" {
		return fmt.Errorf("未找到当前激活标签页")
	}
	result, err := cdpCallWebSocket(target.WebSocketURL, "Runtime.evaluate", map[string]any{
		"expression":    batchInputWindowSyncExpression(text),
		"awaitPromise":  false,
		"returnByValue": true,
	})
	if err != nil {
		return err
	}
	remote, _ := result["result"].(map[string]any)
	value, _ := remote["value"].(map[string]any)
	ok, _ := value["ok"].(bool)
	if ok {
		return nil
	}
	reason, _ := value["error"].(string)
	if strings.TrimSpace(reason) == "" {
		reason = "当前标签页没有可填充的焦点输入框"
	}
	return fmt.Errorf("%s", reason)
}

func batchInputWindowSyncExpression(text string) string {
	payload, _ := json.Marshal(text)
	return fmt.Sprintf(`(() => {
  const value = %s;
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    return { ok: false, error: "当前标签页没有聚焦输入框" };
  }
  const tag = String(el.tagName || "").toLowerCase();
  const editable = !!el.isContentEditable;
  const canSetValue = "value" in el && (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement
  );
  if (!canSetValue && !editable) {
    return { ok: false, error: "当前焦点不是输入框" };
  }
  try { el.focus(); } catch (_) {}
  if (editable) {
    el.textContent = value;
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (_) {}
  } else {
    el.value = value;
    try {
      if (typeof el.setSelectionRange === "function") {
        el.setSelectionRange(value.length, value.length);
      }
    } catch (_) {}
  }
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
})()`, string(payload))
}

func cdpCallWebSocket(wsURL string, method string, params map[string]any) (map[string]any, error) {
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("WebSocket 连接失败: %w", err)
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(3 * time.Second))

	msg := cdpMessage{Id: 1, Method: method, Params: params}
	if err := conn.WriteJSON(msg); err != nil {
		return nil, fmt.Errorf("CDP 命令发送失败: %w", err)
	}

	var cdpResp cdpResponse
	if err := conn.ReadJSON(&cdpResp); err != nil {
		return nil, fmt.Errorf("CDP 响应读取失败: %w", err)
	}
	if cdpResp.Error != nil {
		return nil, fmt.Errorf("CDP 错误: %s", cdpResp.Error.Message)
	}
	return cdpResp.Result, nil
}

func activateWindowSyncTarget(debugPort int, target windowSyncTarget) error {
	targetID := strings.TrimSpace(target.Id)
	if targetID == "" {
		return fmt.Errorf("缺少标签页 target id")
	}
	if _, err := cdpBrowserCallResult(debugPort, "Target.activateTarget", map[string]any{"targetId": targetID}); err != nil {
		return err
	}
	if target.WebSocketURL != "" {
		_, _ = cdpCallWebSocket(target.WebSocketURL, "Page.bringToFront", nil)
	}
	return nil
}

func syncWindowSyncTabsToControlled(debugPort int, activeTarget windowSyncTarget) error {
	targets, err := pageWebSocketTargets(debugPort)
	if err != nil {
		return err
	}
	target := findWindowSyncTargetByURL(targets, activeTarget.Url)
	if strings.TrimSpace(target.Id) == "" {
		target, err = createWindowSyncTarget(debugPort, activeTarget.Url)
		if err != nil {
			return err
		}
	}
	return activateWindowSyncTarget(debugPort, target)
}

func activeWindowSyncTargetForPort(debugPort int) (windowSyncTarget, error) {
	targets, err := pageWebSocketTargets(debugPort)
	if err != nil {
		return windowSyncTarget{}, err
	}
	_, target := activeWindowSyncTarget(targets)
	if strings.TrimSpace(target.Id) == "" {
		return windowSyncTarget{}, fmt.Errorf("未找到当前激活标签页")
	}
	return target, nil
}

func closeOtherWindowSyncTabs(debugPort int, masterActive windowSyncTarget) error {
	targets, err := pageWebSocketTargets(debugPort)
	if err != nil {
		return err
	}
	keep := findWindowSyncTargetByURL(targets, masterActive.Url)
	if strings.TrimSpace(keep.Id) == "" && strings.TrimSpace(masterActive.Url) != "" {
		keep, err = createWindowSyncTarget(debugPort, masterActive.Url)
		if err != nil {
			return err
		}
		targets, err = pageWebSocketTargets(debugPort)
		if err != nil {
			return err
		}
	}
	if strings.TrimSpace(keep.Id) == "" {
		_, keep = activeWindowSyncTarget(targets)
	}
	if strings.TrimSpace(keep.Id) == "" {
		return fmt.Errorf("未找到需要保留的标签页")
	}
	closed := 0
	for _, target := range targets {
		if target.Id == keep.Id || strings.TrimSpace(target.Id) == "" {
			continue
		}
		if err := closeWindowSyncTarget(debugPort, target.Id); err != nil {
			return err
		}
		closed++
	}
	if err := activateWindowSyncTarget(debugPort, keep); err != nil {
		return err
	}
	_ = closed
	return nil
}

func closeCurrentWindowSyncTab(debugPort int, masterActive windowSyncTarget) error {
	targets, err := pageWebSocketTargets(debugPort)
	if err != nil {
		return err
	}
	target := findWindowSyncTargetByURL(targets, masterActive.Url)
	if strings.TrimSpace(target.Id) == "" {
		_, target = activeWindowSyncTarget(targets)
	}
	if strings.TrimSpace(target.Id) == "" {
		return fmt.Errorf("未找到需要关闭的标签页")
	}
	if len(targets) <= 1 {
		if _, err := createWindowSyncTarget(debugPort, "about:blank"); err != nil {
			return err
		}
	}
	return closeWindowSyncTarget(debugPort, target.Id)
}

func closeBlankWindowSyncTabs(debugPort int) error {
	targets, err := pageWebSocketTargets(debugPort)
	if err != nil {
		return err
	}
	blankTargets := make([]windowSyncTarget, 0)
	for _, target := range targets {
		if isWindowSyncBlankURL(target.Url) {
			blankTargets = append(blankTargets, target)
		}
	}
	if len(blankTargets) == 0 {
		return nil
	}
	if len(blankTargets) >= len(targets) {
		if _, err := createWindowSyncTarget(debugPort, "about:blank"); err != nil {
			return err
		}
	}
	for _, target := range blankTargets {
		if strings.TrimSpace(target.Id) == "" {
			continue
		}
		if err := closeWindowSyncTarget(debugPort, target.Id); err != nil {
			return err
		}
	}
	return nil
}

func openWindowSyncUrls(debugPort int, urls []string) error {
	var lastTarget windowSyncTarget
	for _, rawURL := range urls {
		target, err := createWindowSyncTarget(debugPort, rawURL)
		if err != nil {
			return err
		}
		lastTarget = target
	}
	if strings.TrimSpace(lastTarget.Id) != "" {
		return activateWindowSyncTarget(debugPort, lastTarget)
	}
	return nil
}

func closeWindowSyncTarget(debugPort int, targetID string) error {
	targetID = strings.TrimSpace(targetID)
	if targetID == "" {
		return fmt.Errorf("缺少标签页 target id")
	}
	_, err := cdpBrowserCallResult(debugPort, "Target.closeTarget", map[string]any{"targetId": targetID})
	return err
}

func (a *App) applyWindowSyncMasterMarker(state *WindowSyncState) {
	if state == nil || !state.Active {
		return
	}
	master := findWindowSyncWindow(state.Windows, state.MasterProfileId)
	if master == nil || master.DebugPort <= 0 {
		return
	}
	targets, err := pageWebSocketTargets(master.DebugPort)
	if err != nil {
		return
	}
	color := normalizeWindowSyncMasterColor(state.MasterColor)
	for _, target := range targets {
		if strings.TrimSpace(target.WebSocketURL) == "" {
			continue
		}
		_, _ = cdpCallWebSocket(target.WebSocketURL, "Runtime.evaluate", map[string]any{
			"expression":    windowSyncMasterMarkerScript(color),
			"awaitPromise":  false,
			"returnByValue": false,
		})
	}
}

func windowSyncMasterMarkerScript(color string) string {
	payload, _ := json.Marshal(color)
	return fmt.Sprintf(`(() => {
  const color = %s;
  let marker = document.getElementById("__trace_window_sync_master_marker__");
  if (!marker) {
    marker = document.createElement("div");
    marker.id = "__trace_window_sync_master_marker__";
    marker.setAttribute("aria-hidden", "true");
    document.documentElement.appendChild(marker);
  }
  marker.style.cssText = [
    "position: fixed",
    "inset: 0",
    "z-index: 2147483647",
    "pointer-events: none",
    "box-sizing: border-box",
    "border: 4px solid " + color,
    "box-shadow: inset 0 0 0 1px rgba(255,255,255,.72)",
    "border-radius: 2px"
  ].join(";");
})()`, string(payload))
}

func ensureWindowSyncTargetForEvent(debugPort int, targets []windowSyncTarget, event windowSyncEvent) (windowSyncTarget, error) {
	if target := findWindowSyncTargetByURL(targets, event.TargetUrl); strings.TrimSpace(target.Id) != "" {
		return target, nil
	}
	if strings.TrimSpace(event.TargetUrl) != "" {
		return createWindowSyncTarget(debugPort, event.TargetUrl)
	}
	if event.TargetIndex >= 0 {
		for len(targets) <= event.TargetIndex {
			target, err := createWindowSyncTarget(debugPort, "about:blank")
			if err != nil {
				return windowSyncTarget{}, err
			}
			targets = append(targets, target)
		}
	}
	target := findWindowSyncTargetForEvent(targets, event)
	if strings.TrimSpace(target.Id) == "" {
		return windowSyncTarget{}, fmt.Errorf("被控窗口缺少同序标签页：%d", event.TargetIndex+1)
	}
	return target, nil
}

func activeWindowSyncTarget(targets []windowSyncTarget) (int, windowSyncTarget) {
	for index, target := range targets {
		if target.WebSocketURL == "" {
			continue
		}
		active, err := cdpEvaluateBool(target.WebSocketURL, `document.visibilityState === "visible"`)
		if err == nil && active {
			return index, target
		}
	}
	for index, target := range targets {
		if strings.TrimSpace(target.Id) != "" {
			return index, target
		}
	}
	return -1, windowSyncTarget{}
}

func cdpEvaluateBool(wsURL string, expression string) (bool, error) {
	result, err := cdpCallWebSocket(wsURL, "Runtime.evaluate", map[string]any{
		"expression":    expression,
		"returnByValue": true,
	})
	if err != nil {
		return false, err
	}
	remote, _ := result["result"].(map[string]any)
	value, _ := remote["value"].(bool)
	return value, nil
}

func findWindowSyncTargetForEvent(targets []windowSyncTarget, event windowSyncEvent) windowSyncTarget {
	if target := findWindowSyncTargetByURL(targets, event.TargetUrl); strings.TrimSpace(target.Id) != "" {
		return target
	}
	if event.TargetIndex >= 0 && event.TargetIndex < len(targets) {
		return targets[event.TargetIndex]
	}
	return windowSyncTarget{}
}

func findWindowSyncTargetByURL(targets []windowSyncTarget, targetURL string) windowSyncTarget {
	normalizedURL := normalizeWindowSyncTargetURL(targetURL)
	if normalizedURL == "" {
		return windowSyncTarget{}
	}
	for _, target := range targets {
		if normalizeWindowSyncTargetURL(target.Url) == normalizedURL {
			return target
		}
	}
	return windowSyncTarget{}
}

func createWindowSyncTarget(debugPort int, rawURL string) (windowSyncTarget, error) {
	targetURL := strings.TrimSpace(rawURL)
	if targetURL == "" {
		targetURL = "about:blank"
	}
	created, err := cdpBrowserCallResult(debugPort, "Target.createTarget", map[string]any{"url": targetURL})
	if err != nil {
		return windowSyncTarget{}, err
	}
	createdID, _ := created["targetId"].(string)
	targets, err := pageWebSocketTargets(debugPort)
	if err != nil {
		return windowSyncTarget{}, err
	}
	for _, target := range targets {
		if target.Id == createdID {
			return target, nil
		}
	}
	if target := findWindowSyncTargetByURL(targets, targetURL); strings.TrimSpace(target.Id) != "" {
		return target, nil
	}
	return windowSyncTarget{}, fmt.Errorf("新建标签页后未找到目标：%s", targetURL)
}

func normalizeWindowSyncTargetURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme == "" {
		return strings.TrimRight(strings.ToLower(rawURL), "/")
	}
	parsed.Scheme = strings.ToLower(parsed.Scheme)
	parsed.Host = strings.ToLower(parsed.Host)
	if (parsed.Scheme == "https" && strings.HasSuffix(parsed.Host, ":443")) || (parsed.Scheme == "http" && strings.HasSuffix(parsed.Host, ":80")) {
		host, _, splitErr := strings.Cut(parsed.Host, ":")
		if splitErr {
			parsed.Host = host
		}
	}
	if parsed.Path == "/" {
		parsed.Path = ""
	}
	return strings.TrimRight(parsed.String(), "/")
}

func normalizeWindowSyncOpenUrls(input []string) ([]string, error) {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(input))
	for _, item := range input {
		for _, line := range strings.Split(strings.ReplaceAll(item, "\r\n", "\n"), "\n") {
			value := strings.TrimSpace(line)
			if value == "" {
				continue
			}
			normalized, err := normalizeWindowSyncOpenURL(value)
			if err != nil {
				return nil, err
			}
			key := normalizeWindowSyncTargetURL(normalized)
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			out = append(out, normalized)
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("请输入需要打开的网址")
	}
	return out, nil
}

func normalizeWindowSyncOpenURL(rawURL string) (string, error) {
	value := strings.TrimSpace(rawURL)
	if value == "" {
		return "", fmt.Errorf("网址不能为空")
	}
	lower := strings.ToLower(value)
	if lower == "about:blank" {
		return "about:blank", nil
	}
	if !strings.Contains(value, "://") {
		value = "https://" + value
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" {
		return "", fmt.Errorf("网址格式不正确：%s", rawURL)
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https", "about":
	default:
		return "", fmt.Errorf("暂不支持该网址协议：%s", parsed.Scheme)
	}
	if parsed.Scheme != "about" && strings.TrimSpace(parsed.Host) == "" {
		return "", fmt.Errorf("网址缺少域名：%s", rawURL)
	}
	return parsed.String(), nil
}

func isWindowSyncBlankURL(rawURL string) bool {
	value := strings.TrimSpace(strings.ToLower(rawURL))
	return value == "" || value == "about:blank" || value == "chrome://newtab/" || value == "chrome://new-tab-page/" || value == "edge://newtab/"
}

func pageWebSocketTargets(debugPort int) ([]windowSyncTarget, error) {
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
	out := make([]windowSyncTarget, 0, len(targets))
	for _, target := range targets {
		wsURL := strings.TrimSpace(target.WebSocketDebuggerUrl)
		if target.Type != "page" || wsURL == "" {
			continue
		}
		out = append(out, windowSyncTarget{
			Id:           strings.TrimSpace(target.Id),
			Title:        strings.TrimSpace(target.Title),
			Url:          strings.TrimSpace(target.Url),
			Attached:     target.Attached,
			WebSocketURL: wsURL,
		})
	}
	if len(out) > 0 {
		return out, nil
	}
	for _, target := range targets {
		wsURL := strings.TrimSpace(target.WebSocketDebuggerUrl)
		if wsURL == "" {
			continue
		}
		out = append(out, windowSyncTarget{
			Id:           strings.TrimSpace(target.Id),
			Title:        strings.TrimSpace(target.Title),
			Url:          strings.TrimSpace(target.Url),
			Attached:     target.Attached,
			WebSocketURL: wsURL,
		})
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("未找到可用的 WebSocket 调试地址")
	}
	return out, nil
}

func windowSyncInjectionScript(target windowSyncTarget) string {
	return fmt.Sprintf(`(() => {
  if (window.__traceWindowSyncInstalled) return;
  window.__traceWindowSyncInstalled = true;
  const targetId = %q;
  const targetIndex = %d;
  const targetUrl = %q;
  const send = (event) => {
    try {
      const fn = window[%q];
      if (typeof fn === "function") fn(JSON.stringify(event));
    } catch (_) {}
  };
  const modifiers = (event) => (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
  const textFor = (event) => {
    if (!event.key || event.ctrlKey || event.metaKey || event.altKey) return "";
    return event.key.length === 1 ? event.key : "";
  };
  const mouseBase = (event) => ({
    targetId,
    targetIndex,
    targetUrl: window.location.href,
    x: event.clientX,
    y: event.clientY,
    button: event.button === 2 ? "right" : event.button === 1 ? "middle" : "left",
    buttons: event.buttons || 0,
    modifiers: modifiers(event)
  });
  window.addEventListener("mousedown", (event) => send({
    type: "mouseDown",
    ...mouseBase(event)
  }), true);
  window.addEventListener("mousemove", (event) => {
    if (!event.buttons) return;
    send({
      type: "mouseMove",
      ...mouseBase(event)
    });
  }, true);
  window.addEventListener("mouseup", (event) => send({
    type: "mouseUp",
    ...mouseBase(event)
  }), true);
  window.addEventListener("wheel", (event) => send({
    type: "wheel",
    targetId,
    targetIndex,
    targetUrl: window.location.href,
    x: event.clientX,
    y: event.clientY,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    modifiers: modifiers(event)
  }), { capture: true, passive: true });
  window.addEventListener("input", (event) => {
    const target = event.target;
    if (!target || !("value" in target)) return;
    send({
      type: "input",
      targetId,
      targetIndex,
      targetUrl: window.location.href,
      value: String(target.value ?? "")
    });
  }, true);
  window.addEventListener("keydown", (event) => send({
    type: "keyDown",
    targetId,
    targetIndex,
    targetUrl: window.location.href,
    key: event.key,
    code: event.code,
    text: textFor(event),
    modifiers: modifiers(event)
  }), true);
  window.addEventListener("keyup", (event) => send({
    type: "keyUp",
    targetId,
    targetIndex,
    targetUrl: window.location.href,
    key: event.key,
    code: event.code,
    modifiers: modifiers(event)
  }), true);
})();`, target.Id, target.Index, target.Url, windowSyncBindingName)
}

func windowSyncActivationScript(target windowSyncTarget) string {
	payload, _ := json.Marshal(windowSyncEvent{
		Type:        "tabActivated",
		TargetId:    target.Id,
		TargetIndex: target.Index,
	})
	return fmt.Sprintf(`(() => {
  if (window.__traceWindowSyncActivationInstalled) return;
  window.__traceWindowSyncActivationInstalled = true;
  const basePayload = %s;
  let timer = null;
  const send = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      try {
        const fn = window[%q];
        if (typeof fn === "function") {
          fn(JSON.stringify({ ...basePayload, targetUrl: window.location.href }));
        }
      } catch (_) {}
    }, 150);
  };
  if (document.visibilityState === "visible") send();
  window.addEventListener("focus", send, true);
  document.addEventListener("visibilitychange", send, true);
})();`, string(payload), windowSyncBindingName)
}

func normalizeWindowSyncMouseButton(button string) string {
	switch strings.ToLower(strings.TrimSpace(button)) {
	case "right":
		return "right"
	case "middle":
		return "middle"
	default:
		return "left"
	}
}

func windowSyncVirtualKeyCode(event windowSyncEvent) int {
	key := strings.TrimSpace(event.Key)
	if len([]rune(key)) == 1 {
		r := []rune(strings.ToUpper(key))[0]
		if r >= 'A' && r <= 'Z' {
			return int(r)
		}
		if r >= '0' && r <= '9' {
			return int(r)
		}
	}
	switch key {
	case "Backspace":
		return 8
	case "Tab":
		return 9
	case "Enter":
		return 13
	case "Shift":
		return 16
	case "Control":
		return 17
	case "Alt":
		return 18
	case "Escape":
		return 27
	case " ":
		return 32
	case "ArrowLeft":
		return 37
	case "ArrowUp":
		return 38
	case "ArrowRight":
		return 39
	case "ArrowDown":
		return 40
	case "Delete":
		return 46
	default:
		return 0
	}
}
