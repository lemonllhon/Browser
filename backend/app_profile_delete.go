package backend

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/logger"
)

func (a *App) DeleteProfile(profileId string) error {
	return a.BrowserProfileDelete(profileId)
}

func (a *App) deleteProfileWithData(profileId string) error {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return fmt.Errorf("profile id is required")
	}
	if a.browserMgr == nil {
		return fmt.Errorf("browser manager is not initialized")
	}

	log := logger.New("Browser")
	var snapshot browser.Profile
	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists {
		a.browserMgr.Mutex.Unlock()
		return fmt.Errorf("profile not found")
	}
	wasRunning := profile.Running
	snapshot = *profile
	a.browserMgr.Mutex.Unlock()

	if wasRunning {
		if _, err := a.BrowserInstanceStop(profileId); err != nil {
			return fmt.Errorf("删除实例前停止浏览器失败: %w", err)
		}
		a.browserMgr.Mutex.Lock()
		if latest, ok := a.browserMgr.Profiles[profileId]; ok {
			snapshot = *latest
		}
		a.browserMgr.Mutex.Unlock()
	}

	userDataDir, err := a.safeProfileUserDataDir(&snapshot)
	if err != nil {
		return err
	}

	if err := a.browserMgr.Delete(profileId); err != nil {
		return err
	}

	if userDataDir != "" {
		if err := os.RemoveAll(userDataDir); err != nil {
			log.Error("删除实例用户数据目录失败", logger.F("profile_id", profileId), logger.F("path", userDataDir), logger.F("error", err))
			return fmt.Errorf("实例配置已删除，但用户数据目录删除失败: %w", err)
		}
		log.Info("实例用户数据目录已删除", logger.F("profile_id", profileId), logger.F("path", userDataDir))
	}
	return nil
}

func (a *App) OpenProfileUserDataDir(profileId string) error {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return fmt.Errorf("profile id is required")
	}
	if a.browserMgr == nil {
		return fmt.Errorf("browser manager is not initialized")
	}

	if err := a.refreshConfigCacheFromDiskIfPresent(); err != nil {
		return fmt.Errorf("重载浏览器配置失败: %w", err)
	}
	a.refreshBrowserProfileSharedRuntimeOverlay()
	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists || profile == nil {
		a.browserMgr.Mutex.Unlock()
		return fmt.Errorf("profile not found")
	}
	snapshot := *profile
	a.browserMgr.Mutex.Unlock()

	fullPath := a.browserMgr.ResolveUserDataDir(&snapshot)
	if err := os.MkdirAll(fullPath, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %w", err)
	}
	absPath, err := filepath.Abs(fullPath)
	if err != nil {
		return err
	}
	if err := openPathInFileManager(absPath); err != nil {
		return fmt.Errorf("打开目录失败 %s: %w", absPath, err)
	}
	logger.New("Browser").Info("已打开实例用户数据目录", logger.F("profile_id", profileId), logger.F("path", absPath))
	return nil
}

func (a *App) safeProfileUserDataDir(profile *browser.Profile) (string, error) {
	if profile == nil {
		return "", fmt.Errorf("profile is nil")
	}
	if err := a.refreshConfigCacheFromDiskIfPresent(); err != nil {
		return "", fmt.Errorf("重载浏览器配置失败: %w", err)
	}
	resolved := a.browserMgr.ResolveUserDataDir(profile)
	absDir, err := filepath.Abs(resolved)
	if err != nil {
		return "", fmt.Errorf("解析用户数据目录失败: %w", err)
	}

	userDataRoot := strings.TrimSpace(a.config.Browser.UserDataRoot)
	if userDataRoot == "" {
		userDataRoot = "data"
	}
	rootAbs, err := filepath.Abs(a.resolveAppPath(userDataRoot))
	if err != nil {
		return "", fmt.Errorf("解析用户数据根目录失败: %w", err)
	}

	cleanDir := filepath.Clean(absDir)
	cleanRoot := filepath.Clean(rootAbs)
	if strings.EqualFold(cleanDir, cleanRoot) {
		return "", fmt.Errorf("拒绝删除用户数据根目录: %s", cleanDir)
	}
	if isDangerousDeletePath(cleanDir, cleanRoot, a.appRootAbs(), a.appStateRootAbs()) {
		return "", fmt.Errorf("拒绝删除高风险目录: %s", cleanDir)
	}
	if !isPathInside(cleanDir, cleanRoot) && !filepath.IsAbs(strings.TrimSpace(profile.UserDataDir)) {
		return "", fmt.Errorf("用户数据目录不在用户数据根目录下: %s", cleanDir)
	}
	return cleanDir, nil
}

func isPathInside(child string, parent string) bool {
	rel, err := filepath.Rel(parent, child)
	if err != nil {
		return false
	}
	return rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func isDangerousDeletePath(target string, protected ...string) bool {
	cleanTarget := filepath.Clean(target)
	volume := filepath.VolumeName(cleanTarget)
	if cleanTarget == volume+string(filepath.Separator) {
		return true
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		protected = append(protected, home)
	}
	for _, item := range protected {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		cleanProtected, err := filepath.Abs(item)
		if err != nil {
			cleanProtected = filepath.Clean(item)
		}
		if strings.EqualFold(cleanTarget, filepath.Clean(cleanProtected)) {
			return true
		}
	}
	return false
}
