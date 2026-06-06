package backend

import (
	"fmt"
	"time"

	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/logger"
)

// ============================================================================
// 分组类型别名 (保持 Wails 绑定兼容)
// ============================================================================

type BrowserGroup = browser.Group
type BrowserGroupInput = browser.GroupInput
type BrowserGroupWithCount = browser.GroupWithCount

// ============================================================================
// 分组管理 API
// ============================================================================

// ListGroups 获取所有分组（带实例计数）
func (a *App) ListGroups() []BrowserGroupWithCount {
	log := logger.New("Group")
	if a == nil || a.browserMgr == nil {
		log.Error("BrowserManager 未初始化")
		return []BrowserGroupWithCount{}
	}
	if a.browserMgr.GroupDAO == nil {
		log.Error("GroupDAO 未初始化")
		return []BrowserGroupWithCount{}
	}

	groups, err := a.browserMgr.GroupDAO.List()
	if err != nil {
		log.Error("获取分组列表失败", logger.F("error", err))
		return []BrowserGroupWithCount{}
	}

	// 统计每个分组的实例数量
	countMap := make(map[string]int)
	for _, profile := range a.profilesForGroupCounts() {
		if profile.GroupId != "" {
			countMap[profile.GroupId]++
		}
	}

	result := make([]BrowserGroupWithCount, 0, len(groups))
	for _, g := range groups {
		result = append(result, BrowserGroupWithCount{
			Group:         *g,
			InstanceCount: countMap[g.GroupId],
		})
	}
	return result
}

func (a *App) profilesForGroupCounts() []BrowserProfile {
	if a == nil || a.browserMgr == nil {
		return nil
	}
	a.refreshBrowserProfileConfigCacheFromStore()
	return a.browserMgr.List()
}

// CreateGroup 创建分组
func (a *App) CreateGroup(input BrowserGroupInput) (*BrowserGroup, error) {
	log := logger.New("Group")
	if a.browserMgr.GroupDAO == nil {
		return nil, fmt.Errorf("GroupDAO 未初始化")
	}

	group, err := a.browserMgr.GroupDAO.Create(input)
	if err != nil {
		log.Error("创建分组失败", logger.F("error", err))
		return nil, err
	}
	log.Info("分组已创建", logger.F("group_id", group.GroupId), logger.F("group_name", group.GroupName))
	a.emitGroupDataUpdated()
	return group, nil
}

// UpdateGroup 更新分组
func (a *App) UpdateGroup(groupId string, input BrowserGroupInput) (*BrowserGroup, error) {
	log := logger.New("Group")
	if a.browserMgr.GroupDAO == nil {
		return nil, fmt.Errorf("GroupDAO 未初始化")
	}

	group, err := a.browserMgr.GroupDAO.Update(groupId, input)
	if err != nil {
		log.Error("更新分组失败", logger.F("group_id", groupId), logger.F("error", err))
		return nil, err
	}
	log.Info("分组已更新", logger.F("group_id", groupId))
	a.emitGroupDataUpdated()
	return group, nil
}

// DeleteGroup 删除分组
func (a *App) DeleteGroup(groupId string) error {
	log := logger.New("Group")
	if a.browserMgr.GroupDAO == nil {
		return fmt.Errorf("GroupDAO 未初始化")
	}

	group, err := a.browserMgr.GroupDAO.GetById(groupId)
	if err != nil {
		log.Error("获取待删除分组失败", logger.F("group_id", groupId), logger.F("error", err))
		return err
	}

	if err := a.browserMgr.GroupDAO.Delete(groupId); err != nil {
		log.Error("删除分组失败", logger.F("group_id", groupId), logger.F("error", err))
		return err
	}
	a.syncProfilesMovedFromDeletedGroup(groupId, group.ParentId)
	log.Info("分组已删除", logger.F("group_id", groupId))
	a.emitGroupDataUpdated()
	a.emitProfileDataUpdated()
	return nil
}

// MoveInstancesToGroup 批量移动实例到分组
func (a *App) MoveInstancesToGroup(profileIds []string, groupId string) error {
	log := logger.New("Group")
	dao, ok := a.browserMgr.ProfileDAO.(*browser.SQLiteProfileDAO)
	if !ok {
		return fmt.Errorf("ProfileDAO 不支持批量移动")
	}

	if err := dao.MoveToGroup(profileIds, groupId); err != nil {
		log.Error("批量移动实例失败", logger.F("count", len(profileIds)), logger.F("error", err))
		return err
	}
	a.syncProfilesMovedToGroup(profileIds, groupId)
	log.Info("实例已移动到分组", logger.F("count", len(profileIds)), logger.F("group_id", groupId))
	a.emitGroupDataUpdated()
	a.emitProfileDataUpdated()
	return nil
}

func (a *App) syncProfilesMovedToGroup(profileIds []string, groupId string) {
	if a == nil || a.browserMgr == nil || len(profileIds) == 0 {
		return
	}
	idSet := make(map[string]struct{}, len(profileIds))
	for _, profileId := range profileIds {
		idSet[profileId] = struct{}{}
	}

	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	now := time.Now().Format(time.RFC3339)
	for profileId := range idSet {
		if profile, ok := a.browserMgr.Profiles[profileId]; ok {
			profile.GroupId = groupId
			profile.UpdatedAt = now
		}
	}
}

func (a *App) syncProfilesMovedFromDeletedGroup(deletedGroupId, parentGroupId string) {
	if a == nil || a.browserMgr == nil {
		return
	}
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	now := time.Now().Format(time.RFC3339)
	for _, profile := range a.browserMgr.Profiles {
		if profile.GroupId == deletedGroupId {
			profile.GroupId = parentGroupId
			profile.UpdatedAt = now
		}
	}
}

func (a *App) emitGroupDataUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent("browser:groups:updated", nil)
	}
}

func (a *App) emitProfileDataUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent("browser:profiles:updated", nil)
	}
}
