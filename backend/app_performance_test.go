package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"testing"
)

func TestGetPerformanceSnapshotCountsRuntimeState(t *testing.T) {
	cfg := config.DefaultConfig()
	app := NewApp("", "0.7.4")
	app.config = cfg
	app.browserMgr = browser.NewManager(cfg, "")
	app.browserMgr.Profiles["p1"] = &browser.Profile{ProfileId: "p1", Running: true}
	app.browserMgr.Profiles["p2"] = &browser.Profile{ProfileId: "p2", Running: false}
	app.browserMgr.BrowserProcesses["p1"] = nil

	app.xrayBridgeRefs["p1"] = "xray"
	app.clashBridgeRefs["p2"] = "mihomo"
	app.windowSyncEventsTotal.Add(3)
	app.windowSyncDispatchTotal.Add(5)
	app.windowSyncState = &WindowSyncState{
		Active: true,
		Windows: []WindowSyncCandidate{
			{ProfileId: "p1", Running: true, DebugReady: true, DebugPort: 9222},
			{ProfileId: "p2", Running: false, DebugReady: false},
		},
	}

	snapshot := app.GetPerformanceSnapshot()
	if snapshot.AppVersion != "0.7.4" {
		t.Fatalf("expected app version to be preserved, got %q", snapshot.AppVersion)
	}
	if snapshot.TotalInstances != 2 || snapshot.RunningInstances != 1 || snapshot.BrowserProcesses != 1 {
		t.Fatalf("unexpected profile counts: %#v", snapshot)
	}
	if snapshot.ProxyBridgeRefs != 2 || snapshot.XrayBridgeRefs != 1 || snapshot.ClashBridgeRefs != 1 {
		t.Fatalf("unexpected bridge counts: %#v", snapshot)
	}
	if !snapshot.WindowSyncActive || snapshot.WindowSyncWindows != 2 || snapshot.WindowSyncControllable != 1 {
		t.Fatalf("unexpected window sync counts: %#v", snapshot)
	}
	if snapshot.WindowSyncEventsTotal != 3 || snapshot.WindowSyncDispatchTotal != 5 {
		t.Fatalf("unexpected window sync event counters: %#v", snapshot)
	}
}

func TestGetPerformanceSnapshotAllowsNilApp(t *testing.T) {
	var app *App

	snapshot := app.GetPerformanceSnapshot()
	if snapshot.AppVersion != "dev" {
		t.Fatalf("expected dev app version for nil app, got %q", snapshot.AppVersion)
	}
	if snapshot.Platform == "" || snapshot.Arch == "" || snapshot.Goroutines <= 0 {
		t.Fatalf("expected runtime baseline fields to be populated: %#v", snapshot)
	}
}
