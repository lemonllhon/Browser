package backend

import (
	"ant-chrome/backend/internal/logger"
	"time"
)

// reconcileProfileProxyBindings 对实例代理绑定执行幂等修复：
// 1. 同步已存在 proxyId 的绑定快照；
// 2. 当 proxyId 失效时按绑定快照/配置执行自动重关联；
// 3. 仅在有变更时持久化。
func (a *App) reconcileProfileProxyBindings() {
	if a == nil || a.browserMgr == nil {
		return
	}

	a.refreshBrowserProfileConfigCacheFromStore()
	log := logger.New("Browser")
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()

	changedProfiles := make([]*BrowserProfile, 0)
	reboundCount := 0
	for _, profile := range a.browserMgr.Profiles {
		changed, boundInPool, mode := a.browserMgr.ResolveProfileProxyBinding(profile)
		if changed {
			profile.UpdatedAt = time.Now().Format(time.RFC3339)
			changedProfiles = append(changedProfiles, profile)
		}
		if boundInPool && mode != "" && mode != "proxy_id" {
			reboundCount++
			log.Info("实例代理重关联成功",
				logger.F("profile_id", profile.ProfileId),
				logger.F("profile_name", profile.ProfileName),
				logger.F("proxy_id", profile.ProxyId),
				logger.F("mode", mode),
			)
		}
	}

	if len(changedProfiles) == 0 {
		return
	}
	if a.browserMgr.ProfileDAO != nil {
		for _, profile := range changedProfiles {
			if err := a.browserMgr.ProfileDAO.Upsert(profile); err != nil {
				log.Error("实例代理绑定修复持久化失败",
					logger.F("profile_id", profile.ProfileId),
					logger.F("error", err.Error()),
				)
				return
			}
		}
	} else {
		if err := a.browserMgr.SaveProfiles(); err != nil {
			log.Error("实例代理绑定修复持久化失败", logger.F("error", err.Error()))
			return
		}
	}
	log.Info("实例代理绑定修复完成",
		logger.F("changed", len(changedProfiles)),
		logger.F("rebound", reboundCount),
	)
}
