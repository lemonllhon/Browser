package backend

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"ant-chrome/backend/internal/browser"
)

// BrowserExtensionSyncDataInput 扩展插件数据同步输入。
type BrowserExtensionSyncDataInput struct {
	ExtensionId      string   `json:"extensionId"`
	SourceProfileId  string   `json:"sourceProfileId"`
	TargetProfileIds []string `json:"targetProfileIds"`
}

// BrowserExtensionSyncProfileData 将主实例中的扩展数据直接同步到副实例用户数据目录。
func (a *App) BrowserExtensionSyncProfileData(input BrowserExtensionSyncDataInput) ([]BrowserExtensionBinding, error) {
	dao, err := a.extensionDAO()
	if err != nil {
		return nil, err
	}
	extensionId := strings.TrimSpace(input.ExtensionId)
	if extensionId == "" {
		return nil, fmt.Errorf("扩展插件 ID 不能为空")
	}
	sourceProfileId := strings.TrimSpace(input.SourceProfileId)
	if sourceProfileId == "" {
		return nil, fmt.Errorf("请选择主实例")
	}
	targetProfileIds := normalizeStringList(input.TargetProfileIds)
	if len(targetProfileIds) == 0 {
		return nil, fmt.Errorf("请选择副实例")
	}
	for _, targetProfileId := range targetProfileIds {
		if strings.EqualFold(targetProfileId, sourceProfileId) {
			return nil, fmt.Errorf("主实例不能同时作为副实例")
		}
	}

	if err := a.refreshConfigCacheFromDiskIfPresent(); err != nil {
		return nil, fmt.Errorf("重载浏览器配置失败: %w", err)
	}
	a.refreshBrowserProfileSharedRuntimeOverlay()
	extension, err := dao.Get(extensionId)
	if err != nil {
		return nil, err
	}
	sourceProfile, err := a.requireStoppedProfileForExtensionSync(sourceProfileId, "主实例")
	if err != nil {
		return nil, err
	}
	sourceBinding, err := a.requireExtensionBindingForProfile(dao, sourceProfileId, extensionId, "主实例")
	if err != nil {
		return nil, err
	}
	sourceChromeID, sourceExtensionDir, _, err := a.chromeExtensionIDForProfileBinding(sourceProfile, sourceBinding, extension)
	if err != nil {
		return nil, err
	}

	targets := make([]extensionDataSyncTarget, 0, len(targetProfileIds))
	for _, targetProfileId := range targetProfileIds {
		targetProfile, err := a.requireStoppedProfileForExtensionSync(targetProfileId, "副实例")
		if err != nil {
			return nil, err
		}
		targetBinding, err := a.requireExtensionBindingForProfile(dao, targetProfileId, extensionId, "副实例")
		if err != nil {
			return nil, err
		}
		if normalizeExtensionBindingMode(targetBinding.Mode) != "shared" {
			return nil, fmt.Errorf("副实例「%s」不是共享绑定，请先将绑定模式改为共享", profileDisplayName(targetProfile))
		}
		targetChromeID, targetExtensionDir, targetIDFromProfile, err := a.chromeExtensionIDForProfileBinding(targetProfile, targetBinding, extension)
		if err != nil {
			return nil, err
		}
		if !strings.EqualFold(sourceChromeID, targetChromeID) {
			if sameCleanPath(sourceExtensionDir, targetExtensionDir) && !targetIDFromProfile {
				targetChromeID = sourceChromeID
			} else {
				return nil, fmt.Errorf("主实例与副实例「%s」的浏览器真实扩展 ID 不一致，无法安全同步数据", profileDisplayName(targetProfile))
			}
		}
		targets = append(targets, extensionDataSyncTarget{
			profile:  targetProfile,
			chromeID: targetChromeID,
		})
	}

	sourceUserDataDir := a.browserMgr.ResolveUserDataDir(sourceProfile)
	for _, target := range targets {
		targetUserDataDir := a.browserMgr.ResolveUserDataDir(target.profile)
		if err := a.syncExtensionDataFromProfileToProfile(extension.ExtensionId, sourceUserDataDir, targetUserDataDir, sourceChromeID, target.chromeID); err != nil {
			return nil, fmt.Errorf("同步到副实例「%s」失败: %w", profileDisplayName(target.profile), err)
		}
	}
	a.clearExtensionAutoSyncBlocked(extensionId)
	bindings, err := dao.ListBindings(extensionId)
	if err != nil {
		return nil, err
	}
	a.emitBrowserExtensionsUpdated()
	return bindings, nil
}

type extensionDataSyncTarget struct {
	profile  *browser.Profile
	chromeID string
}

type extensionDataSyncPath struct {
	profileRel              string
	sharedRel               string
	kind                    extensionSharedDataKind
	syncSharedBacking       bool
	removeWhenSourceMissing bool
}

type extensionDataSyncStats struct {
	sourceFound int
	copied      int
	removed     int
}

type extensionDataSyncPathResult struct {
	sourceFound bool
	copied      bool
	removed     bool
}

func (a *App) requireStoppedProfileForExtensionSync(profileId string, role string) (*browser.Profile, error) {
	profile, err := a.requireProfile(profileId)
	if err != nil {
		return nil, err
	}
	if a.isProfileRunning(profileId) {
		return nil, fmt.Errorf("%s「%s」正在运行，请先停止后再同步插件数据", role, profileDisplayName(profile))
	}
	return profile, nil
}

func (a *App) requireExtensionBindingForProfile(dao browser.ExtensionDAO, profileId string, extensionId string, role string) (browser.ExtensionBinding, error) {
	bindings, err := dao.ListBindingsByProfile(profileId)
	if err != nil {
		return browser.ExtensionBinding{}, err
	}
	for _, binding := range bindings {
		if binding.ExtensionId != extensionId {
			continue
		}
		if !binding.Enabled {
			return browser.ExtensionBinding{}, fmt.Errorf("%s未启用当前扩展插件", role)
		}
		return binding, nil
	}
	return browser.ExtensionBinding{}, fmt.Errorf("%s未绑定当前扩展插件", role)
}

func (a *App) chromeExtensionIDForProfileBinding(profile *browser.Profile, binding browser.ExtensionBinding, extension *browser.Extension) (string, string, bool, error) {
	extensionDir, err := a.extensionDirForBinding(binding, extension)
	if err != nil {
		return "", "", false, err
	}
	if a != nil && a.browserMgr != nil && profile != nil {
		userDataDir := a.browserMgr.ResolveUserDataDir(profile)
		if id, ok, err := chromeExtensionIDFromProfilePreferences(userDataDir, extensionDir); err != nil {
			return "", "", false, err
		} else if ok {
			return id, extensionDir, true, nil
		}
	}
	id, err := chromeExtensionIDForDirectory(extensionDir)
	return id, extensionDir, false, err
}

func chromeExtensionIDFromProfilePreferences(userDataDir string, extensionDir string) (string, bool, error) {
	for _, name := range []string{"Preferences", "Secure Preferences"} {
		id, ok, err := chromeExtensionIDFromPreferenceFile(filepath.Join(userDataDir, "Default", name), extensionDir)
		if err != nil || ok {
			return id, ok, err
		}
	}
	return "", false, nil
}

func chromeExtensionIDFromPreferenceFile(preferencesPath string, extensionDir string) (string, bool, error) {
	data, err := os.ReadFile(preferencesPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("读取实例扩展 Preferences 失败: %w", err)
	}
	var root map[string]interface{}
	if err := json.Unmarshal(data, &root); err != nil {
		return "", false, fmt.Errorf("解析实例扩展 Preferences 失败: %w", err)
	}
	extensions, _ := root["extensions"].(map[string]interface{})
	settings, _ := extensions["settings"].(map[string]interface{})
	for id, raw := range settings {
		if !isChromeExtensionID(id) {
			continue
		}
		item, _ := raw.(map[string]interface{})
		recordedPath, _ := item["path"].(string)
		if extensionPreferencePathMatches(recordedPath, extensionDir) {
			return id, true, nil
		}
	}
	return "", false, nil
}

func extensionPreferencePathMatches(recordedPath string, extensionDir string) bool {
	recordedPath = strings.TrimSpace(recordedPath)
	if recordedPath == "" {
		return false
	}
	recordedPath = filepath.FromSlash(recordedPath)
	if !filepath.IsAbs(recordedPath) {
		if abs, err := filepath.Abs(recordedPath); err == nil {
			recordedPath = abs
		}
	}
	return sameCleanPath(recordedPath, extensionDir)
}

func isChromeExtensionID(id string) bool {
	id = strings.TrimSpace(id)
	if len(id) != 32 {
		return false
	}
	for _, char := range id {
		if char < 'a' || char > 'p' {
			return false
		}
	}
	return true
}

func (a *App) syncExtensionDataFromProfileToProfile(extensionID string, sourceUserDataDir string, targetUserDataDir string, sourceChromeID string, targetChromeID string) error {
	sourceBase := filepath.Join(sourceUserDataDir, "Default")
	targetBase := filepath.Join(targetUserDataDir, "Default")
	if err := os.MkdirAll(targetBase, 0755); err != nil {
		return fmt.Errorf("创建副实例默认配置目录失败: %w", err)
	}

	sourcePaths := extensionDataSyncPaths(sourceChromeID)
	sourcePaths = appendDiscoveredExtensionDataSyncPaths(sourcePaths, discoverExtensionDataSyncPaths(sourceBase, sourceChromeID))
	stats := extensionDataSyncStats{}
	for _, sourceItem := range sourcePaths {
		targetItem := sourceItem
		targetItem.profileRel = extensionDataTargetProfileRel(sourceItem.profileRel, sourceChromeID, targetChromeID)
		sourcePath := filepath.Join(sourceBase, filepath.FromSlash(sourceItem.profileRel))
		targetPath := filepath.Join(targetBase, filepath.FromSlash(targetItem.profileRel))
		result, err := a.syncExtensionDataPath(sourceUserDataDir, targetUserDataDir, sourcePath, targetPath, sourceItem.kind, sourceItem.removeWhenSourceMissing)
		if err != nil {
			return fmt.Errorf("%s: %w", sourceItem.profileRel, err)
		}
		stats.add(result)
		if targetItem.syncSharedBacking && strings.TrimSpace(targetItem.sharedRel) != "" {
			targetSharedPath := filepath.Join(a.extensionSharedDataDir(extensionID), targetChromeID, filepath.FromSlash(targetItem.sharedRel))
			result, err := a.syncExtensionDataPath(sourceUserDataDir, a.extensionSharedDataRoot(), sourcePath, targetSharedPath, sourceItem.kind, sourceItem.removeWhenSourceMissing)
			if err != nil {
				return fmt.Errorf("%s: %w", sourceItem.profileRel, err)
			}
			stats.add(result)
		}
	}
	if stats.sourceFound == 0 {
		return fmt.Errorf("主实例未发现当前扩展的可同步数据，请确认主实例已启动过该插件并已保存插件设置（浏览器真实扩展 ID: %s）", sourceChromeID)
	}
	return nil
}

func (s *extensionDataSyncStats) add(result extensionDataSyncPathResult) {
	if result.sourceFound {
		s.sourceFound++
	}
	if result.copied {
		s.copied++
	}
	if result.removed {
		s.removed++
	}
}

func extensionDataSyncPaths(chromeID string) []extensionDataSyncPath {
	paths := make([]extensionDataSyncPath, 0, len(sharedExtensionDataPaths(chromeID))+8)
	for _, item := range sharedExtensionDataPaths(chromeID) {
		paths = append(paths, extensionDataSyncPath{
			profileRel:              item.profileRel,
			sharedRel:               item.sharedRel,
			kind:                    item.kind,
			syncSharedBacking:       true,
			removeWhenSourceMissing: true,
		})
	}
	paths = append(paths,
		extensionDataSyncPath{profileRel: "Storage/ext/" + chromeID, kind: extensionSharedDataDir, removeWhenSourceMissing: true},
		extensionDataSyncPath{profileRel: "Storage/ext/chrome-extension_" + chromeID, kind: extensionSharedDataDir, removeWhenSourceMissing: true},
		extensionDataSyncPath{profileRel: "Storage/ext/chrome-extension_" + chromeID + "_0", kind: extensionSharedDataDir, removeWhenSourceMissing: true},
		extensionDataSyncPath{profileRel: "Local Storage/leveldb", kind: extensionSharedDataDir},
		extensionDataSyncPath{profileRel: "Session Storage", kind: extensionSharedDataDir},
		extensionDataSyncPath{profileRel: "Service Worker", kind: extensionSharedDataDir},
		extensionDataSyncPath{profileRel: "Extension State", kind: extensionSharedDataDir},
	)
	return paths
}

func appendDiscoveredExtensionDataSyncPaths(paths []extensionDataSyncPath, discovered []extensionDataSyncPath) []extensionDataSyncPath {
	seen := make(map[string]struct{}, len(paths)+len(discovered))
	for _, item := range paths {
		seen[extensionDataSyncPathKey(item.profileRel)] = struct{}{}
	}
	for _, item := range discovered {
		key := extensionDataSyncPathKey(item.profileRel)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		paths = append(paths, item)
	}
	return paths
}

func extensionDataSyncPathKey(profileRel string) string {
	return strings.ToLower(filepath.ToSlash(filepath.Clean(filepath.FromSlash(profileRel))))
}

func extensionDataTargetProfileRel(sourceRel string, sourceChromeID string, targetChromeID string) string {
	if strings.EqualFold(sourceChromeID, targetChromeID) {
		return sourceRel
	}
	return strings.ReplaceAll(sourceRel, sourceChromeID, targetChromeID)
}

func discoverExtensionDataSyncPaths(sourceBase string, chromeID string) []extensionDataSyncPath {
	chromeID = strings.TrimSpace(chromeID)
	if chromeID == "" {
		return nil
	}
	markers := []string{
		chromeID,
		"chrome-extension_" + chromeID,
		"chrome-extension://" + chromeID,
	}
	paths := make([]extensionDataSyncPath, 0)
	seen := map[string]struct{}{}
	_ = filepath.WalkDir(sourceBase, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil || entry == nil {
			return nil
		}
		rel, err := filepath.Rel(sourceBase, path)
		if err != nil || rel == "." {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if shouldSkipExtensionDataDiscoveryPath(rel, entry) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.Contains(rel, chromeID) {
			if rootRel, kind, ok := discoveredExtensionDataRoot(rel, entry.IsDir(), chromeID); ok {
				paths = appendUniqueDiscoveredExtensionDataPath(paths, seen, rootRel, kind, true)
				if entry.IsDir() && extensionDataSyncPathKey(rootRel) == extensionDataSyncPathKey(rel) {
					return filepath.SkipDir
				}
			}
		}
		if !entry.IsDir() && shouldInspectExtensionDataFileContent(rel) && fileContainsAnyMarker(path, markers) {
			if rootRel, ok := discoveredExtensionDataContentRoot(rel); ok {
				paths = appendUniqueDiscoveredExtensionDataPath(paths, seen, rootRel, extensionSharedDataDir, false)
			}
		}
		return nil
	})
	return paths
}

func appendUniqueDiscoveredExtensionDataPath(paths []extensionDataSyncPath, seen map[string]struct{}, profileRel string, kind extensionSharedDataKind, removeWhenSourceMissing bool) []extensionDataSyncPath {
	profileRel = filepath.ToSlash(filepath.Clean(filepath.FromSlash(profileRel)))
	key := extensionDataSyncPathKey(profileRel)
	if _, ok := seen[key]; ok {
		return paths
	}
	seen[key] = struct{}{}
	return append(paths, extensionDataSyncPath{
		profileRel:              profileRel,
		kind:                    kind,
		removeWhenSourceMissing: removeWhenSourceMissing,
	})
}

func shouldSkipExtensionDataDiscoveryPath(rel string, entry fs.DirEntry) bool {
	parts := strings.Split(filepath.ToSlash(rel), "/")
	if len(parts) == 0 {
		return false
	}
	name := strings.ToLower(parts[len(parts)-1])
	if entry.IsDir() {
		switch name {
		case "cache", "code cache", "gpucache", "grshadercache", "shadercache", "crashpad", "browsermetrics", "optimization hints":
			return true
		}
	}
	return false
}

func shouldInspectExtensionDataFileContent(rel string) bool {
	rel = filepath.ToSlash(rel)
	prefixes := []string{
		"Local Storage/leveldb/",
		"Session Storage/",
		"Service Worker/",
		"Extension State/",
		"Storage/",
		"IndexedDB/",
		"File System/",
		"databases/",
	}
	for _, prefix := range prefixes {
		if strings.HasPrefix(rel, prefix) {
			return true
		}
	}
	return false
}

func discoveredExtensionDataRoot(rel string, isDir bool, chromeID string) (string, extensionSharedDataKind, bool) {
	parts := strings.Split(filepath.ToSlash(rel), "/")
	if len(parts) == 0 {
		return "", extensionSharedDataDir, false
	}
	if len(parts) >= 2 {
		switch parts[0] {
		case "Local Extension Settings", "Sync Extension Settings", "IndexedDB", "File System", "databases", "Extension Rules", "Extension Scripts", "DNR Extension Rules", "Managed Extension Settings":
			if strings.Contains(parts[1], chromeID) {
				return strings.Join(parts[:2], "/"), extensionSharedDataDir, true
			}
		case "Local Storage":
			if strings.Contains(parts[1], chromeID) {
				return strings.Join(parts[:2], "/"), extensionSharedDataFile, true
			}
		}
	}
	if len(parts) >= 3 && parts[0] == "Storage" && parts[1] == "ext" && strings.Contains(parts[2], chromeID) {
		return strings.Join(parts[:3], "/"), extensionSharedDataDir, true
	}
	for i, part := range parts {
		if !strings.Contains(part, chromeID) {
			continue
		}
		kind := extensionSharedDataDir
		if !isDir && i == len(parts)-1 {
			kind = extensionSharedDataFile
		}
		return strings.Join(parts[:i+1], "/"), kind, true
	}
	return "", extensionSharedDataDir, false
}

func discoveredExtensionDataContentRoot(rel string) (string, bool) {
	rel = filepath.ToSlash(rel)
	switch {
	case strings.HasPrefix(rel, "Local Storage/leveldb/"):
		return "Local Storage/leveldb", true
	case strings.HasPrefix(rel, "Session Storage/"):
		return "Session Storage", true
	case strings.HasPrefix(rel, "Service Worker/"):
		return "Service Worker", true
	case strings.HasPrefix(rel, "Extension State/"):
		return "Extension State", true
	case strings.HasPrefix(rel, "Storage/"):
		return "Storage", true
	case strings.HasPrefix(rel, "IndexedDB/"):
		return "IndexedDB", true
	case strings.HasPrefix(rel, "File System/"):
		return "File System", true
	case strings.HasPrefix(rel, "databases/"):
		return "databases", true
	default:
		return "", false
	}
}

func fileContainsAnyMarker(path string, markers []string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() || info.Size() > 16*1024*1024 {
		return false
	}
	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		return false
	}
	text := string(data)
	for _, marker := range markers {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}

func (a *App) syncExtensionDataPath(sourceUserDataDir string, targetUserDataDir string, sourcePath string, targetPath string, kind extensionSharedDataKind, removeWhenSourceMissing bool) (extensionDataSyncPathResult, error) {
	sourceRoot, err := filepath.Abs(sourceUserDataDir)
	if err != nil {
		return extensionDataSyncPathResult{}, err
	}
	targetRoot, err := filepath.Abs(targetUserDataDir)
	if err != nil {
		return extensionDataSyncPathResult{}, err
	}
	sharedRoot, err := filepath.Abs(a.extensionSharedDataRoot())
	if err != nil {
		return extensionDataSyncPathResult{}, err
	}
	sourceAllowedRoots := []string{filepath.Clean(sourceRoot), filepath.Clean(sharedRoot)}
	targetAllowedRoots := []string{filepath.Clean(targetRoot), filepath.Clean(sharedRoot)}

	cleanSource, sourceInfo, sourceExists, err := resolveExtensionDataSyncSource(sourcePath, sourceAllowedRoots)
	if err != nil {
		return extensionDataSyncPathResult{}, err
	}
	cleanTarget, err := resolveExtensionDataSyncTarget(targetPath, targetAllowedRoots)
	if err != nil {
		return extensionDataSyncPathResult{}, err
	}
	if !sourceExists {
		if !removeWhenSourceMissing {
			return extensionDataSyncPathResult{}, nil
		}
		removed := pathExists(cleanTarget)
		if err := removeExtensionProfileDataPath(cleanTarget); err != nil {
			return extensionDataSyncPathResult{}, err
		}
		return extensionDataSyncPathResult{removed: removed}, nil
	}
	if strings.EqualFold(filepath.Clean(cleanSource), filepath.Clean(cleanTarget)) {
		return extensionDataSyncPathResult{sourceFound: true}, nil
	}
	if kind == extensionSharedDataFile {
		if sourceInfo.IsDir() {
			return extensionDataSyncPathResult{}, fmt.Errorf("主实例扩展数据应为文件，实际是目录: %s", cleanSource)
		}
		return extensionDataSyncPathResult{sourceFound: true, copied: true}, replaceExtensionProfileDataFile(cleanSource, cleanTarget)
	}
	if !sourceInfo.IsDir() {
		return extensionDataSyncPathResult{}, fmt.Errorf("主实例扩展数据应为目录，实际是文件: %s", cleanSource)
	}
	return extensionDataSyncPathResult{sourceFound: true, copied: true}, replaceExtensionProfileDataDir(cleanSource, cleanTarget)
}

func pathExists(target string) bool {
	if strings.TrimSpace(target) == "" {
		return false
	}
	_, err := os.Lstat(target)
	return err == nil
}

func resolveExtensionDataSyncSource(sourcePath string, allowedRoots []string) (string, os.FileInfo, bool, error) {
	cleanSource, err := filepath.Abs(sourcePath)
	if err != nil {
		return "", nil, false, err
	}
	cleanSource = filepath.Clean(cleanSource)
	if !isPathInsideAny(cleanSource, allowedRoots) {
		return "", nil, false, fmt.Errorf("主实例扩展数据路径不在允许范围内: %s", cleanSource)
	}
	sourceInfo, err := os.Stat(cleanSource)
	if err != nil {
		if os.IsNotExist(err) {
			return cleanSource, nil, false, nil
		}
		return "", nil, false, err
	}
	resolvedSource := cleanSource
	if resolved, err := filepath.EvalSymlinks(cleanSource); err == nil && strings.TrimSpace(resolved) != "" {
		resolvedAbs, absErr := filepath.Abs(resolved)
		if absErr != nil {
			return "", nil, false, absErr
		}
		resolvedSource = filepath.Clean(resolvedAbs)
	}
	if !isPathInsideAny(resolvedSource, allowedRoots) {
		return "", nil, false, fmt.Errorf("主实例扩展数据链接不在允许范围内: %s", resolvedSource)
	}
	return resolvedSource, sourceInfo, true, nil
}

func resolveExtensionDataSyncTarget(targetPath string, allowedRoots []string) (string, error) {
	cleanTarget, err := filepath.Abs(targetPath)
	if err != nil {
		return "", err
	}
	cleanTarget = filepath.Clean(cleanTarget)
	if !isPathInsideAny(cleanTarget, allowedRoots) {
		return "", fmt.Errorf("副实例扩展数据路径不在允许范围内: %s", cleanTarget)
	}
	if _, err := os.Lstat(cleanTarget); err != nil {
		if os.IsNotExist(err) {
			return cleanTarget, nil
		}
		return "", err
	}
	resolvedTarget := cleanTarget
	if resolved, err := filepath.EvalSymlinks(cleanTarget); err == nil && strings.TrimSpace(resolved) != "" {
		resolvedAbs, absErr := filepath.Abs(resolved)
		if absErr != nil {
			return "", absErr
		}
		resolvedTarget = filepath.Clean(resolvedAbs)
	}
	if !isPathInsideAny(resolvedTarget, allowedRoots) {
		return "", fmt.Errorf("副实例扩展数据链接不在允许范围内: %s", resolvedTarget)
	}
	return resolvedTarget, nil
}

func isPathInsideAny(child string, parents []string) bool {
	cleanChild := filepath.Clean(child)
	for _, parent := range parents {
		parent = strings.TrimSpace(parent)
		if parent == "" {
			continue
		}
		if isPathInside(cleanChild, filepath.Clean(parent)) {
			return true
		}
	}
	return false
}

func replaceExtensionProfileDataDir(sourceDir string, targetDir string) error {
	if err := os.MkdirAll(filepath.Dir(targetDir), 0755); err != nil {
		return err
	}
	tmpDir, err := os.MkdirTemp(filepath.Dir(targetDir), ".extension-sync-")
	if err != nil {
		return err
	}
	_ = os.RemoveAll(tmpDir)
	if err := copyDirContents(sourceDir, tmpDir); err != nil {
		_ = os.RemoveAll(tmpDir)
		return err
	}
	if err := removeExtensionProfileDataPath(targetDir); err != nil {
		_ = os.RemoveAll(tmpDir)
		return err
	}
	if err := os.Rename(tmpDir, targetDir); err != nil {
		_ = os.RemoveAll(tmpDir)
		return err
	}
	return nil
}

func replaceExtensionProfileDataFile(sourceFile string, targetFile string) error {
	if err := os.MkdirAll(filepath.Dir(targetFile), 0755); err != nil {
		return err
	}
	tmpFile, err := os.CreateTemp(filepath.Dir(targetFile), ".extension-sync-")
	if err != nil {
		return err
	}
	tmpPath := tmpFile.Name()
	if closeErr := tmpFile.Close(); closeErr != nil {
		_ = os.Remove(tmpPath)
		return closeErr
	}
	if err := copyFileContents(sourceFile, tmpPath); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := removeExtensionProfileDataPath(targetFile); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, targetFile); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}

func removeExtensionProfileDataPath(target string) error {
	if strings.TrimSpace(target) == "" {
		return nil
	}
	if _, err := os.Lstat(target); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return os.RemoveAll(target)
}

func profileDisplayName(profile *browser.Profile) string {
	if profile == nil {
		return ""
	}
	if name := strings.TrimSpace(profile.ProfileName); name != "" {
		return name
	}
	return strings.TrimSpace(profile.ProfileId)
}
