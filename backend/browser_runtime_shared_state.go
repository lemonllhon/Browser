package backend

import (
	"ant-chrome/backend/internal/config"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type browserProfileRuntimeState struct {
	ProfileID        string `json:"profileId"`
	Running          bool   `json:"running"`
	DebugPort        int    `json:"debugPort"`
	DebugReady       bool   `json:"debugReady"`
	PID              int    `json:"pid"`
	RuntimeWarning   string `json:"runtimeWarning"`
	SwitchProxyURL   string `json:"switchProxyUrl,omitempty"`
	SwitchProxyToken string `json:"switchProxyToken,omitempty"`
	LastStartAt      string `json:"lastStartAt"`
	LastStopAt       string `json:"lastStopAt"`
	UpdatedAt        string `json:"updatedAt"`
}

func (a *App) reconcileBrowserProfileRuntimeStates() {
	if a == nil || a.browserMgr == nil {
		return
	}

	a.refreshBrowserProfileConfigCacheFromStore()
	a.browserMgr.InitData()
	a.browserMgr.Mutex.Lock()

	changed := false
	stoppedProfileIDs := make([]string, 0)
	for profileID, profile := range a.browserMgr.Profiles {
		if profile == nil {
			continue
		}

		state, err := a.loadBrowserProfileRuntimeState(profileID)
		if err != nil || state == nil || !state.Running {
			if profile.Running && !isBrowserProfileLive(profile, a.browserMgr.BrowserProcesses[profileID]) {
				a.markProfileStoppedLocked(profileID, profile)
				stoppedProfileIDs = append(stoppedProfileIDs, profileID)
				changed = true
			}
			continue
		}

		if !browserRuntimeStateLive(state) {
			if profile.Running && profile.DebugPort == state.DebugPort && profile.Pid == state.PID {
				a.markProfileStoppedLocked(profileID, profile)
				stoppedProfileIDs = append(stoppedProfileIDs, profileID)
				changed = true
			}
			_ = a.clearBrowserProfileRuntimeState(profileID)
			continue
		}

		debugReady := state.DebugReady
		runtimeWarning := state.RuntimeWarning
		if state.DebugPort > 0 && canConnectDebugPort(state.DebugPort, 250*time.Millisecond) {
			debugReady = true
			runtimeWarning = ""
		}

		if profile.Running != true ||
			profile.DebugPort != state.DebugPort ||
			profile.DebugReady != debugReady ||
			profile.Pid != state.PID ||
			profile.RuntimeWarning != runtimeWarning ||
			(state.LastStartAt != "" && profile.LastStartAt != state.LastStartAt) {
			profile.Running = true
			profile.DebugPort = state.DebugPort
			profile.DebugReady = debugReady
			profile.Pid = state.PID
			profile.RuntimeWarning = runtimeWarning
			if state.LastStartAt != "" {
				profile.LastStartAt = state.LastStartAt
			}
			profile.LastError = ""
			changed = true
		}
	}

	if changed && a.launchServer != nil {
		for _, profile := range a.browserMgr.Profiles {
			if profile != nil && profile.Running && profile.DebugReady && profile.DebugPort > 0 {
				a.launchServer.SetActiveProfile(profile)
				break
			}
		}
	}
	a.browserMgr.Mutex.Unlock()

	for _, profileID := range stoppedProfileIDs {
		a.handleWindowSyncProfileStopped(profileID, "runtime-reconcile")
	}
}

func (a *App) refreshBrowserProfileConfigCacheFromStore() {
	if a == nil || a.browserMgr == nil {
		return
	}

	var profiles []*BrowserProfile
	if a.browserMgr.ProfileDAO != nil {
		var err error
		profiles, err = a.browserMgr.ProfileDAO.List()
		if err != nil {
			return
		}
	} else {
		if _, err := os.Stat(a.resolveAppPath("config.yaml")); err != nil {
			return
		}
		if err := a.refreshConfigCacheFromDiskIfPresent(); err != nil || a.config == nil {
			return
		}
		profiles = browserProfilesFromConfig(a.config.Browser.Profiles)
	}

	next := make(map[string]*BrowserProfile, len(profiles))
	for _, persisted := range profiles {
		if persisted == nil || strings.TrimSpace(persisted.ProfileId) == "" {
			continue
		}
		snapshot := *persisted
		next[persisted.ProfileId] = &snapshot
	}

	a.browserMgr.Mutex.Lock()

	cleanupProfileIDs := make([]string, 0)
	for profileID, existing := range a.browserMgr.Profiles {
		incoming := next[profileID]
		if incoming == nil {
			delete(a.browserMgr.BrowserProcesses, profileID)
			cleanupProfileIDs = append(cleanupProfileIDs, profileID)
			continue
		}
		preserveBrowserProfileRuntimeFields(incoming, existing)
	}

	a.browserMgr.Profiles = next
	a.browserMgr.Mutex.Unlock()

	for _, profileID := range cleanupProfileIDs {
		a.releaseProfileXrayBridge(profileID)
		a.releaseProfileClashBridge(profileID)
		a.releaseProfileSwitchBridge(profileID)
		a.releaseProfileAuthProxyBridge(profileID)
		if a.launchServer != nil {
			a.launchServer.ClearActiveProfile(profileID)
		}
	}
}

func browserProfilesFromConfig(items []config.BrowserProfileConfig) []*BrowserProfile {
	now := time.Now().Format(time.RFC3339)
	profiles := make([]*BrowserProfile, 0, len(items))
	for _, item := range items {
		profileID := strings.TrimSpace(item.ProfileId)
		if profileID == "" {
			continue
		}
		createdAt := strings.TrimSpace(item.CreatedAt)
		if createdAt == "" {
			createdAt = now
		}
		updatedAt := strings.TrimSpace(item.UpdatedAt)
		if updatedAt == "" {
			updatedAt = createdAt
		}
		profiles = append(profiles, &BrowserProfile{
			ProfileId:                    profileID,
			ProfileName:                  item.ProfileName,
			UserDataDir:                  item.UserDataDir,
			CoreId:                       normalizeBrowserProfileCoreID(item.CoreId),
			FingerprintArgs:              append([]string{}, item.FingerprintArgs...),
			ProxyId:                      item.ProxyId,
			ProxyConfig:                  item.ProxyConfig,
			ProxyBindSourceID:            item.ProxyBindSourceID,
			ProxyBindSourceURL:           item.ProxyBindSourceURL,
			ProxyBindName:                item.ProxyBindName,
			ProxyBindUpdatedAt:           item.ProxyBindUpdatedAt,
			AutoProxySwitchEnabled:       item.AutoProxySwitchEnabled,
			AutoProxySwitchGroupName:     strings.TrimSpace(item.AutoProxySwitchGroupName),
			AutoProxySwitchMode:          normalizeBrowserProfileAutoProxySwitchMode(item.AutoProxySwitchMode),
			AutoProxySwitchIntervalM:     item.AutoProxySwitchIntervalM,
			AutoProxySwitchRotateByGroup: item.AutoProxySwitchRotateByGroup,
			AutoProxySwitchLastProxyId:   item.AutoProxySwitchLastProxyId,
			LaunchArgs:                   append([]string{}, item.LaunchArgs...),
			Tags:                         append([]string{}, item.Tags...),
			Keywords:                     append([]string{}, item.Keywords...),
			GroupId:                      strings.TrimSpace(item.GroupId),
			CreatedAt:                    createdAt,
			UpdatedAt:                    updatedAt,
		})
	}
	return profiles
}

func normalizeBrowserProfileCoreID(coreID string) string {
	coreID = strings.TrimSpace(coreID)
	if strings.EqualFold(coreID, "default") {
		return ""
	}
	return coreID
}

func normalizeBrowserProfileAutoProxySwitchMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "manual":
		return "manual"
	default:
		return "interval"
	}
}

func (a *App) refreshBrowserProfileSharedRuntimeOverlay() {
	if a == nil || a.browserMgr == nil {
		return
	}

	a.refreshBrowserProfileConfigCacheFromStore()
	a.browserMgr.InitData()

	var activeSnapshot *BrowserProfile
	a.browserMgr.Mutex.Lock()
	for profileID, profile := range a.browserMgr.Profiles {
		if profile == nil {
			continue
		}

		state, err := a.loadBrowserProfileRuntimeState(profileID)
		if err != nil || state == nil || !browserRuntimeStateLive(state) {
			continue
		}

		debugReady := state.DebugReady
		runtimeWarning := state.RuntimeWarning
		if state.DebugPort > 0 && canConnectDebugPort(state.DebugPort, 250*time.Millisecond) {
			debugReady = true
			runtimeWarning = ""
		}

		profile.Running = true
		profile.DebugPort = state.DebugPort
		profile.DebugReady = debugReady
		profile.Pid = state.PID
		profile.RuntimeWarning = runtimeWarning
		if state.LastStartAt != "" {
			profile.LastStartAt = state.LastStartAt
		}
		profile.LastError = ""
		if activeSnapshot == nil && profile.DebugReady && profile.DebugPort > 0 {
			activeSnapshot = copyBrowserProfileSnapshot(profile)
		}
	}
	a.browserMgr.Mutex.Unlock()

	if activeSnapshot != nil && a.launchServer != nil {
		a.launchServer.SetActiveProfile(activeSnapshot)
	}
}

func preserveBrowserProfileRuntimeFields(target *BrowserProfile, source *BrowserProfile) {
	if target == nil || source == nil {
		return
	}
	target.Running = source.Running
	target.DebugPort = source.DebugPort
	target.DebugReady = source.DebugReady
	target.Pid = source.Pid
	target.RuntimeWarning = source.RuntimeWarning
	target.LastError = source.LastError
	target.LastStartAt = source.LastStartAt
	target.LastStopAt = source.LastStopAt
	target.LaunchCode = source.LaunchCode
}

func browserRuntimeStateLive(state *browserProfileRuntimeState) bool {
	if state == nil || !state.Running {
		return false
	}
	if state.DebugPort > 0 && canConnectDebugPort(state.DebugPort, 250*time.Millisecond) {
		return true
	}
	if state.PID > 0 && isProcessAlive(state.PID) {
		return true
	}
	return false
}

func (a *App) persistBrowserProfileRuntimeState(profile *BrowserProfile) {
	if a == nil || profile == nil {
		return
	}

	switchProxyURL, switchProxyToken := a.profileSwitchBridgeRuntimeControl(profile.ProfileId)
	state := browserProfileRuntimeState{
		ProfileID:        profile.ProfileId,
		Running:          profile.Running,
		DebugPort:        profile.DebugPort,
		DebugReady:       profile.DebugReady,
		PID:              profile.Pid,
		RuntimeWarning:   profile.RuntimeWarning,
		SwitchProxyURL:   switchProxyURL,
		SwitchProxyToken: switchProxyToken,
		LastStartAt:      profile.LastStartAt,
		LastStopAt:       profile.LastStopAt,
		UpdatedAt:        time.Now().Format(time.RFC3339Nano),
	}
	if !state.Running {
		_ = a.clearBrowserProfileRuntimeState(profile.ProfileId)
		return
	}

	path := a.browserProfileRuntimeStatePath(profile.ProfileId)
	if path == "" {
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return
	}
	_ = os.Rename(tmp, path)
}

func (a *App) loadBrowserProfileRuntimeState(profileID string) (*browserProfileRuntimeState, error) {
	path := a.browserProfileRuntimeStatePath(profileID)
	if path == "" {
		return nil, os.ErrNotExist
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var state browserProfileRuntimeState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	if strings.TrimSpace(state.ProfileID) == "" {
		state.ProfileID = profileID
	}
	return &state, nil
}

func (a *App) clearBrowserProfileRuntimeState(profileID string) error {
	path := a.browserProfileRuntimeStatePath(profileID)
	if path == "" {
		return nil
	}
	err := os.Remove(path)
	if err == nil || os.IsNotExist(err) {
		return nil
	}
	return err
}

func (a *App) browserProfileRuntimeStatePath(profileID string) string {
	profileID = strings.TrimSpace(profileID)
	if profileID == "" || strings.TrimSpace(a.appRoot) == "" {
		return ""
	}
	return filepath.Join(a.appStateRootAbs(), "runtime", "browser-instances", safeBrowserRuntimeStateName(profileID)+".json")
}

func safeBrowserRuntimeStateName(value string) string {
	value = strings.TrimSpace(value)
	var builder strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			builder.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			builder.WriteRune(r)
		case r >= '0' && r <= '9':
			builder.WriteRune(r)
		case r == '-' || r == '_':
			builder.WriteRune(r)
		default:
			builder.WriteByte('_')
		}
	}
	if builder.Len() == 0 {
		return "profile"
	}
	return builder.String()
}
