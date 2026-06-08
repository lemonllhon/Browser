package backend

import (
	"ant-chrome/backend/internal/cloudsync"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type ProfileTransferShareCreateInput struct {
	ProfileIDs                     []string `json:"profileIds"`
	IncludeCookies                 bool     `json:"includeCookies"`
	IncludePlainCookiesWhenRunning bool     `json:"includePlainCookiesWhenRunning"`
	ExpiresInHours                 int      `json:"expiresInHours"`
	Note                           string   `json:"note"`
}

type ProfileTransferShareCreateResult struct {
	Share         cloudsync.BackupShareItem `json:"share"`
	Backup        cloudsync.BackupItem      `json:"backup"`
	Code          string                    `json:"code"`
	ShareURL      string                    `json:"shareUrl"`
	DirectURL     string                    `json:"directUrl"`
	ExpiresAt     string                    `json:"expiresAt"`
	LocalPath     string                    `json:"localPath"`
	ProfileBackup ProfileBackupActionResult `json:"profileBackup"`
	Message       string                    `json:"message"`
}

type ProfileTransferShareResolveInput struct {
	ShareText string `json:"shareText"`
	ServerURL string `json:"serverURL"`
}

type ProfileTransferShareResolveResult struct {
	Share      cloudsync.BackupShareItem `json:"share"`
	Backup     cloudsync.BackupItem      `json:"backup"`
	ServerURL  string                    `json:"serverURL"`
	Code       string                    `json:"code"`
	ServerTime string                    `json:"serverTime"`
	Message    string                    `json:"message"`
}

type ProfileTransferSharePrepareRestoreInput struct {
	ShareText string `json:"shareText"`
	ServerURL string `json:"serverURL"`
}

type profileTransferShareTarget struct {
	ServerURL string
	Code      string
}

func (a *App) CloudSyncCreateProfileTransferShare(input ProfileTransferShareCreateInput) (ProfileTransferShareCreateResult, error) {
	if a == nil || a.browserMgr == nil {
		err := fmt.Errorf("浏览器实例服务尚未初始化")
		if a != nil {
			a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, err.Error())
		}
		return ProfileTransferShareCreateResult{}, err
	}
	if len(profileBackupRequestedProfileIDSet(input.ProfileIDs)) == 0 {
		err := fmt.Errorf("请选择要分享的已停止实例")
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, err.Error())
		return ProfileTransferShareCreateResult{}, err
	}

	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(10 * time.Minute)
	defer cancel()
	a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "starting", 0, "准备创建实例流转分享...")

	tempDir := a.resolveAppPath(filepath.Join("data", "cloud-sync", "temp"))
	if err := os.MkdirAll(tempDir, 0700); err != nil {
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, fmt.Sprintf("创建临时目录失败: %v", err))
		return ProfileTransferShareCreateResult{}, err
	}
	zipPath := filepath.Join(tempDir, fmt.Sprintf("trace-profile-transfer-%s.zip", time.Now().Format("20060102-150405")))

	exportInput := ProfileBackupExportRequest{
		Scope:                          "custom",
		ProfileIDs:                     input.ProfileIDs,
		IncludeCookies:                 input.IncludeCookies,
		IncludePlainCookiesWhenRunning: input.IncludePlainCookiesWhenRunning,
	}

	a.maintenanceMu.Lock()
	if err := a.refreshConfigCacheFromDiskIfPresent(); err != nil {
		a.maintenanceMu.Unlock()
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, fmt.Sprintf("重载浏览器配置失败: %v", err))
		return ProfileTransferShareCreateResult{}, fmt.Errorf("重载浏览器配置失败: %w", err)
	}
	profiles := a.selectProfilesForBackup(exportInput)
	if len(profiles) == 0 {
		a.maintenanceMu.Unlock()
		err := fmt.Errorf("没有可分享的实例")
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, err.Error())
		return ProfileTransferShareCreateResult{}, err
	}
	if running := runningProfileNames(profiles); len(running) > 0 {
		a.maintenanceMu.Unlock()
		err := fmt.Errorf("流转分享仅支持已停止实例，请先停止：%s", strings.Join(running, "、"))
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, err.Error())
		return ProfileTransferShareCreateResult{}, err
	}
	a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "preparing", 6, "正在生成实例流转包...")
	profileResult, err := a.writeProfileBackupZip(zipPath, profiles, exportInput)
	a.maintenanceMu.Unlock()
	if err != nil {
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, fmt.Sprintf("生成实例流转包失败: %v", err))
		return ProfileTransferShareCreateResult{}, err
	}
	defer os.Remove(zipPath)

	name := fmt.Sprintf("实例流转分享 %s", time.Now().Format("2006-01-02 15:04"))
	fields := map[string]string{
		"backupType":     cloudSyncBackupTypeProfileTransfer,
		"packageFormat":  profileBackupFormat,
		"packageVersion": strconv.Itoa(profileBackupVersion),
		"name":           name,
		"description":    fmt.Sprintf("流转分享，包含 %d 个已停止实例", profileResult.ProfileCount),
		"appName":        a.appName(),
		"appVersion":     a.appVersion(),
		"sourceOs":       runtime.GOOS,
		"encrypted":      "false",
	}
	a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "uploading", 62, "实例流转包已生成，正在上传到同步服务...")
	item, err := manager.UploadBackupFile(ctx, zipPath, fields, a.cloudSyncTransferBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "uploading", 62, 88, "正在上传实例流转包"))
	if err != nil {
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, fmt.Sprintf("上传实例流转包失败: %v", err))
		return ProfileTransferShareCreateResult{}, err
	}

	a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "sharing", 90, "正在生成 24 小时一次性授权码...")
	expiresInHours := input.ExpiresInHours
	if expiresInHours <= 0 || expiresInHours > 24 {
		expiresInHours = 24
	}
	share, err := manager.CreateBackupShare(ctx, cloudsync.BackupShareCreateInput{
		BackupID:       item.ID,
		ExpiresInHours: expiresInHours,
		Note:           strings.TrimSpace(input.Note),
	})
	if err != nil {
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, fmt.Sprintf("生成流转分享失败: %v", err))
		return ProfileTransferShareCreateResult{}, err
	}
	a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "done", 100, "实例流转分享已生成")
	return ProfileTransferShareCreateResult{
		Share:         share.Share,
		Backup:        share.Backup,
		Code:          share.Code,
		ShareURL:      share.ShareURL,
		DirectURL:     share.DirectURL,
		ExpiresAt:     share.ExpiresAt,
		LocalPath:     zipPath,
		ProfileBackup: profileResult,
		Message:       "实例流转分享已生成",
	}, nil
}

func (a *App) CloudSyncResolveProfileTransferShare(input ProfileTransferShareResolveInput) (ProfileTransferShareResolveResult, error) {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(45 * time.Second)
	defer cancel()
	target, err := a.resolveProfileTransferShareTarget(input.ShareText, input.ServerURL)
	if err != nil {
		return ProfileTransferShareResolveResult{}, err
	}
	resolved, err := manager.ResolveBackupShare(ctx, cloudsync.BackupShareResolveInput{
		ServerURL: target.ServerURL,
		Code:      target.Code,
	})
	if err != nil {
		return ProfileTransferShareResolveResult{}, err
	}
	if err := validateProfileTransferShareBackup(resolved.Backup); err != nil {
		return ProfileTransferShareResolveResult{}, err
	}
	return ProfileTransferShareResolveResult{
		Share:      resolved.Share,
		Backup:     resolved.Backup,
		ServerURL:  target.ServerURL,
		Code:       target.Code,
		ServerTime: resolved.ServerTime,
		Message:    "流转分享解析通过",
	}, nil
}

func (a *App) CloudSyncPrepareProfileTransferShareRestore(input ProfileTransferSharePrepareRestoreInput) (ProfileBackupActionResult, error) {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(5 * time.Minute)
	defer cancel()
	a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "starting", 0, "准备接收实例流转分享...")

	target, err := a.resolveProfileTransferShareTarget(input.ShareText, input.ServerURL)
	if err != nil {
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, err.Error())
		return ProfileBackupActionResult{}, err
	}
	download, err := manager.DownloadBackupShare(ctx, cloudsync.BackupShareDownloadInput{
		ServerURL: target.ServerURL,
		Code:      target.Code,
	}, a.cloudSyncTransferBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "downloading", 5, 82, "正在下载实例流转包"))
	if err != nil {
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, fmt.Sprintf("下载实例流转包失败: %v", err))
		return ProfileBackupActionResult{}, err
	}
	if err := validateProfileTransferShareBackup(download.Backup); err != nil {
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, err.Error())
		return ProfileBackupActionResult{}, err
	}
	a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "verifying", 86, "正在校验实例流转包...")
	if err := verifyCloudSyncBackupChecksum(download.LocalPath, download.Backup.ChecksumSHA256); err != nil {
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, fmt.Sprintf("实例流转包校验失败: %v", err))
		return ProfileBackupActionResult{}, err
	}
	summary, err := readProfileBackupSummary(download.LocalPath)
	if err != nil {
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, fmt.Sprintf("实例流转包校验失败: %v", err))
		return ProfileBackupActionResult{}, err
	}
	profiles, err := readProfileBackupProfileSummaries(download.LocalPath)
	if err != nil {
		a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "error", 100, fmt.Sprintf("实例流转包解析失败: %v", err))
		return ProfileBackupActionResult{}, err
	}
	a.cloudSyncEmitBackupTypeProgress(cloudSyncBackupTypeProfileTransfer, "done", 100, "实例流转包已下载并校验通过")
	return ProfileBackupActionResult{
		Cancelled:          false,
		Message:            "实例流转包已下载并校验通过",
		ZipPath:            download.LocalPath,
		CreatedAt:          summary.CreatedAt,
		ProfileCount:       summary.ProfileCount,
		CookieProfileCount: summary.CookieProfileCount,
		Summary:            summary,
		Profiles:           profiles,
	}, nil
}

func (a *App) resolveProfileTransferShareTarget(shareText string, fallbackServerURL string) (profileTransferShareTarget, error) {
	text := strings.TrimSpace(shareText)
	if text == "" {
		return profileTransferShareTarget{}, fmt.Errorf("请粘贴流转分享链接或授权码")
	}
	if target, ok, err := parseProfileTransferShareURL(text); ok || err != nil {
		if err != nil {
			return profileTransferShareTarget{}, err
		}
		if strings.TrimSpace(target.ServerURL) == "" {
			target.ServerURL = strings.TrimSpace(fallbackServerURL)
		}
		return normalizeProfileTransferShareTarget(target)
	}
	serverURL := strings.TrimSpace(fallbackServerURL)
	if serverURL == "" {
		status, _ := a.ensureCloudSyncManager().GetStatus()
		serverURL = strings.TrimSpace(status.ServerURL)
	}
	return normalizeProfileTransferShareTarget(profileTransferShareTarget{
		ServerURL: serverURL,
		Code:      text,
	})
}

func parseProfileTransferShareURL(text string) (profileTransferShareTarget, bool, error) {
	parsed, err := url.Parse(strings.TrimSpace(text))
	if err != nil || parsed.Scheme == "" {
		return profileTransferShareTarget{}, false, nil
	}
	if parsed.Scheme == "trace-browser" {
		query := parsed.Query()
		return profileTransferShareTarget{
			ServerURL: query.Get("server"),
			Code:      query.Get("code"),
		}, true, nil
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return profileTransferShareTarget{}, false, nil
	}
	query := parsed.Query()
	if strings.TrimSpace(query.Get("code")) != "" {
		serverURL := query.Get("server")
		if strings.TrimSpace(serverURL) == "" {
			serverURL = parsed.Scheme + "://" + parsed.Host
		}
		return profileTransferShareTarget{ServerURL: serverURL, Code: query.Get("code")}, true, nil
	}
	marker := "/v1/sync/shares/"
	pathValue := parsed.EscapedPath()
	idx := strings.Index(pathValue, marker)
	if idx < 0 {
		return profileTransferShareTarget{}, true, fmt.Errorf("分享链接格式不正确")
	}
	rest := strings.TrimPrefix(pathValue[idx+len(marker):], "/")
	if rest == "" {
		return profileTransferShareTarget{}, true, fmt.Errorf("分享链接缺少授权码")
	}
	codePart := strings.Split(rest, "/")[0]
	code, err := url.PathUnescape(codePart)
	if err != nil {
		return profileTransferShareTarget{}, true, err
	}
	parsed.Path = strings.TrimRight(parsed.Path[:idx], "/")
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return profileTransferShareTarget{
		ServerURL: parsed.String(),
		Code:      code,
	}, true, nil
}

func normalizeProfileTransferShareTarget(target profileTransferShareTarget) (profileTransferShareTarget, error) {
	serverURL, err := cloudsync.NormalizeServerURL(target.ServerURL)
	if err != nil {
		return profileTransferShareTarget{}, fmt.Errorf("分享链接缺少同步服务地址，请粘贴完整分享链接")
	}
	code := strings.TrimSpace(target.Code)
	if code == "" {
		return profileTransferShareTarget{}, fmt.Errorf("分享链接缺少授权码")
	}
	return profileTransferShareTarget{ServerURL: serverURL, Code: code}, nil
}

func validateProfileTransferShareBackup(backup cloudsync.BackupItem) error {
	if backup.BackupType != "" && backup.BackupType != cloudSyncBackupTypeProfileTransfer {
		return fmt.Errorf("该分享不是实例流转分享")
	}
	if strings.TrimSpace(backup.PackageFormat) != "" && backup.PackageFormat != profileBackupFormat {
		return fmt.Errorf("该分享不是有效的实例备份包")
	}
	if backup.Encrypted {
		return fmt.Errorf("该分享包已加密，无法跨账号接收")
	}
	return nil
}

func runningProfileNames(profiles []BrowserProfile) []string {
	out := make([]string, 0)
	for _, profile := range profiles {
		if !profile.Running {
			continue
		}
		name := strings.TrimSpace(profile.ProfileName)
		if name == "" {
			name = strings.TrimSpace(profile.ProfileId)
		}
		if name != "" {
			out = append(out, name)
		}
	}
	return out
}
