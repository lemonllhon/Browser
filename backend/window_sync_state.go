package backend

import (
	"fmt"
	"strings"
	"time"
)

func (a *App) WindowSyncGetState() *WindowSyncState {
	if a == nil {
		return nil
	}
	a.windowSyncMu.Lock()
	state := cloneWindowSyncState(a.windowSyncState)
	a.windowSyncMu.Unlock()
	if state == nil || !state.Active {
		return state
	}
	return a.refreshWindowSyncRuntimeState(state)
}

func (a *App) WindowSyncStop() (*WindowSyncState, error) {
	if a == nil {
		return nil, nil
	}
	a.windowSyncMu.Lock()
	previous := cloneWindowSyncState(a.windowSyncState)
	a.stopWindowSyncListenerLocked()
	a.windowSyncState = nil
	a.windowSyncMu.Unlock()

	if previous != nil {
		previous.Active = false
		previous.UpdatedAt = time.Now().Format(time.RFC3339)
	}
	a.hideWindowSyncToolbar()
	a.emitWindowSyncStateChanged(previous)
	return previous, nil
}

func (a *App) WindowSyncGetSettings() WindowSyncSettings {
	state := a.WindowSyncGetState()
	if state != nil && state.Active {
		return WindowSyncSettings{
			MasterColor:  state.MasterColor,
			SyncKeyboard: state.SyncKeyboard,
			SyncMouse:    state.SyncMouse,
		}
	}
	return defaultWindowSyncSettings()
}

func (a *App) WindowSyncSaveSettings(input WindowSyncSettings) (*WindowSyncState, error) {
	settings := normalizeWindowSyncSettings(input)
	a.windowSyncMu.Lock()
	if a.windowSyncState == nil || !a.windowSyncState.Active {
		a.windowSyncMu.Unlock()
		return nil, fmt.Errorf("窗口同步未启动")
	}
	a.windowSyncState.MasterColor = settings.MasterColor
	a.windowSyncState.SyncKeyboard = settings.SyncKeyboard
	a.windowSyncState.SyncMouse = settings.SyncMouse
	a.windowSyncState.UpdatedAt = time.Now().Format(time.RFC3339)
	state := cloneWindowSyncState(a.windowSyncState)
	a.windowSyncMu.Unlock()

	a.applyWindowSyncMasterMarker(state)
	a.emitWindowSyncStateChanged(state)
	a.updateWindowSyncToolbar(state)
	return state, nil
}

func (a *App) WindowSyncPause() (*WindowSyncState, error) {
	state, err := a.updateWindowSyncPaused(true)
	if err != nil {
		return nil, err
	}
	return state, nil
}

func (a *App) WindowSyncResume() (*WindowSyncState, error) {
	state, err := a.updateWindowSyncPaused(false)
	if err != nil {
		return nil, err
	}
	return state, nil
}

func (a *App) updateWindowSyncPaused(paused bool) (*WindowSyncState, error) {
	if a == nil {
		return nil, fmt.Errorf("窗口同步未启动")
	}
	a.windowSyncMu.Lock()
	if a.windowSyncState == nil || !a.windowSyncState.Active {
		a.windowSyncMu.Unlock()
		return nil, fmt.Errorf("窗口同步未启动")
	}
	a.windowSyncState.Paused = paused
	a.windowSyncState.UpdatedAt = time.Now().Format(time.RFC3339)
	state := cloneWindowSyncState(a.windowSyncState)
	a.windowSyncMu.Unlock()

	a.emitWindowSyncStateChanged(state)
	a.updateWindowSyncToolbar(state)
	return state, nil
}

func (a *App) requireWindowSyncState() (*WindowSyncState, error) {
	if a == nil {
		return nil, fmt.Errorf("窗口同步未启动")
	}
	a.windowSyncMu.Lock()
	defer a.windowSyncMu.Unlock()
	if a.windowSyncState == nil || !a.windowSyncState.Active {
		return nil, fmt.Errorf("窗口同步未启动")
	}
	return cloneWindowSyncState(a.windowSyncState), nil
}

func defaultWindowSyncSettings() WindowSyncSettings {
	return WindowSyncSettings{
		MasterColor:  defaultWindowSyncMasterColor,
		SyncKeyboard: true,
		SyncMouse:    true,
	}
}

func normalizeWindowSyncSettings(input WindowSyncSettings) WindowSyncSettings {
	out := defaultWindowSyncSettings()
	out.MasterColor = normalizeWindowSyncMasterColor(input.MasterColor)
	out.SyncKeyboard = input.SyncKeyboard
	out.SyncMouse = input.SyncMouse
	return out
}

func normalizeWindowSyncMasterColor(color string) string {
	value := strings.TrimSpace(color)
	if value == "" {
		return defaultWindowSyncMasterColor
	}
	if !strings.HasPrefix(value, "#") {
		value = "#" + value
	}
	if len(value) == 4 {
		value = fmt.Sprintf("#%c%c%c%c%c%c", value[1], value[1], value[2], value[2], value[3], value[3])
	}
	if len(value) != 7 {
		return defaultWindowSyncMasterColor
	}
	for _, ch := range value[1:] {
		if (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F') {
			continue
		}
		return defaultWindowSyncMasterColor
	}
	return strings.ToLower(value)
}

func cloneWindowSyncState(state *WindowSyncState) *WindowSyncState {
	if state == nil {
		return nil
	}
	snapshot := *state
	snapshot.ProfileIds = append([]string{}, state.ProfileIds...)
	snapshot.Windows = append([]WindowSyncCandidate{}, state.Windows...)
	return &snapshot
}
