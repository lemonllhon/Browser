package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"os"
	"os/exec"
	"testing"
)

func TestBrowserProfileListReconcilesSharedRuntimeState(t *testing.T) {
	ln := mustListenLoopback(t)
	defer ln.Close()

	appRoot := t.TempDir()
	app1 := newRuntimeStateTestApp(appRoot)
	app1.browserMgr.Profiles["profile-1"] = &BrowserProfile{ProfileId: "profile-1", ProfileName: "Profile 1"}
	app1.markProfileRunningLocked("profile-1", app1.browserMgr.Profiles["profile-1"], nil, 0, listenerPort(t, ln), false, "pending")

	app2 := newRuntimeStateTestApp(appRoot)
	app2.browserMgr.Profiles["profile-1"] = &BrowserProfile{ProfileId: "profile-1", ProfileName: "Profile 1"}

	profiles := app2.BrowserProfileList()
	if len(profiles) != 1 {
		t.Fatalf("expected one profile, got %d", len(profiles))
	}
	got := profiles[0]
	if !got.Running || !got.DebugReady || got.DebugPort != listenerPort(t, ln) {
		t.Fatalf("shared runtime state was not reconciled: %#v", got)
	}
	if got.RuntimeWarning != "" {
		t.Fatalf("expected live debug port to clear runtime warning, got %q", got.RuntimeWarning)
	}
}

func TestBrowserProfileListClearsStaleSharedRuntimeState(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	app.browserMgr.Profiles["profile-1"] = &BrowserProfile{
		ProfileId: "profile-1",
		Running:   true,
		DebugPort: 9,
	}
	app.persistBrowserProfileRuntimeState(app.browserMgr.Profiles["profile-1"])

	profiles := app.BrowserProfileList()
	if len(profiles) != 1 {
		t.Fatalf("expected one profile, got %d", len(profiles))
	}
	if profiles[0].Running || profiles[0].DebugPort != 0 {
		t.Fatalf("expected stale shared runtime state to be cleared: %#v", profiles[0])
	}
	if _, err := os.Stat(app.browserProfileRuntimeStatePath("profile-1")); !os.IsNotExist(err) {
		t.Fatalf("expected stale runtime state file to be removed, stat err=%v", err)
	}
}

func TestDashboardAndRunningInstancesReconcileSharedRuntimeState(t *testing.T) {
	ln := mustListenLoopback(t)
	defer ln.Close()

	appRoot := t.TempDir()
	app1 := newRuntimeStateTestApp(appRoot)
	app1.browserMgr.Profiles["profile-1"] = &BrowserProfile{ProfileId: "profile-1", ProfileName: "Profile 1"}
	app1.markProfileRunningLocked("profile-1", app1.browserMgr.Profiles["profile-1"], nil, 0, listenerPort(t, ln), true, "")

	app2 := newRuntimeStateTestApp(appRoot)
	app2.browserMgr.Profiles["profile-1"] = &BrowserProfile{ProfileId: "profile-1", ProfileName: "Profile 1"}

	stats := app2.GetDashboardStats()
	if stats["totalInstances"] != 1 || stats["runningInstances"] != 1 {
		t.Fatalf("expected dashboard stats to include shared runtime state, got %#v", stats)
	}

	running := app2.GetRunningInstances()
	if len(running) != 1 || !running[0].Running || running[0].DebugPort != listenerPort(t, ln) {
		t.Fatalf("expected running instances to include shared runtime state, got %#v", running)
	}
}

func TestDashboardStatsUsesLatestSharedCoreAndProxyData(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	app.config.Browser.Cores = []BrowserCore{
		{CoreId: "stale-core", CoreName: "Stale Core"},
	}
	app.config.Browser.Proxies = []BrowserProxy{
		{ProxyId: "stale-proxy", ProxyName: "Stale Proxy", ProxyConfig: "http://127.0.0.1:18080"},
	}
	app.browserMgr.CoreDAO = &coreDAOListStub{cores: []BrowserCore{
		{CoreId: "core-a", CoreName: "Core A"},
		{CoreId: "core-b", CoreName: "Core B"},
	}}
	app.browserMgr.ProxyDAO = &proxyDAOListStub{proxies: []BrowserProxy{
		{ProxyId: "proxy-a", ProxyName: "Proxy A", ProxyConfig: "http://127.0.0.1:18081"},
		{ProxyId: "proxy-b", ProxyName: "Proxy B", ProxyConfig: "http://127.0.0.1:18082"},
		{ProxyId: "proxy-c", ProxyName: "Proxy C", ProxyConfig: "http://127.0.0.1:18083"},
	}}

	stats := app.GetDashboardStats()
	if stats["coreCount"] != 2 || stats["proxyCount"] != 3 {
		t.Fatalf("expected dashboard counts from latest DAO data, got %#v", stats)
	}
	if len(app.config.Browser.Cores) != 2 || len(app.config.Browser.Proxies) != 3 {
		t.Fatalf("expected latest DAO data to refresh config cache, cores=%#v proxies=%#v", app.config.Browser.Cores, app.config.Browser.Proxies)
	}
}

func TestBrowserProxyListUsesLatestSharedStore(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	app.config.Browser.Proxies = []BrowserProxy{
		{ProxyId: "stale-proxy", ProxyName: "Stale Proxy", ProxyConfig: "http://127.0.0.1:18080"},
	}
	app.browserMgr.ProxyDAO = &proxyDAOListStub{proxies: []BrowserProxy{
		{ProxyId: "fresh-proxy", ProxyName: "Fresh Proxy", ProxyConfig: "http://127.0.0.1:18081", GroupName: "fresh"},
	}}

	list := app.BrowserProxyList()
	if len(list) != 1 || list[0].ProxyId != "fresh-proxy" {
		t.Fatalf("expected proxy list from latest DAO data, got %#v", list)
	}
	if len(app.getLatestProxies()) != 1 || app.config.Browser.Proxies[0].ProxyId != "fresh-proxy" {
		t.Fatalf("expected proxy cache to be refreshed from DAO, got %#v", app.config.Browser.Proxies)
	}
}

func TestLicenseStatusRefreshesSharedProfileStore(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	app.browserMgr.Profiles["stale-profile"] = &BrowserProfile{ProfileId: "stale-profile", ProfileName: "Stale"}
	app.browserMgr.ProfileDAO = &profileDAOListStub{profiles: []*BrowserProfile{
		{ProfileId: "profile-a", ProfileName: "Profile A"},
		{ProfileId: "profile-b", ProfileName: "Profile B"},
	}}

	status := app.GetLicenseStatus()
	if status.UsedCount != 2 {
		t.Fatalf("expected license status to count latest shared profiles, got %#v", status)
	}
	if _, exists := app.browserMgr.Profiles["stale-profile"]; exists {
		t.Fatalf("expected stale cached profile to be removed")
	}
}

func TestBrowserCoreExtendedInfoRefreshesSharedProfileStore(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	app.browserMgr.Profiles["stale-profile"] = &BrowserProfile{ProfileId: "stale-profile", CoreId: "stale-core"}
	app.browserMgr.ProfileDAO = &profileDAOListStub{profiles: []*BrowserProfile{
		{ProfileId: "profile-a", CoreId: "core-a"},
		{ProfileId: "profile-b"},
	}}
	app.browserMgr.CoreDAO = &coreDAOListStub{cores: []BrowserCore{
		{CoreId: "core-a", CoreName: "Core A", IsDefault: true},
	}}

	info := app.BrowserCoreExtendedInfo()
	if len(info) != 1 {
		t.Fatalf("expected one core info item, got %#v", info)
	}
	if info[0].CoreId != "core-a" || info[0].InstanceCount != 2 {
		t.Fatalf("expected extended info to count latest shared profiles, got %#v", info)
	}
}

func TestBrowserProfileListRefreshesProfileConfigFromStore(t *testing.T) {
	ln := mustListenLoopback(t)
	defer ln.Close()

	app := newRuntimeStateTestApp(t.TempDir())
	app.browserMgr.Profiles["profile-1"] = &BrowserProfile{
		ProfileId:   "profile-1",
		ProfileName: "Old name",
		Running:     true,
		DebugPort:   listenerPort(t, ln),
		LastStartAt: "2026-05-26T00:00:00Z",
	}
	app.browserMgr.Profiles["deleted-profile"] = &BrowserProfile{
		ProfileId:   "deleted-profile",
		ProfileName: "Deleted",
	}
	app.browserMgr.ProfileDAO = &profileDAOListStub{profiles: []*BrowserProfile{
		{
			ProfileId:   "profile-1",
			ProfileName: "Updated name",
			Tags:        []string{"synced"},
		},
		{
			ProfileId:   "created-profile",
			ProfileName: "Created elsewhere",
		},
	}}

	profiles := app.BrowserProfileList()
	if len(profiles) != 2 {
		t.Fatalf("expected refreshed profile list, got %d: %#v", len(profiles), profiles)
	}

	byID := map[string]BrowserProfile{}
	for _, profile := range profiles {
		byID[profile.ProfileId] = profile
	}
	updated := byID["profile-1"]
	if updated.ProfileName != "Updated name" || len(updated.Tags) != 1 || updated.Tags[0] != "synced" {
		t.Fatalf("expected persisted config changes to be visible: %#v", updated)
	}
	if !updated.Running || updated.DebugPort != listenerPort(t, ln) || updated.LastStartAt == "" {
		t.Fatalf("expected local runtime fields to survive config refresh: %#v", updated)
	}
	if _, exists := byID["created-profile"]; !exists {
		t.Fatalf("expected created profile from store to be visible: %#v", profiles)
	}
	if _, exists := byID["deleted-profile"]; exists {
		t.Fatalf("expected deleted profile to disappear: %#v", profiles)
	}
}

func TestBrowserProfileListRefreshesProfileConfigFromDiskWithoutDAO(t *testing.T) {
	appRoot := t.TempDir()
	app := newRuntimeStateTestApp(appRoot)
	app.browserMgr.Profiles["stale-profile"] = &BrowserProfile{
		ProfileId:   "stale-profile",
		ProfileName: "Stale",
	}

	latest := config.DefaultConfig()
	latest.Browser.Profiles = []config.BrowserProfileConfig{
		{
			ProfileId:   "fresh-profile",
			ProfileName: "Fresh",
			CoreId:      "default",
			Tags:        []string{"from-disk"},
		},
	}
	if err := latest.Save(app.resolveAppPath("config.yaml")); err != nil {
		t.Fatalf("failed to save config: %v", err)
	}

	profiles := app.BrowserProfileList()
	if len(profiles) != 1 {
		t.Fatalf("expected refreshed profile list from disk, got %#v", profiles)
	}
	got := profiles[0]
	if got.ProfileId != "fresh-profile" || got.ProfileName != "Fresh" {
		t.Fatalf("expected fresh profile from disk, got %#v", got)
	}
	if got.CoreId != "" || len(got.Tags) != 1 || got.Tags[0] != "from-disk" {
		t.Fatalf("expected normalized profile config from disk, got %#v", got)
	}
	if _, exists := app.browserMgr.Profiles["stale-profile"]; exists {
		t.Fatalf("expected stale cached profile to be removed")
	}
}

func TestBrowserProfileCreateRefreshesBeforeWriting(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	app.browserMgr.Profiles["deleted-profile"] = &BrowserProfile{
		ProfileId:   "deleted-profile",
		ProfileName: "Deleted elsewhere",
	}
	dao := &profileDAOListStub{}
	app.browserMgr.ProfileDAO = dao

	created, err := app.BrowserProfileCreate(BrowserProfileInput{ProfileName: "Created here"})
	if err != nil {
		t.Fatalf("BrowserProfileCreate failed: %v", err)
	}
	if created == nil || created.ProfileId == "" {
		t.Fatalf("expected created profile with id, got %#v", created)
	}
	if len(dao.upsertedIDs) != 1 || dao.upsertedIDs[0] != created.ProfileId {
		t.Fatalf("expected create to avoid resurrecting stale cached profiles, upserted=%v created=%s", dao.upsertedIDs, created.ProfileId)
	}
}

func TestBrowserProfileSwitchProxyNowUsesSharedSwitchBridge(t *testing.T) {
	ln := mustListenLoopback(t)
	defer ln.Close()

	appRoot := t.TempDir()
	app1 := newRuntimeStateTestApp(appRoot)
	app1.config.Browser.Proxies = []BrowserProxy{
		{ProxyId: "proxy-a", ProxyName: "Proxy A", ProxyConfig: "http://127.0.0.1:18081"},
		{ProxyId: "proxy-b", ProxyName: "Proxy B", ProxyConfig: "http://127.0.0.1:18082"},
	}
	profile := &BrowserProfile{
		ProfileId:                "profile-1",
		ProfileName:              "Profile 1",
		AutoProxySwitchEnabled:   true,
		AutoProxySwitchMode:      "manual",
		AutoProxySwitchIntervalM: 5,
	}
	app1.browserMgr.Profiles["profile-1"] = profile
	if _, err := app1.startProfileSwitchBridge(profile); err != nil {
		t.Fatalf("startProfileSwitchBridge failed: %v", err)
	}
	defer app1.releaseProfileSwitchBridge("profile-1")
	app1.markProfileRunningLocked("profile-1", profile, nil, 0, listenerPort(t, ln), true, "")

	app2 := newRuntimeStateTestApp(appRoot)
	app2.config.Browser.Proxies = app1.config.Browser.Proxies
	app2.browserMgr.Profiles["profile-1"] = &BrowserProfile{
		ProfileId:              "profile-1",
		ProfileName:            "Profile 1",
		AutoProxySwitchEnabled: true,
		AutoProxySwitchMode:    "manual",
	}

	updated, err := app2.BrowserProfileSwitchProxyNow("profile-1")
	if err != nil {
		t.Fatalf("BrowserProfileSwitchProxyNow returned error: %v", err)
	}
	if updated == nil || updated.AutoProxySwitchLastProxyId == "" {
		t.Fatalf("expected remote switch to return current proxy id, got %#v", updated)
	}
}

func newRuntimeStateTestApp(appRoot string) *App {
	app := NewApp(appRoot)
	app.config = config.DefaultConfig()
	app.browserMgr = browser.NewManager(app.config, appRoot)
	app.browserMgr.Profiles = map[string]*BrowserProfile{}
	app.browserMgr.BrowserProcesses = map[string]*exec.Cmd{}
	return app
}

type profileDAOListStub struct {
	profiles    []*BrowserProfile
	upsertedIDs []string
}

func (s *profileDAOListStub) List() ([]*BrowserProfile, error) {
	out := make([]*BrowserProfile, 0, len(s.profiles))
	for _, profile := range s.profiles {
		if profile == nil {
			continue
		}
		snapshot := *profile
		out = append(out, &snapshot)
	}
	return out, nil
}

func (s *profileDAOListStub) GetById(profileId string) (*BrowserProfile, error) {
	for _, profile := range s.profiles {
		if profile != nil && profile.ProfileId == profileId {
			snapshot := *profile
			return &snapshot, nil
		}
	}
	return nil, os.ErrNotExist
}

func (s *profileDAOListStub) Upsert(profile *BrowserProfile) error {
	if profile != nil {
		s.upsertedIDs = append(s.upsertedIDs, profile.ProfileId)
	}
	return nil
}

func (s *profileDAOListStub) Delete(profileId string) error {
	return nil
}

type coreDAOListStub struct {
	cores []BrowserCore
}

func (s *coreDAOListStub) List() ([]BrowserCore, error) {
	return append([]BrowserCore{}, s.cores...), nil
}

func (s *coreDAOListStub) Upsert(BrowserCore) error { return nil }
func (s *coreDAOListStub) Delete(string) error      { return nil }
func (s *coreDAOListStub) SetDefault(string) error  { return nil }

type proxyDAOListStub struct {
	proxies []BrowserProxy
}

func (s *proxyDAOListStub) List() ([]BrowserProxy, error) {
	return append([]BrowserProxy{}, s.proxies...), nil
}

func (s *proxyDAOListStub) ListByGroup(groupName string) ([]BrowserProxy, error) {
	result := make([]BrowserProxy, 0)
	for _, item := range s.proxies {
		if item.GroupName == groupName {
			result = append(result, item)
		}
	}
	return result, nil
}

func (s *proxyDAOListStub) ListGroups() ([]string, error) { return nil, nil }
func (s *proxyDAOListStub) Upsert(BrowserProxy) error     { return nil }
func (s *proxyDAOListStub) Delete(string) error           { return nil }
func (s *proxyDAOListStub) DeleteAll() error              { return nil }
func (s *proxyDAOListStub) UpdateSpeedResult(string, bool, int64, string) error {
	return nil
}
func (s *proxyDAOListStub) UpdateIPHealthResult(string, string) error { return nil }
