package backend

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

func (a *App) WindowSyncListCandidates() []WindowSyncCandidate {
	if a == nil || a.browserMgr == nil {
		return []WindowSyncCandidate{}
	}

	activeState := a.WindowSyncGetState()
	activeById := make(map[string]WindowSyncCandidate)
	if activeState != nil && activeState.Active {
		for _, item := range activeState.Windows {
			activeById[item.ProfileId] = item
		}
	}

	a.browserMgr.Mutex.Lock()
	items := make([]WindowSyncCandidate, 0, len(a.browserMgr.Profiles))
	for _, profile := range a.browserMgr.Profiles {
		if profile == nil {
			continue
		}
		item := WindowSyncCandidate{
			ProfileId:    profile.ProfileId,
			ProfileName:  profile.ProfileName,
			DebugPort:    profile.DebugPort,
			Pid:          profile.Pid,
			Running:      profile.Running,
			DebugReady:   profile.DebugReady,
			CanSync:      profile.Running && profile.DebugReady && profile.DebugPort > 0,
			CanAutoStart: !profile.Running,
		}
		if !profile.Running {
			item.Unavailable = "未运行，将在开始同步时自动启动"
		} else if !profile.DebugReady || profile.DebugPort <= 0 {
			item.Unavailable = "调试端口未就绪"
		} else if !canConnectDebugPort(profile.DebugPort, 250*time.Millisecond) {
			item.CanSync = false
			item.Unavailable = "调试端口不可连接"
		}
		if active, ok := activeById[item.ProfileId]; ok {
			item.Role = active.Role
			item.Master = active.Master
		}
		if item.CanSync || item.CanAutoStart {
			items = append(items, item)
		}
	}
	a.browserMgr.Mutex.Unlock()

	sort.Slice(items, func(i, j int) bool {
		return strings.Compare(items[i].ProfileName, items[j].ProfileName) < 0
	})
	return items
}

func (a *App) ensureWindowSyncProfilesReady(profileIds []string, masterProfileId string, layout WindowSyncLayoutSettings) error {
	plannedRects := a.plannedWindowSyncStartupRects(profileIds, masterProfileId, layout)
	for _, profileId := range profileIds {
		profile, err := a.windowSyncProfileSnapshot(profileId)
		if err != nil {
			return err
		}
		if profile.Running && profile.DebugReady && profile.DebugPort > 0 && canConnectDebugPort(profile.DebugPort, 250*time.Millisecond) {
			continue
		}
		if profile.Running {
			return fmt.Errorf("实例调试端口未就绪：%s", profile.ProfileName)
		}
		launchArgs := windowSyncStartupLaunchArgs(plannedRects[profileId])
		if _, err := a.browserInstanceStartInternal(profileId, launchArgs, nil, false, true); err != nil {
			return fmt.Errorf("自动启动实例失败：%s，%w", profile.ProfileName, err)
		}
		if err := a.waitWindowSyncProfileReady(profileId, 30*time.Second); err != nil {
			return err
		}
		if rect, ok := plannedRects[profileId]; ok {
			_ = a.setWindowSyncProfileBounds(profileId, rect)
		}
	}
	return nil
}

func (a *App) plannedWindowSyncStartupRects(profileIds []string, masterProfileId string, layout WindowSyncLayoutSettings) map[string]workAreaRect {
	windows := make([]WindowSyncCandidate, 0, len(profileIds))
	for _, profileId := range profileIds {
		windows = append(windows, WindowSyncCandidate{
			ProfileId: profileId,
			Master:    profileId == masterProfileId,
		})
	}
	state := &WindowSyncState{
		MasterProfileId: masterProfileId,
		Windows:         windows,
	}
	return calculateWindowSyncLayoutRects(layout, orderedWindowSyncWindows(state), a.windowSyncLayoutWorkArea(layout))
}

func windowSyncStartupLaunchArgs(rect workAreaRect) []string {
	if rect.Width <= 0 || rect.Height <= 0 {
		return nil
	}
	return []string{
		fmt.Sprintf("--window-position=%d,%d", rect.Left, rect.Top),
		fmt.Sprintf("--window-size=%d,%d", rect.Width, rect.Height),
	}
}

func (a *App) windowSyncProfileSnapshot(profileId string) (BrowserProfile, error) {
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists || profile == nil {
		return BrowserProfile{}, fmt.Errorf("实例不存在：%s", profileId)
	}
	return *profile, nil
}

func (a *App) waitWindowSyncProfileReady(profileId string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		profile, err := a.windowSyncProfileSnapshot(profileId)
		if err != nil {
			return err
		}
		if profile.Running && profile.DebugReady && profile.DebugPort > 0 && canConnectDebugPort(profile.DebugPort, 250*time.Millisecond) {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("自动启动后调试端口未就绪：%s", profile.ProfileName)
		}
		time.Sleep(300 * time.Millisecond)
	}
}

func (a *App) resolveWindowSyncCandidates(profileIds []string, masterProfileId string) ([]WindowSyncCandidate, error) {
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()

	windows := make([]WindowSyncCandidate, 0, len(profileIds))
	for _, profileId := range profileIds {
		profile, exists := a.browserMgr.Profiles[profileId]
		if !exists || profile == nil {
			return nil, fmt.Errorf("实例不存在：%s", profileId)
		}
		if !profile.Running {
			return nil, fmt.Errorf("实例未运行：%s", profile.ProfileName)
		}
		if !profile.DebugReady || profile.DebugPort <= 0 {
			return nil, fmt.Errorf("实例调试端口未就绪：%s", profile.ProfileName)
		}
		if !canConnectDebugPort(profile.DebugPort, 250*time.Millisecond) {
			return nil, fmt.Errorf("实例调试端口不可连接：%s", profile.ProfileName)
		}
		isMaster := profile.ProfileId == masterProfileId
		role := "controlled"
		if isMaster {
			role = "master"
		}
		windows = append(windows, WindowSyncCandidate{
			ProfileId:   profile.ProfileId,
			ProfileName: profile.ProfileName,
			DebugPort:   profile.DebugPort,
			Pid:         profile.Pid,
			Running:     profile.Running,
			DebugReady:  profile.DebugReady,
			Role:        role,
			Master:      isMaster,
			CanSync:     true,
		})
	}
	return windows, nil
}

func normalizeWindowSyncProfileIds(profileIds []string) []string {
	seen := make(map[string]struct{}, len(profileIds))
	out := make([]string, 0, len(profileIds))
	for _, profileId := range profileIds {
		value := strings.TrimSpace(profileId)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}
