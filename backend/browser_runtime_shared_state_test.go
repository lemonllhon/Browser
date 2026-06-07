package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"os"
	"os/exec"
	"strings"
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
			GroupId:     "group-from-disk",
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
	if got.CoreId != "" || len(got.Tags) != 1 || got.Tags[0] != "from-disk" || got.GroupId != "group-from-disk" {
		t.Fatalf("expected normalized profile config from disk, got %#v", got)
	}
	if _, exists := app.browserMgr.Profiles["stale-profile"]; exists {
		t.Fatalf("expected stale cached profile to be removed")
	}
}

func TestDefaultContentForProfileRefreshesConfigFromDisk(t *testing.T) {
	appRoot := t.TempDir()
	app := newRuntimeStateTestApp(appRoot)
	includeGlobal := false
	app.config.Browser.DefaultContentRules = []config.BrowserDefaultContentRule{
		{
			RuleId:                "tag:fresh:stale",
			Scope:                 "tag",
			TargetName:            "fresh",
			Enabled:               true,
			IncludeGlobalDefaults: &includeGlobal,
			StartURLs: []config.BrowserStartURL{
				{Name: "Stale Start", URL: "https://stale-start.example.test/"},
			},
			Bookmarks: []config.BrowserBookmark{
				{Name: "Stale Bookmark", URL: "https://stale-bookmark.example.test/"},
			},
		},
	}

	latest := config.DefaultConfig()
	latest.Browser.DefaultContentRules = []config.BrowserDefaultContentRule{
		{
			RuleId:                "tag:fresh:latest",
			Scope:                 "tag",
			TargetName:            "fresh",
			Enabled:               true,
			IncludeGlobalDefaults: &includeGlobal,
			StartURLs: []config.BrowserStartURL{
				{Name: "Latest Start", URL: "https://latest-start.example.test/"},
			},
			Bookmarks: []config.BrowserBookmark{
				{Name: "Latest Bookmark", URL: "https://latest-bookmark.example.test/"},
			},
		},
	}
	if err := latest.Save(app.resolveAppPath("config.yaml")); err != nil {
		t.Fatalf("failed to save config: %v", err)
	}

	profile := &BrowserProfile{
		ProfileId:   "profile-1",
		ProfileName: "Profile 1",
		Tags:        []string{"fresh"},
	}
	bookmarks := app.BookmarkListForProfile(profile)
	if len(bookmarks) != 1 || bookmarks[0].URL != "https://latest-bookmark.example.test/" {
		t.Fatalf("expected bookmarks from latest shared config, got %#v", bookmarks)
	}
	startURLs := app.DefaultStartURLValuesForProfile(profile)
	if len(startURLs) != 1 || startURLs[0] != "https://latest-start.example.test/" {
		t.Fatalf("expected start URLs from latest shared config, got %#v", startURLs)
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

func TestBrowserProfileWriteRejectsDeletedSharedGroup(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	dao := &profileDAOListStub{profiles: []*BrowserProfile{
		{ProfileId: "profile-1", ProfileName: "Fresh profile", GroupId: ""},
	}}
	app.browserMgr.ProfileDAO = dao
	app.browserMgr.GroupDAO = &groupDAOListStub{groups: []*BrowserGroup{
		{GroupId: "existing-group", GroupName: "Existing"},
	}}

	if _, err := app.BrowserProfileCreate(BrowserProfileInput{ProfileName: "Created", GroupId: "deleted-group"}); err == nil || !strings.Contains(err.Error(), "分组不存在") {
		t.Fatalf("expected create with deleted group to fail, got %v", err)
	}
	if _, err := app.BrowserProfileUpdate("profile-1", BrowserProfileInput{ProfileName: "Updated", GroupId: "deleted-group"}); err == nil || !strings.Contains(err.Error(), "分组不存在") {
		t.Fatalf("expected update with deleted group to fail, got %v", err)
	}
	if err := app.MoveInstancesToGroup([]string{"profile-1"}, "deleted-group"); err == nil || !strings.Contains(err.Error(), "分组不存在") {
		t.Fatalf("expected move to deleted group to fail before writing, got %v", err)
	}
	if len(dao.upsertedIDs) != 0 {
		t.Fatalf("expected deleted group writes to be rejected before profile upsert, upserted=%v", dao.upsertedIDs)
	}
}

func TestBrowserProfileUpdateSavesOnlyTargetProfile(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	dao := &profileDAOListStub{profiles: []*BrowserProfile{
		{ProfileId: "profile-1", ProfileName: "One", Tags: []string{"one"}},
		{ProfileId: "profile-2", ProfileName: "Two", Tags: []string{"two"}},
	}}
	app.browserMgr.ProfileDAO = dao

	if _, err := app.BrowserProfileUpdate("profile-1", BrowserProfileInput{ProfileName: "One Updated", Tags: []string{"one-updated"}}); err != nil {
		t.Fatalf("BrowserProfileUpdate failed: %v", err)
	}
	if len(dao.upsertedIDs) != 1 || dao.upsertedIDs[0] != "profile-1" {
		t.Fatalf("expected only updated profile to be upserted, got %v", dao.upsertedIDs)
	}
	if dao.profiles[1].ProfileName != "Two" || len(dao.profiles[1].Tags) != 1 || dao.profiles[1].Tags[0] != "two" {
		t.Fatalf("expected unrelated profile to remain untouched, got %#v", dao.profiles[1])
	}
}

func TestReconcileProfileProxyBindingsRefreshesProfilesBeforeWriting(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	app.config.Browser.Proxies = []BrowserProxy{
		{ProxyId: "proxy-fresh", ProxyName: "Fresh Proxy", ProxyConfig: "http://127.0.0.1:18081"},
	}
	app.browserMgr.ProxyDAO = &proxyDAOListStub{proxies: app.config.Browser.Proxies}
	app.browserMgr.Profiles["deleted-profile"] = &BrowserProfile{
		ProfileId:   "deleted-profile",
		ProfileName: "Deleted elsewhere",
		ProxyId:     "missing-proxy",
		ProxyConfig: "http://127.0.0.1:18080",
	}
	dao := &profileDAOListStub{profiles: []*BrowserProfile{
		{
			ProfileId:         "profile-1",
			ProfileName:       "Updated elsewhere",
			ProxyId:           "missing-proxy",
			ProxyConfig:       "http://127.0.0.1:18081",
			ProxyBindSourceID: "source-a",
			ProxyBindName:     "Fresh Proxy",
		},
		{
			ProfileId:          "profile-2",
			ProfileName:        "Unchanged elsewhere",
			ProxyId:            "proxy-fresh",
			ProxyConfig:        "http://127.0.0.1:18081",
			ProxyBindName:      "Fresh Proxy",
			ProxyBindUpdatedAt: "2026-06-07T00:00:00Z",
		},
	}}
	app.browserMgr.ProfileDAO = dao

	app.reconcileProfileProxyBindings()

	if _, exists := app.browserMgr.Profiles["deleted-profile"]; exists {
		t.Fatalf("expected stale cached profile to be removed before proxy binding save")
	}
	if len(dao.upsertedIDs) != 1 || dao.upsertedIDs[0] != "profile-1" {
		t.Fatalf("expected only latest shared profile to be saved, upserted=%v", dao.upsertedIDs)
	}
	latest := app.browserMgr.Profiles["profile-1"]
	if latest == nil || latest.ProxyId != "proxy-fresh" {
		t.Fatalf("expected latest shared profile to be rebound to fresh proxy, got %#v", latest)
	}
	if dao.profiles[1].ProfileName != "Unchanged elsewhere" {
		t.Fatalf("expected unrelated profile to remain untouched, got %#v", dao.profiles[1])
	}
}

func TestProfileSwitchProxyIDRefreshesProfilesBeforeWriting(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	app.browserMgr.Profiles["profile-1"] = &BrowserProfile{
		ProfileId:                  "profile-1",
		ProfileName:                "Stale name",
		GroupId:                    "old-group",
		AutoProxySwitchLastProxyId: "proxy-old",
	}
	dao := &profileDAOListStub{profiles: []*BrowserProfile{
		{
			ProfileId:                  "profile-1",
			ProfileName:                "Fresh name",
			GroupId:                    "fresh-group",
			AutoProxySwitchLastProxyId: "proxy-old",
		},
	}}
	app.browserMgr.ProfileDAO = dao

	app.updateProfileSwitchProxyID("profile-1", "proxy-new")

	if len(dao.upsertedIDs) != 1 || dao.upsertedIDs[0] != "profile-1" {
		t.Fatalf("expected proxy switch state to save one latest profile, upserted=%v", dao.upsertedIDs)
	}
	persisted := dao.profiles[0]
	if persisted.ProfileName != "Fresh name" || persisted.GroupId != "fresh-group" {
		t.Fatalf("expected shared profile fields to be preserved, got %#v", persisted)
	}
	if persisted.AutoProxySwitchLastProxyId != "proxy-new" {
		t.Fatalf("expected last proxy id to be updated, got %#v", persisted)
	}
	cached := app.browserMgr.Profiles["profile-1"]
	if cached.ProfileName != "Fresh name" || cached.GroupId != "fresh-group" || cached.AutoProxySwitchLastProxyId != "proxy-new" {
		t.Fatalf("expected cached profile to be refreshed before write, got %#v", cached)
	}
}

func TestListGroupsCountsFromSharedProfileCacheWithoutProfileDAO(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	app.browserMgr.GroupDAO = &groupDAOListStub{groups: []*BrowserGroup{
		{GroupId: "group-a", GroupName: "Group A"},
		{GroupId: "group-b", GroupName: "Group B"},
	}}
	app.browserMgr.ProfileDAO = nil
	app.browserMgr.Profiles["profile-1"] = &BrowserProfile{ProfileId: "profile-1", GroupId: "group-a"}
	app.browserMgr.Profiles["profile-2"] = &BrowserProfile{ProfileId: "profile-2", GroupId: "group-a"}
	app.browserMgr.Profiles["profile-3"] = &BrowserProfile{ProfileId: "profile-3", GroupId: "group-b"}

	groups := app.ListGroups()
	counts := make(map[string]int)
	for _, group := range groups {
		counts[group.GroupId] = group.InstanceCount
	}
	if counts["group-a"] != 2 || counts["group-b"] != 1 {
		t.Fatalf("expected group counts from cached profiles without ProfileDAO, got %#v", groups)
	}
}

func TestBrowserProfileBatchTagsPersistConfigFallback(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	app.browserMgr.ProfileDAO = nil
	app.browserMgr.Profiles["profile-1"] = &BrowserProfile{
		ProfileId:   "profile-1",
		ProfileName: "Profile 1",
		Tags:        []string{"old"},
	}

	if err := app.BrowserProfileBatchSetTags([]string{"profile-1"}, []string{"new"}, false); err != nil {
		t.Fatalf("BrowserProfileBatchSetTags failed: %v", err)
	}
	loaded, err := config.Load(app.resolveAppPath("config.yaml"))
	if err != nil {
		t.Fatalf("load saved config after batch set failed: %v", err)
	}
	if len(loaded.Browser.Profiles) != 1 || !stringSliceContains(loaded.Browser.Profiles[0].Tags, "old") || !stringSliceContains(loaded.Browser.Profiles[0].Tags, "new") {
		t.Fatalf("expected batch set tags to persist to config fallback, got %#v", loaded.Browser.Profiles)
	}

	if err := app.BrowserProfileBatchRemoveTags([]string{"profile-1"}, []string{"old"}); err != nil {
		t.Fatalf("BrowserProfileBatchRemoveTags failed: %v", err)
	}
	loaded, err = config.Load(app.resolveAppPath("config.yaml"))
	if err != nil {
		t.Fatalf("load saved config after batch remove failed: %v", err)
	}
	if len(loaded.Browser.Profiles) != 1 || stringSliceContains(loaded.Browser.Profiles[0].Tags, "old") || !stringSliceContains(loaded.Browser.Profiles[0].Tags, "new") {
		t.Fatalf("expected batch remove tags to persist to config fallback, got %#v", loaded.Browser.Profiles)
	}
}

func TestSaveBrowserProxiesDiffSavesAndPreservesProbeResults(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	dao := &proxyDAOListStub{proxies: []BrowserProxy{
		{
			ProxyId:          "__direct__",
			ProxyName:        "直连（不走代理）",
			ProxyConfig:      "direct://",
			LastLatencyMs:    5,
			LastTestOk:       true,
			LastTestedAt:     "2026-06-07T00:00:00Z",
			LastIPHealthJSON: `{"ok":true,"ip":"127.0.0.1"}`,
		},
		{
			ProxyId:          "keep",
			ProxyName:        "Keep",
			ProxyConfig:      "http://127.0.0.1:18080",
			LastLatencyMs:    123,
			LastTestOk:       true,
			LastTestedAt:     "2026-06-07T01:00:00Z",
			LastIPHealthJSON: `{"ok":true,"ip":"203.0.113.10"}`,
		},
		{
			ProxyId:     "remove",
			ProxyName:   "Remove",
			ProxyConfig: "http://127.0.0.1:18081",
		},
	}}
	app.browserMgr.ProxyDAO = dao

	err := app.SaveBrowserProxies([]BrowserProxy{
		{
			ProxyId:     "keep",
			ProxyName:   "Keep Updated",
			ProxyConfig: "http://127.0.0.1:18080",
			GroupName:   "fresh",
		},
		{
			ProxyId:     "add",
			ProxyName:   "Add",
			ProxyConfig: "http://127.0.0.1:18082",
		},
	})
	if err != nil {
		t.Fatalf("SaveBrowserProxies failed: %v", err)
	}

	if dao.deleteAllCalled {
		t.Fatalf("expected diff save to avoid DeleteAll")
	}
	if !stringSliceContains(dao.deletedIDs, "remove") {
		t.Fatalf("expected removed proxy to be deleted, deleted=%v", dao.deletedIDs)
	}
	if stringSliceContains(dao.deletedIDs, "keep") || stringSliceContains(dao.deletedIDs, "__direct__") {
		t.Fatalf("expected unchanged proxies to stay in place, deleted=%v", dao.deletedIDs)
	}

	byID := map[string]BrowserProxy{}
	for _, item := range dao.proxies {
		byID[item.ProxyId] = item
	}
	if _, exists := byID["remove"]; exists {
		t.Fatalf("expected removed proxy to be absent, got %#v", dao.proxies)
	}
	keep := byID["keep"]
	if keep.ProxyName != "Keep Updated" || keep.GroupName != "fresh" {
		t.Fatalf("expected keep proxy config fields to update, got %#v", keep)
	}
	if keep.LastLatencyMs != 123 || !keep.LastTestOk || keep.LastTestedAt != "2026-06-07T01:00:00Z" || keep.LastIPHealthJSON == "" {
		t.Fatalf("expected keep proxy probe fields to be preserved, got %#v", keep)
	}
	direct := byID["__direct__"]
	if direct.LastLatencyMs != 5 || !direct.LastTestOk || direct.LastTestedAt == "" || direct.LastIPHealthJSON == "" {
		t.Fatalf("expected builtin proxy probe fields to be preserved, got %#v", direct)
	}
	if _, exists := byID["add"]; !exists {
		t.Fatalf("expected new proxy to be inserted, got %#v", dao.proxies)
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

func stringSliceContains(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
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
		for i, existing := range s.profiles {
			if existing != nil && existing.ProfileId == profile.ProfileId {
				snapshot := *profile
				s.profiles[i] = &snapshot
				return nil
			}
		}
		snapshot := *profile
		s.profiles = append(s.profiles, &snapshot)
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
	proxies         []BrowserProxy
	deletedIDs      []string
	upsertedIDs     []string
	deleteAllCalled bool
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
func (s *proxyDAOListStub) Upsert(proxy BrowserProxy) error {
	s.upsertedIDs = append(s.upsertedIDs, proxy.ProxyId)
	for i, existing := range s.proxies {
		if existing.ProxyId != proxy.ProxyId {
			continue
		}
		proxy.LastLatencyMs = existing.LastLatencyMs
		proxy.LastTestOk = existing.LastTestOk
		proxy.LastTestedAt = existing.LastTestedAt
		proxy.LastIPHealthJSON = existing.LastIPHealthJSON
		s.proxies[i] = proxy
		return nil
	}
	s.proxies = append(s.proxies, proxy)
	return nil
}
func (s *proxyDAOListStub) Delete(proxyId string) error {
	s.deletedIDs = append(s.deletedIDs, proxyId)
	next := s.proxies[:0]
	for _, item := range s.proxies {
		if item.ProxyId != proxyId {
			next = append(next, item)
		}
	}
	s.proxies = next
	return nil
}
func (s *proxyDAOListStub) DeleteAll() error {
	s.deleteAllCalled = true
	s.proxies = nil
	return nil
}
func (s *proxyDAOListStub) UpdateSpeedResult(string, bool, int64, string) error {
	return nil
}
func (s *proxyDAOListStub) UpdateIPHealthResult(string, string) error { return nil }

type groupDAOListStub struct {
	groups []*BrowserGroup
}

func (s *groupDAOListStub) List() ([]*BrowserGroup, error) {
	out := make([]*BrowserGroup, 0, len(s.groups))
	for _, group := range s.groups {
		if group == nil {
			continue
		}
		snapshot := *group
		out = append(out, &snapshot)
	}
	return out, nil
}

func (s *groupDAOListStub) GetById(groupId string) (*BrowserGroup, error) {
	for _, group := range s.groups {
		if group != nil && group.GroupId == groupId {
			snapshot := *group
			return &snapshot, nil
		}
	}
	return nil, os.ErrNotExist
}

func (s *groupDAOListStub) Create(input BrowserGroupInput) (*BrowserGroup, error) {
	return nil, nil
}

func (s *groupDAOListStub) Update(groupId string, input BrowserGroupInput) (*BrowserGroup, error) {
	return nil, nil
}

func (s *groupDAOListStub) Delete(groupId string) error { return nil }

func (s *groupDAOListStub) GetChildren(parentId string) ([]*BrowserGroup, error) {
	return nil, nil
}

func (s *groupDAOListStub) MoveChildren(fromGroupId, toGroupId string) error {
	return nil
}
