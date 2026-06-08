package backend

import (
	"ant-chrome/backend/internal/apppath"
	"ant-chrome/backend/internal/backup"
	"ant-chrome/backend/internal/cloudsync"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type CloudSyncStatus = cloudsync.Status
type CloudSyncLoginBindInput = cloudsync.LoginBindInput
type CloudSyncOAuthStartInput = cloudsync.OAuthStartInput
type CloudSyncBackupListInput = cloudsync.BackupListInput
type CloudSyncBackupListResult = cloudsync.BackupListResult
type CloudSyncBackupUploadInput = cloudsync.BackupUploadInput
type CloudSyncBackupUploadResult = cloudsync.BackupUploadResult
type CloudSyncBackupDownloadInput = cloudsync.BackupDownloadInput
type CloudSyncBackupDownloadResult = cloudsync.BackupDownloadResult
type CloudSyncBackupRestoreInput = cloudsync.BackupRestoreInput
type CloudSyncBackupRestoreResult = cloudsync.BackupRestoreResult
type CloudSyncBackupDeleteInput = cloudsync.BackupDeleteInput
type CloudSyncEncryptionStatus = cloudsync.EncryptionStatus
type CloudSyncEncryptionSetupInput = cloudsync.EncryptionSetupInput
type CloudSyncEncryptionUnlockInput = cloudsync.EncryptionUnlockInput

type CloudSyncProfileBackupUploadResult struct {
	Backup        cloudsync.BackupItem      `json:"backup"`
	LocalPath     string                    `json:"localPath"`
	ProfileBackup ProfileBackupActionResult `json:"profileBackup"`
	Message       string                    `json:"message"`
}

type CloudSyncProfileBackupPrepareRestoreInput struct {
	BackupID string `json:"backupId"`
}

const cloudSyncBackupProgressEvent = "cloud-sync:backup:progress"

func (a *App) CloudSyncGetStatus() (CloudSyncStatus, error) {
	manager := a.ensureCloudSyncManager()
	return manager.GetStatus()
}

func (a *App) CloudSyncLoginBind(input CloudSyncLoginBindInput) (CloudSyncStatus, error) {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(30 * time.Second)
	defer cancel()
	status, err := manager.LoginBind(ctx, input)
	if err == nil {
		startCtx := context.Background()
		if a != nil && a.ctx != nil {
			startCtx = a.ctx
		}
		manager.Start(startCtx)
	}
	return status, err
}

func (a *App) CloudSyncStartOAuth(input CloudSyncOAuthStartInput) (CloudSyncStatus, error) {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(5 * time.Minute)
	defer cancel()
	status, err := manager.StartOAuth(ctx, input, func(targetURL string) error {
		if a != nil {
			a.appRuntime().OpenExternalURL(ctx, targetURL)
		}
		return nil
	})
	if err == nil {
		startCtx := context.Background()
		if a != nil && a.ctx != nil {
			startCtx = a.ctx
		}
		manager.Start(startCtx)
	}
	return status, err
}

func (a *App) CloudSyncRefreshStatus() (CloudSyncStatus, error) {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(20 * time.Second)
	defer cancel()
	return manager.RefreshStatus(ctx)
}

func (a *App) CloudSyncLogout() (CloudSyncStatus, error) {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(15 * time.Second)
	defer cancel()
	if err := manager.Logout(ctx); err != nil {
		return CloudSyncStatus{AuthState: "disconnected"}, err
	}
	return manager.GetStatus()
}

func (a *App) CloudSyncSetupEncryption(input CloudSyncEncryptionSetupInput) (CloudSyncEncryptionStatus, error) {
	manager := a.ensureCloudSyncManager()
	return manager.SetupEncryption(input.Password)
}

func (a *App) CloudSyncUnlockEncryption(input CloudSyncEncryptionUnlockInput) (CloudSyncEncryptionStatus, error) {
	manager := a.ensureCloudSyncManager()
	return manager.UnlockEncryption(input.Password)
}

func (a *App) CloudSyncDisableEncryption() (CloudSyncEncryptionStatus, error) {
	manager := a.ensureCloudSyncManager()
	return manager.DisableEncryption()
}

func (a *App) CloudSyncListBackups(input CloudSyncBackupListInput) (CloudSyncBackupListResult, error) {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(45 * time.Second)
	defer cancel()
	if input.Page <= 0 {
		input.Page = 1
	}
	if input.PageSize <= 0 {
		input.PageSize = 20
	}
	return manager.ListBackups(ctx, input)
}

func (a *App) CloudSyncUploadFullBackup(input CloudSyncBackupUploadInput) (CloudSyncBackupUploadResult, error) {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(10 * time.Minute)
	defer cancel()
	a.cloudSyncEmitProgress("starting", 0, "准备上传全量云端备份...")

	tempDir := a.resolveAppPath(filepath.Join("data", "cloud-sync", "temp"))
	if err := os.MkdirAll(tempDir, 0700); err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("创建临时目录失败: %v", err))
		return CloudSyncBackupUploadResult{}, err
	}
	zipPath := filepath.Join(tempDir, fmt.Sprintf("trace-cloud-full-%s.zip", time.Now().Format("20060102-150405")))
	a.cloudSyncEmitProgress("preparing", 5, "正在生成全量备份包...")
	included, skipped, fileCount, err := a.cloudSyncExportFullBackupToPath(zipPath, a.cloudSyncMapProgress("preparing", 5, 62, "正在生成全量备份包"))
	if err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("生成全量备份包失败: %v", err))
		return CloudSyncBackupUploadResult{}, err
	}
	defer os.Remove(zipPath)
	encryptedPath := strings.TrimSuffix(zipPath, filepath.Ext(zipPath)) + ".enc"
	defer os.Remove(encryptedPath)
	a.cloudSyncEmitProgress("encrypting", 62, "备份包生成完成，正在执行客户端加密...")
	if err := manager.EncryptBackupFile(zipPath, encryptedPath, a.cloudSyncTransferProgress("encrypting", 62, 66, "正在加密全量备份包")); err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("加密云端备份失败: %v", err))
		return CloudSyncBackupUploadResult{}, err
	}
	a.cloudSyncEmitProgress("uploading", 68, "备份包已加密，准备上传到云端...")

	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = fmt.Sprintf("全量配置备份 %s", time.Now().Format("2006-01-02 15:04"))
	}
	fields := map[string]string{
		"backupType":     "full_config",
		"packageFormat":  backup.PackageFormat,
		"packageVersion": strconv.Itoa(backup.ManifestVersion),
		"name":           name,
		"description":    strings.TrimSpace(input.Description),
		"appName":        a.appName(),
		"appVersion":     a.appVersion(),
		"sourceOs":       runtime.GOOS,
		"encrypted":      "true",
		"encryptionAlg":  cloudsync.EncryptionAlgorithm,
	}
	item, err := manager.UploadBackupFile(ctx, encryptedPath, fields, a.cloudSyncTransferProgress("uploading", 68, 96, "正在上传全量备份到云端"))
	if err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("上传云端备份失败: %v", err))
		return CloudSyncBackupUploadResult{}, err
	}
	a.cloudSyncEmitProgress("done", 100, "云端备份上传完成")
	return CloudSyncBackupUploadResult{
		Backup:          item,
		LocalPath:       zipPath,
		IncludedEntries: included,
		SkippedEntries:  skipped,
		FileCount:       fileCount,
		Message:         "云端备份上传完成",
	}, nil
}

func (a *App) CloudSyncDownloadBackup(input CloudSyncBackupDownloadInput) (CloudSyncBackupDownloadResult, error) {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(5 * time.Minute)
	defer cancel()
	a.cloudSyncEmitProgress("starting", 0, "准备下载云端备份...")
	result, err := manager.DownloadBackup(ctx, input, a.cloudSyncTransferProgress("downloading", 5, 88, "正在下载云端备份"))
	if err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("下载云端备份失败: %v", err))
		return CloudSyncBackupDownloadResult{}, err
	}
	if prepared, err := a.cloudSyncPrepareDownloadedBackup(manager, result, 90, 98, "云端备份"); err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("云端备份处理失败: %v", err))
		return CloudSyncBackupDownloadResult{}, err
	} else {
		result = prepared
	}
	a.cloudSyncEmitProgress("done", 100, "云端备份下载完成")
	return result, nil
}

func (a *App) CloudSyncRestoreBackup(input CloudSyncBackupRestoreInput) (CloudSyncBackupRestoreResult, error) {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(10 * time.Minute)
	defer cancel()
	a.cloudSyncEmitProgress("starting", 0, "准备从云端恢复全量备份...")

	download, err := manager.DownloadBackup(ctx, cloudsync.BackupDownloadInput{BackupID: input.BackupID}, a.cloudSyncTransferProgress("downloading", 5, 38, "正在下载云端备份"))
	if err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("下载云端备份失败: %v", err))
		return CloudSyncBackupRestoreResult{}, err
	}
	if prepared, err := a.cloudSyncPrepareDownloadedBackup(manager, download, 40, 50, "云端备份"); err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("云端备份处理失败: %v", err))
		return CloudSyncBackupRestoreResult{}, err
	} else {
		download = prepared
	}

	a.maintenanceMu.Lock()
	defer a.maintenanceMu.Unlock()

	restoreDir := a.resolveAppPath(filepath.Join("data", "cloud-sync", "restore-points"))
	if err := os.MkdirAll(restoreDir, 0700); err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("创建恢复点目录失败: %v", err))
		return CloudSyncBackupRestoreResult{}, err
	}
	restorePointPath := filepath.Join(restoreDir, fmt.Sprintf("before-cloud-restore-%s.zip", time.Now().Format("20060102-150405")))
	a.cloudSyncEmitProgress("snapshotting", 52, "正在创建恢复前本地备份点...")
	if _, _, _, err := a.cloudSyncExportFullBackupToPathLocked(restorePointPath, a.cloudSyncMapProgress("snapshotting", 52, 66, "正在创建恢复前本地备份点")); err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("创建恢复点失败: %v", err))
		return CloudSyncBackupRestoreResult{}, err
	}

	a.cloudSyncEmitProgress("restoring", 68, "开始恢复云端备份内容...")
	importResult, err := a.backupImportFromPathLockedWithEmitter(download.LocalPath, input.ResetFirst, a.cloudSyncMapSimpleProgress("restoring", 68, 98))
	if err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("恢复云端备份失败: %v", err))
		return CloudSyncBackupRestoreResult{}, err
	}
	message := mapString(importResult, "message")
	if strings.TrimSpace(message) == "" {
		message = "云端备份恢复完成"
	}
	a.cloudSyncEmitProgress("done", 100, message)
	return CloudSyncBackupRestoreResult{
		Backup:           download.Backup,
		DownloadedPath:   download.LocalPath,
		RestorePointPath: restorePointPath,
		Imported:         int(mapInt64(importResult, "imported")),
		Skipped:          int(mapInt64(importResult, "skipped")),
		Conflicts:        int(mapInt64(importResult, "conflicts")),
		Partial:          mapBool(importResult, "partial"),
		Message:          message,
	}, nil
}

func (a *App) CloudSyncUploadProfileBackup(input ProfileBackupExportRequest) (CloudSyncProfileBackupUploadResult, error) {
	if a == nil || a.browserMgr == nil {
		err := fmt.Errorf("浏览器实例服务尚未初始化")
		if a != nil {
			a.cloudSyncEmitProgress("error", 100, err.Error())
		}
		return CloudSyncProfileBackupUploadResult{}, err
	}
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(10 * time.Minute)
	defer cancel()
	a.cloudSyncEmitProgress("starting", 0, "准备上传实例云端备份...")

	tempDir := a.resolveAppPath(filepath.Join("data", "cloud-sync", "temp"))
	if err := os.MkdirAll(tempDir, 0700); err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("创建临时目录失败: %v", err))
		return CloudSyncProfileBackupUploadResult{}, err
	}
	zipPath := filepath.Join(tempDir, fmt.Sprintf("trace-cloud-instances-%s.zip", time.Now().Format("20060102-150405")))

	a.maintenanceMu.Lock()
	if err := a.refreshConfigCacheFromDiskIfPresent(); err != nil {
		a.maintenanceMu.Unlock()
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("重载浏览器配置失败: %v", err))
		return CloudSyncProfileBackupUploadResult{}, fmt.Errorf("重载浏览器配置失败: %w", err)
	}
	profiles := a.selectProfilesForBackup(input)
	if len(profiles) == 0 {
		a.maintenanceMu.Unlock()
		err := fmt.Errorf("没有可上传的实例")
		a.cloudSyncEmitProgress("error", 100, err.Error())
		return CloudSyncProfileBackupUploadResult{}, err
	}
	a.cloudSyncEmitProgress("preparing", 6, "正在生成实例备份包...")
	profileResult, err := a.writeProfileBackupZip(zipPath, profiles, input)
	a.maintenanceMu.Unlock()
	if err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("生成实例备份包失败: %v", err))
		return CloudSyncProfileBackupUploadResult{}, err
	}
	defer os.Remove(zipPath)
	encryptedPath := strings.TrimSuffix(zipPath, filepath.Ext(zipPath)) + ".enc"
	defer os.Remove(encryptedPath)

	name := fmt.Sprintf("实例备份 %s", time.Now().Format("2006-01-02 15:04"))
	fields := map[string]string{
		"backupType":     "profile_bundle",
		"packageFormat":  profileBackupFormat,
		"packageVersion": strconv.Itoa(profileBackupVersion),
		"name":           name,
		"description":    fmt.Sprintf("包含 %d 个实例", profileResult.ProfileCount),
		"appName":        a.appName(),
		"appVersion":     a.appVersion(),
		"sourceOs":       runtime.GOOS,
		"encrypted":      "true",
		"encryptionAlg":  cloudsync.EncryptionAlgorithm,
	}
	a.cloudSyncEmitProgress("encrypting", 60, "实例备份包生成完成，正在执行客户端加密...")
	if err := manager.EncryptBackupFile(zipPath, encryptedPath, a.cloudSyncTransferProgress("encrypting", 60, 64, "正在加密实例备份包")); err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("加密实例云端备份失败: %v", err))
		return CloudSyncProfileBackupUploadResult{}, err
	}
	a.cloudSyncEmitProgress("uploading", 66, "实例备份包已加密，准备上传到云端...")
	item, err := manager.UploadBackupFile(ctx, encryptedPath, fields, a.cloudSyncTransferProgress("uploading", 66, 96, "正在上传实例备份到云端"))
	if err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("上传实例云端备份失败: %v", err))
		return CloudSyncProfileBackupUploadResult{}, err
	}
	a.cloudSyncEmitProgress("done", 100, "实例云端备份上传完成")
	return CloudSyncProfileBackupUploadResult{
		Backup:        item,
		LocalPath:     zipPath,
		ProfileBackup: profileResult,
		Message:       "实例云端备份上传完成",
	}, nil
}

func (a *App) CloudSyncPrepareProfileBackupRestore(input CloudSyncProfileBackupPrepareRestoreInput) (ProfileBackupActionResult, error) {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(5 * time.Minute)
	defer cancel()
	a.cloudSyncEmitProgress("starting", 0, "准备下载实例云端备份...")

	download, err := manager.DownloadBackup(ctx, cloudsync.BackupDownloadInput{BackupID: input.BackupID}, a.cloudSyncTransferProgress("downloading", 5, 88, "正在下载实例云端备份"))
	if err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("下载实例云端备份失败: %v", err))
		return ProfileBackupActionResult{}, err
	}
	if download.Backup.BackupType != "" && download.Backup.BackupType != "profile_bundle" {
		err := fmt.Errorf("该云端备份不是实例备份")
		a.cloudSyncEmitProgress("error", 100, err.Error())
		return ProfileBackupActionResult{}, err
	}
	if prepared, err := a.cloudSyncPrepareDownloadedBackup(manager, download, 90, 96, "实例备份包"); err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("实例备份包处理失败: %v", err))
		return ProfileBackupActionResult{}, err
	} else {
		download = prepared
	}
	summary, err := readProfileBackupSummary(download.LocalPath)
	if err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("实例备份包校验失败: %v", err))
		return ProfileBackupActionResult{}, err
	}
	profiles, err := readProfileBackupProfileSummaries(download.LocalPath)
	if err != nil {
		a.cloudSyncEmitProgress("error", 100, fmt.Sprintf("实例备份包解析失败: %v", err))
		return ProfileBackupActionResult{}, err
	}
	a.cloudSyncEmitProgress("done", 100, "实例云端备份已下载并校验通过")
	return ProfileBackupActionResult{
		Cancelled:          false,
		Message:            "实例云端备份已下载并校验通过",
		ZipPath:            download.LocalPath,
		CreatedAt:          summary.CreatedAt,
		ProfileCount:       summary.ProfileCount,
		CookieProfileCount: summary.CookieProfileCount,
		Summary:            summary,
		Profiles:           profiles,
	}, nil
}

func (a *App) CloudSyncDeleteBackup(input CloudSyncBackupDeleteInput) error {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(45 * time.Second)
	defer cancel()
	return manager.DeleteBackup(ctx, input)
}

func (a *App) CloudSyncDefaultDeviceName() string {
	return cloudsync.DefaultDeviceName()
}

func (a *App) ensureCloudSyncManager() *cloudsync.Manager {
	if a.cloudSync != nil {
		return a.cloudSync
	}
	version := "dev"
	if a != nil {
		version = strings.TrimSpace(a.appVersion())
	}
	root := ""
	if a != nil {
		root = a.resolveAppPath("data/cloud-sync")
	}
	a.cloudSync = cloudsync.NewManager(root, version)
	return a.cloudSync
}

func (a *App) operationContext(timeout time.Duration) (context.Context, context.CancelFunc) {
	base := context.Background()
	if a != nil && a.ctx != nil {
		base = a.ctx
	}
	return context.WithTimeout(base, timeout)
}

func (a *App) cloudSyncExportFullBackupToPath(zipPath string, emitProgress func(phase string, progress int, message string, meta *backupProgressMeta)) (int, int, int, error) {
	a.maintenanceMu.Lock()
	defer a.maintenanceMu.Unlock()
	return a.cloudSyncExportFullBackupToPathLocked(zipPath, emitProgress)
}

func (a *App) cloudSyncExportFullBackupToPathLocked(zipPath string, emitProgress func(phase string, progress int, message string, meta *backupProgressMeta)) (int, int, int, error) {
	if a == nil {
		return 0, 0, 0, fmt.Errorf("应用未初始化")
	}
	scope, err := backup.BuildScope(backup.BuildOptions{AppRoot: apppath.StateRoot(a.appRoot), Config: a.config})
	if err != nil {
		return 0, 0, 0, err
	}
	manifest := backup.BuildManifest(scope, a.appName(), a.appVersion(), time.Now())
	return backupWritePackageZip(zipPath, scope, manifest, emitProgress)
}

func (a *App) cloudSyncPrepareDownloadedBackup(manager *cloudsync.Manager, result cloudsync.BackupDownloadResult, start int, end int, label string) (cloudsync.BackupDownloadResult, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		label = "云端备份"
	}
	verifyEnd := start + (end-start)/3
	if verifyEnd < start {
		verifyEnd = start
	}
	a.cloudSyncEmitProgress("verifying", start, fmt.Sprintf("正在校验%s...", label))
	if err := verifyCloudSyncBackupChecksum(result.LocalPath, result.Backup.ChecksumSHA256); err != nil {
		return result, err
	}
	if !result.Backup.Encrypted {
		a.cloudSyncEmitProgress("verifying", end, fmt.Sprintf("%s校验完成", label))
		return result, nil
	}
	decryptedPath := cloudSyncDecryptedBackupPath(result.LocalPath)
	a.cloudSyncEmitProgress("decrypting", verifyEnd, fmt.Sprintf("正在解密%s...", label))
	if err := manager.DecryptBackupFile(result.LocalPath, decryptedPath, a.cloudSyncTransferProgress("decrypting", verifyEnd, end, fmt.Sprintf("正在解密%s", label))); err != nil {
		return result, err
	}
	_ = os.Remove(result.LocalPath)
	result.LocalPath = decryptedPath
	if strings.TrimSpace(result.Message) == "" || result.Message == "下载完成" {
		result.Message = "下载并解密完成"
	}
	return result, nil
}

func cloudSyncDecryptedBackupPath(path string) string {
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(path, ext)
	if ext == "" {
		ext = ".zip"
	}
	return base + ".decrypted" + ext
}

func (a *App) cloudSyncEmitProgress(phase string, progress int, message string) {
	a.cloudSyncEmitProgressMeta(phase, progress, message, nil)
}

func (a *App) cloudSyncEmitProgressMeta(phase string, progress int, message string, meta *backupProgressMeta) {
	a.backupEmitProgress(cloudSyncBackupProgressEvent, phase, progress, message, meta)
}

func (a *App) cloudSyncMapProgress(phase string, start int, end int, prefix string) func(string, int, string, *backupProgressMeta) {
	return func(innerPhase string, progress int, message string, meta *backupProgressMeta) {
		mapped := cloudSyncMapPercent(progress, start, end)
		if strings.TrimSpace(phase) == "" {
			phase = innerPhase
		}
		if strings.TrimSpace(prefix) != "" && strings.TrimSpace(message) != "" {
			message = fmt.Sprintf("%s：%s", strings.TrimSpace(prefix), strings.TrimSpace(message))
		}
		a.cloudSyncEmitProgressMeta(phase, mapped, message, meta)
	}
}

func (a *App) cloudSyncMapSimpleProgress(phase string, start int, end int) func(string, int, string) {
	return func(innerPhase string, progress int, message string) {
		nextPhase := strings.TrimSpace(phase)
		if nextPhase == "" {
			nextPhase = innerPhase
		}
		a.cloudSyncEmitProgress(nextPhase, cloudSyncMapPercent(progress, start, end), message)
	}
}

func (a *App) cloudSyncTransferProgress(phase string, start int, end int, message string) cloudsync.TransferProgressFunc {
	return func(progress cloudsync.TransferProgress) {
		mappedProgress := start
		if progress.TotalBytes > 0 {
			ratio := float64(progress.TransferredBytes) / float64(progress.TotalBytes)
			if ratio < 0 {
				ratio = 0
			}
			if ratio > 1 {
				ratio = 1
			}
			mappedProgress = start + int(ratio*float64(end-start))
		}
		detail := strings.TrimSpace(message)
		if progress.TotalBytes > 0 {
			detail = fmt.Sprintf("%s（%s / %s）", detail, cloudSyncFormatBytes(progress.TransferredBytes), cloudSyncFormatBytes(progress.TotalBytes))
		} else if progress.TransferredBytes > 0 {
			detail = fmt.Sprintf("%s（已传输 %s）", detail, cloudSyncFormatBytes(progress.TransferredBytes))
		}
		a.cloudSyncEmitProgress(phase, mappedProgress, detail)
	}
}

func cloudSyncMapPercent(progress int, start int, end int) int {
	if start > end {
		start, end = end, start
	}
	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}
	return start + int(float64(end-start)*float64(progress)/100)
}

func cloudSyncFormatBytes(bytes int64) string {
	if bytes <= 0 {
		return "0 B"
	}
	units := []string{"B", "KB", "MB", "GB", "TB"}
	size := float64(bytes)
	index := 0
	for size >= 1024 && index < len(units)-1 {
		size /= 1024
		index++
	}
	if index == 0 {
		return fmt.Sprintf("%d %s", bytes, units[index])
	}
	return fmt.Sprintf("%.1f %s", size, units[index])
}

func verifyCloudSyncBackupChecksum(path string, expected string) error {
	expected = strings.TrimSpace(expected)
	if expected == "" {
		return nil
	}
	actual, err := backupSHA256File(path)
	if err != nil {
		return err
	}
	if !strings.EqualFold(actual, expected) {
		return fmt.Errorf("云端备份校验失败: checksum mismatch")
	}
	return nil
}
