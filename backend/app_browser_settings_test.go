package backend

import (
	"ant-chrome/backend/internal/config"
	"path/filepath"
	"testing"
)

func TestBrowserStartTimingSettingsUsesDefaultsWhenUnset(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Browser.StartReadyTimeoutMs = 0
	cfg.Browser.StartStableWindowMs = -1

	readyMs := browserStartReadyTimeoutMillis(cfg)
	stableMs := browserStartStableWindowMillis(cfg)

	if readyMs != 3000 {
		t.Fatalf("expected default ready timeout 3000ms, got %d", readyMs)
	}
	if stableMs != 1200 {
		t.Fatalf("expected default stable window 1200ms, got %d", stableMs)
	}
}

func TestSaveBrowserSettingsPreservesExistingStartTimingWhenOmitted(t *testing.T) {
	app := NewApp(t.TempDir())
	app.config = config.DefaultConfig()
	app.config.Browser.StartReadyTimeoutMs = 15000
	app.config.Browser.StartStableWindowMs = 2400

	if err := app.SaveBrowserSettings(BrowserSettings{
		UserDataRoot:           app.config.Browser.UserDataRoot,
		DefaultFingerprintArgs: append([]string{}, app.config.Browser.DefaultFingerprintArgs...),
		DefaultLaunchArgs:      append([]string{}, app.config.Browser.DefaultLaunchArgs...),
		DefaultProxy:           app.config.Browser.DefaultProxy,
	}); err != nil {
		t.Fatalf("SaveBrowserSettings returned error: %v", err)
	}

	if app.config.Browser.StartReadyTimeoutMs != 15000 {
		t.Fatalf("expected ready timeout to be preserved, got %d", app.config.Browser.StartReadyTimeoutMs)
	}
	if app.config.Browser.StartStableWindowMs != 2400 {
		t.Fatalf("expected stable window to be preserved, got %d", app.config.Browser.StartStableWindowMs)
	}
}

func TestSaveBrowserSettingsAppliesExplicitStartTiming(t *testing.T) {
	app := NewApp(t.TempDir())
	app.config = config.DefaultConfig()

	if err := app.SaveBrowserSettings(BrowserSettings{
		UserDataRoot:           app.config.Browser.UserDataRoot,
		DefaultFingerprintArgs: append([]string{}, app.config.Browser.DefaultFingerprintArgs...),
		DefaultLaunchArgs:      append([]string{}, app.config.Browser.DefaultLaunchArgs...),
		DefaultProxy:           app.config.Browser.DefaultProxy,
		StartReadyTimeoutMs:    18000,
		StartStableWindowMs:    3000,
	}); err != nil {
		t.Fatalf("SaveBrowserSettings returned error: %v", err)
	}

	if app.config.Browser.StartReadyTimeoutMs != 18000 {
		t.Fatalf("expected ready timeout 18000ms, got %d", app.config.Browser.StartReadyTimeoutMs)
	}
	if app.config.Browser.StartStableWindowMs != 3000 {
		t.Fatalf("expected stable window 3000ms, got %d", app.config.Browser.StartStableWindowMs)
	}
}

func TestGetBrowserSettingsRefreshesConfigFromDisk(t *testing.T) {
	root := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.Browser.UserDataRoot = "shared-data"
	cfg.Browser.DefaultProxy = "http://127.0.0.1:18080"
	if err := cfg.Save(filepath.Join(root, "config.yaml")); err != nil {
		t.Fatalf("write config failed: %v", err)
	}

	app := NewApp(root)
	app.config = config.DefaultConfig()

	settings := app.GetBrowserSettings()
	if settings.UserDataRoot != "shared-data" {
		t.Fatalf("expected settings to refresh user data root from disk, got %q", settings.UserDataRoot)
	}
	if settings.DefaultProxy != "http://127.0.0.1:18080" {
		t.Fatalf("expected settings to refresh default proxy from disk, got %q", settings.DefaultProxy)
	}
}

func TestSaveBrowserSettingsPreservesDiskDefaultContent(t *testing.T) {
	root := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.Browser.DefaultStartURLs = []config.BrowserStartURL{{Name: "Shared", URL: "https://shared.example.test/"}}
	cfg.Browser.DefaultStartURLsSet = true
	cfg.Browser.DefaultContentRules = []config.BrowserDefaultContentRule{{
		RuleId:     "tag:shared:1",
		Scope:      "tag",
		TargetName: "shared",
		Enabled:    true,
	}}
	if err := cfg.Save(filepath.Join(root, "config.yaml")); err != nil {
		t.Fatalf("write config failed: %v", err)
	}

	app := NewApp(root)
	app.config = config.DefaultConfig()
	if err := app.SaveBrowserSettings(BrowserSettings{
		UserDataRoot:           "updated-data",
		DefaultFingerprintArgs: []string{"--fingerprint-brand=Trace"},
		DefaultLaunchArgs:      []string{"--disable-sync"},
		DefaultProxy:           "http://127.0.0.1:19090",
		StartReadyTimeoutMs:    4500,
		StartStableWindowMs:    1500,
	}); err != nil {
		t.Fatalf("SaveBrowserSettings returned error: %v", err)
	}

	loaded, err := config.Load(filepath.Join(root, "config.yaml"))
	if err != nil {
		t.Fatalf("load config failed: %v", err)
	}
	if loaded.Browser.UserDataRoot != "updated-data" {
		t.Fatalf("expected browser settings to be saved, got userDataRoot=%q", loaded.Browser.UserDataRoot)
	}
	if len(loaded.Browser.DefaultStartURLs) != 1 || loaded.Browser.DefaultStartURLs[0].URL != "https://shared.example.test/" {
		t.Fatalf("expected disk start urls to survive settings save, got %#v", loaded.Browser.DefaultStartURLs)
	}
	if len(loaded.Browser.DefaultContentRules) != 1 || loaded.Browser.DefaultContentRules[0].RuleId != "tag:shared:1" {
		t.Fatalf("expected disk default content rules to survive settings save, got %#v", loaded.Browser.DefaultContentRules)
	}
}
