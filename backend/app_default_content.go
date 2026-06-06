package backend

import (
	"fmt"
	"strings"

	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/logger"
)

type BrowserDefaultContentRule = config.BrowserDefaultContentRule

const (
	defaultContentScopeTag   = "tag"
	defaultContentScopeGroup = "group"
)

func normalizeBookmarks(items []BrowserBookmark) []BrowserBookmark {
	valid := make([]BrowserBookmark, 0, len(items))
	seen := make(map[string]bool)
	for _, item := range items {
		name := strings.TrimSpace(item.Name)
		url := strings.TrimSpace(item.URL)
		if name == "" || url == "" {
			continue
		}
		key := strings.ToLower(url)
		if seen[key] {
			continue
		}
		seen[key] = true
		valid = append(valid, BrowserBookmark{Name: name, URL: url})
	}
	return valid
}

func normalizeDefaultContentRules(items []BrowserDefaultContentRule) []BrowserDefaultContentRule {
	valid := make([]BrowserDefaultContentRule, 0, len(items))
	seen := make(map[string]bool)
	for index, item := range items {
		scope := strings.ToLower(strings.TrimSpace(item.Scope))
		if scope != defaultContentScopeTag && scope != defaultContentScopeGroup {
			continue
		}
		targetName := strings.TrimSpace(item.TargetName)
		targetId := strings.TrimSpace(item.TargetId)
		if targetName == "" && targetId == "" {
			continue
		}
		ruleId := strings.TrimSpace(item.RuleId)
		if ruleId == "" {
			keyTarget := strings.ToLower(targetName)
			if keyTarget == "" {
				keyTarget = strings.ToLower(targetId)
			}
			ruleId = fmt.Sprintf("%s:%s:%d", scope, keyTarget, index)
		}
		if seen[ruleId] {
			continue
		}
		seen[ruleId] = true
		valid = append(valid, BrowserDefaultContentRule{
			RuleId:                ruleId,
			Scope:                 scope,
			TargetId:              targetId,
			TargetName:            targetName,
			StartURLs:             normalizeStartURLItems(item.StartURLs),
			Bookmarks:             normalizeBookmarks(item.Bookmarks),
			Enabled:               item.Enabled,
			ApplyToChilds:         item.ApplyToChilds,
			IncludeGlobalDefaults: normalizeIncludeGlobalDefaults(item.IncludeGlobalDefaults),
		})
	}
	return valid
}

func normalizeIncludeGlobalDefaults(value *bool) *bool {
	include := true
	if value != nil {
		include = *value
	}
	return &include
}

func ruleIncludesGlobalDefaults(rule BrowserDefaultContentRule) bool {
	return rule.IncludeGlobalDefaults == nil || *rule.IncludeGlobalDefaults
}

func mergeStartURLItems(groups ...[]BrowserStartURL) []BrowserStartURL {
	var merged []BrowserStartURL
	seen := make(map[string]bool)
	for _, group := range groups {
		for _, item := range group {
			name := strings.TrimSpace(item.Name)
			url := strings.TrimSpace(item.URL)
			if name == "" || url == "" {
				continue
			}
			key := strings.ToLower(url)
			if seen[key] {
				continue
			}
			seen[key] = true
			merged = append(merged, BrowserStartURL{Name: name, URL: url})
		}
	}
	return merged
}

func mergeBookmarkItems(groups ...[]BrowserBookmark) []BrowserBookmark {
	var merged []BrowserBookmark
	seen := make(map[string]bool)
	for _, group := range groups {
		for _, item := range group {
			name := strings.TrimSpace(item.Name)
			url := strings.TrimSpace(item.URL)
			if name == "" || url == "" {
				continue
			}
			key := strings.ToLower(url)
			if seen[key] {
				continue
			}
			seen[key] = true
			merged = append(merged, BrowserBookmark{Name: name, URL: url})
		}
	}
	return merged
}

func (a *App) DefaultContentRuleList() []BrowserDefaultContentRule {
	_ = a.refreshConfigCacheFromDiskIfPresent()
	return append([]BrowserDefaultContentRule{}, a.config.Browser.DefaultContentRules...)
}

func (a *App) DefaultContentRuleSave(items []BrowserDefaultContentRule) error {
	log := logger.New("DefaultContent")
	valid := normalizeDefaultContentRules(items)
	if err := a.refreshConfigCacheFromDiskIfPresent(); err != nil {
		log.Error("配置重载失败", logger.F("error", err.Error()))
		return err
	}
	a.config.Browser.DefaultContentRules = valid
	if err := a.config.Save(a.resolveAppPath("config.yaml")); err != nil {
		log.Error("默认内容联动规则保存失败", logger.F("error", err.Error()))
		return err
	}
	log.Info("默认内容联动规则已保存", logger.F("count", len(valid)))
	a.emitBrowserDefaultsUpdated()
	return nil
}

func (a *App) defaultContentRulesForProfile(profile *BrowserProfile) []BrowserDefaultContentRule {
	if profile == nil {
		return nil
	}
	tagSet := make(map[string]bool)
	for _, tag := range profile.Tags {
		if normalized := strings.ToLower(strings.TrimSpace(tag)); normalized != "" {
			tagSet[normalized] = true
		}
	}

	groupIds := make(map[string]bool)
	groupNames := make(map[string]bool)
	groupId := strings.TrimSpace(profile.GroupId)
	directGroupId := strings.ToLower(groupId)
	directGroupName := ""
	if groupId != "" {
		groupIds[directGroupId] = true
		if a.browserMgr.GroupDAO != nil {
			if group, err := a.browserMgr.GroupDAO.GetById(groupId); err == nil && group != nil {
				directGroupName = strings.ToLower(strings.TrimSpace(group.GroupName))
				groupNames[directGroupName] = true
				parentId := strings.TrimSpace(group.ParentId)
				for parentId != "" {
					parent, err := a.browserMgr.GroupDAO.GetById(parentId)
					if err != nil || parent == nil {
						break
					}
					groupIds[strings.ToLower(parent.GroupId)] = true
					groupNames[strings.ToLower(strings.TrimSpace(parent.GroupName))] = true
					parentId = strings.TrimSpace(parent.ParentId)
				}
			}
		}
	}

	matched := make([]BrowserDefaultContentRule, 0)
	for _, rule := range a.config.Browser.DefaultContentRules {
		if !rule.Enabled {
			continue
		}
		scope := strings.ToLower(strings.TrimSpace(rule.Scope))
		targetName := strings.ToLower(strings.TrimSpace(rule.TargetName))
		targetId := strings.ToLower(strings.TrimSpace(rule.TargetId))
		switch scope {
		case defaultContentScopeTag:
			if tagSet[targetName] {
				matched = append(matched, rule)
			}
		case defaultContentScopeGroup:
			if targetId != "" && groupIds[targetId] {
				if targetId == directGroupId || rule.ApplyToChilds {
					matched = append(matched, rule)
				}
				continue
			}
			if targetName != "" && groupNames[targetName] {
				if targetName == directGroupName || rule.ApplyToChilds {
					matched = append(matched, rule)
				}
			}
		}
	}
	return matched
}

func (a *App) BookmarkListForProfile(profile *BrowserProfile) []BrowserBookmark {
	rules := a.defaultContentRulesForProfile(profile)
	includeGlobal := len(rules) == 0
	for _, rule := range rules {
		if ruleIncludesGlobalDefaults(rule) {
			includeGlobal = true
			break
		}
	}
	bookmarks := make([][]BrowserBookmark, 0, len(rules)+1)
	if includeGlobal {
		bookmarks = append(bookmarks, a.BookmarkList())
	}
	for _, rule := range rules {
		bookmarks = append(bookmarks, rule.Bookmarks)
	}
	return mergeBookmarkItems(bookmarks...)
}

func (a *App) DefaultStartURLListForProfile(profile *BrowserProfile) []BrowserStartURL {
	rules := a.defaultContentRulesForProfile(profile)
	includeGlobal := len(rules) == 0
	for _, rule := range rules {
		if ruleIncludesGlobalDefaults(rule) {
			includeGlobal = true
			break
		}
	}
	startURLs := make([][]BrowserStartURL, 0, len(rules)+1)
	if includeGlobal {
		startURLs = append(startURLs, a.DefaultStartURLList())
	}
	for _, rule := range rules {
		startURLs = append(startURLs, rule.StartURLs)
	}
	return mergeStartURLItems(startURLs...)
}

func (a *App) DefaultStartURLValuesForProfile(profile *BrowserProfile) []string {
	items := a.DefaultStartURLListForProfile(profile)
	urls := make([]string, 0, len(items))
	for _, item := range items {
		if url := strings.TrimSpace(item.URL); url != "" {
			urls = append(urls, url)
		}
	}
	return urls
}
