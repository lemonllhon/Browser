package backend

const browserDefaultsUpdatedEvent = "browser:defaults:updated"
const browserSettingsUpdatedEvent = "browser:settings:updated"
const browserCoresUpdatedEvent = "browser:cores:updated"
const browserProxiesUpdatedEvent = "browser:proxies:updated"
const browserExtensionsUpdatedEvent = "browser:extensions:updated"
const browserCookiesUpdatedEvent = "browser:cookies:updated"
const browserSnapshotsUpdatedEvent = "browser:snapshots:updated"
const browserLogsUpdatedEvent = "browser:logs:updated"

func (a *App) emitBrowserDefaultsUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserDefaultsUpdatedEvent, a.browserDataVersionPayload(browserDataDomainDefaults, nil, nil))
	}
}

func (a *App) emitBrowserSettingsUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserSettingsUpdatedEvent, a.browserDataVersionPayload(browserDataDomainSettings, nil, nil))
	}
}

func (a *App) emitBrowserCoresUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserCoresUpdatedEvent, a.browserDataVersionPayload(browserDataDomainCores, nil, nil))
	}
}

func (a *App) emitBrowserProxiesUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserProxiesUpdatedEvent, a.browserDataVersionPayload(browserDataDomainProxies, nil, nil))
	}
}

func (a *App) emitBrowserExtensionsUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserExtensionsUpdatedEvent, a.browserDataVersionPayload(browserDataDomainExtensions, nil, nil))
	}
}

func (a *App) emitBrowserCookiesUpdated(profileId string) {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserCookiesUpdatedEvent, a.browserDataVersionPayload(
			browserDataDomainCookies,
			[]string{profileId},
			map[string]interface{}{"profileId": profileId},
		))
	}
}

func (a *App) emitBrowserSnapshotsUpdated(profileId string) {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserSnapshotsUpdatedEvent, a.browserDataVersionPayload(
			browserDataDomainSnapshots,
			[]string{profileId},
			map[string]interface{}{"profileId": profileId},
		))
	}
}

func (a *App) emitBrowserLogsUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserLogsUpdatedEvent, a.browserDataVersionPayload(browserDataDomainLogs, nil, nil))
	}
}
