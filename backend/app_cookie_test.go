package backend

import (
	"os"
	"path/filepath"
	"testing"

	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
)

func TestBrowserClearCookiesClearsStoppedProfileUserData(t *testing.T) {
	root := t.TempDir()
	cfg := config.DefaultConfig()
	app := NewApp(root)
	app.config = cfg
	app.browserMgr = browser.NewManager(cfg, root)
	app.browserMgr.Profiles = map[string]*BrowserProfile{
		"profile-1": {
			ProfileId:   "profile-1",
			ProfileName: "Profile 1",
			UserDataDir: "profile-1",
			Running:     false,
		},
	}

	userDataDir := filepath.Join(root, "data", "profile-1")
	if err := os.MkdirAll(filepath.Join(userDataDir, "Default"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(userDataDir, "Default", "Cookies"), []byte("cookie-db"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(userDataDir, "Preferences"), []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}

	if err := app.BrowserClearCookies("profile-1"); err != nil {
		t.Fatalf("BrowserClearCookies returned error: %v", err)
	}

	if _, err := os.Stat(userDataDir); err != nil {
		t.Fatalf("expected user data dir to remain: %v", err)
	}
	entries, err := os.ReadDir(userDataDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected user data dir contents to be removed, got %d entries", len(entries))
	}
}

func TestBrowserClearCookiesResetsStoppedProfileFingerprintFromDefaultConfig(t *testing.T) {
	root := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.Browser.DefaultFingerprintArgs = []string{
		"--fingerprint-auto-hardware=true",
		"--fingerprint-region=JP",
		"--lang=ja-JP",
		"--timezone=Asia/Tokyo",
		"--fingerprint-platform=mac",
	}
	app := NewApp(root)
	app.config = cfg
	app.browserMgr = browser.NewManager(cfg, root)
	app.browserMgr.Profiles = map[string]*BrowserProfile{
		"profile-1": {
			ProfileId:       "profile-1",
			ProfileName:     "Profile 1",
			UserDataDir:     "profile-1",
			FingerprintArgs: []string{"--fingerprint=123", "--fingerprint-platform=windows"},
			Running:         false,
		},
	}

	userDataDir := filepath.Join(root, "data", "profile-1")
	if err := os.MkdirAll(userDataDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(userDataDir, "Preferences"), []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}

	if err := app.BrowserClearCookies("profile-1"); err != nil {
		t.Fatalf("BrowserClearCookies returned error: %v", err)
	}

	args := app.browserMgr.Profiles["profile-1"].FingerprintArgs
	if containsLaunchArg(args, "--fingerprint-auto-hardware=true") {
		t.Fatalf("auto hardware marker should be resolved when stored after reset: %v", args)
	}
	if !containsLaunchArg(args, "--fingerprint-region=JP") || !containsLaunchArg(args, "--lang=ja-JP") || !containsLaunchArg(args, "--timezone=Asia/Tokyo") {
		t.Fatalf("default locale fingerprint args should be preserved: %v", args)
	}
	if value := launchArgValue(args, "--fingerprint-platform"); value != "mac" {
		t.Fatalf("configured platform should be preserved, got %q in %v", value, args)
	}
	if value := launchArgValue(args, "--fingerprint"); value == "" || value == "123" {
		t.Fatalf("fingerprint seed should be regenerated, got %q in %v", value, args)
	}
	if launchArgValue(args, "--fingerprint-webgl-vendor") == "" || launchArgValue(args, "--fingerprint-fonts") == "" {
		t.Fatalf("hardware fingerprint fields should be generated: %v", args)
	}
}

func TestBrowserClearCookiesUsesLatestSharedBrowserSettings(t *testing.T) {
	root := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.Browser.UserDataRoot = "old-data"
	cfg.Browser.DefaultFingerprintArgs = []string{"--fingerprint-platform=windows"}
	app := NewApp(root)
	app.config = cfg
	app.browserMgr = browser.NewManager(cfg, root)
	app.browserMgr.Profiles = map[string]*BrowserProfile{
		"profile-1": {
			ProfileId:       "profile-1",
			ProfileName:     "Profile 1",
			UserDataDir:     "profile-1",
			FingerprintArgs: []string{"--fingerprint=123", "--fingerprint-platform=windows"},
			Running:         false,
		},
	}

	latest := config.DefaultConfig()
	latest.Browser.UserDataRoot = "latest-data"
	latest.Browser.DefaultFingerprintArgs = []string{
		"--fingerprint-region=JP",
		"--lang=ja-JP",
		"--timezone=Asia/Tokyo",
		"--fingerprint-platform=mac",
	}
	latest.Browser.Profiles = []config.BrowserProfileConfig{
		{
			ProfileId:       "profile-1",
			ProfileName:     "Profile 1",
			UserDataDir:     "profile-1",
			FingerprintArgs: []string{"--fingerprint=123", "--fingerprint-platform=windows"},
		},
	}
	if err := latest.Save(app.resolveAppPath("config.yaml")); err != nil {
		t.Fatalf("failed to save config: %v", err)
	}

	oldUserDataDir := filepath.Join(root, "old-data", "profile-1")
	if err := os.MkdirAll(oldUserDataDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(oldUserDataDir, "Preferences"), []byte("old"), 0644); err != nil {
		t.Fatal(err)
	}
	latestUserDataDir := filepath.Join(root, "latest-data", "profile-1")
	if err := os.MkdirAll(latestUserDataDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(latestUserDataDir, "Preferences"), []byte("latest"), 0644); err != nil {
		t.Fatal(err)
	}

	if err := app.BrowserClearCookies("profile-1"); err != nil {
		t.Fatalf("BrowserClearCookies returned error: %v", err)
	}

	oldContent, err := os.ReadFile(filepath.Join(oldUserDataDir, "Preferences"))
	if err != nil {
		t.Fatalf("expected old user data dir to be untouched: %v", err)
	}
	if string(oldContent) != "old" {
		t.Fatalf("expected old user data to be untouched, got %q", string(oldContent))
	}
	entries, err := os.ReadDir(latestUserDataDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected latest user data dir contents to be removed, got %d entries", len(entries))
	}

	args := app.browserMgr.Profiles["profile-1"].FingerprintArgs
	if !containsLaunchArg(args, "--fingerprint-region=JP") || !containsLaunchArg(args, "--lang=ja-JP") || !containsLaunchArg(args, "--timezone=Asia/Tokyo") {
		t.Fatalf("latest shared fingerprint defaults should be used: %v", args)
	}
	if value := launchArgValue(args, "--fingerprint-platform"); value != "mac" {
		t.Fatalf("latest shared platform should be used, got %q in %v", value, args)
	}
}

func TestResetStoppedProfileFingerprintRefreshesProfileStoreBeforeSaving(t *testing.T) {
	root := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.Browser.DefaultFingerprintArgs = []string{"--fingerprint-platform=mac"}
	app := NewApp(root)
	app.config = cfg
	app.browserMgr = browser.NewManager(cfg, root)
	app.browserMgr.Profiles = map[string]*BrowserProfile{
		"profile-1": {
			ProfileId:       "profile-1",
			ProfileName:     "Stale profile",
			UserDataDir:     "profile-1",
			FingerprintArgs: []string{"--fingerprint=old", "--fingerprint-platform=windows"},
			Tags:            []string{"stale"},
			GroupId:         "old-group",
			Running:         false,
		},
	}
	dao := &profileDAOListStub{profiles: []*BrowserProfile{
		{
			ProfileId:       "profile-1",
			ProfileName:     "Fresh profile",
			UserDataDir:     "profile-1",
			FingerprintArgs: []string{"--fingerprint=old", "--fingerprint-platform=windows"},
			Tags:            []string{"fresh"},
			GroupId:         "fresh-group",
			Running:         false,
		},
	}}
	app.browserMgr.ProfileDAO = dao

	if err := app.resetStoppedProfileFingerprint("profile-1"); err != nil {
		t.Fatalf("resetStoppedProfileFingerprint returned error: %v", err)
	}

	persisted := dao.profiles[0]
	if persisted.ProfileName != "Fresh profile" || persisted.GroupId != "fresh-group" || len(persisted.Tags) != 1 || persisted.Tags[0] != "fresh" {
		t.Fatalf("expected reset to preserve latest shared profile fields, got %#v", persisted)
	}
	if value := launchArgValue(persisted.FingerprintArgs, "--fingerprint-platform"); value != "mac" {
		t.Fatalf("expected fingerprint to be reset from latest defaults, got %q in %v", value, persisted.FingerprintArgs)
	}
	if value := launchArgValue(persisted.FingerprintArgs, "--fingerprint"); value == "" || value == "old" {
		t.Fatalf("expected fingerprint seed to be regenerated, got %q in %v", value, persisted.FingerprintArgs)
	}
}

func TestBrowserClearCookiesRejectsRunningProfileWithoutDebugReady(t *testing.T) {
	root := t.TempDir()
	cfg := config.DefaultConfig()
	app := NewApp(root)
	app.config = cfg
	app.browserMgr = browser.NewManager(cfg, root)
	app.browserMgr.Profiles = map[string]*BrowserProfile{
		"profile-1": {
			ProfileId:  "profile-1",
			Running:    true,
			DebugReady: false,
		},
	}

	if err := app.BrowserClearCookies("profile-1"); err == nil {
		t.Fatal("expected running profile without debug readiness to return an error")
	}
}
