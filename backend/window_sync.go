package backend

import (
	"ant-chrome/backend/internal/logger"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

func (a *App) WindowSyncStart(input WindowSyncStartInput) (*WindowSyncState, error) {
	if a == nil || a.browserMgr == nil {
		return nil, fmt.Errorf("浏览器管理器未就绪")
	}

	profileIds := normalizeWindowSyncProfileIds(input.ProfileIds)
	if len(profileIds) < 2 {
		return nil, fmt.Errorf("至少选择 2 个运行中的窗口")
	}
	masterProfileId := strings.TrimSpace(input.MasterProfileId)
	if masterProfileId == "" {
		return nil, fmt.Errorf("请选择主控窗口")
	}
	if !containsString(profileIds, masterProfileId) {
		return nil, fmt.Errorf("主控窗口必须在已选窗口中")
	}

	now := time.Now().Format(time.RFC3339)
	layout := a.normalizedWindowSyncLayoutSettings(a.windowSyncLayout)
	layout.Mode = "grid"
	layout.UpdatedAt = now
	if err := a.ensureWindowSyncProfilesReady(profileIds, masterProfileId, layout); err != nil {
		return nil, err
	}

	windows, err := a.resolveWindowSyncCandidates(profileIds, masterProfileId)
	if err != nil {
		return nil, err
	}

	state := &WindowSyncState{
		SessionId:       uuid.NewString(),
		Active:          true,
		Paused:          false,
		MasterProfileId: masterProfileId,
		ProfileIds:      profileIds,
		Windows:         windows,
		MasterColor:     defaultWindowSyncMasterColor,
		SyncKeyboard:    true,
		SyncMouse:       true,
		Layout:          layout,
		StartedAt:       now,
		UpdatedAt:       now,
	}

	a.windowSyncMu.Lock()
	a.stopWindowSyncListenerLocked()
	a.windowSyncState = cloneWindowSyncState(state)
	a.windowSyncMu.Unlock()

	if err := a.applyWindowSyncLayoutToState(state.Layout, state); err != nil {
		a.windowSyncMu.Lock()
		a.windowSyncState = nil
		a.windowSyncMu.Unlock()
		return nil, err
	}

	a.applyWindowSyncMasterMarker(state)
	a.emitWindowSyncStateChanged(state)
	a.showWindowSyncToolbar(state)
	a.startWindowSyncListener()
	go a.reapplyWindowSyncStartupLayout(state.SessionId)
	return cloneWindowSyncState(state), nil
}

func (a *App) WindowSyncApplyLayout(input WindowSyncLayoutSettings) (*WindowSyncState, error) {
	settings := a.normalizedWindowSyncLayoutSettings(input)

	a.windowSyncMu.Lock()
	if a.windowSyncState == nil || !a.windowSyncState.Active {
		a.windowSyncMu.Unlock()
		return nil, fmt.Errorf("窗口同步未启动")
	}
	now := time.Now().Format(time.RFC3339)
	settings.UpdatedAt = now
	a.windowSyncLayout = settings
	a.windowSyncState.Layout = settings
	a.windowSyncState.UpdatedAt = now
	state := cloneWindowSyncState(a.windowSyncState)
	a.windowSyncMu.Unlock()

	if err := a.applyWindowSyncLayoutToState(settings, state); err != nil {
		return state, err
	}
	a.emitWindowSyncStateChanged(state)
	a.updateWindowSyncToolbar(state)
	return state, nil
}

func (a *App) WindowSyncSaveLayoutSettings(input WindowSyncLayoutSettings) (*WindowSyncLayoutSettings, error) {
	settings := a.normalizedWindowSyncLayoutSettings(input)
	settings.UpdatedAt = time.Now().Format(time.RFC3339)

	a.windowSyncMu.Lock()
	a.windowSyncLayout = settings
	if a.windowSyncState != nil && a.windowSyncState.Active {
		a.windowSyncState.Layout = settings
		a.windowSyncState.UpdatedAt = settings.UpdatedAt
	}
	a.windowSyncMu.Unlock()

	return &settings, nil
}

func (a *App) WindowSyncGetLayoutSettings() WindowSyncLayoutSettings {
	if a == nil {
		return defaultWindowSyncLayoutSettings()
	}
	a.windowSyncMu.Lock()
	defer a.windowSyncMu.Unlock()
	if a.windowSyncState != nil && a.windowSyncState.Active && strings.TrimSpace(a.windowSyncState.Layout.Mode) != "" {
		return a.normalizedWindowSyncLayoutSettings(a.windowSyncState.Layout)
	}
	return a.normalizedWindowSyncLayoutSettings(a.windowSyncLayout)
}

func (a *App) WindowSyncShowAll() (*WindowSyncState, error) {
	state, err := a.requireWindowSyncState()
	if err != nil {
		return nil, err
	}

	failures := make([]string, 0)
	for _, item := range state.Windows {
		if err := a.showWindowSyncProfile(item.ProfileId); err != nil {
			name := strings.TrimSpace(item.ProfileName)
			if name == "" {
				name = item.ProfileId
			}
			failures = append(failures, fmt.Sprintf("%s：%v", name, err))
		}
	}
	if len(failures) > 0 {
		return state, fmt.Errorf("部分窗口弹出失败：%s", strings.Join(failures, "；"))
	}
	a.updateWindowSyncToolbar(state)
	return state, nil
}

func (a *App) ensureWindowSyncProfileMutable(profileId string) error {
	if a == nil {
		return nil
	}
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return nil
	}
	a.windowSyncMu.Lock()
	defer a.windowSyncMu.Unlock()
	if a.windowSyncState == nil || !a.windowSyncState.Active {
		return nil
	}
	if a.windowSyncState.MasterProfileId == profileId {
		return fmt.Errorf("同步状态下无法修改主控窗口，请先停止窗口同步")
	}
	return nil
}

func (a *App) startWindowSyncListener() {
	if a == nil {
		return
	}
	a.windowSyncMu.Lock()
	if a.windowSyncState == nil || !a.windowSyncState.Active {
		a.windowSyncMu.Unlock()
		return
	}
	a.windowSyncSeq++
	seq := a.windowSyncSeq
	cancel := make(chan struct{})
	a.windowSyncCancel = cancel
	a.windowSyncMu.Unlock()

	go a.runWindowSyncListener(seq, cancel)
}

func (a *App) stopWindowSyncListenerLocked() {
	if a.windowSyncCancel != nil {
		close(a.windowSyncCancel)
		a.windowSyncCancel = nil
	}
}

func (a *App) runWindowSyncListener(seq int, cancel <-chan struct{}) {
	lastActiveTab := ""
	for {
		select {
		case <-cancel:
			return
		default:
		}

		state := a.WindowSyncGetState()
		if state == nil || !state.Active {
			return
		}
		master := findWindowSyncWindow(state.Windows, state.MasterProfileId)
		if master == nil || !master.Running || !master.DebugReady || master.DebugPort <= 0 {
			a.handleWindowSyncProfileStopped(state.MasterProfileId, "master-unavailable")
			return
		}

		if err := a.listenWindowSyncMaster(seq, cancel, state, master.DebugPort, &lastActiveTab); err != nil {
			select {
			case <-cancel:
				return
			case <-time.After(700 * time.Millisecond):
			}
		}
	}
}

func (a *App) listenWindowSyncMaster(seq int, cancel <-chan struct{}, state *WindowSyncState, debugPort int, lastActiveTab *string) error {
	targets, err := pageWebSocketTargets(debugPort)
	if err != nil {
		return err
	}
	for index := range targets {
		targets[index].Index = index
	}
	localCancel := make(chan struct{})
	defer close(localCancel)
	done := make(chan error, 1)
	connected := 0
	for _, target := range targets {
		target := target
		go func() {
			if err := a.listenWindowSyncTarget(seq, cancel, localCancel, target); err != nil {
				select {
				case done <- err:
				default:
				}
			}
		}()
		connected++
	}
	logger.New("WindowSync").Info("主控窗口同步监听已启动",
		logger.F("debug_port", debugPort),
		logger.F("targets", connected),
		logger.F("session_id", state.SessionId),
	)
	if connected == 0 {
		return fmt.Errorf("未找到可监听的主控页面")
	}

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	refreshAfter := 0
	for {
		select {
		case <-cancel:
			return nil
		case err := <-done:
			logger.New("WindowSync").Warn("主控页面监听中断", logger.F("error", err.Error()))
			return err
		case <-ticker.C:
			refreshAfter++
			if refreshAfter%2 == 0 {
				a.applyWindowSyncMasterMarker(state)
			}
			a.syncWindowSyncTabs(seq, debugPort, lastActiveTab)
			if refreshAfter >= 4 {
				return nil
			}
		}
	}
}

func (a *App) listenWindowSyncTarget(seq int, cancel <-chan struct{}, localCancel <-chan struct{}, target windowSyncTarget) error {
	conn, _, err := websocket.DefaultDialer.Dial(target.WebSocketURL, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	nextID := 1
	send := func(method string, params map[string]any) error {
		msg := cdpMessage{Id: nextID, Method: method, Params: params}
		nextID++
		return conn.WriteJSON(msg)
	}
	if err := send("Runtime.enable", nil); err != nil {
		return err
	}
	if err := send("Page.enable", nil); err != nil {
		return err
	}
	_ = send("Runtime.removeBinding", map[string]any{"name": windowSyncBindingName})
	if err := send("Runtime.addBinding", map[string]any{"name": windowSyncBindingName}); err != nil && !strings.Contains(strings.ToLower(err.Error()), "already") {
		return err
	}
	source := windowSyncInjectionScript(target)
	if err := send("Page.addScriptToEvaluateOnNewDocument", map[string]any{"source": source}); err != nil {
		return err
	}
	if err := send("Runtime.evaluate", map[string]any{"expression": source, "awaitPromise": false}); err != nil {
		return err
	}
	activationSource := windowSyncActivationScript(target)
	if err := send("Page.addScriptToEvaluateOnNewDocument", map[string]any{"source": activationSource}); err != nil {
		return err
	}
	if err := send("Runtime.evaluate", map[string]any{"expression": activationSource, "awaitPromise": false}); err != nil {
		return err
	}

	done := make(chan error, 1)
	go func() {
		for {
			var raw map[string]any
			if err := conn.ReadJSON(&raw); err != nil {
				done <- err
				return
			}
			if method, _ := raw["method"].(string); method == "Runtime.bindingCalled" {
				params, _ := raw["params"].(map[string]any)
				payload, _ := params["payload"].(string)
				a.handleWindowSyncPayload(seq, payload)
			}
		}
	}()

	select {
	case <-cancel:
		_ = conn.Close()
		return nil
	case <-localCancel:
		_ = conn.Close()
		return nil
	case err := <-done:
		return fmt.Errorf("%s: %w", target.Id, err)
	}
}

func (a *App) handleWindowSyncPayload(seq int, payload string) {
	if strings.TrimSpace(payload) == "" {
		return
	}
	var event windowSyncEvent
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		return
	}
	state := a.WindowSyncGetState()
	if state == nil || !state.Active || state.Paused {
		return
	}
	a.windowSyncMu.Lock()
	currentSeq := a.windowSyncSeq
	a.windowSyncMu.Unlock()
	if currentSeq != seq {
		return
	}

	isKeyboard := event.Type == "keyDown" || event.Type == "keyUp" || event.Type == "input"
	isMouse := event.Type == "wheel" || event.Type == "mouseDown" || event.Type == "mouseMove" || event.Type == "mouseUp" || event.Type == "tabActivated"
	if isKeyboard && !state.SyncKeyboard {
		return
	}
	if isMouse && !state.SyncMouse {
		return
	}

	for _, item := range state.Windows {
		if item.ProfileId == state.MasterProfileId {
			continue
		}
		if !windowSyncCandidateControllable(item) {
			a.handleWindowSyncControlledUnavailable(item, "controlled-unavailable")
			continue
		}
		if err := dispatchWindowSyncEvent(item.DebugPort, event); err != nil {
			logger.New("WindowSync").Warn("同步事件派发失败",
				logger.F("profile_id", item.ProfileId),
				logger.F("event_type", event.Type),
				logger.F("error", err.Error()),
			)
			a.handleWindowSyncControlledUnavailable(item, "dispatch-unavailable")
		}
	}
}

func (a *App) syncWindowSyncTabs(seq int, masterDebugPort int, lastActiveTab *string) {
	state := a.WindowSyncGetState()
	if state == nil || !state.Active || state.Paused || !state.SyncMouse {
		return
	}
	a.windowSyncMu.Lock()
	currentSeq := a.windowSyncSeq
	a.windowSyncMu.Unlock()
	if currentSeq != seq {
		return
	}

	masterTargets, err := pageWebSocketTargets(masterDebugPort)
	if err != nil || len(masterTargets) == 0 {
		return
	}
	_, activeTarget := activeWindowSyncTarget(masterTargets)
	if strings.TrimSpace(activeTarget.Id) == "" {
		return
	}
	activeKey := normalizeWindowSyncTargetURL(activeTarget.Url)
	if activeKey == "" {
		activeKey = strings.TrimSpace(activeTarget.Id)
	}
	if lastActiveTab != nil && *lastActiveTab == activeKey {
		return
	}
	if lastActiveTab != nil {
		*lastActiveTab = activeKey
	}

	for _, item := range state.Windows {
		if item.ProfileId == state.MasterProfileId {
			continue
		}
		if !windowSyncCandidateControllable(item) {
			a.handleWindowSyncControlledUnavailable(item, "controlled-unavailable")
			continue
		}
		if err := syncWindowSyncTabsToControlled(item.DebugPort, activeTarget); err != nil {
			logger.New("WindowSync").Warn("同步标签页失败",
				logger.F("profile_id", item.ProfileId),
				logger.F("error", err.Error()),
			)
			a.handleWindowSyncControlledUnavailable(item, "tabs-unavailable")
		}
	}
}

func (a *App) handleWindowSyncControlledUnavailable(item WindowSyncCandidate, reason string) {
	if a == nil || strings.TrimSpace(item.ProfileId) == "" {
		return
	}
	if item.DebugPort > 0 && canConnectDebugPort(item.DebugPort, 200*time.Millisecond) {
		return
	}
	a.handleWindowSyncProfileStopped(item.ProfileId, reason)
}

type windowSyncEvent struct {
	Type        string  `json:"type"`
	TargetId    string  `json:"targetId"`
	TargetIndex int     `json:"targetIndex"`
	TargetUrl   string  `json:"targetUrl"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Button      string  `json:"button"`
	Buttons     int     `json:"buttons"`
	DeltaX      float64 `json:"deltaX"`
	DeltaY      float64 `json:"deltaY"`
	Key         string  `json:"key"`
	Code        string  `json:"code"`
	Text        string  `json:"text"`
	Value       string  `json:"value"`
	Modifiers   int     `json:"modifiers"`
}

func findWindowSyncWindow(windows []WindowSyncCandidate, profileId string) *WindowSyncCandidate {
	for i := range windows {
		if windows[i].ProfileId == profileId {
			item := windows[i]
			return &item
		}
	}
	return nil
}

func (a *App) refreshWindowSyncRuntimeState(state *WindowSyncState) *WindowSyncState {
	if a == nil || state == nil || !state.Active || a.browserMgr == nil {
		return state
	}
	a.browserMgr.Mutex.Lock()
	byId := make(map[string]*WindowSyncCandidate, len(state.Windows))
	for i := range state.Windows {
		byId[state.Windows[i].ProfileId] = &state.Windows[i]
	}
	for _, profile := range a.browserMgr.Profiles {
		if profile == nil {
			continue
		}
		if item := byId[profile.ProfileId]; item != nil {
			item.ProfileName = profile.ProfileName
			item.DebugPort = profile.DebugPort
			item.Pid = profile.Pid
			item.Running = profile.Running
			item.DebugReady = profile.DebugReady
			item.CanSync = profile.Running && profile.DebugReady && profile.DebugPort > 0
			item.CanAutoStart = !profile.Running
			if !profile.Running {
				item.Unavailable = "实例未运行"
			} else if !profile.DebugReady || profile.DebugPort <= 0 {
				item.Unavailable = "调试端口未就绪"
			} else {
				item.Unavailable = ""
			}
		}
	}
	a.browserMgr.Mutex.Unlock()

	a.windowSyncMu.Lock()
	if a.windowSyncState != nil && a.windowSyncState.Active && a.windowSyncState.SessionId == state.SessionId {
		a.windowSyncState.Windows = append([]WindowSyncCandidate{}, state.Windows...)
		a.windowSyncState.UpdatedAt = time.Now().Format(time.RFC3339)
		state.UpdatedAt = a.windowSyncState.UpdatedAt
	}
	a.windowSyncMu.Unlock()
	return state
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
