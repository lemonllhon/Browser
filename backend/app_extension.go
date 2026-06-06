package backend

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/platform"

	"github.com/google/uuid"
)

const extensionImportMaxArchiveBytes int64 = 300 * 1024 * 1024

type extensionManifestInfo struct {
	Name            string
	Version         string
	Description     string
	ManifestVersion int
	ManifestJSON    string
}

// BrowserExtensionImportInput 扩展导入输入。
type BrowserExtensionImportInput struct {
	Path     string `json:"path"`
	Mode     string `json:"mode"`
	Existing string `json:"existing"`
}

// BrowserExtensionImportResult 扩展导入结果。
type BrowserExtensionImportResult struct {
	Cancelled bool              `json:"cancelled"`
	Duplicate bool              `json:"duplicate"`
	Message   string            `json:"message"`
	Existing  *BrowserExtension `json:"existing,omitempty"`
	Extension *BrowserExtension `json:"extension,omitempty"`
}

// BrowserExtensionAssignInput 扩展绑定实例输入。
type BrowserExtensionAssignInput struct {
	ExtensionId string   `json:"extensionId"`
	ProfileIds  []string `json:"profileIds"`
	Mode        string   `json:"mode"`
	Enabled     bool     `json:"enabled"`
}

// BrowserExtensionUnassignInput 扩展解绑实例输入。
type BrowserExtensionUnassignInput struct {
	ExtensionId string   `json:"extensionId"`
	ProfileIds  []string `json:"profileIds"`
}

// BrowserExtensionAutoBindInput 扩展自动绑定配置输入。
type BrowserExtensionAutoBindInput struct {
	ExtensionId string `json:"extensionId"`
	Enabled     bool   `json:"enabled"`
	Mode        string `json:"mode"`
}

// BrowserExtensionList 获取扩展插件列表。
func (a *App) BrowserExtensionList() ([]BrowserExtension, error) {
	if err := a.syncExtensionLibraryDirectories(); err != nil {
		return nil, err
	}
	dao, err := a.extensionDAO()
	if err != nil {
		return nil, err
	}
	return dao.List()
}

// BrowserExtensionGet 获取扩展插件详情。
func (a *App) BrowserExtensionGet(extensionId string) (*BrowserExtension, error) {
	if err := a.syncExtensionLibraryDirectories(); err != nil {
		return nil, err
	}
	dao, err := a.extensionDAO()
	if err != nil {
		return nil, err
	}
	extensionId = strings.TrimSpace(extensionId)
	if extensionId == "" {
		return nil, fmt.Errorf("扩展插件 ID 不能为空")
	}
	return dao.Get(extensionId)
}

// BrowserExtensionListProfileBindings 获取扩展绑定的实例列表。
func (a *App) BrowserExtensionListProfileBindings(extensionId string) ([]BrowserExtensionBinding, error) {
	dao, err := a.extensionDAO()
	if err != nil {
		return nil, err
	}
	extensionId = strings.TrimSpace(extensionId)
	if extensionId == "" {
		return nil, fmt.Errorf("扩展插件 ID 不能为空")
	}
	if _, err := dao.Get(extensionId); err != nil {
		return nil, err
	}
	return dao.ListBindings(extensionId)
}

// BrowserExtensionListForProfile 获取实例绑定的扩展列表。
func (a *App) BrowserExtensionListForProfile(profileId string) ([]BrowserExtensionBinding, error) {
	dao, err := a.extensionDAO()
	if err != nil {
		return nil, err
	}
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return nil, fmt.Errorf("实例 ID 不能为空")
	}
	a.refreshBrowserProfileConfigCacheFromStore()
	if _, err := a.requireProfile(profileId); err != nil {
		return nil, err
	}
	return dao.ListBindingsByProfile(profileId)
}

// BrowserExtensionChooseArchive 选择本地扩展压缩包。
func (a *App) BrowserExtensionChooseArchive() (map[string]interface{}, error) {
	if a.ctx == nil {
		return nil, fmt.Errorf("应用上下文未初始化")
	}
	path, err := a.appRuntime().OpenFileDialog(a.ctx, platform.OpenDialogOptions{
		Title: "选择扩展插件压缩包",
		Filters: []platform.FileFilter{
			{DisplayName: "扩展插件包 (*.zip;*.crx)", Pattern: "*.zip;*.crx"},
			{DisplayName: "ZIP 文件 (*.zip)", Pattern: "*.zip"},
			{DisplayName: "CRX 文件 (*.crx)", Pattern: "*.crx"},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("打开文件选择器失败: %w", err)
	}
	return map[string]interface{}{
		"cancelled": strings.TrimSpace(path) == "",
		"path":      path,
	}, nil
}

// BrowserExtensionChooseDirectory 选择本地解压后的扩展目录。
func (a *App) BrowserExtensionChooseDirectory() (map[string]interface{}, error) {
	if a.ctx == nil {
		return nil, fmt.Errorf("应用上下文未初始化")
	}
	path, err := a.appRuntime().OpenDirectoryDialog(a.ctx, platform.OpenDialogOptions{
		Title: "选择扩展插件目录",
	})
	if err != nil {
		return nil, fmt.Errorf("打开目录选择器失败: %w", err)
	}
	return map[string]interface{}{
		"cancelled": strings.TrimSpace(path) == "",
		"path":      path,
	}, nil
}

// BrowserExtensionImportDirectory 导入本地扩展目录。
func (a *App) BrowserExtensionImportDirectory(input BrowserExtensionImportInput) (*BrowserExtensionImportResult, error) {
	sourceDir := strings.TrimSpace(input.Path)
	if sourceDir == "" {
		return nil, fmt.Errorf("扩展目录不能为空")
	}
	absSource, err := filepath.Abs(sourceDir)
	if err != nil {
		return nil, fmt.Errorf("解析扩展目录失败: %w", err)
	}
	info, err := os.Stat(absSource)
	if err != nil {
		return nil, fmt.Errorf("扩展目录不存在: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("请选择解压后的扩展目录")
	}
	extensionDir, err := findExtensionManifestRoot(absSource)
	if err != nil {
		return nil, err
	}
	return a.importExtensionFromDirectory(extensionDir, "directory", extensionDir, "", input)
}

// BrowserExtensionImportArchive 导入本地 ZIP/CRX 扩展压缩包。
func (a *App) BrowserExtensionImportArchive(input BrowserExtensionImportInput) (*BrowserExtensionImportResult, error) {
	archivePath := strings.TrimSpace(input.Path)
	if archivePath == "" {
		return nil, fmt.Errorf("扩展压缩包不能为空")
	}
	absArchive, err := filepath.Abs(archivePath)
	if err != nil {
		return nil, fmt.Errorf("解析扩展压缩包失败: %w", err)
	}
	info, err := os.Stat(absArchive)
	if err != nil {
		return nil, fmt.Errorf("扩展压缩包不存在: %w", err)
	}
	if info.IsDir() {
		return nil, fmt.Errorf("请选择 ZIP 或 CRX 压缩包")
	}
	if info.Size() <= 0 {
		return nil, fmt.Errorf("扩展压缩包为空")
	}
	if info.Size() > extensionImportMaxArchiveBytes {
		return nil, fmt.Errorf("扩展压缩包超过限制: %.0f MB", float64(extensionImportMaxArchiveBytes)/1024/1024)
	}

	tmpRoot := filepath.Join(a.extensionTempRoot(), "archive-"+uuid.NewString())
	defer os.RemoveAll(tmpRoot)
	if err := os.MkdirAll(tmpRoot, 0755); err != nil {
		return nil, fmt.Errorf("创建临时目录失败: %w", err)
	}
	if err := extractExtensionArchive(absArchive, tmpRoot); err != nil {
		return nil, err
	}
	extensionDir, err := findExtensionManifestRoot(tmpRoot)
	if err != nil {
		return nil, err
	}

	ext := strings.ToLower(filepath.Ext(absArchive))
	sourceType := "zip"
	if ext == ".crx" {
		sourceType = "crx"
	}
	return a.importExtensionFromDirectory(extensionDir, sourceType, "", absArchive, input)
}

// BrowserExtensionAssignProfiles 将扩展绑定到一个或多个实例。
func (a *App) BrowserExtensionAssignProfiles(input BrowserExtensionAssignInput) ([]BrowserExtensionBinding, error) {
	dao, err := a.extensionDAO()
	if err != nil {
		return nil, err
	}
	extensionId := strings.TrimSpace(input.ExtensionId)
	if extensionId == "" {
		return nil, fmt.Errorf("扩展插件 ID 不能为空")
	}
	extension, err := dao.Get(extensionId)
	if err != nil {
		return nil, err
	}
	profileIds := normalizeStringList(input.ProfileIds)
	if len(profileIds) == 0 {
		return nil, fmt.Errorf("请选择要绑定的实例")
	}
	a.refreshBrowserProfileConfigCacheFromStore()
	mode := normalizeExtensionBindingMode(input.Mode)
	for _, profileId := range profileIds {
		if err := a.assignExtensionToProfile(dao, extension, profileId, mode, input.Enabled, true); err != nil {
			return nil, err
		}
	}
	bindings, err := dao.ListBindings(extensionId)
	if err != nil {
		return nil, err
	}
	a.emitBrowserExtensionsUpdated()
	return bindings, nil
}

// BrowserExtensionSetAutoBind 设置扩展自动绑定配置。
func (a *App) BrowserExtensionSetAutoBind(input BrowserExtensionAutoBindInput) (*BrowserExtension, error) {
	dao, err := a.extensionDAO()
	if err != nil {
		return nil, err
	}
	extensionId := strings.TrimSpace(input.ExtensionId)
	if extensionId == "" {
		return nil, fmt.Errorf("扩展插件 ID 不能为空")
	}
	extension, err := dao.Get(extensionId)
	if err != nil {
		return nil, err
	}
	mode := normalizeExtensionBindingMode(input.Mode)
	if err := dao.SetAutoBind(extensionId, input.Enabled, mode); err != nil {
		return nil, err
	}
	extension.AutoBindEnabled = input.Enabled
	extension.AutoBindMode = mode
	if input.Enabled {
		a.refreshBrowserProfileConfigCacheFromStore()
		if err := a.applyAutoBindExtensionToAllProfiles(dao, extension); err != nil {
			return nil, err
		}
	}
	updated, err := dao.Get(extensionId)
	if err != nil {
		return nil, err
	}
	a.emitBrowserExtensionsUpdated()
	return updated, nil
}

// BrowserExtensionUnassignProfiles 删除扩展与实例的绑定关系。
func (a *App) BrowserExtensionUnassignProfiles(input BrowserExtensionUnassignInput) ([]BrowserExtensionBinding, error) {
	dao, err := a.extensionDAO()
	if err != nil {
		return nil, err
	}
	extensionId := strings.TrimSpace(input.ExtensionId)
	if extensionId == "" {
		return nil, fmt.Errorf("扩展插件 ID 不能为空")
	}
	if _, err := dao.Get(extensionId); err != nil {
		return nil, err
	}
	profileIds := normalizeStringList(input.ProfileIds)
	if len(profileIds) == 0 {
		return nil, fmt.Errorf("请选择要解绑的实例")
	}
	a.refreshBrowserProfileConfigCacheFromStore()
	for _, profileId := range profileIds {
		exclusiveDir := ""
		bindings, err := dao.ListBindingsByProfile(profileId)
		if err != nil {
			return nil, err
		}
		for _, binding := range bindings {
			if binding.ExtensionId == extensionId {
				exclusiveDir = strings.TrimSpace(binding.ExclusiveDir)
				break
			}
		}
		if err := dao.DeleteBinding(profileId, extensionId); err != nil {
			return nil, err
		}
		if exclusiveDir != "" {
			if err := a.removeExtensionExclusiveDir(exclusiveDir); err != nil {
				return nil, err
			}
		}
	}
	bindings, err := dao.ListBindings(extensionId)
	if err != nil {
		return nil, err
	}
	a.emitBrowserExtensionsUpdated()
	return bindings, nil
}

// BrowserExtensionDelete 删除未被实例使用的扩展插件。
func (a *App) BrowserExtensionDelete(extensionId string) error {
	dao, err := a.extensionDAO()
	if err != nil {
		return err
	}
	extensionId = strings.TrimSpace(extensionId)
	if extensionId == "" {
		return fmt.Errorf("扩展插件 ID 不能为空")
	}

	extension, err := dao.Get(extensionId)
	if err != nil {
		return err
	}
	bindings, err := dao.ListBindings(extensionId)
	if err != nil {
		return err
	}
	a.refreshBrowserProfileSharedRuntimeOverlay()
	for _, binding := range bindings {
		if a.isProfileRunning(binding.ProfileId) {
			name := strings.TrimSpace(binding.ProfileName)
			if name == "" {
				name = binding.ProfileId
			}
			return fmt.Errorf("扩展插件已绑定运行中的实例「%s」，请先停止相关实例后再删除", name)
		}
	}

	installDir := strings.TrimSpace(extension.InstallDir)
	safeDir := ""
	if installDir != "" {
		absInstallDir := a.resolveAppPath(installDir)
		safeDir, err = a.safeExtensionLibraryDir(absInstallDir)
		if err != nil {
			return err
		}
	}

	exclusiveDirs := make([]string, 0)
	for _, binding := range bindings {
		if dir := strings.TrimSpace(binding.ExclusiveDir); dir != "" {
			exclusiveDirs = append(exclusiveDirs, dir)
		}
	}
	if err := dao.Delete(extensionId); err != nil {
		return err
	}
	extensionSharedDataDir := a.extensionSharedDataDir(extensionId)
	for _, dir := range exclusiveDirs {
		if err := a.removeExtensionExclusiveDir(dir); err != nil {
			return err
		}
	}
	if safeDir != "" {
		if err := os.RemoveAll(safeDir); err != nil {
			return fmt.Errorf("扩展记录已删除，但插件目录删除失败: %w", err)
		}
	}
	if safeSharedDir, err := a.safeExtensionSharedDataDir(extensionSharedDataDir); err == nil && safeSharedDir != "" {
		if err := os.RemoveAll(safeSharedDir); err != nil {
			return fmt.Errorf("扩展记录已删除，但共享数据目录删除失败: %w", err)
		}
	} else if err != nil {
		return err
	}
	packagePath := strings.TrimSpace(extension.PackagePath)
	if packagePath != "" {
		absPackage := a.resolveAppPath(packagePath)
		if safePackage, err := a.safeExtensionPackagePath(absPackage); err == nil && safePackage != "" {
			_ = os.Remove(safePackage)
		}
	}
	a.emitBrowserExtensionsUpdated()
	return nil
}

func (a *App) importExtensionFromDirectory(sourceDir string, sourceType string, sourceURL string, packagePath string, input BrowserExtensionImportInput) (*BrowserExtensionImportResult, error) {
	dao, err := a.extensionDAO()
	if err != nil {
		return nil, err
	}
	info, err := readExtensionManifest(sourceDir)
	if err != nil {
		return nil, err
	}
	if info.ManifestVersion <= 0 {
		return nil, fmt.Errorf("manifest.json 缺少有效的 manifest_version")
	}
	if strings.TrimSpace(info.Name) == "" {
		return nil, fmt.Errorf("manifest.json 缺少扩展名称")
	}

	existing, err := dao.FindByNameVersion(info.Name, info.Version)
	if err != nil {
		return nil, err
	}
	mode := normalizeExtensionImportMode(input.Mode)
	if existing != nil && mode == "ask" {
		return &BrowserExtensionImportResult{
			Duplicate: true,
			Message:   "发现同名同版本扩展，请选择处理方式",
			Existing:  existing,
		}, nil
	}
	if existing != nil && mode == "cancel" {
		return &BrowserExtensionImportResult{
			Cancelled: true,
			Message:   "已取消导入",
			Existing:  existing,
		}, nil
	}

	now := time.Now().Format(time.RFC3339)
	extensionId := uuid.NewString()
	createdAt := now
	autoBindEnabled := false
	autoBindMode := "shared"
	if existing != nil && mode == "overwrite" {
		extensionId = existing.ExtensionId
		createdAt = existing.CreatedAt
		autoBindEnabled = existing.AutoBindEnabled
		autoBindMode = existing.AutoBindMode
	}

	targetDir := filepath.Join(a.extensionLibraryRoot(), extensionId)
	safeTargetDir, err := a.safeExtensionLibraryDir(targetDir)
	if err != nil {
		return nil, err
	}
	tmpTarget := safeTargetDir + ".tmp-" + uuid.NewString()
	if err := copyDirContents(sourceDir, tmpTarget); err != nil {
		_ = os.RemoveAll(tmpTarget)
		return nil, err
	}
	if _, err := readExtensionManifest(tmpTarget); err != nil {
		_ = os.RemoveAll(tmpTarget)
		return nil, err
	}
	if err := os.RemoveAll(safeTargetDir); err != nil {
		_ = os.RemoveAll(tmpTarget)
		return nil, fmt.Errorf("清理旧扩展目录失败: %w", err)
	}
	if err := os.Rename(tmpTarget, safeTargetDir); err != nil {
		_ = os.RemoveAll(tmpTarget)
		return nil, fmt.Errorf("写入扩展目录失败: %w", err)
	}

	installDir, err := a.relativeStatePath(safeTargetDir)
	if err != nil {
		installDir = safeTargetDir
	}
	packageRel := ""
	if strings.TrimSpace(packagePath) != "" {
		packageRel, _ = a.copyExtensionPackage(packagePath, extensionId)
	}

	extension := browser.Extension{
		ExtensionId:     extensionId,
		Name:            info.Name,
		Version:         info.Version,
		ManifestVersion: info.ManifestVersion,
		Description:     info.Description,
		SourceType:      strings.TrimSpace(sourceType),
		SourceURL:       strings.TrimSpace(sourceURL),
		InstallDir:      installDir,
		PackagePath:     packageRel,
		ManifestJSON:    info.ManifestJSON,
		AutoBindEnabled: autoBindEnabled,
		AutoBindMode:    autoBindMode,
		CreatedAt:       createdAt,
		UpdatedAt:       now,
	}
	if extension.SourceType == "" {
		extension.SourceType = "directory"
	}
	if err := dao.Upsert(extension); err != nil {
		return nil, err
	}
	saved, err := dao.Get(extensionId)
	if err != nil {
		return nil, err
	}
	a.emitBrowserExtensionsUpdated()
	return &BrowserExtensionImportResult{
		Message:   "扩展插件导入成功",
		Extension: saved,
	}, nil
}

func (a *App) extensionDAO() (browser.ExtensionDAO, error) {
	if a.browserMgr == nil || a.browserMgr.ExtensionDAO == nil {
		return nil, fmt.Errorf("扩展插件服务未初始化")
	}
	if err := a.browserMgr.ExtensionDAO.EnsureSchema(); err != nil {
		return nil, err
	}
	return a.browserMgr.ExtensionDAO, nil
}

func (a *App) assignExtensionToProfile(dao browser.ExtensionDAO, extension *browser.Extension, profileId string, mode string, enabled bool, validateProfile bool) error {
	if extension == nil {
		return fmt.Errorf("扩展插件不存在")
	}
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return fmt.Errorf("实例 ID 不能为空")
	}
	if validateProfile {
		if _, err := a.requireProfile(profileId); err != nil {
			return err
		}
	}
	mode = normalizeExtensionBindingMode(mode)
	oldExclusiveDir := ""
	oldBindings, err := dao.ListBindingsByProfile(profileId)
	if err != nil {
		return err
	}
	for _, binding := range oldBindings {
		if binding.ExtensionId == extension.ExtensionId {
			oldExclusiveDir = strings.TrimSpace(binding.ExclusiveDir)
			break
		}
	}
	exclusiveDir := ""
	if mode == "exclusive" {
		exclusiveDir, err = a.prepareExtensionExclusiveDir(extension, profileId)
		if err != nil {
			return err
		}
	}
	if err := dao.UpsertBinding(browser.ExtensionBinding{
		ProfileId:    profileId,
		ExtensionId:  extension.ExtensionId,
		Mode:         mode,
		Enabled:      enabled,
		ExclusiveDir: exclusiveDir,
		UpdatedAt:    time.Now().Format(time.RFC3339),
	}); err != nil {
		return err
	}
	if oldExclusiveDir != "" && oldExclusiveDir != exclusiveDir {
		if err := a.removeExtensionExclusiveDir(oldExclusiveDir); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) applyAutoBindExtensionToAllProfiles(dao browser.ExtensionDAO, extension *browser.Extension) error {
	if a.browserMgr == nil || extension == nil {
		return nil
	}
	profiles := a.browserMgr.List()
	for _, profile := range profiles {
		if err := a.assignExtensionToProfile(dao, extension, profile.ProfileId, extension.AutoBindMode, true, false); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) applyAutoBindExtensionsForProfile(profileId string) error {
	if a.browserMgr == nil || a.browserMgr.ExtensionDAO == nil {
		return nil
	}
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return nil
	}
	if _, err := a.requireProfile(profileId); err != nil {
		return nil
	}
	dao, err := a.extensionDAO()
	if err != nil {
		return err
	}
	extensions, err := dao.ListAutoBindEnabled()
	if err != nil {
		return err
	}
	for _, extension := range extensions {
		ext := extension
		if err := a.assignExtensionToProfile(dao, &ext, profileId, ext.AutoBindMode, true, false); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) isProfileRunning(profileId string) bool {
	if a.browserMgr == nil {
		return false
	}
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	profile, ok := a.browserMgr.Profiles[strings.TrimSpace(profileId)]
	return ok && profile != nil && profile.Running
}

func (a *App) syncExtensionLibraryDirectories() error {
	dao, err := a.extensionDAO()
	if err != nil {
		return err
	}
	libraryRoot := a.extensionLibraryRoot()
	if err := os.MkdirAll(libraryRoot, 0755); err != nil {
		return fmt.Errorf("创建扩展插件库目录失败: %w", err)
	}

	existing, err := dao.List()
	if err != nil {
		return err
	}
	knownDirs := make(map[string]struct{}, len(existing))
	for _, item := range existing {
		if dir := strings.TrimSpace(item.InstallDir); dir != "" {
			if abs, err := filepath.Abs(a.resolveAppPath(dir)); err == nil {
				knownDirs[filepath.Clean(abs)] = struct{}{}
			}
		}
	}

	entries, err := os.ReadDir(libraryRoot)
	if err != nil {
		return fmt.Errorf("读取扩展插件库目录失败: %w", err)
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dir := filepath.Join(libraryRoot, entry.Name())
		cleanDir := filepath.Clean(dir)
		if _, ok := knownDirs[cleanDir]; ok {
			continue
		}
		if _, err := os.Stat(filepath.Join(cleanDir, "manifest.json")); err != nil {
			continue
		}
		info, err := readExtensionManifest(cleanDir)
		if err != nil {
			continue
		}
		now := time.Now().Format(time.RFC3339)
		extensionId := strings.TrimSpace(entry.Name())
		if extensionId == "" {
			extensionId = uuid.NewString()
		}
		if _, err := dao.Get(extensionId); err == nil {
			extensionId = uuid.NewString()
		}
		installDir, err := filepath.Rel(a.appStateRootAbs(), cleanDir)
		if err != nil || strings.HasPrefix(installDir, "..") {
			installDir = cleanDir
		}
		extension := browser.Extension{
			ExtensionId:     extensionId,
			Name:            info.Name,
			Version:         info.Version,
			ManifestVersion: info.ManifestVersion,
			Description:     info.Description,
			SourceType:      "directory",
			InstallDir:      installDir,
			ManifestJSON:    info.ManifestJSON,
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		if err := dao.Upsert(extension); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) extensionLibraryRoot() string {
	return a.resolveAppPath(filepath.Join("data", "extensions", "library"))
}

func (a *App) extensionPackageRoot() string {
	return a.resolveAppPath(filepath.Join("data", "extensions", "packages"))
}

func (a *App) extensionExclusiveRoot() string {
	return a.resolveAppPath(filepath.Join("data", "extensions", "exclusive"))
}

func (a *App) extensionTempRoot() string {
	return a.resolveAppPath(filepath.Join("data", "extensions", "tmp"))
}

func (a *App) safeExtensionLibraryDir(target string) (string, error) {
	if strings.TrimSpace(target) == "" {
		return "", nil
	}
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return "", fmt.Errorf("解析扩展目录失败: %w", err)
	}
	absRoot, err := filepath.Abs(a.extensionLibraryRoot())
	if err != nil {
		return "", fmt.Errorf("解析扩展库目录失败: %w", err)
	}
	cleanTarget := filepath.Clean(absTarget)
	cleanRoot := filepath.Clean(absRoot)
	if strings.EqualFold(cleanTarget, cleanRoot) {
		return "", fmt.Errorf("拒绝删除扩展库根目录: %s", cleanTarget)
	}
	if !isPathInside(cleanTarget, cleanRoot) {
		return "", fmt.Errorf("扩展目录不在扩展库目录下: %s", cleanTarget)
	}
	return cleanTarget, nil
}

func (a *App) safeExtensionExclusiveDir(target string) (string, error) {
	if strings.TrimSpace(target) == "" {
		return "", nil
	}
	absTarget, err := filepath.Abs(a.resolveAppPath(target))
	if err != nil {
		return "", fmt.Errorf("解析扩展独享目录失败: %w", err)
	}
	absRoot, err := filepath.Abs(a.extensionExclusiveRoot())
	if err != nil {
		return "", fmt.Errorf("解析扩展独享根目录失败: %w", err)
	}
	cleanTarget := filepath.Clean(absTarget)
	cleanRoot := filepath.Clean(absRoot)
	if strings.EqualFold(cleanTarget, cleanRoot) {
		return "", fmt.Errorf("拒绝操作扩展独享根目录: %s", cleanTarget)
	}
	if !isPathInside(cleanTarget, cleanRoot) {
		return "", fmt.Errorf("扩展独享目录不在允许范围内: %s", cleanTarget)
	}
	return cleanTarget, nil
}

func (a *App) safeExtensionPackagePath(target string) (string, error) {
	if strings.TrimSpace(target) == "" {
		return "", nil
	}
	absTarget, err := filepath.Abs(a.resolveAppPath(target))
	if err != nil {
		return "", fmt.Errorf("解析扩展原始包路径失败: %w", err)
	}
	absRoot, err := filepath.Abs(a.extensionPackageRoot())
	if err != nil {
		return "", fmt.Errorf("解析扩展原始包目录失败: %w", err)
	}
	cleanTarget := filepath.Clean(absTarget)
	cleanRoot := filepath.Clean(absRoot)
	if strings.EqualFold(cleanTarget, cleanRoot) {
		return "", fmt.Errorf("拒绝操作扩展原始包根目录: %s", cleanTarget)
	}
	if !isPathInside(cleanTarget, cleanRoot) {
		return "", fmt.Errorf("扩展原始包不在允许范围内: %s", cleanTarget)
	}
	return cleanTarget, nil
}

func (a *App) safeExtensionSharedDataDir(target string) (string, error) {
	if strings.TrimSpace(target) == "" {
		return "", nil
	}
	absTarget, err := filepath.Abs(a.resolveAppPath(target))
	if err != nil {
		return "", fmt.Errorf("解析扩展共享数据目录失败: %w", err)
	}
	absRoot, err := filepath.Abs(a.extensionSharedDataRoot())
	if err != nil {
		return "", fmt.Errorf("解析扩展共享数据根目录失败: %w", err)
	}
	cleanTarget := filepath.Clean(absTarget)
	cleanRoot := filepath.Clean(absRoot)
	if strings.EqualFold(cleanTarget, cleanRoot) {
		return "", fmt.Errorf("拒绝操作扩展共享数据根目录: %s", cleanTarget)
	}
	if !isPathInside(cleanTarget, cleanRoot) {
		return "", fmt.Errorf("扩展共享数据目录不在允许范围内: %s", cleanTarget)
	}
	return cleanTarget, nil
}

func (a *App) extensionContentDir(extension *browser.Extension) (string, error) {
	if extension == nil {
		return "", fmt.Errorf("扩展插件不存在")
	}
	installDir := strings.TrimSpace(extension.InstallDir)
	if installDir == "" {
		return "", fmt.Errorf("扩展插件安装目录为空")
	}
	libraryDir, err := a.safeExtensionLibraryDir(a.resolveAppPath(installDir))
	if err != nil {
		return "", err
	}
	if sourceDir, ok, err := a.localExtensionSourceDir(extension); err != nil {
		return "", err
	} else if ok && !sameCleanPath(sourceDir, libraryDir) {
		if err := a.writeExtensionDirectory(sourceDir, libraryDir, "同步扩展库目录"); err != nil {
			return "", err
		}
	}
	return libraryDir, nil
}

func (a *App) localExtensionSourceDir(extension *browser.Extension) (string, bool, error) {
	if extension == nil || !strings.EqualFold(strings.TrimSpace(extension.SourceType), "directory") {
		return "", false, nil
	}
	sourceDir := strings.TrimSpace(extension.SourceURL)
	if sourceDir == "" {
		return "", false, nil
	}
	absSource, err := filepath.Abs(a.resolveAppPath(sourceDir))
	if err != nil {
		return "", false, fmt.Errorf("解析本地扩展来源目录失败: %w", err)
	}
	cleanSource := filepath.Clean(absSource)
	info, err := os.Stat(cleanSource)
	if err != nil {
		if os.IsNotExist(err) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("访问本地扩展来源目录失败: %w", err)
	}
	if !info.IsDir() {
		return "", false, fmt.Errorf("本地扩展来源不是目录: %s", cleanSource)
	}
	if _, err := readExtensionManifest(cleanSource); err != nil {
		return "", false, err
	}
	return cleanSource, true, nil
}

func (a *App) prepareExtensionExclusiveDir(extension *browser.Extension, profileId string) (string, error) {
	if extension == nil {
		return "", fmt.Errorf("扩展插件不存在")
	}
	sourceDir, err := a.extensionContentDir(extension)
	if err != nil {
		return "", err
	}
	if _, err := readExtensionManifest(sourceDir); err != nil {
		return "", err
	}
	targetDir := filepath.Join(a.extensionExclusiveRoot(), sanitizeExtensionPackageName(profileId), sanitizeExtensionPackageName(extension.ExtensionId))
	safeTargetDir, err := a.safeExtensionExclusiveDir(targetDir)
	if err != nil {
		return "", err
	}
	if err := a.writeExtensionDirectory(sourceDir, safeTargetDir, "写入独享扩展目录"); err != nil {
		return "", err
	}
	rel, err := a.relativeStatePath(safeTargetDir)
	if err != nil {
		return safeTargetDir, nil
	}
	return rel, nil
}

func (a *App) refreshExtensionExclusiveDir(binding browser.ExtensionBinding, extension *browser.Extension) error {
	sourceDir, ok, err := a.localExtensionSourceDir(extension)
	if err != nil || !ok {
		return err
	}
	targetDir := strings.TrimSpace(binding.ExclusiveDir)
	if targetDir == "" {
		return fmt.Errorf("扩展插件 %s 的独享目录为空，请重新保存绑定", binding.ExtensionId)
	}
	safeTargetDir, err := a.safeExtensionExclusiveDir(targetDir)
	if err != nil {
		return err
	}
	return a.writeExtensionDirectory(sourceDir, safeTargetDir, "同步独享扩展目录")
}

func (a *App) writeExtensionDirectory(sourceDir string, safeTargetDir string, action string) error {
	if sameCleanPath(sourceDir, safeTargetDir) {
		return nil
	}
	tmpTarget := safeTargetDir + ".tmp-" + uuid.NewString()
	if err := copyDirContents(sourceDir, tmpTarget); err != nil {
		_ = os.RemoveAll(tmpTarget)
		return fmt.Errorf("%s失败: %w", action, err)
	}
	if _, err := readExtensionManifest(tmpTarget); err != nil {
		_ = os.RemoveAll(tmpTarget)
		return err
	}
	if err := os.RemoveAll(safeTargetDir); err != nil {
		_ = os.RemoveAll(tmpTarget)
		return fmt.Errorf("清理旧扩展目录失败: %w", err)
	}
	if err := os.Rename(tmpTarget, safeTargetDir); err != nil {
		_ = os.RemoveAll(tmpTarget)
		return fmt.Errorf("%s失败: %w", action, err)
	}
	return nil
}

func sameCleanPath(left string, right string) bool {
	leftAbs, err := filepath.Abs(left)
	if err != nil {
		leftAbs = left
	}
	rightAbs, err := filepath.Abs(right)
	if err != nil {
		rightAbs = right
	}
	return strings.EqualFold(filepath.Clean(leftAbs), filepath.Clean(rightAbs))
}

func (a *App) removeExtensionExclusiveDir(dir string) error {
	safeDir, err := a.safeExtensionExclusiveDir(dir)
	if err != nil {
		return err
	}
	if safeDir == "" {
		return nil
	}
	if err := os.RemoveAll(safeDir); err != nil {
		return fmt.Errorf("删除独享扩展目录失败: %w", err)
	}
	return nil
}

func (a *App) requireProfile(profileId string) (*browser.Profile, error) {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return nil, fmt.Errorf("实例 ID 不能为空")
	}
	if a.browserMgr == nil {
		return nil, fmt.Errorf("浏览器管理器未初始化")
	}
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	profile, ok := a.browserMgr.Profiles[profileId]
	if !ok || profile == nil {
		return nil, fmt.Errorf("实例不存在: %s", profileId)
	}
	return profile, nil
}

func readExtensionManifest(extensionDir string) (extensionManifestInfo, error) {
	manifestPath := filepath.Join(extensionDir, "manifest.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return extensionManifestInfo{}, fmt.Errorf("读取 manifest.json 失败: %w", err)
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(data, &payload); err != nil {
		return extensionManifestInfo{}, fmt.Errorf("解析 manifest.json 失败: %w", err)
	}

	return extensionManifestInfo{
		Name:            manifestString(payload["name"], filepath.Base(extensionDir)),
		Version:         manifestString(payload["version"], ""),
		Description:     manifestString(payload["description"], ""),
		ManifestVersion: manifestInt(payload["manifest_version"]),
		ManifestJSON:    string(data),
	}, nil
}

func extractExtensionArchive(archivePath string, dest string) error {
	payload, err := os.ReadFile(archivePath)
	if err != nil {
		return fmt.Errorf("读取扩展压缩包失败: %w", err)
	}
	if len(payload) == 0 {
		return fmt.Errorf("扩展压缩包为空")
	}
	zipPayload, err := stripCRXHeaderIfNeeded(payload)
	if err != nil {
		return err
	}
	reader, err := zip.NewReader(bytes.NewReader(zipPayload), int64(len(zipPayload)))
	if err != nil {
		return fmt.Errorf("扩展压缩包不是有效的 ZIP/CRX 文件: %w", err)
	}
	if len(reader.File) == 0 {
		return fmt.Errorf("扩展压缩包为空")
	}
	cleanDest := filepath.Clean(dest)
	for _, file := range reader.File {
		name := filepath.ToSlash(file.Name)
		name = strings.TrimLeft(name, "/")
		if name == "" {
			continue
		}
		target := filepath.Join(cleanDest, filepath.FromSlash(name))
		cleanTarget := filepath.Clean(target)
		if cleanTarget != cleanDest && !isPathInside(cleanTarget, cleanDest) {
			return fmt.Errorf("扩展压缩包包含非法路径: %s", file.Name)
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(cleanTarget, 0755); err != nil {
				return fmt.Errorf("创建解压目录失败: %w", err)
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
			return fmt.Errorf("创建解压文件目录失败: %w", err)
		}
		src, err := file.Open()
		if err != nil {
			return fmt.Errorf("读取压缩包文件失败: %w", err)
		}
		dst, err := os.OpenFile(cleanTarget, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, file.Mode())
		if err != nil {
			src.Close()
			return fmt.Errorf("写入解压文件失败: %w", err)
		}
		_, copyErr := io.Copy(dst, src)
		closeErr := dst.Close()
		src.Close()
		if copyErr != nil {
			return fmt.Errorf("写入解压文件失败: %w", copyErr)
		}
		if closeErr != nil {
			return fmt.Errorf("关闭解压文件失败: %w", closeErr)
		}
	}
	return nil
}

func stripCRXHeaderIfNeeded(payload []byte) ([]byte, error) {
	if len(payload) < 4 || string(payload[:4]) != "Cr24" {
		return payload, nil
	}
	if len(payload) < 16 {
		return nil, fmt.Errorf("CRX 文件头不完整")
	}
	version := binary.LittleEndian.Uint32(payload[4:8])
	var headerSize uint64
	switch version {
	case 2:
		publicKeyLen := binary.LittleEndian.Uint32(payload[8:12])
		signatureLen := binary.LittleEndian.Uint32(payload[12:16])
		headerSize = 16 + uint64(publicKeyLen) + uint64(signatureLen)
	case 3:
		headerLen := binary.LittleEndian.Uint32(payload[8:12])
		headerSize = 12 + uint64(headerLen)
	default:
		return nil, fmt.Errorf("暂不支持 CRX v%d 格式", version)
	}
	if headerSize >= uint64(len(payload)) {
		return nil, fmt.Errorf("CRX 文件缺少 ZIP 内容")
	}
	return payload[headerSize:], nil
}

func findExtensionManifestRoot(root string) (string, error) {
	var matches []string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			name := entry.Name()
			if name == "__MACOSX" || strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.EqualFold(entry.Name(), "manifest.json") {
			matches = append(matches, filepath.Dir(path))
		}
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("查找 manifest.json 失败: %w", err)
	}
	if len(matches) == 0 {
		return "", fmt.Errorf("未找到 manifest.json，请确认这是有效的浏览器扩展")
	}
	return pickShallowestPath(matches), nil
}

func pickShallowestPath(paths []string) string {
	if len(paths) == 0 {
		return ""
	}
	best := paths[0]
	bestDepth := len(strings.Split(filepath.Clean(best), string(filepath.Separator)))
	for _, item := range paths[1:] {
		depth := len(strings.Split(filepath.Clean(item), string(filepath.Separator)))
		if depth < bestDepth {
			best = item
			bestDepth = depth
		}
	}
	return best
}

func copyDirContents(src string, dst string) error {
	cleanSrc, err := filepath.Abs(src)
	if err != nil {
		return fmt.Errorf("解析源目录失败: %w", err)
	}
	cleanDst, err := filepath.Abs(dst)
	if err != nil {
		return fmt.Errorf("解析目标目录失败: %w", err)
	}
	if strings.EqualFold(filepath.Clean(cleanSrc), filepath.Clean(cleanDst)) {
		return fmt.Errorf("源目录和目标目录不能相同")
	}
	return filepath.WalkDir(cleanSrc, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(cleanSrc, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return os.MkdirAll(cleanDst, 0755)
		}
		target := filepath.Join(cleanDst, rel)
		cleanTarget := filepath.Clean(target)
		if !isPathInside(cleanTarget, cleanDst) {
			return fmt.Errorf("非法复制路径: %s", target)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return os.MkdirAll(cleanTarget, info.Mode())
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil
		}
		if err := os.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
			return err
		}
		srcFile, err := os.Open(path)
		if err != nil {
			return err
		}
		dstFile, err := os.OpenFile(cleanTarget, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
		if err != nil {
			srcFile.Close()
			return err
		}
		_, copyErr := io.Copy(dstFile, srcFile)
		closeErr := dstFile.Close()
		srcFile.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
}

func normalizeStringList(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func normalizeExtensionImportMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "overwrite", "new", "cancel":
		return strings.ToLower(strings.TrimSpace(mode))
	default:
		return "ask"
	}
}

func normalizeExtensionBindingMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "exclusive":
		return "exclusive"
	default:
		return "shared"
	}
}

func sanitizeExtensionPackageName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "extension-package"
	}
	re := regexp.MustCompile(`[^a-zA-Z0-9._-]+`)
	name = re.ReplaceAllString(name, "-")
	name = strings.Trim(name, ".-")
	if name == "" {
		return "extension-package"
	}
	return name
}

func (a *App) copyExtensionPackage(src string, extensionId string) (string, error) {
	if strings.TrimSpace(src) == "" {
		return "", nil
	}
	if err := os.MkdirAll(a.extensionPackageRoot(), 0755); err != nil {
		return "", fmt.Errorf("创建扩展包目录失败: %w", err)
	}
	ext := strings.ToLower(filepath.Ext(src))
	if ext == "" {
		ext = ".zip"
	}
	targetName := sanitizeExtensionPackageName(extensionId) + ext
	target := filepath.Join(a.extensionPackageRoot(), targetName)
	in, err := os.Open(src)
	if err != nil {
		return "", fmt.Errorf("读取扩展原始包失败: %w", err)
	}
	defer in.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return "", fmt.Errorf("保存扩展原始包失败: %w", err)
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return "", fmt.Errorf("保存扩展原始包失败: %w", copyErr)
	}
	if closeErr != nil {
		return "", fmt.Errorf("保存扩展原始包失败: %w", closeErr)
	}
	rel, err := a.relativeStatePath(target)
	if err != nil {
		return target, nil
	}
	return rel, nil
}

func (a *App) relativeStatePath(path string) (string, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	stateRoot, err := filepath.Abs(a.appStateRootAbs())
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(stateRoot, absPath)
	if err != nil {
		return "", err
	}
	if rel == "." || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("path is outside state root")
	}
	return rel, nil
}

func manifestString(value interface{}, fallback string) string {
	switch v := value.(type) {
	case string:
		if trimmed := strings.TrimSpace(v); trimmed != "" {
			return trimmed
		}
	}
	return fallback
}

func manifestInt(value interface{}) int {
	switch v := value.(type) {
	case float64:
		return int(v)
	case int:
		return v
	case json.Number:
		n, _ := v.Int64()
		return int(n)
	default:
		return 0
	}
}
