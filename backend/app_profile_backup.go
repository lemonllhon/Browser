package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/platform"
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	goruntime "runtime"
	"sort"
	"strings"
	"time"
)

const (
	profileBackupFormat        = "trace-browser-instance-backup"
	profileBackupVersion       = 1
	profileBackupProgressEvent = "browser:profile-backup:progress"
	profileBackupCookieNotice  = "仅备份非无痕窗口中的持久 Cookie。无痕窗口关闭后不会保留 Cookie，实例关闭时也无法读取无痕内容。"
)

type ProfileBackupExportRequest struct {
	Scope                          string   `json:"scope"`
	ProfileIDs                     []string `json:"profileIds"`
	IncludeCookies                 bool     `json:"includeCookies"`
	IncludePlainCookiesWhenRunning bool     `json:"includePlainCookiesWhenRunning"`
}

type ProfileBackupImportRequest struct {
	ZipPath        string   `json:"zipPath"`
	RestoreCookies bool     `json:"restoreCookies"`
	ProfileIDs     []string `json:"profileIds,omitempty"`
}

type ProfileBackupSummary struct {
	ZipPath              string   `json:"zipPath"`
	Format               string   `json:"format"`
	Version              int      `json:"version"`
	AppName              string   `json:"appName"`
	AppVersion           string   `json:"appVersion"`
	CreatedAt            string   `json:"createdAt"`
	SourceOS             string   `json:"sourceOs"`
	ProfileCount         int      `json:"profileCount"`
	CookieProfileCount   int      `json:"cookieProfileCount"`
	IncludesCookies      bool     `json:"includesCookies"`
	IncludesPlainCookies bool     `json:"includesPlainCookies"`
	CookieNotice         string   `json:"cookieNotice"`
	Warnings             []string `json:"warnings"`
}

type ProfileBackupWarning struct {
	ProfileID   string `json:"profileId,omitempty"`
	ProfileName string `json:"profileName,omitempty"`
	Message     string `json:"message"`
}

type ProfileBackupActionResult struct {
	Cancelled          bool                          `json:"cancelled"`
	Message            string                        `json:"message"`
	ZipPath            string                        `json:"zipPath"`
	CreatedAt          string                        `json:"createdAt"`
	Exported           int                           `json:"exported"`
	Imported           int                           `json:"imported"`
	Skipped            int                           `json:"skipped"`
	Failed             int                           `json:"failed"`
	ProfileCount       int                           `json:"profileCount"`
	CookieProfileCount int                           `json:"cookieProfileCount"`
	Summary            ProfileBackupSummary          `json:"summary"`
	Warnings           []ProfileBackupWarning        `json:"warnings"`
	Profiles           []ProfileBackupProfileSummary `json:"profiles,omitempty"`
}

type ProfileBackupProfileSummary struct {
	ProfileID       string `json:"profileId"`
	ProfileName     string `json:"profileName"`
	UserDataDir     string `json:"userDataDir"`
	GroupID         string `json:"groupId,omitempty"`
	TagCount        int    `json:"tagCount"`
	KeywordCount    int    `json:"keywordCount"`
	HasCookies      bool   `json:"hasCookies"`
	CookieFileCount int    `json:"cookieFileCount"`
}

type profileBackupManifest struct {
	Format               string   `json:"format"`
	Version              int      `json:"version"`
	AppName              string   `json:"appName"`
	AppVersion           string   `json:"appVersion"`
	CreatedAt            string   `json:"createdAt"`
	SourceOS             string   `json:"sourceOs"`
	ProfileCount         int      `json:"profileCount"`
	CookieProfileCount   int      `json:"cookieProfileCount"`
	IncludesCookies      bool     `json:"includesCookies"`
	IncludesPlainCookies bool     `json:"includesPlainCookies"`
	CookieNotice         string   `json:"cookieNotice"`
	Warnings             []string `json:"warnings,omitempty"`
}

type profileBackupPayload struct {
	Profiles []profileBackupProfile `json:"profiles"`
}

type profileBackupProfile struct {
	ProfileID                    string   `json:"profileId"`
	ProfileName                  string   `json:"profileName"`
	UserDataDir                  string   `json:"userDataDir"`
	CoreID                       string   `json:"coreId"`
	FingerprintArgs              []string `json:"fingerprintArgs"`
	ProxyID                      string   `json:"proxyId"`
	ProxyConfig                  string   `json:"proxyConfig"`
	ProxyBindSourceID            string   `json:"proxyBindSourceId,omitempty"`
	ProxyBindSourceURL           string   `json:"proxyBindSourceUrl,omitempty"`
	ProxyBindName                string   `json:"proxyBindName,omitempty"`
	ProxyBindUpdatedAt           string   `json:"proxyBindUpdatedAt,omitempty"`
	AutoProxySwitchEnabled       bool     `json:"autoProxySwitchEnabled,omitempty"`
	AutoProxySwitchGroupName     string   `json:"autoProxySwitchGroupName,omitempty"`
	AutoProxySwitchMode          string   `json:"autoProxySwitchMode,omitempty"`
	AutoProxySwitchIntervalM     int      `json:"autoProxySwitchIntervalM,omitempty"`
	AutoProxySwitchRotateByGroup bool     `json:"autoProxySwitchRotateByGroup,omitempty"`
	AutoProxySwitchLastProxyID   string   `json:"autoProxySwitchLastProxyId,omitempty"`
	LaunchArgs                   []string `json:"launchArgs"`
	Tags                         []string `json:"tags"`
	Keywords                     []string `json:"keywords"`
	GroupID                      string   `json:"groupId,omitempty"`
	LaunchCode                   string   `json:"launchCode,omitempty"`
	CreatedAt                    string   `json:"createdAt,omitempty"`
	UpdatedAt                    string   `json:"updatedAt,omitempty"`
}

type profileBackupCookieMeta struct {
	ProfileID            string                    `json:"profileId"`
	ProfileName          string                    `json:"profileName"`
	UserDataDir          string                    `json:"userDataDir"`
	Files                []profileBackupCookieFile `json:"files"`
	PlainCookiesIncluded bool                      `json:"plainCookiesIncluded"`
	PlainCookiesPath     string                    `json:"plainCookiesPath,omitempty"`
	Warnings             []string                  `json:"warnings,omitempty"`
}

type profileBackupCookieFile struct {
	RelativePath string `json:"relativePath"`
	ArchivePath  string `json:"archivePath"`
	Size         int64  `json:"size"`
	Kind         string `json:"kind,omitempty"`
}

type profileBackupProgressMeta struct {
	ProfileID   string
	ProfileName string
	Index       int
	Total       int
}

func (a *App) BrowserProfilesBackupExport(input ProfileBackupExportRequest) (ProfileBackupActionResult, error) {
	a.maintenanceMu.Lock()
	defer a.maintenanceMu.Unlock()

	if a == nil || a.ctx == nil {
		return ProfileBackupActionResult{}, fmt.Errorf("应用上下文未初始化")
	}
	if a.browserMgr == nil {
		return ProfileBackupActionResult{}, fmt.Errorf("浏览器实例服务尚未初始化")
	}
	if err := a.refreshConfigCacheFromDiskIfPresent(); err != nil {
		a.emitProfileBackupProgress("error", 100, fmt.Sprintf("重载浏览器配置失败: %v", err), nil)
		return ProfileBackupActionResult{}, fmt.Errorf("重载浏览器配置失败: %w", err)
	}

	a.emitProfileBackupProgress("starting", 0, "等待选择实例备份导出路径...", nil)
	defaultName := fmt.Sprintf("trace-browser-instances-backup-%s.zip", time.Now().Format("20060102-150405"))
	savePath, err := a.appRuntime().SaveFileDialog(a.ctx, platform.SaveDialogOptions{
		Title:           "导出实例备份",
		DefaultFilename: defaultName,
		Filters: []platform.FileFilter{
			{DisplayName: "ZIP 文件 (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		a.emitProfileBackupProgress("error", 100, fmt.Sprintf("打开保存对话框失败: %v", err), nil)
		return ProfileBackupActionResult{}, fmt.Errorf("打开保存对话框失败: %w", err)
	}
	if strings.TrimSpace(savePath) == "" {
		a.emitProfileBackupProgress("cancelled", 0, "已取消导出实例备份", nil)
		return ProfileBackupActionResult{Cancelled: true, Message: "已取消导出"}, nil
	}
	savePath = backupEnsureZipSuffix(savePath)

	profiles := a.selectProfilesForBackup(input)
	if len(profiles) == 0 {
		a.emitProfileBackupProgress("error", 100, "没有可导出的实例", nil)
		return ProfileBackupActionResult{}, fmt.Errorf("没有可导出的实例")
	}

	a.emitProfileBackupProgress("preparing", 8, "正在收集实例信息...", nil)
	result, err := a.writeProfileBackupZip(savePath, profiles, input)
	if err != nil {
		a.emitProfileBackupProgress("error", 100, fmt.Sprintf("导出实例备份失败: %v", err), nil)
		return ProfileBackupActionResult{}, err
	}
	a.emitProfileBackupProgress("done", 100, "实例备份导出完成", nil)
	return result, nil
}

func (a *App) BrowserProfilesBackupChooseImportPackage() (ProfileBackupActionResult, error) {
	if a == nil || a.ctx == nil {
		return ProfileBackupActionResult{}, fmt.Errorf("应用上下文未初始化")
	}
	a.emitProfileBackupProgress("starting", 0, "等待选择实例备份包...", nil)
	zipPath, err := a.appRuntime().OpenFileDialog(a.ctx, platform.OpenDialogOptions{
		Title: "选择实例备份包",
		Filters: []platform.FileFilter{
			{DisplayName: "ZIP 文件 (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		a.emitProfileBackupProgress("error", 100, fmt.Sprintf("打开文件对话框失败: %v", err), nil)
		return ProfileBackupActionResult{}, fmt.Errorf("打开文件对话框失败: %w", err)
	}
	if strings.TrimSpace(zipPath) == "" {
		a.emitProfileBackupProgress("cancelled", 0, "已取消选择实例备份包", nil)
		return ProfileBackupActionResult{Cancelled: true, Message: "已取消选择"}, nil
	}

	summary, err := readProfileBackupSummary(zipPath)
	if err != nil {
		a.emitProfileBackupProgress("error", 100, fmt.Sprintf("实例备份包校验失败: %v", err), nil)
		return ProfileBackupActionResult{}, err
	}
	profiles, err := readProfileBackupProfileSummaries(zipPath)
	if err != nil {
		a.emitProfileBackupProgress("error", 100, fmt.Sprintf("实例备份包解析失败: %v", err), nil)
		return ProfileBackupActionResult{}, err
	}
	a.emitProfileBackupProgress("done", 100, "实例备份包校验通过", nil)
	return ProfileBackupActionResult{
		Cancelled:          false,
		Message:            "实例备份包校验通过",
		ZipPath:            zipPath,
		CreatedAt:          summary.CreatedAt,
		ProfileCount:       summary.ProfileCount,
		CookieProfileCount: summary.CookieProfileCount,
		Summary:            summary,
		Profiles:           profiles,
	}, nil
}

func (a *App) BrowserProfilesBackupImport(input ProfileBackupImportRequest) (ProfileBackupActionResult, error) {
	a.maintenanceMu.Lock()
	defer a.maintenanceMu.Unlock()

	if a == nil || a.browserMgr == nil {
		return ProfileBackupActionResult{}, fmt.Errorf("浏览器实例服务尚未初始化")
	}
	if err := a.refreshConfigCacheFromDiskIfPresent(); err != nil {
		a.emitProfileBackupProgress("error", 100, fmt.Sprintf("重载浏览器配置失败: %v", err), nil)
		return ProfileBackupActionResult{}, fmt.Errorf("重载浏览器配置失败: %w", err)
	}
	zipPath := strings.TrimSpace(input.ZipPath)
	if zipPath == "" {
		return ProfileBackupActionResult{}, fmt.Errorf("实例备份包路径不能为空")
	}
	a.emitProfileBackupProgress("preparing", 5, "正在校验实例备份包...", nil)

	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		a.emitProfileBackupProgress("error", 100, fmt.Sprintf("打开实例备份包失败: %v", err), nil)
		return ProfileBackupActionResult{}, fmt.Errorf("打开实例备份包失败: %w", err)
	}
	defer reader.Close()

	manifest, err := readProfileBackupManifestFromZip(&reader.Reader)
	if err != nil {
		a.emitProfileBackupProgress("error", 100, fmt.Sprintf("读取实例备份清单失败: %v", err), nil)
		return ProfileBackupActionResult{}, err
	}
	payload, err := readProfileBackupPayloadFromZip(&reader.Reader)
	if err != nil {
		a.emitProfileBackupProgress("error", 100, fmt.Sprintf("读取实例配置失败: %v", err), nil)
		return ProfileBackupActionResult{}, err
	}

	originalTotal := len(payload.Profiles)
	selectedIDs := profileBackupRequestedProfileIDSet(input.ProfileIDs)
	if len(selectedIDs) > 0 {
		payload.Profiles = filterProfileBackupPayloadProfiles(payload.Profiles, selectedIDs)
	}
	total := len(payload.Profiles)
	if total == 0 {
		if originalTotal > 0 && len(selectedIDs) > 0 {
			return ProfileBackupActionResult{}, fmt.Errorf("未在备份包中找到勾选的实例")
		}
		return ProfileBackupActionResult{}, fmt.Errorf("实例备份包中没有实例配置")
	}

	a.refreshBrowserProfileConfigCacheFromStore()
	coreIDs := a.profileBackupCoreIDSet()
	proxyIDs := a.profileBackupProxyIDSet()
	groupIDs := a.profileBackupGroupIDSet()
	usedNames := a.profileBackupUsedProfileNames()

	imported := 0
	failed := 0
	cookieProfiles := 0
	warnings := make([]ProfileBackupWarning, 0)

	for i, item := range payload.Profiles {
		meta := &profileBackupProgressMeta{
			ProfileID:   item.ProfileID,
			ProfileName: item.ProfileName,
			Index:       i + 1,
			Total:       total,
		}
		progress := 10 + int(float64(i)/float64(total)*80)
		a.emitProfileBackupProgress("importing", progress, fmt.Sprintf("正在恢复实例 %d/%d：%s", i+1, total, profileBackupDisplayName(item.ProfileName, item.ProfileID)), meta)

		createInput, itemWarnings := a.profileBackupBuildCreateInput(item, coreIDs, proxyIDs, groupIDs, usedNames)
		for _, warning := range itemWarnings {
			warnings = append(warnings, ProfileBackupWarning{ProfileID: item.ProfileID, ProfileName: item.ProfileName, Message: warning})
		}

		created, err := a.browserMgr.Create(createInput)
		if err != nil {
			failed++
			warnings = append(warnings, ProfileBackupWarning{ProfileID: item.ProfileID, ProfileName: item.ProfileName, Message: err.Error()})
			continue
		}
		imported++
		if created != nil {
			a.profileBackupApplyRestoredFields(created.ProfileId, item)
		}

		if input.RestoreCookies && created != nil {
			restored, cookieWarnings := a.restoreProfileBackupCookies(&reader.Reader, item, created)
			if restored {
				cookieProfiles++
			}
			for _, warning := range cookieWarnings {
				warnings = append(warnings, ProfileBackupWarning{ProfileID: item.ProfileID, ProfileName: item.ProfileName, Message: warning})
			}
		}
	}

	a.emitProfileBackupProgress("done", 100, fmt.Sprintf("实例恢复完成：成功 %d，失败 %d", imported, failed), nil)
	a.emitProfileDataUpdated()
	a.emitGroupDataUpdated()

	summary := profileBackupSummaryFromManifest(manifest, zipPath)
	profiles := profileBackupProfileSummariesFromPayload(&reader.Reader, payload)
	return ProfileBackupActionResult{
		Cancelled:          false,
		Message:            fmt.Sprintf("实例恢复完成：成功 %d，失败 %d", imported, failed),
		ZipPath:            zipPath,
		CreatedAt:          manifest.CreatedAt,
		Imported:           imported,
		Skipped:            originalTotal - total,
		Failed:             failed,
		ProfileCount:       total,
		CookieProfileCount: cookieProfiles,
		Summary:            summary,
		Warnings:           warnings,
		Profiles:           profiles,
	}, nil
}

func (a *App) selectProfilesForBackup(input ProfileBackupExportRequest) []BrowserProfile {
	all := a.BrowserProfileList()
	scope := strings.ToLower(strings.TrimSpace(input.Scope))
	if scope == "" {
		scope = "all"
	}
	if scope == "all" {
		return all
	}
	if len(input.ProfileIDs) == 0 {
		return []BrowserProfile{}
	}
	selected := make(map[string]struct{}, len(input.ProfileIDs))
	for _, id := range input.ProfileIDs {
		id = strings.TrimSpace(id)
		if id != "" {
			selected[id] = struct{}{}
		}
	}
	out := make([]BrowserProfile, 0, len(selected))
	for _, profile := range all {
		if _, ok := selected[profile.ProfileId]; ok {
			out = append(out, profile)
		}
	}
	return out
}

func (a *App) writeProfileBackupZip(zipPath string, profiles []BrowserProfile, input ProfileBackupExportRequest) (ProfileBackupActionResult, error) {
	if err := os.MkdirAll(filepath.Dir(zipPath), 0755); err != nil {
		return ProfileBackupActionResult{}, fmt.Errorf("创建导出目录失败: %w", err)
	}

	tmpPath := zipPath + ".tmp"
	f, err := os.Create(tmpPath)
	if err != nil {
		return ProfileBackupActionResult{}, fmt.Errorf("创建导出文件失败: %w", err)
	}
	w := zip.NewWriter(f)
	createdAt := time.Now().Format(time.RFC3339)
	warnings := make([]ProfileBackupWarning, 0)
	manifestWarnings := make([]string, 0)
	cookieProfileCount := 0

	writeErr := func() error {
		payloadProfiles := make([]profileBackupProfile, 0, len(profiles))
		for i, profile := range profiles {
			meta := &profileBackupProgressMeta{
				ProfileID:   profile.ProfileId,
				ProfileName: profile.ProfileName,
				Index:       i + 1,
				Total:       len(profiles),
			}
			progress := 12 + int(float64(i)/float64(len(profiles))*60)
			a.emitProfileBackupProgress("writing", progress, fmt.Sprintf("正在处理实例 %d/%d：%s", i+1, len(profiles), profileBackupDisplayName(profile.ProfileName, profile.ProfileId)), meta)
			payloadProfiles = append(payloadProfiles, profileBackupProfileFromBrowser(profile))

			if input.IncludeCookies {
				restored, cookieWarnings, err := a.writeProfileCookiesToBackup(w, profile, input.IncludePlainCookiesWhenRunning)
				if err != nil {
					warnings = append(warnings, ProfileBackupWarning{ProfileID: profile.ProfileId, ProfileName: profile.ProfileName, Message: err.Error()})
					manifestWarnings = append(manifestWarnings, fmt.Sprintf("%s: %s", profileBackupDisplayName(profile.ProfileName, profile.ProfileId), err.Error()))
					continue
				}
				if restored {
					cookieProfileCount++
				}
				for _, warning := range cookieWarnings {
					warnings = append(warnings, ProfileBackupWarning{ProfileID: profile.ProfileId, ProfileName: profile.ProfileName, Message: warning})
					manifestWarnings = append(manifestWarnings, fmt.Sprintf("%s: %s", profileBackupDisplayName(profile.ProfileName, profile.ProfileId), warning))
				}
			}
		}

		payload := profileBackupPayload{Profiles: payloadProfiles}
		if err := profileBackupZipWriteJSON(w, "payload/profiles.json", payload); err != nil {
			return err
		}
		if err := profileBackupZipWriteJSON(w, "payload/groups.json", a.profileBackupGroupsSnapshot()); err != nil {
			return err
		}
		if err := profileBackupZipWriteJSON(w, "payload/proxies.json", a.getLatestProxies()); err != nil {
			return err
		}
		if err := profileBackupZipWriteJSON(w, "payload/cores.json", a.browserMgr.ListCores()); err != nil {
			return err
		}

		manifest := profileBackupManifest{
			Format:               profileBackupFormat,
			Version:              profileBackupVersion,
			AppName:              a.appName(),
			AppVersion:           a.appVersion(),
			CreatedAt:            createdAt,
			SourceOS:             goruntime.GOOS,
			ProfileCount:         len(payloadProfiles),
			CookieProfileCount:   cookieProfileCount,
			IncludesCookies:      input.IncludeCookies,
			IncludesPlainCookies: input.IncludePlainCookiesWhenRunning,
			CookieNotice:         profileBackupCookieNotice,
			Warnings:             manifestWarnings,
		}
		if err := profileBackupZipWriteJSON(w, "manifest.json", manifest); err != nil {
			return err
		}
		return nil
	}()

	closeErr := w.Close()
	fileCloseErr := f.Close()
	if writeErr != nil {
		_ = os.Remove(tmpPath)
		return ProfileBackupActionResult{}, writeErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return ProfileBackupActionResult{}, closeErr
	}
	if fileCloseErr != nil {
		_ = os.Remove(tmpPath)
		return ProfileBackupActionResult{}, fileCloseErr
	}
	if err := profileBackupReplaceFile(tmpPath, zipPath); err != nil {
		_ = os.Remove(tmpPath)
		return ProfileBackupActionResult{}, fmt.Errorf("保存导出文件失败: %w", err)
	}

	summary := ProfileBackupSummary{
		ZipPath:              zipPath,
		Format:               profileBackupFormat,
		Version:              profileBackupVersion,
		AppName:              a.appName(),
		AppVersion:           a.appVersion(),
		CreatedAt:            createdAt,
		SourceOS:             goruntime.GOOS,
		ProfileCount:         len(profiles),
		CookieProfileCount:   cookieProfileCount,
		IncludesCookies:      input.IncludeCookies,
		IncludesPlainCookies: input.IncludePlainCookiesWhenRunning,
		CookieNotice:         profileBackupCookieNotice,
		Warnings:             manifestWarnings,
	}
	return ProfileBackupActionResult{
		Cancelled:          false,
		Message:            "实例备份导出完成",
		ZipPath:            zipPath,
		CreatedAt:          createdAt,
		Exported:           len(profiles),
		ProfileCount:       len(profiles),
		CookieProfileCount: cookieProfileCount,
		Summary:            summary,
		Warnings:           warnings,
	}, nil
}

func (a *App) writeProfileCookiesToBackup(w *zip.Writer, profile BrowserProfile, includePlain bool) (bool, []string, error) {
	cookieRoot := profileBackupCookieArchiveRoot(profile.ProfileId)
	userDataDir := a.browserMgr.ResolveUserDataDir(&profile)
	meta := profileBackupCookieMeta{
		ProfileID:   profile.ProfileId,
		ProfileName: profile.ProfileName,
		UserDataDir: profile.UserDataDir,
		Files:       []profileBackupCookieFile{},
		Warnings:    []string{},
	}

	for _, rel := range profileBackupCookieCandidatePaths(userDataDir) {
		absPath := filepath.Join(userDataDir, filepath.FromSlash(rel))
		info, err := os.Stat(absPath)
		if err != nil {
			continue
		}
		if info.IsDir() {
			continue
		}
		archivePath := path.Join(cookieRoot, rel)
		if err := profileBackupZipAddFile(w, absPath, archivePath); err != nil {
			meta.Warnings = append(meta.Warnings, fmt.Sprintf("Cookie 文件复制失败 %s: %v", rel, err))
			continue
		}
		meta.Files = append(meta.Files, profileBackupCookieFile{
			RelativePath: rel,
			ArchivePath:  archivePath,
			Size:         info.Size(),
			Kind:         profileBackupCookieFileKind(rel),
		})
	}

	if !profileBackupCookieMetaHasCookieData(meta) {
		meta.Warnings = append(meta.Warnings, "未找到非无痕持久 Cookie 文件")
	}

	if includePlain && profile.Running && profile.DebugReady {
		if content, err := a.BrowserExportCookies(profile.ProfileId); err == nil && strings.TrimSpace(content) != "" {
			plainPath := path.Join(cookieRoot, "plain-cookies.txt")
			if err := profileBackupZipWriteString(w, plainPath, content); err == nil {
				meta.PlainCookiesIncluded = true
				meta.PlainCookiesPath = plainPath
			} else {
				meta.Warnings = append(meta.Warnings, fmt.Sprintf("明文 Cookie 快照写入失败: %v", err))
			}
		} else if err != nil {
			meta.Warnings = append(meta.Warnings, fmt.Sprintf("运行中明文 Cookie 快照导出失败: %v", err))
		}
	}

	if err := profileBackupZipWriteJSON(w, path.Join(cookieRoot, "cookie-meta.json"), meta); err != nil {
		return profileBackupCookieMetaHasCookieData(meta), meta.Warnings, err
	}
	return profileBackupCookieMetaHasCookieData(meta), meta.Warnings, nil
}

func (a *App) restoreProfileBackupCookies(reader *zip.Reader, source profileBackupProfile, target *BrowserProfile) (bool, []string) {
	warnings := make([]string, 0)
	metaPath := path.Join(profileBackupCookieArchiveRoot(source.ProfileID), "cookie-meta.json")
	var meta profileBackupCookieMeta
	if err := readProfileBackupJSON(reader, metaPath, &meta); err != nil {
		return false, []string{"备份包中未找到该实例的 Cookie 元数据"}
	}
	if len(meta.Files) == 0 {
		return false, meta.Warnings
	}

	userDataDir := a.browserMgr.ResolveUserDataDir(target)
	if err := os.MkdirAll(userDataDir, 0755); err != nil {
		return false, []string{fmt.Sprintf("创建用户数据目录失败: %v", err)}
	}

	restored := false
	restoredCookieData := false
	restoredLocalState := false
	expectedLocalState := profileBackupCookieMetaHasFileKind(meta, "local_state")
	for _, item := range meta.Files {
		rel, err := profileBackupSafeRelativePath(item.RelativePath)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("跳过不安全 Cookie 路径 %s: %v", item.RelativePath, err))
			continue
		}
		archivePath := strings.TrimSpace(item.ArchivePath)
		if archivePath == "" {
			archivePath = path.Join(profileBackupCookieArchiveRoot(source.ProfileID), rel)
		}
		dst := filepath.Join(userDataDir, filepath.FromSlash(rel))
		if !isPathInside(filepath.Clean(dst), filepath.Clean(userDataDir)) {
			warnings = append(warnings, fmt.Sprintf("跳过越界 Cookie 路径 %s", rel))
			continue
		}
		if err := copyProfileBackupZipFile(reader, archivePath, dst); err != nil {
			warnings = append(warnings, fmt.Sprintf("恢复 Cookie 文件失败 %s: %v", rel, err))
			continue
		}
		restored = true
		kind := strings.TrimSpace(item.Kind)
		if kind == "" {
			kind = profileBackupCookieFileKind(rel)
		}
		if kind == "cookie_db" {
			restoredCookieData = true
		} else if kind == "local_state" {
			restoredLocalState = true
		}
	}
	if restoredCookieData && expectedLocalState && !restoredLocalState {
		warnings = append(warnings, "Cookie 加密密钥文件 Local State 恢复失败，部分 Cookie 可能无法读取")
	}
	if restoredCookieData && !expectedLocalState {
		warnings = append(warnings, "备份包缺少 Cookie 加密密钥文件 Local State，恢复后部分 Cookie 可能无法读取")
	}
	warnings = append(warnings, meta.Warnings...)
	return restored && restoredCookieData, warnings
}

func (a *App) profileBackupBuildCreateInput(item profileBackupProfile, coreIDs, proxyIDs, groupIDs map[string]struct{}, usedNames map[string]struct{}) (BrowserProfileInput, []string) {
	warnings := make([]string, 0)
	name := uniqueRestoredProfileName(item.ProfileName, usedNames)

	coreID := strings.TrimSpace(item.CoreID)
	if coreID != "" {
		if _, ok := coreIDs[strings.ToLower(coreID)]; !ok {
			coreID = ""
			warnings = append(warnings, "原内核不存在，已改用默认内核")
		}
	}

	proxyID := strings.TrimSpace(item.ProxyID)
	proxyConfig := strings.TrimSpace(item.ProxyConfig)
	if proxyID != "" {
		if _, ok := proxyIDs[strings.ToLower(proxyID)]; !ok {
			proxyID = ""
			if proxyConfig != "" {
				warnings = append(warnings, "原代理节点不存在，已保留代理配置文本")
			} else {
				warnings = append(warnings, "原代理节点不存在，已清空代理引用")
			}
		}
	}

	groupID := strings.TrimSpace(item.GroupID)
	if groupID != "" {
		if _, ok := groupIDs[strings.ToLower(groupID)]; !ok {
			groupID = ""
			warnings = append(warnings, "原分组不存在，已恢复到未分组")
		}
	}

	return BrowserProfileInput{
		ProfileName:                  name,
		UserDataDir:                  "",
		CoreId:                       coreID,
		FingerprintArgs:              append([]string{}, item.FingerprintArgs...),
		ProxyId:                      proxyID,
		ProxyConfig:                  proxyConfig,
		AutoProxySwitchEnabled:       item.AutoProxySwitchEnabled,
		AutoProxySwitchGroupName:     item.AutoProxySwitchGroupName,
		AutoProxySwitchMode:          item.AutoProxySwitchMode,
		AutoProxySwitchIntervalM:     item.AutoProxySwitchIntervalM,
		AutoProxySwitchRotateByGroup: item.AutoProxySwitchRotateByGroup,
		LaunchArgs:                   append([]string{}, item.LaunchArgs...),
		Tags:                         append([]string{}, item.Tags...),
		Keywords:                     append([]string{}, item.Keywords...),
		GroupId:                      groupID,
	}, warnings
}

func (a *App) profileBackupApplyRestoredFields(profileID string, item profileBackupProfile) {
	if a == nil || a.browserMgr == nil {
		return
	}
	var snapshot *BrowserProfile
	a.browserMgr.Mutex.Lock()
	profile := a.browserMgr.Profiles[profileID]
	if profile != nil {
		profile.ProxyBindSourceID = item.ProxyBindSourceID
		profile.ProxyBindSourceURL = item.ProxyBindSourceURL
		profile.ProxyBindName = item.ProxyBindName
		profile.ProxyBindUpdatedAt = item.ProxyBindUpdatedAt
		profile.AutoProxySwitchLastProxyId = item.AutoProxySwitchLastProxyID
		copied := *profile
		snapshot = &copied
	}
	a.browserMgr.Mutex.Unlock()
	if snapshot != nil && a.browserMgr.ProfileDAO != nil {
		_ = a.browserMgr.ProfileDAO.Upsert(snapshot)
		return
	}
	if snapshot != nil {
		_ = a.browserMgr.SaveProfiles()
	}
}

func (a *App) profileBackupCoreIDSet() map[string]struct{} {
	out := map[string]struct{}{}
	for _, core := range a.browserMgr.ListCores() {
		id := strings.ToLower(strings.TrimSpace(core.CoreId))
		if id != "" {
			out[id] = struct{}{}
		}
	}
	return out
}

func (a *App) profileBackupProxyIDSet() map[string]struct{} {
	out := map[string]struct{}{}
	for _, proxy := range a.getLatestProxies() {
		id := strings.ToLower(strings.TrimSpace(proxy.ProxyId))
		if id != "" {
			out[id] = struct{}{}
		}
	}
	return out
}

func (a *App) profileBackupGroupIDSet() map[string]struct{} {
	out := map[string]struct{}{}
	for _, group := range a.profileBackupGroupsSnapshot() {
		id := strings.ToLower(strings.TrimSpace(group.GroupId))
		if id != "" {
			out[id] = struct{}{}
		}
	}
	return out
}

func (a *App) profileBackupUsedProfileNames() map[string]struct{} {
	out := map[string]struct{}{}
	for _, profile := range a.BrowserProfileList() {
		name := strings.ToLower(strings.TrimSpace(profile.ProfileName))
		if name != "" {
			out[name] = struct{}{}
		}
	}
	return out
}

func (a *App) profileBackupGroupsSnapshot() []browser.Group {
	if a == nil || a.browserMgr == nil || a.browserMgr.GroupDAO == nil {
		return []browser.Group{}
	}
	groups, err := a.browserMgr.GroupDAO.List()
	if err != nil {
		return []browser.Group{}
	}
	out := make([]browser.Group, 0, len(groups))
	for _, group := range groups {
		if group != nil {
			out = append(out, *group)
		}
	}
	return out
}

func (a *App) emitProfileBackupProgress(phase string, progress int, message string, meta *profileBackupProgressMeta) {
	event := backupProgressEvent{
		Phase:     strings.TrimSpace(phase),
		Progress:  progress,
		Message:   strings.TrimSpace(message),
		Timestamp: time.Now().Format("15:04:05"),
	}
	if meta != nil {
		event.ComponentID = meta.ProfileID
		event.ComponentName = meta.ProfileName
		event.EntryIndex = meta.Index
		event.EntryTotal = meta.Total
	}
	a.emitBackupProgressEvent(profileBackupProgressEvent, event)
}

func readProfileBackupSummary(zipPath string) (ProfileBackupSummary, error) {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return ProfileBackupSummary{}, fmt.Errorf("打开实例备份包失败: %w", err)
	}
	defer reader.Close()
	manifest, err := readProfileBackupManifestFromZip(&reader.Reader)
	if err != nil {
		return ProfileBackupSummary{}, err
	}
	return profileBackupSummaryFromManifest(manifest, zipPath), nil
}

func readProfileBackupProfileSummaries(zipPath string) ([]ProfileBackupProfileSummary, error) {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, fmt.Errorf("打开实例备份包失败: %w", err)
	}
	defer reader.Close()
	payload, err := readProfileBackupPayloadFromZip(&reader.Reader)
	if err != nil {
		return nil, err
	}
	return profileBackupProfileSummariesFromPayload(&reader.Reader, payload), nil
}

func profileBackupProfileSummariesFromPayload(reader *zip.Reader, payload profileBackupPayload) []ProfileBackupProfileSummary {
	out := make([]ProfileBackupProfileSummary, 0, len(payload.Profiles))
	for _, item := range payload.Profiles {
		summary := ProfileBackupProfileSummary{
			ProfileID:    item.ProfileID,
			ProfileName:  item.ProfileName,
			UserDataDir:  item.UserDataDir,
			GroupID:      item.GroupID,
			TagCount:     len(item.Tags),
			KeywordCount: len(item.Keywords),
		}
		metaPath := path.Join(profileBackupCookieArchiveRoot(item.ProfileID), "cookie-meta.json")
		var meta profileBackupCookieMeta
		if err := readProfileBackupJSON(reader, metaPath, &meta); err == nil {
			summary.HasCookies = profileBackupCookieMetaHasCookieData(meta)
			summary.CookieFileCount = profileBackupCookieMetaCookieFileCount(meta)
			if meta.PlainCookiesIncluded {
				summary.CookieFileCount++
			}
		}
		out = append(out, summary)
	}
	return out
}

func profileBackupSummaryFromManifest(manifest profileBackupManifest, zipPath string) ProfileBackupSummary {
	return ProfileBackupSummary{
		ZipPath:              zipPath,
		Format:               manifest.Format,
		Version:              manifest.Version,
		AppName:              manifest.AppName,
		AppVersion:           manifest.AppVersion,
		CreatedAt:            manifest.CreatedAt,
		SourceOS:             manifest.SourceOS,
		ProfileCount:         manifest.ProfileCount,
		CookieProfileCount:   manifest.CookieProfileCount,
		IncludesCookies:      manifest.IncludesCookies,
		IncludesPlainCookies: manifest.IncludesPlainCookies,
		CookieNotice:         manifest.CookieNotice,
		Warnings:             append([]string{}, manifest.Warnings...),
	}
}

func readProfileBackupManifestFromZip(reader *zip.Reader) (profileBackupManifest, error) {
	var manifest profileBackupManifest
	if err := readProfileBackupJSON(reader, "manifest.json", &manifest); err != nil {
		return profileBackupManifest{}, err
	}
	if manifest.Format != profileBackupFormat {
		return profileBackupManifest{}, fmt.Errorf("不是有效的实例备份包")
	}
	if manifest.Version <= 0 || manifest.Version > profileBackupVersion {
		return profileBackupManifest{}, fmt.Errorf("实例备份包版本不兼容: %d", manifest.Version)
	}
	if manifest.CookieNotice == "" {
		manifest.CookieNotice = profileBackupCookieNotice
	}
	return manifest, nil
}

func readProfileBackupPayloadFromZip(reader *zip.Reader) (profileBackupPayload, error) {
	var payload profileBackupPayload
	if err := readProfileBackupJSON(reader, "payload/profiles.json", &payload); err != nil {
		return profileBackupPayload{}, err
	}
	return payload, nil
}

func readProfileBackupJSON(reader *zip.Reader, name string, target interface{}) error {
	file := profileBackupFindZipFile(reader, name)
	if file == nil {
		return fmt.Errorf("备份包缺少 %s", name)
	}
	rc, err := file.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	decoder := json.NewDecoder(io.LimitReader(rc, 16*1024*1024))
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("解析 %s 失败: %w", name, err)
	}
	return nil
}

func profileBackupFindZipFile(reader *zip.Reader, name string) *zip.File {
	name = path.Clean(strings.TrimSpace(name))
	for _, file := range reader.File {
		if path.Clean(file.Name) == name {
			return file
		}
	}
	return nil
}

func profileBackupZipWriteJSON(w *zip.Writer, archivePath string, value interface{}) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return profileBackupZipWriteBytes(w, archivePath, data)
}

func profileBackupZipWriteString(w *zip.Writer, archivePath string, value string) error {
	return profileBackupZipWriteBytes(w, archivePath, []byte(value))
}

func profileBackupZipWriteBytes(w *zip.Writer, archivePath string, data []byte) error {
	header := &zip.FileHeader{
		Name:     path.Clean(archivePath),
		Method:   zip.Deflate,
		Modified: time.Now(),
	}
	writer, err := w.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = writer.Write(data)
	return err
}

func profileBackupReplaceFile(tmpPath string, targetPath string) error {
	err := os.Rename(tmpPath, targetPath)
	if err == nil {
		return nil
	}
	if _, tmpErr := os.Stat(tmpPath); tmpErr != nil {
		return err
	}
	if _, statErr := os.Stat(targetPath); statErr != nil {
		return err
	}
	if removeErr := os.Remove(targetPath); removeErr != nil {
		return removeErr
	}
	return os.Rename(tmpPath, targetPath)
}

func profileBackupZipAddFile(w *zip.Writer, sourcePath string, archivePath string) error {
	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = path.Clean(archivePath)
	header.Method = zip.Deflate
	writer, err := w.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(writer, file)
	return err
}

func copyProfileBackupZipFile(reader *zip.Reader, archivePath string, dst string) error {
	file := profileBackupFindZipFile(reader, archivePath)
	if file == nil {
		return fmt.Errorf("备份包缺少文件 %s", archivePath)
	}
	rc, err := file.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	tmpPath := dst + ".tmp"
	out, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, rc); err != nil {
		out.Close()
		_ = os.Remove(tmpPath)
		return err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, dst); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}

func profileBackupProfileFromBrowser(profile BrowserProfile) profileBackupProfile {
	return profileBackupProfile{
		ProfileID:                    profile.ProfileId,
		ProfileName:                  profile.ProfileName,
		UserDataDir:                  profile.UserDataDir,
		CoreID:                       profile.CoreId,
		FingerprintArgs:              append([]string{}, profile.FingerprintArgs...),
		ProxyID:                      profile.ProxyId,
		ProxyConfig:                  profile.ProxyConfig,
		ProxyBindSourceID:            profile.ProxyBindSourceID,
		ProxyBindSourceURL:           profile.ProxyBindSourceURL,
		ProxyBindName:                profile.ProxyBindName,
		ProxyBindUpdatedAt:           profile.ProxyBindUpdatedAt,
		AutoProxySwitchEnabled:       profile.AutoProxySwitchEnabled,
		AutoProxySwitchGroupName:     profile.AutoProxySwitchGroupName,
		AutoProxySwitchMode:          profile.AutoProxySwitchMode,
		AutoProxySwitchIntervalM:     profile.AutoProxySwitchIntervalM,
		AutoProxySwitchRotateByGroup: profile.AutoProxySwitchRotateByGroup,
		AutoProxySwitchLastProxyID:   profile.AutoProxySwitchLastProxyId,
		LaunchArgs:                   append([]string{}, profile.LaunchArgs...),
		Tags:                         append([]string{}, profile.Tags...),
		Keywords:                     append([]string{}, profile.Keywords...),
		GroupID:                      profile.GroupId,
		LaunchCode:                   profile.LaunchCode,
		CreatedAt:                    profile.CreatedAt,
		UpdatedAt:                    profile.UpdatedAt,
	}
}

func profileBackupCookieArchiveRoot(profileID string) string {
	return path.Join("payload", "cookies", safeProfileBackupName(profileID))
}

func safeProfileBackupName(value string) string {
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

func profileBackupCookieCandidatePaths(userDataDir string) []string {
	basePaths := []string{
		"Default/Network/Cookies",
		"Default/Cookies",
		"Network/Cookies",
		"Cookies",
	}
	if entries, err := os.ReadDir(userDataDir); err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			name := entry.Name()
			if strings.HasPrefix(name, ".") {
				continue
			}
			basePaths = append(basePaths,
				path.Join(filepath.ToSlash(name), "Network", "Cookies"),
				path.Join(filepath.ToSlash(name), "Cookies"),
			)
		}
	}
	suffixes := []string{"", "-wal", "-shm", "-journal"}
	seen := map[string]struct{}{}
	paths := make([]string, 0, 1+len(basePaths)*len(suffixes))
	paths = append(paths, "Local State")
	for _, base := range basePaths {
		for _, suffix := range suffixes {
			item := path.Clean(base + suffix)
			if item == "." {
				continue
			}
			if _, ok := seen[item]; ok {
				continue
			}
			seen[item] = struct{}{}
			paths = append(paths, item)
		}
	}
	return paths
}

func profileBackupCookieFileKind(relativePath string) string {
	rel := strings.TrimSpace(filepath.ToSlash(relativePath))
	if strings.EqualFold(rel, "Local State") {
		return "local_state"
	}
	name := path.Base(rel)
	if strings.EqualFold(name, "Cookies") ||
		strings.EqualFold(name, "Cookies-wal") ||
		strings.EqualFold(name, "Cookies-shm") ||
		strings.EqualFold(name, "Cookies-journal") {
		return "cookie_db"
	}
	return "cookie_related"
}

func profileBackupCookieMetaHasCookieData(meta profileBackupCookieMeta) bool {
	if meta.PlainCookiesIncluded {
		return true
	}
	return profileBackupCookieMetaCookieFileCount(meta) > 0
}

func profileBackupCookieMetaCookieFileCount(meta profileBackupCookieMeta) int {
	count := 0
	for _, file := range meta.Files {
		kind := strings.TrimSpace(file.Kind)
		if kind == "" {
			kind = profileBackupCookieFileKind(file.RelativePath)
		}
		if kind == "cookie_db" {
			count++
		}
	}
	return count
}

func profileBackupCookieMetaHasFileKind(meta profileBackupCookieMeta, targetKind string) bool {
	targetKind = strings.TrimSpace(targetKind)
	if targetKind == "" {
		return false
	}
	for _, file := range meta.Files {
		kind := strings.TrimSpace(file.Kind)
		if kind == "" {
			kind = profileBackupCookieFileKind(file.RelativePath)
		}
		if kind == targetKind {
			return true
		}
	}
	return false
}

func profileBackupSafeRelativePath(value string) (string, error) {
	value = strings.TrimSpace(filepath.ToSlash(value))
	if value == "" {
		return "", fmt.Errorf("路径为空")
	}
	if strings.HasPrefix(value, "/") || strings.Contains(value, ":") {
		return "", fmt.Errorf("不允许绝对路径")
	}
	clean := path.Clean(value)
	if clean == "." || strings.HasPrefix(clean, "../") || clean == ".." {
		return "", fmt.Errorf("不允许越界路径")
	}
	return clean, nil
}

func uniqueRestoredProfileName(name string, used map[string]struct{}) string {
	base := strings.TrimSpace(name)
	if base == "" {
		base = "恢复实例"
	}
	candidate := base
	key := strings.ToLower(candidate)
	if _, ok := used[key]; !ok {
		used[key] = struct{}{}
		return candidate
	}
	candidate = base + " (恢复)"
	key = strings.ToLower(candidate)
	if _, ok := used[key]; !ok {
		used[key] = struct{}{}
		return candidate
	}
	for i := 2; ; i++ {
		candidate = fmt.Sprintf("%s (恢复 %d)", base, i)
		key = strings.ToLower(candidate)
		if _, ok := used[key]; !ok {
			used[key] = struct{}{}
			return candidate
		}
	}
}

func profileBackupDisplayName(name string, id string) string {
	name = strings.TrimSpace(name)
	if name != "" {
		return name
	}
	id = strings.TrimSpace(id)
	if id != "" {
		return id
	}
	return "未命名实例"
}

func profileBackupSortedProfileIDs(profiles []BrowserProfile) []string {
	ids := make([]string, 0, len(profiles))
	for _, profile := range profiles {
		if strings.TrimSpace(profile.ProfileId) != "" {
			ids = append(ids, profile.ProfileId)
		}
	}
	sort.Strings(ids)
	return ids
}

func profileBackupRequestedProfileIDSet(profileIDs []string) map[string]struct{} {
	out := make(map[string]struct{}, len(profileIDs))
	for _, id := range profileIDs {
		id = strings.TrimSpace(id)
		if id != "" {
			out[id] = struct{}{}
		}
	}
	return out
}

func filterProfileBackupPayloadProfiles(profiles []profileBackupProfile, selected map[string]struct{}) []profileBackupProfile {
	if len(selected) == 0 {
		return profiles
	}
	out := make([]profileBackupProfile, 0, len(profiles))
	for _, profile := range profiles {
		if _, ok := selected[profile.ProfileID]; ok {
			out = append(out, profile)
		}
	}
	return out
}
