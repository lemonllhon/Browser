package backend

import (
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
type CloudSyncBackupListInput = cloudsync.BackupListInput
type CloudSyncBackupListResult = cloudsync.BackupListResult
type CloudSyncBackupUploadInput = cloudsync.BackupUploadInput
type CloudSyncBackupUploadResult = cloudsync.BackupUploadResult
type CloudSyncBackupDownloadInput = cloudsync.BackupDownloadInput
type CloudSyncBackupDownloadResult = cloudsync.BackupDownloadResult
type CloudSyncBackupRestoreInput = cloudsync.BackupRestoreInput
type CloudSyncBackupRestoreResult = cloudsync.BackupRestoreResult
type CloudSyncBackupDeleteInput = cloudsync.BackupDeleteInput

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

	tempDir := a.resolveAppPath(filepath.Join("data", "cloud-sync", "temp"))
	if err := os.MkdirAll(tempDir, 0700); err != nil {
		return CloudSyncBackupUploadResult{}, err
	}
	zipPath := filepath.Join(tempDir, fmt.Sprintf("trace-cloud-full-%s.zip", time.Now().Format("20060102-150405")))
	included, skipped, fileCount, err := a.cloudSyncExportFullBackupToPath(zipPath)
	if err != nil {
		return CloudSyncBackupUploadResult{}, err
	}
	defer os.Remove(zipPath)

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
		"encrypted":      "false",
		"encryptionAlg":  "",
	}
	item, err := manager.UploadBackupFile(ctx, zipPath, fields)
	if err != nil {
		return CloudSyncBackupUploadResult{}, err
	}
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
	result, err := manager.DownloadBackup(ctx, input)
	if err != nil {
		return CloudSyncBackupDownloadResult{}, err
	}
	if err := verifyCloudSyncBackupChecksum(result.LocalPath, result.Backup.ChecksumSHA256); err != nil {
		return CloudSyncBackupDownloadResult{}, err
	}
	return result, nil
}

func (a *App) CloudSyncRestoreBackup(input CloudSyncBackupRestoreInput) (CloudSyncBackupRestoreResult, error) {
	manager := a.ensureCloudSyncManager()
	ctx, cancel := a.operationContext(10 * time.Minute)
	defer cancel()

	download, err := manager.DownloadBackup(ctx, cloudsync.BackupDownloadInput{BackupID: input.BackupID})
	if err != nil {
		return CloudSyncBackupRestoreResult{}, err
	}
	if err := verifyCloudSyncBackupChecksum(download.LocalPath, download.Backup.ChecksumSHA256); err != nil {
		return CloudSyncBackupRestoreResult{}, err
	}

	a.maintenanceMu.Lock()
	defer a.maintenanceMu.Unlock()

	restoreDir := a.resolveAppPath(filepath.Join("data", "cloud-sync", "restore-points"))
	if err := os.MkdirAll(restoreDir, 0700); err != nil {
		return CloudSyncBackupRestoreResult{}, err
	}
	restorePointPath := filepath.Join(restoreDir, fmt.Sprintf("before-cloud-restore-%s.zip", time.Now().Format("20060102-150405")))
	if _, _, _, err := a.cloudSyncExportFullBackupToPathLocked(restorePointPath); err != nil {
		return CloudSyncBackupRestoreResult{}, err
	}

	importResult, err := a.backupImportFromPathLocked(download.LocalPath, input.ResetFirst)
	if err != nil {
		return CloudSyncBackupRestoreResult{}, err
	}
	return CloudSyncBackupRestoreResult{
		Backup:           download.Backup,
		DownloadedPath:   download.LocalPath,
		RestorePointPath: restorePointPath,
		Imported:         int(mapInt64(importResult, "imported")),
		Skipped:          int(mapInt64(importResult, "skipped")),
		Conflicts:        int(mapInt64(importResult, "conflicts")),
		Partial:          mapBool(importResult, "partial"),
		Message:          mapString(importResult, "message"),
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

func (a *App) cloudSyncExportFullBackupToPath(zipPath string) (int, int, int, error) {
	a.maintenanceMu.Lock()
	defer a.maintenanceMu.Unlock()
	return a.cloudSyncExportFullBackupToPathLocked(zipPath)
}

func (a *App) cloudSyncExportFullBackupToPathLocked(zipPath string) (int, int, int, error) {
	if a == nil {
		return 0, 0, 0, fmt.Errorf("应用未初始化")
	}
	scope, err := backup.BuildScope(backup.BuildOptions{AppRoot: a.appRoot, Config: a.config})
	if err != nil {
		return 0, 0, 0, err
	}
	manifest := backup.BuildManifest(scope, a.appName(), a.appVersion(), time.Now())
	return backupWritePackageZip(zipPath, scope, manifest, a.backupEmitExportProgressMeta)
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
