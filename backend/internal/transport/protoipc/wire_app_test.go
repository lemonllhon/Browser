package protoipc

import "testing"

func TestAppConfigAndPathRoundTrip(t *testing.T) {
	config, err := DecodeAppConfigInfo(EncodeAppConfigInfo(AppConfigInfo{
		Name:             "Trace Browser",
		Version:          "1.2.3",
		ProjectGithubURL: "https://example.test/releases",
	}))
	if err != nil {
		t.Fatalf("DecodeAppConfigInfo failed: %v", err)
	}
	if config.Name != "Trace Browser" || config.Version != "1.2.3" {
		t.Fatalf("config was not preserved: %#v", config)
	}

	path, err := DecodeAppPathRequest(EncodeAppPathRequest(AppPathRequest{Path: "C:/tmp"}))
	if err != nil {
		t.Fatalf("DecodeAppPathRequest failed: %v", err)
	}
	if path.Path != "C:/tmp" {
		t.Fatalf("path was not preserved: %#v", path)
	}

	release, err := DecodeAppReleasePageRequest(EncodeAppReleasePageRequest(AppReleasePageRequest{URL: "https://example.test"}))
	if err != nil {
		t.Fatalf("DecodeAppReleasePageRequest failed: %v", err)
	}
	if release.URL != "https://example.test" {
		t.Fatalf("release page was not preserved: %#v", release)
	}
}

func TestAppDashboardAndLicenseRoundTrip(t *testing.T) {
	stats, err := DecodeAppDashboardStats(EncodeAppDashboardStats(AppDashboardStats{
		TotalInstances:   11,
		RunningInstances: 3,
		ProxyCount:       5,
		CoreCount:        2,
		MemUsedMB:        128,
		AppVersion:       "1.2.3",
	}))
	if err != nil {
		t.Fatalf("DecodeAppDashboardStats failed: %v", err)
	}
	if stats.TotalInstances != 11 || stats.RunningInstances != 3 || stats.AppVersion != "1.2.3" {
		t.Fatalf("dashboard stats were not preserved: %#v", stats)
	}

	snapshot, err := DecodeAppPerformanceSnapshot(EncodeAppPerformanceSnapshot(AppPerformanceSnapshot{
		TimestampMS:             1700000000000,
		AppVersion:              "1.2.3",
		Platform:                "windows",
		Arch:                    "amd64",
		MemAllocMB:              64,
		MemSysMB:                96,
		MemHeapInuseMB:          72,
		MemNumGC:                4,
		Goroutines:              12,
		TotalInstances:          11,
		RunningInstances:        3,
		BrowserProcesses:        2,
		ProxyBridgeRefs:         5,
		XrayBridgeRefs:          1,
		ClashBridgeRefs:         2,
		SwitchBridgeRefs:        1,
		AuthProxyBridgeRefs:     1,
		WindowSyncActive:        true,
		WindowSyncWindows:       3,
		WindowSyncControllable:  2,
		WindowSyncEventsTotal:   100,
		WindowSyncDispatchTotal: 180,
	}))
	if err != nil {
		t.Fatalf("DecodeAppPerformanceSnapshot failed: %v", err)
	}
	if !snapshot.WindowSyncActive || snapshot.WindowSyncEventsTotal != 100 || snapshot.MemAllocMB != 64 {
		t.Fatalf("performance snapshot was not preserved: %#v", snapshot)
	}

	versions, err := DecodeAppDataVersions(EncodeAppDataVersions(AppDataVersions{
		TimestampMS:       1700000000000,
		ProfilesVersion:   1,
		GroupsVersion:     2,
		ProxiesVersion:    3,
		CoresVersion:      4,
		ExtensionsVersion: 5,
		DefaultsVersion:   6,
		SettingsVersion:   7,
		CookiesVersion:    8,
		SnapshotsVersion:  9,
		LogsVersion:       10,
	}))
	if err != nil {
		t.Fatalf("DecodeAppDataVersions failed: %v", err)
	}
	if versions.ProfilesVersion != 1 || versions.ExtensionsVersion != 5 || versions.LogsVersion != 10 {
		t.Fatalf("data versions were not preserved: %#v", versions)
	}

	status, err := DecodeAppLicenseStatus(EncodeAppLicenseStatus(AppLicenseStatus{
		MaxLimit:  50,
		UsedCount: 10,
		UsedKeys:  []string{"ANT-1", "ANT-2"},
	}))
	if err != nil {
		t.Fatalf("DecodeAppLicenseStatus failed: %v", err)
	}
	if status.MaxLimit != 50 || status.UsedCount != 10 || len(status.UsedKeys) != 2 {
		t.Fatalf("license status was not preserved: %#v", status)
	}
}

func TestAppAdminAndProfileRoundTrip(t *testing.T) {
	redeem, err := DecodeAppCDKeyRedeemRequest(EncodeAppCDKeyRedeemRequest(AppCDKeyRedeemRequest{CDKey: "ANT-ABCD"}))
	if err != nil {
		t.Fatalf("DecodeAppCDKeyRedeemRequest failed: %v", err)
	}
	if redeem.CDKey != "ANT-ABCD" {
		t.Fatalf("cdkey redeem request was not preserved: %#v", redeem)
	}

	generate, err := DecodeAppCDKeysGenerateRequest(EncodeAppCDKeysGenerateRequest(AppCDKeysGenerateRequest{Count: 12}))
	if err != nil {
		t.Fatalf("DecodeAppCDKeysGenerateRequest failed: %v", err)
	}
	if generate.Count != 12 {
		t.Fatalf("generate request was not preserved: %#v", generate)
	}

	keys, err := DecodeAppCDKeysGenerateResponse(EncodeAppCDKeysGenerateResponse(AppCDKeysGenerateResponse{Keys: []string{"A", "B"}}))
	if err != nil {
		t.Fatalf("DecodeAppCDKeysGenerateResponse failed: %v", err)
	}
	if len(keys.Keys) != 2 || keys.Keys[1] != "B" {
		t.Fatalf("generated keys were not preserved: %#v", keys)
	}

	request, err := DecodeAppRemoteAuthorProfileRequest(EncodeAppRemoteAuthorProfileRequest(AppRemoteAuthorProfileRequest{
		URL:       "https://example.test/profile.json",
		TimeoutMs: 3000,
	}))
	if err != nil {
		t.Fatalf("DecodeAppRemoteAuthorProfileRequest failed: %v", err)
	}
	if request.URL != "https://example.test/profile.json" || request.TimeoutMs != 3000 {
		t.Fatalf("remote profile request was not preserved: %#v", request)
	}

	response, err := DecodeAppRemoteAuthorProfileResponse(EncodeAppRemoteAuthorProfileResponse(AppRemoteAuthorProfileResponse{JSON: `{"author":{"name":"Trace"}}`}))
	if err != nil {
		t.Fatalf("DecodeAppRemoteAuthorProfileResponse failed: %v", err)
	}
	if response.JSON == "" {
		t.Fatalf("remote profile response was not preserved: %#v", response)
	}
}

func TestAppLogListRoundTrip(t *testing.T) {
	logs, err := DecodeAppLogListResponse(EncodeAppLogListResponse(AppLogListResponse{
		Entries: []AppLogEntry{{
			Time:       "2026-05-24 12:00:00",
			Level:      "INFO",
			Component:  "App",
			Message:    "ready",
			FieldsJSON: `{"count":2}`,
		}},
	}))
	if err != nil {
		t.Fatalf("DecodeAppLogListResponse failed: %v", err)
	}
	if len(logs.Entries) != 1 || logs.Entries[0].FieldsJSON != `{"count":2}` {
		t.Fatalf("app logs were not preserved: %#v", logs)
	}
}

func TestAppWindowStateSaveRoundTrip(t *testing.T) {
	request, err := DecodeAppWindowStateSaveRequest(EncodeAppWindowStateSaveRequest(AppWindowStateSaveRequest{
		Width:  1280,
		Height: 720,
	}))
	if err != nil {
		t.Fatalf("DecodeAppWindowStateSaveRequest failed: %v", err)
	}
	if request.Width != 1280 || request.Height != 720 {
		t.Fatalf("window state request was not preserved: %#v", request)
	}
}

func TestAppRuntimeAndWindowRoundTrip(t *testing.T) {
	event, err := DecodeAppRuntimeEventPayload(EncodeAppRuntimeEventPayload(AppRuntimeEventPayload{
		ProfileID:         "p1",
		ProfileName:       "测试实例",
		Error:             "boom",
		Key:               "bridge",
		Engine:            "xray",
		DebugPort:         9222,
		PID:               1234,
		Reused:            true,
		Running:           true,
		DebugReady:        true,
		RuntimeWarning:    "pending",
		Domain:            "profiles",
		Reason:            "data-updated",
		Version:           11,
		ProfilesVersion:   11,
		GroupsVersion:     12,
		ProxiesVersion:    13,
		CoresVersion:      14,
		ExtensionsVersion: 15,
		DefaultsVersion:   16,
		SettingsVersion:   17,
		CookiesVersion:    18,
		SnapshotsVersion:  19,
		LogsVersion:       20,
		ChangedIDs:        []string{"p1", "p2"},
	}))
	if err != nil {
		t.Fatalf("DecodeAppRuntimeEventPayload failed: %v", err)
	}
	if event.ProfileID != "p1" || event.DebugPort != 9222 || !event.DebugReady {
		t.Fatalf("runtime event was not preserved: %#v", event)
	}
	if event.Domain != "profiles" || event.ProfilesVersion != 11 || event.LogsVersion != 20 || len(event.ChangedIDs) != 2 {
		t.Fatalf("runtime data version event was not preserved: %#v", event)
	}

	size, err := DecodeAppWindowSize(EncodeAppWindowSize(AppWindowSize{Width: 1280, Height: 720}))
	if err != nil {
		t.Fatalf("DecodeAppWindowSize failed: %v", err)
	}
	if size.Width != 1280 || size.Height != 720 {
		t.Fatalf("window size was not preserved: %#v", size)
	}

	state, err := DecodeAppWindowState(EncodeAppWindowState(AppWindowState{Normal: true, Maximised: true}))
	if err != nil {
		t.Fatalf("DecodeAppWindowState failed: %v", err)
	}
	if !state.Normal || !state.Maximised || state.Minimised {
		t.Fatalf("window state was not preserved: %#v", state)
	}

	env, err := DecodeAppEnvironmentInfo(EncodeAppEnvironmentInfo(AppEnvironmentInfo{
		BuildType: "desktop",
		Platform:  "windows",
		Arch:      "amd64",
	}))
	if err != nil {
		t.Fatalf("DecodeAppEnvironmentInfo failed: %v", err)
	}
	if env.Platform != "windows" || env.Arch != "amd64" {
		t.Fatalf("environment was not preserved: %#v", env)
	}
}

func TestAppFileDropRoundTrip(t *testing.T) {
	payload, err := DecodeAppFileDropPayload(EncodeAppFileDropPayload(AppFileDropPayload{
		X:     10,
		Y:     20,
		Paths: []string{"C:/tmp/ext.zip", "C:/tmp/ext"},
	}))
	if err != nil {
		t.Fatalf("DecodeAppFileDropPayload failed: %v", err)
	}
	if payload.X != 10 || payload.Y != 20 || len(payload.Paths) != 2 {
		t.Fatalf("file drop payload was not preserved: %#v", payload)
	}
}

func TestBackupActionResultRoundTrip(t *testing.T) {
	result, err := DecodeBackupActionResult(EncodeBackupActionResult(BackupActionResult{
		Cancelled:        false,
		Message:          "导入完成",
		ZipPath:          "backup.zip",
		ResetFirst:       true,
		Imported:         3,
		Skipped:          1,
		Conflicts:        2,
		Partial:          true,
		ComponentTotal:   4,
		ComponentSuccess: 3,
		ComponentFailed:  1,
		FailedComponents: []BackupFailedComponent{{
			ComponentID:   "profiles",
			ComponentName: "浏览器实例",
			Error:         "示例错误",
		}},
		IncludedEntries: 5,
		SkippedEntries:  6,
		FileCount:       7,
	}))
	if err != nil {
		t.Fatalf("DecodeBackupActionResult failed: %v", err)
	}
	if result.Imported != 3 || result.ComponentFailed != 1 || len(result.FailedComponents) != 1 {
		t.Fatalf("backup result was not preserved: %#v", result)
	}
}

func TestBackupProgressRoundTrip(t *testing.T) {
	progress, err := DecodeBackupProgress(EncodeBackupProgress(BackupProgress{
		Phase:         "exporting",
		Progress:      42,
		Message:       "正在导出",
		ComponentID:   "profiles",
		ComponentName: "浏览器实例",
		EntryIndex:    2,
		EntryTotal:    10,
		Timestamp:     "12:00:00",
	}))
	if err != nil {
		t.Fatalf("DecodeBackupProgress failed: %v", err)
	}
	if progress.Progress != 42 || progress.ComponentName != "浏览器实例" || progress.EntryTotal != 10 {
		t.Fatalf("backup progress was not preserved: %#v", progress)
	}
}
