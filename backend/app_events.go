package backend

const browserDefaultsUpdatedEvent = "browser:defaults:updated"

func (a *App) emitBrowserDefaultsUpdated() {
	if a != nil && a.ctx != nil {
		a.emitEvent(browserDefaultsUpdatedEvent, nil)
	}
}
