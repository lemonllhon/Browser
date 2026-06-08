package backend

import (
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/database"
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

func TestBackupEnsureZipSuffix(t *testing.T) {
	if got := backupEnsureZipSuffix("c:/tmp/a.zip"); got != "c:/tmp/a.zip" {
		t.Fatalf("zip 后缀重复追加: %s", got)
	}
	if got := backupEnsureZipSuffix("c:/tmp/a"); got != "c:/tmp/a.zip" {
		t.Fatalf("zip 后缀追加失败: %s", got)
	}
}

func TestBackupMergeConfigDedup(t *testing.T) {
	current := config.DefaultConfig()
	current.App.MaxProfileLimit = 12
	current.App.UsedCDKeys = []string{"A1", "B2"}
	current.Browser.DefaultBookmarks = []config.BrowserBookmark{
		{Name: "Google", URL: "https://www.google.com/"},
	}
	current.Browser.Proxies = []config.BrowserProxy{
		{ProxyId: "p1", ProxyName: "P1", ProxyConfig: "http://127.0.0.1:7890"},
	}
	current.Browser.Cores = []config.BrowserCore{
		{CoreId: "c1", CoreName: "C1", CorePath: "chrome/c1"},
	}
	current.Browser.Profiles = []config.BrowserProfileConfig{
		{ProfileId: "u1", ProfileName: "U1", UserDataDir: "u1"},
	}

	incoming := config.DefaultConfig()
	incoming.App.UsedCDKeys = []string{"b2", "C3"}
	incoming.Browser.DefaultBookmarks = []config.BrowserBookmark{
		{Name: "Google Dup", URL: "https://www.google.com/"},
		{Name: "ChatGPT", URL: "https://chatgpt.com/"},
	}
	incoming.Browser.Proxies = []config.BrowserProxy{
		{ProxyId: "p1", ProxyName: "P1 Dup", ProxyConfig: "http://127.0.0.1:7890"},
		{ProxyId: "p2", ProxyName: "P2", ProxyConfig: "socks5://127.0.0.1:1080"},
	}
	incoming.Browser.Cores = []config.BrowserCore{
		{CoreId: "c1", CoreName: "C1 Dup", CorePath: "chrome/c1"},
		{CoreId: "c2", CoreName: "C2", CorePath: "chrome/c2"},
	}
	incoming.Browser.Profiles = []config.BrowserProfileConfig{
		{ProfileId: "u1", ProfileName: "U1 Dup", UserDataDir: "u1"},
		{ProfileId: "u2", ProfileName: "U2", UserDataDir: "u2"},
	}

	merged := backupMergeConfig(current, incoming)
	if merged == nil {
		t.Fatalf("merged 为空")
	}

	if merged.App.MaxProfileLimit != 12 {
		t.Fatalf("license limit 不应被导入配置改写: got=%d", merged.App.MaxProfileLimit)
	}
	if len(merged.App.UsedCDKeys) != 2 {
		t.Fatalf("used cd keys 不应被导入配置改写: %+v", merged.App.UsedCDKeys)
	}
	if len(merged.Browser.DefaultBookmarks) != 2 {
		t.Fatalf("bookmarks 判重失败: %+v", merged.Browser.DefaultBookmarks)
	}
	if len(merged.Browser.Proxies) != 2 {
		t.Fatalf("proxies 判重失败: %+v", merged.Browser.Proxies)
	}
	if len(merged.Browser.Cores) != 2 {
		t.Fatalf("cores 判重失败: %+v", merged.Browser.Cores)
	}
	if len(merged.Browser.Profiles) != 2 {
		t.Fatalf("profiles 判重失败: %+v", merged.Browser.Profiles)
	}
}

func TestBackupSyncDirConflictAndOverwrite(t *testing.T) {
	src := filepath.Join(t.TempDir(), "src")
	dst := filepath.Join(t.TempDir(), "dst")
	if err := os.MkdirAll(src, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(dst, 0755); err != nil {
		t.Fatal(err)
	}

	srcFile := filepath.Join(src, "a.txt")
	dstFile := filepath.Join(dst, "a.txt")
	if err := os.WriteFile(srcFile, []byte("new-content"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dstFile, []byte("old-content"), 0644); err != nil {
		t.Fatal(err)
	}

	stats := &backupMergeStats{}
	if err := backupSyncDir(src, dst, false, stats, nil); err != nil {
		t.Fatal(err)
	}
	if stats.Conflicts != 1 || stats.Imported != 0 {
		t.Fatalf("非覆盖模式统计异常: %+v", stats)
	}
	got, err := os.ReadFile(dstFile)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "old-content" {
		t.Fatalf("非覆盖模式不应改写目标文件: %s", string(got))
	}

	stats2 := &backupMergeStats{}
	if err := backupSyncDir(src, dst, true, stats2, nil); err != nil {
		t.Fatal(err)
	}
	if stats2.Imported != 1 {
		t.Fatalf("覆盖模式导入统计异常: %+v", stats2)
	}
	got2, err := os.ReadFile(dstFile)
	if err != nil {
		t.Fatal(err)
	}
	if string(got2) != "new-content" {
		t.Fatalf("覆盖模式应改写目标文件: %s", string(got2))
	}
}

func TestBackupZipAddDirSkipsCloudSyncSession(t *testing.T) {
	src := t.TempDir()
	if err := os.WriteFile(filepath.Join(src, "app.db"), []byte("database"), 0644); err != nil {
		t.Fatal(err)
	}
	sessionPath := filepath.Join(src, "cloud-sync", "session.json")
	if err := os.MkdirAll(filepath.Dir(sessionPath), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(sessionPath, []byte(`{"refreshToken":"secret"}`), 0644); err != nil {
		t.Fatal(err)
	}
	extensionFiles := map[string]string{
		filepath.Join("extensions", "library", "extension-1", "manifest.json"):                                            `{"name":"Trace Helper"}`,
		filepath.Join("extensions", "packages", "extension-1.zip"):                                                        "zip-data",
		filepath.Join("extensions", "exclusive", "profile-1", "extension-1", "manifest.json"):                             `{"name":"Trace Helper Exclusive"}`,
		filepath.Join("extensions", "shared-data", "extension-1", "chromeid", "local-extension-settings", "000003.log"):   "shared-state",
		filepath.Join("profile-1", "Default", "Local Extension Settings", "chromeid", "000003.log"):                       "profile-extension-state",
		filepath.Join("profile-1", "Default", "IndexedDB", "chrome-extension_chromeid_0.indexeddb.leveldb", "000003.log"): "profile-indexeddb",
		filepath.Join("profile-1", "Default", "Extension State", "chrome-extension_chromeid", "CURRENT"):                  "profile-extension-state-root",
		filepath.Join("extensions", "tmp", "extension-1", "manifest.json"):                                                `{"name":"Temporary"}`,
	}
	for rel, content := range extensionFiles {
		target := filepath.Join(src, rel)
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}

	zipPath := filepath.Join(t.TempDir(), "backup.zip")
	out, err := os.Create(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(out)
	count, err := backupZipAddDir(writer, src, "payload/app/data/", zipPath)
	closeErr := writer.Close()
	fileCloseErr := out.Close()
	if err != nil {
		t.Fatal(err)
	}
	if closeErr != nil {
		t.Fatal(closeErr)
	}
	if fileCloseErr != nil {
		t.Fatal(fileCloseErr)
	}
	if count != 8 {
		t.Fatalf("unexpected archived file count: %d", count)
	}

	entries := readBackupZipEntries(t, zipPath)
	if !entries["payload/app/data/app.db"] {
		t.Fatalf("expected app data file in backup, got %+v", entries)
	}
	if entries["payload/app/data/cloud-sync/session.json"] {
		t.Fatalf("cloud sync session should not be archived")
	}
	expectedExtensionEntries := []string{
		"payload/app/data/extensions/library/extension-1/manifest.json",
		"payload/app/data/extensions/packages/extension-1.zip",
		"payload/app/data/extensions/exclusive/profile-1/extension-1/manifest.json",
		"payload/app/data/extensions/shared-data/extension-1/chromeid/local-extension-settings/000003.log",
		"payload/app/data/profile-1/Default/Local Extension Settings/chromeid/000003.log",
		"payload/app/data/profile-1/Default/IndexedDB/chrome-extension_chromeid_0.indexeddb.leveldb/000003.log",
		"payload/app/data/profile-1/Default/Extension State/chrome-extension_chromeid/CURRENT",
	}
	for _, name := range expectedExtensionEntries {
		if !entries[name] {
			t.Fatalf("expected extension data file in backup: %s", name)
		}
	}
	if entries["payload/app/data/extensions/tmp/extension-1/manifest.json"] {
		t.Fatalf("extension tmp data should not be archived")
	}
}

func TestBackupSyncDirSkipsAppDataRuntimeOnlyPaths(t *testing.T) {
	src := filepath.Join(t.TempDir(), "src")
	dst := filepath.Join(t.TempDir(), "dst")
	sourceFiles := map[string]string{
		"app.db": "database",
		filepath.Join("cloud-sync", "session.json"):                            "secret",
		filepath.Join("extensions", "tmp", "extension-1", "a.js"):              "temporary",
		filepath.Join("extensions", "library", "extension-1", "manifest.json"): "extension",
	}
	for rel, content := range sourceFiles {
		target := filepath.Join(src, rel)
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}

	stats := &backupMergeStats{}
	if err := backupSyncDir(src, dst, true, stats, backupShouldSkipAppDataImportRelPath); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dst, "extensions", "library", "extension-1", "manifest.json")); err != nil {
		t.Fatalf("extension library should be imported: %v", err)
	}
	skipped := []string{
		"app.db",
		filepath.Join("cloud-sync", "session.json"),
		filepath.Join("extensions", "tmp", "extension-1", "a.js"),
	}
	for _, rel := range skipped {
		if _, err := os.Stat(filepath.Join(dst, rel)); err == nil {
			t.Fatalf("runtime-only app data path should be skipped: %s", rel)
		} else if !os.IsNotExist(err) {
			t.Fatal(err)
		}
	}
}

func readBackupZipEntries(t *testing.T, zipPath string) map[string]bool {
	t.Helper()
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	entries := map[string]bool{}
	for _, file := range reader.File {
		entries[file.Name] = true
	}
	return entries
}

func TestBackupMergeDatabaseFromLegacySourceFillsMissingColumns(t *testing.T) {
	app, db := newBackupMergeDatabaseTestApp(t)
	srcPath := filepath.Join(t.TempDir(), "legacy.db")
	src, err := database.NewDB(srcPath)
	if err != nil {
		t.Fatal(err)
	}
	srcConn := src.GetConn()
	legacyStmts := []string{
		`CREATE TABLE browser_profiles (
			profile_id TEXT PRIMARY KEY,
			profile_name TEXT NOT NULL,
			user_data_dir TEXT NOT NULL DEFAULT '',
			core_id TEXT NOT NULL DEFAULT '',
			fingerprint_args TEXT NOT NULL DEFAULT '[]',
			proxy_id TEXT NOT NULL DEFAULT '',
			proxy_config TEXT NOT NULL DEFAULT '',
			launch_args TEXT NOT NULL DEFAULT '[]',
			tags TEXT NOT NULL DEFAULT '[]',
			keywords TEXT NOT NULL DEFAULT '[]',
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		)`,
		`CREATE TABLE browser_proxies (
			proxy_id TEXT PRIMARY KEY,
			proxy_name TEXT NOT NULL,
			proxy_config TEXT NOT NULL,
			dns_servers TEXT NOT NULL DEFAULT '',
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE browser_extensions (
			extension_id TEXT PRIMARY KEY,
			name TEXT NOT NULL DEFAULT '',
			version TEXT NOT NULL DEFAULT '',
			manifest_version INTEGER NOT NULL DEFAULT 0,
			description TEXT NOT NULL DEFAULT '',
			source_type TEXT NOT NULL DEFAULT '',
			source_url TEXT NOT NULL DEFAULT '',
			install_dir TEXT NOT NULL DEFAULT '',
			package_path TEXT NOT NULL DEFAULT '',
			manifest_json TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE browser_profile_extensions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			profile_id TEXT NOT NULL,
			extension_id TEXT NOT NULL,
			mode TEXT NOT NULL DEFAULT 'shared',
			enabled INTEGER NOT NULL DEFAULT 1,
			exclusive_dir TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(profile_id, extension_id)
		)`,
		`INSERT INTO browser_profiles (profile_id, profile_name, user_data_dir, core_id, fingerprint_args, proxy_id, proxy_config, launch_args, tags, keywords, created_at, updated_at)
		 VALUES ('profile-old', '旧实例', 'profiles/old', '', '[]', 'proxy-old', 'http://127.0.0.1:7890', '[]', '[]', '[]', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`,
		`INSERT INTO browser_proxies (proxy_id, proxy_name, proxy_config, dns_servers, sort_order, created_at)
		 VALUES ('proxy-old', '旧代理', 'http://127.0.0.1:7890', '', 7, '2024-01-01T00:00:00Z')`,
		`INSERT INTO browser_extensions (extension_id, name, version, manifest_version, description, source_type, source_url, install_dir, package_path, manifest_json, created_at, updated_at)
		 VALUES ('extension-old', '旧扩展', '1.0.0', 3, '', 'directory', '', 'data/extensions/library/extension-old', '', '{}', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`,
		`INSERT INTO browser_profile_extensions (profile_id, extension_id, mode, enabled, exclusive_dir, created_at, updated_at)
		 VALUES ('profile-old', 'extension-old', 'shared', 1, '', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`,
	}
	for _, stmt := range legacyStmts {
		if _, err := srcConn.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	if err := src.Close(); err != nil {
		t.Fatal(err)
	}

	stats := &backupMergeStats{}
	if err := app.backupMergeDatabaseFromSource(srcPath, false, stats); err != nil {
		t.Fatalf("backupMergeDatabaseFromSource failed: %v", err)
	}

	var switchMode string
	var rotateByGroup int
	var groupID string
	if err := db.GetConn().QueryRow(`SELECT auto_proxy_switch_mode, auto_proxy_switch_rotate_by_group, group_id FROM browser_profiles WHERE profile_id = 'profile-old'`).Scan(&switchMode, &rotateByGroup, &groupID); err != nil {
		t.Fatal(err)
	}
	if switchMode != "interval" || rotateByGroup != 0 || groupID != "" {
		t.Fatalf("legacy profile defaults mismatch: mode=%q rotate=%d group=%q", switchMode, rotateByGroup, groupID)
	}

	var sourceFilter string
	var lastLatency int
	if err := db.GetConn().QueryRow(`SELECT source_filter_json, last_latency_ms FROM browser_proxies WHERE proxy_id = 'proxy-old'`).Scan(&sourceFilter, &lastLatency); err != nil {
		t.Fatal(err)
	}
	if sourceFilter != "" || lastLatency != -1 {
		t.Fatalf("legacy proxy defaults mismatch: source_filter=%q latency=%d", sourceFilter, lastLatency)
	}

	var autoBindEnabled int
	var autoBindMode string
	if err := db.GetConn().QueryRow(`SELECT auto_bind_enabled, auto_bind_mode FROM browser_extensions WHERE extension_id = 'extension-old'`).Scan(&autoBindEnabled, &autoBindMode); err != nil {
		t.Fatal(err)
	}
	if autoBindEnabled != 0 || autoBindMode != "shared" {
		t.Fatalf("legacy extension defaults mismatch: enabled=%d mode=%q", autoBindEnabled, autoBindMode)
	}

	var bindingCount int
	if err := db.GetConn().QueryRow(`SELECT COUNT(1) FROM browser_profile_extensions WHERE profile_id = 'profile-old' AND extension_id = 'extension-old'`).Scan(&bindingCount); err != nil {
		t.Fatal(err)
	}
	if bindingCount != 1 {
		t.Fatalf("expected extension binding to be imported, got %d", bindingCount)
	}
}

func newBackupMergeDatabaseTestApp(t *testing.T) (*App, *database.DB) {
	t.Helper()
	root := t.TempDir()
	app := NewApp(root)
	app.config = config.DefaultConfig()
	dbPath := filepath.Join(root, "data", "app.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		t.Fatal(err)
	}
	db, err := database.NewDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatal(err)
	}
	app.db = db
	return app, db
}
