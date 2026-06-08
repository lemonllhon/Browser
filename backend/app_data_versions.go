package backend

import (
	"strings"
	"time"
)

const (
	browserDataDomainProfiles   = "profiles"
	browserDataDomainGroups     = "groups"
	browserDataDomainProxies    = "proxies"
	browserDataDomainCores      = "cores"
	browserDataDomainExtensions = "extensions"
	browserDataDomainDefaults   = "defaults"
	browserDataDomainSettings   = "settings"
	browserDataDomainCookies    = "cookies"
	browserDataDomainSnapshots  = "snapshots"
	browserDataDomainLogs       = "logs"
)

type AppDataVersions struct {
	TimestampMS       int64
	ProfilesVersion   int64
	GroupsVersion     int64
	ProxiesVersion    int64
	CoresVersion      int64
	ExtensionsVersion int64
	DefaultsVersion   int64
	SettingsVersion   int64
	CookiesVersion    int64
	SnapshotsVersion  int64
	LogsVersion       int64
}

func (a *App) GetDataVersions() AppDataVersions {
	if a == nil {
		return AppDataVersions{TimestampMS: time.Now().UnixMilli()}
	}
	return AppDataVersions{
		TimestampMS:       time.Now().UnixMilli(),
		ProfilesVersion:   a.profilesDataVersion.Load(),
		GroupsVersion:     a.groupsDataVersion.Load(),
		ProxiesVersion:    a.proxiesDataVersion.Load(),
		CoresVersion:      a.coresDataVersion.Load(),
		ExtensionsVersion: a.extensionsDataVersion.Load(),
		DefaultsVersion:   a.defaultsDataVersion.Load(),
		SettingsVersion:   a.settingsDataVersion.Load(),
		CookiesVersion:    a.cookiesDataVersion.Load(),
		SnapshotsVersion:  a.snapshotsDataVersion.Load(),
		LogsVersion:       a.logsDataVersion.Load(),
	}
}

func (a *App) nextBrowserDataVersion(domain string) int64 {
	if a == nil {
		return 0
	}
	switch domain {
	case browserDataDomainProfiles:
		return a.profilesDataVersion.Add(1)
	case browserDataDomainGroups:
		return a.groupsDataVersion.Add(1)
	case browserDataDomainProxies:
		return a.proxiesDataVersion.Add(1)
	case browserDataDomainCores:
		return a.coresDataVersion.Add(1)
	case browserDataDomainExtensions:
		return a.extensionsDataVersion.Add(1)
	case browserDataDomainDefaults:
		return a.defaultsDataVersion.Add(1)
	case browserDataDomainSettings:
		return a.settingsDataVersion.Add(1)
	case browserDataDomainCookies:
		return a.cookiesDataVersion.Add(1)
	case browserDataDomainSnapshots:
		return a.snapshotsDataVersion.Add(1)
	case browserDataDomainLogs:
		return a.logsDataVersion.Add(1)
	default:
		return 0
	}
}

func (a *App) browserDataVersionPayload(domain string, changedIDs []string, extras map[string]interface{}) map[string]interface{} {
	version := a.nextBrowserDataVersion(domain)
	versions := a.GetDataVersions()
	payload := map[string]interface{}{
		"domain":            domain,
		"reason":            "data-updated",
		"version":           version,
		"profilesVersion":   versions.ProfilesVersion,
		"groupsVersion":     versions.GroupsVersion,
		"proxiesVersion":    versions.ProxiesVersion,
		"coresVersion":      versions.CoresVersion,
		"extensionsVersion": versions.ExtensionsVersion,
		"defaultsVersion":   versions.DefaultsVersion,
		"settingsVersion":   versions.SettingsVersion,
		"cookiesVersion":    versions.CookiesVersion,
		"snapshotsVersion":  versions.SnapshotsVersion,
		"logsVersion":       versions.LogsVersion,
	}
	if ids := normalizeChangedIDs(changedIDs); len(ids) > 0 {
		payload["changedIds"] = ids
	}
	for key, value := range extras {
		if trimmed := strings.TrimSpace(key); trimmed != "" {
			payload[trimmed] = value
		}
	}
	return payload
}

func normalizeChangedIDs(items []string) []string {
	if len(items) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, item := range items {
		value := strings.TrimSpace(item)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}
