package backend

import (
	"ant-chrome/backend/internal/logger"
	"ant-chrome/backend/internal/transport/protoipc"
	"fmt"
	"strings"
	"time"
)

func (a *App) handleWindowSyncProfileStopped(profileId string, reason string) {
	if a == nil {
		return
	}
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return
	}

	var activeState *WindowSyncState
	var inactiveState *WindowSyncState
	var masterClosedPrompt *WindowSyncMasterClosedPrompt
	masterClosed := false

	a.windowSyncMu.Lock()
	if a.windowSyncState == nil || !a.windowSyncState.Active || !windowSyncStateHasProfile(a.windowSyncState, profileId) {
		a.windowSyncMu.Unlock()
		return
	}

	next := cloneWindowSyncState(a.windowSyncState)
	next.UpdatedAt = time.Now().Format(time.RFC3339)
	if next.MasterProfileId == profileId {
		markWindowSyncCandidateStopped(next, profileId)
		next.Active = false
		masterClosed = true
		prompt := windowSyncMasterClosedPrompt(next, profileId, reason)
		masterClosedPrompt = &prompt
		a.stopWindowSyncListenerLocked()
		a.windowSyncState = nil
		inactiveState = next
	} else {
		next.ProfileIds = removeWindowSyncProfileId(next.ProfileIds, profileId)
		next.Windows = removeWindowSyncCandidate(next.Windows, profileId)
		pruneInactiveWindowSyncControlledCandidates(next)
		if !windowSyncCanRemainActive(next) {
			next.Active = false
			a.stopWindowSyncListenerLocked()
			a.windowSyncState = nil
			inactiveState = next
		} else {
			a.windowSyncState = cloneWindowSyncState(next)
			activeState = cloneWindowSyncState(next)
		}
	}
	a.windowSyncMu.Unlock()

	if masterClosed {
		logger.New("WindowSync").Info("主控窗口已关闭，窗口同步已停止",
			logger.F("profile_id", profileId),
			logger.F("reason", reason),
		)
		if masterClosedPrompt == nil || !a.showWindowSyncMasterClosedPrompt(*masterClosedPrompt) {
			a.emitEvent("window-sync:master-closed", masterClosedEventPayload(masterClosedPrompt))
		}
	}
	if activeState != nil {
		logger.New("WindowSync").Info("同步窗口已移除",
			logger.F("profile_id", profileId),
			logger.F("remaining", len(activeState.Windows)),
			logger.F("reason", reason),
		)
		a.emitWindowSyncStateChanged(activeState)
		a.updateWindowSyncToolbar(activeState)
		return
	}
	if inactiveState != nil {
		if !masterClosed {
			logger.New("WindowSync").Info("同步窗口不足，窗口同步已停止",
				logger.F("profile_id", profileId),
				logger.F("reason", reason),
			)
		}
		a.hideWindowSyncToolbar()
		a.emitWindowSyncStateChanged(inactiveState)
	}
}

func windowSyncStateHasProfile(state *WindowSyncState, profileId string) bool {
	if state == nil || strings.TrimSpace(profileId) == "" {
		return false
	}
	if containsString(state.ProfileIds, profileId) {
		return true
	}
	return findWindowSyncWindow(state.Windows, profileId) != nil
}

func removeWindowSyncProfileId(profileIds []string, profileId string) []string {
	out := make([]string, 0, len(profileIds))
	for _, item := range profileIds {
		if item != profileId {
			out = append(out, item)
		}
	}
	return out
}

func removeWindowSyncCandidate(windows []WindowSyncCandidate, profileId string) []WindowSyncCandidate {
	out := make([]WindowSyncCandidate, 0, len(windows))
	for _, item := range windows {
		if item.ProfileId != profileId {
			out = append(out, item)
		}
	}
	return out
}

func pruneInactiveWindowSyncControlledCandidates(state *WindowSyncState) {
	if state == nil {
		return
	}
	keep := make(map[string]struct{}, len(state.Windows))
	windows := make([]WindowSyncCandidate, 0, len(state.Windows))
	for _, item := range state.Windows {
		if item.ProfileId == state.MasterProfileId || windowSyncCandidateControllable(item) {
			windows = append(windows, item)
			keep[item.ProfileId] = struct{}{}
		}
	}
	profileIds := make([]string, 0, len(state.ProfileIds))
	for _, profileId := range state.ProfileIds {
		if _, ok := keep[profileId]; ok {
			profileIds = append(profileIds, profileId)
		}
	}
	if len(profileIds) == 0 && len(windows) > 0 {
		for _, item := range windows {
			profileIds = append(profileIds, item.ProfileId)
		}
	}
	state.Windows = windows
	state.ProfileIds = profileIds
}

func windowSyncCandidateControllable(item WindowSyncCandidate) bool {
	return item.Running && item.DebugReady && item.DebugPort > 0
}

func windowSyncCanRemainActive(state *WindowSyncState) bool {
	if state == nil || !state.Active {
		return false
	}
	masterReady := false
	controlledReady := false
	for _, item := range state.Windows {
		if item.ProfileId == state.MasterProfileId {
			masterReady = windowSyncCandidateControllable(item)
			continue
		}
		if windowSyncCandidateControllable(item) {
			controlledReady = true
		}
	}
	return masterReady && controlledReady
}

func markWindowSyncCandidateStopped(state *WindowSyncState, profileId string) {
	if state == nil {
		return
	}
	for index := range state.Windows {
		if state.Windows[index].ProfileId != profileId {
			continue
		}
		state.Windows[index].Running = false
		state.Windows[index].DebugReady = false
		state.Windows[index].DebugPort = 0
		state.Windows[index].Pid = 0
		state.Windows[index].CanSync = false
		state.Windows[index].Unavailable = "实例已关闭"
		return
	}
}

type WindowSyncMasterClosedPrompt struct {
	ProfileId             string
	ProfileName           string
	RemainingProfileIds   []string
	RemainingProfileNames []string
	Reason                string
}

type WindowSyncPromptAdapter interface {
	ShowMasterClosedPrompt(app *App, prompt WindowSyncMasterClosedPrompt) bool
}

func windowSyncMasterClosedPrompt(state *WindowSyncState, profileId string, reason string) WindowSyncMasterClosedPrompt {
	remainingProfileIds := make([]string, 0)
	remainingProfileNames := make([]string, 0)
	masterName := profileId
	if state != nil {
		for _, item := range orderedWindowSyncWindows(state) {
			name := strings.TrimSpace(item.ProfileName)
			if name == "" {
				name = item.ProfileId
			}
			if item.ProfileId == profileId {
				masterName = name
				continue
			}
			remainingProfileIds = append(remainingProfileIds, item.ProfileId)
			remainingProfileNames = append(remainingProfileNames, name)
		}
	}
	return WindowSyncMasterClosedPrompt{
		ProfileId:             profileId,
		ProfileName:           masterName,
		RemainingProfileIds:   remainingProfileIds,
		RemainingProfileNames: remainingProfileNames,
		Reason:                strings.TrimSpace(reason),
	}
}

func masterClosedEventPayload(prompt *WindowSyncMasterClosedPrompt) map[string]interface{} {
	if prompt == nil {
		return map[string]interface{}{}
	}
	return map[string]interface{}{
		"profileId":             prompt.ProfileId,
		"profileName":           prompt.ProfileName,
		"key":                   strings.Join(prompt.RemainingProfileIds, "\n"),
		"engine":                prompt.Reason,
		"remainingProfileIds":   append([]string{}, prompt.RemainingProfileIds...),
		"remainingProfileNames": append([]string{}, prompt.RemainingProfileNames...),
	}
}

func (a *App) SetWindowSyncPromptAdapter(adapter WindowSyncPromptAdapter) {
	if a == nil {
		return
	}
	a.windowSyncPromptMu.Lock()
	a.windowSyncPromptAdapter = adapter
	a.windowSyncPromptMu.Unlock()
}

func (a *App) showWindowSyncMasterClosedPrompt(prompt WindowSyncMasterClosedPrompt) bool {
	if a == nil {
		return false
	}
	a.windowSyncPromptMu.RLock()
	adapter := a.windowSyncPromptAdapter
	a.windowSyncPromptMu.RUnlock()
	if adapter == nil {
		return false
	}
	return adapter.ShowMasterClosedPrompt(a, prompt)
}

func (a *App) emitWindowSyncStateChanged(state *WindowSyncState) {
	if a == nil {
		return
	}
	a.emitProtoEvent(protoipc.EventWindowSyncStateChanged, encodeProtoWindowSyncStateResponse(state))
	a.emitEvent("window-sync:state-changed", state)
}

func (a *App) showWindowSyncToolbar(state *WindowSyncState) {
	if a == nil || state == nil || !state.Active {
		return
	}
	if toolbar := a.currentWindowSyncToolbarAdapter(); toolbar != nil {
		_ = toolbar.Show(a, state)
	}
}

func (a *App) updateWindowSyncToolbar(state *WindowSyncState) {
	if a == nil || state == nil || !state.Active {
		return
	}
	if toolbar := a.currentWindowSyncToolbarAdapter(); toolbar != nil {
		_ = toolbar.Update(state)
	}
}

func (a *App) hideWindowSyncToolbar() {
	if a == nil {
		return
	}
	if toolbar := a.currentWindowSyncToolbarAdapter(); toolbar != nil {
		_ = toolbar.Hide()
	}
}

func (a *App) SetWindowSyncToolbarAdapter(adapter WindowSyncToolbarAdapter) {
	if a == nil {
		return
	}
	a.windowSyncToolbarMu.Lock()
	a.windowSyncToolbarAdapter = adapter
	a.windowSyncToolbarMu.Unlock()
}

func (a *App) WindowSyncToolbarSetSize(width int, height int) error {
	if a == nil {
		return fmt.Errorf("窗口同步工具栏尚未初始化")
	}
	if width <= 0 || height <= 0 {
		return fmt.Errorf("窗口同步工具栏尺寸无效")
	}
	toolbar := a.currentWindowSyncToolbarAdapter()
	if toolbar == nil {
		return nil
	}
	return toolbar.SetSize(width, height)
}

func (a *App) currentWindowSyncToolbarAdapter() WindowSyncToolbarAdapter {
	if a == nil {
		return nil
	}
	a.windowSyncToolbarMu.RLock()
	adapter := a.windowSyncToolbarAdapter
	a.windowSyncToolbarMu.RUnlock()
	if adapter != nil {
		return adapter
	}
	return &a.windowSyncToolbar
}
