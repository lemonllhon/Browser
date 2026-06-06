package backend

const browserDefaultsUpdatedEvent = "browser:defaults:updated"
const browserSettingsUpdatedEvent = "browser:settings:updated"
const browserCoresUpdatedEvent = "browser:cores:updated"
const browserProxiesUpdatedEvent = "browser:proxies:updated"
const browserExtensionsUpdatedEvent = "browser:extensions:updated"
const browserCookiesUpdatedEvent = "browser:cookies:updated"
const browserSnapshotsUpdatedEvent = "browser:snapshots:updated"

func (a *App) emitBrowserDefaultsUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserDefaultsUpdatedEvent, nil)
	}
}

func (a *App) emitBrowserSettingsUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserSettingsUpdatedEvent, nil)
	}
}

func (a *App) emitBrowserCoresUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserCoresUpdatedEvent, nil)
	}
}

func (a *App) emitBrowserProxiesUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserProxiesUpdatedEvent, nil)
	}
}

func (a *App) emitBrowserExtensionsUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserExtensionsUpdatedEvent, nil)
	}
}

func (a *App) emitBrowserCookiesUpdated(profileId string) {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserCookiesUpdatedEvent, map[string]string{"profileId": profileId})
	}
}

func (a *App) emitBrowserSnapshotsUpdated(profileId string) {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserSnapshotsUpdatedEvent, map[string]string{"profileId": profileId})
	}
}
