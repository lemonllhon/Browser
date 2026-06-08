package backend

import (
	"net/url"
	"strings"
)

const profileTransferDeepLinkEvent = "app:profile-transfer:open"

type ProfileTransferDeepLink struct {
	Action    string `json:"action"`
	URL       string `json:"url"`
	ServerURL string `json:"serverUrl"`
	Code      string `json:"code"`
	Source    string `json:"source"`
}

func (a *App) HandleProfileTransferLaunchArgs(args []string, source string) bool {
	for _, arg := range args {
		if a.HandleProfileTransferDeepLink(arg, source) {
			return true
		}
	}
	return false
}

func (a *App) HandleProfileTransferDeepLink(rawURL string, source string) bool {
	link, ok := a.parseProfileTransferDeepLink(rawURL, source)
	if !ok {
		return false
	}
	a.storeProfileTransferDeepLink(link)
	a.EmitPendingProfileTransferDeepLink()
	return true
}

func (a *App) ConsumePendingProfileTransferDeepLink() (ProfileTransferDeepLink, bool) {
	if a == nil {
		return ProfileTransferDeepLink{}, false
	}
	a.deepLinkMu.Lock()
	defer a.deepLinkMu.Unlock()
	if a.pendingDeepLink == nil {
		return ProfileTransferDeepLink{}, false
	}
	link := *a.pendingDeepLink
	a.pendingDeepLink = nil
	return link, true
}

func (a *App) EmitPendingProfileTransferDeepLink() bool {
	if a == nil || a.ctx == nil {
		return false
	}
	a.deepLinkMu.Lock()
	link := a.pendingDeepLink
	a.deepLinkMu.Unlock()
	if link == nil {
		return false
	}
	a.emitEvent(profileTransferDeepLinkEvent, map[string]interface{}{
		"action":    link.Action,
		"url":       link.URL,
		"serverUrl": link.ServerURL,
		"code":      link.Code,
		"source":    link.Source,
	})
	return true
}

func (a *App) storeProfileTransferDeepLink(link ProfileTransferDeepLink) {
	if a == nil {
		return
	}
	a.deepLinkMu.Lock()
	defer a.deepLinkMu.Unlock()
	a.pendingDeepLink = &link
}

func (a *App) parseProfileTransferDeepLink(rawURL string, source string) (ProfileTransferDeepLink, bool) {
	text := strings.TrimSpace(rawURL)
	if text == "" || !strings.HasPrefix(strings.ToLower(text), "trace-browser:") {
		return ProfileTransferDeepLink{}, false
	}
	parsed, err := url.Parse(text)
	if err != nil || !strings.EqualFold(parsed.Scheme, "trace-browser") {
		return ProfileTransferDeepLink{}, false
	}
	action := strings.Trim(strings.TrimSpace(parsed.Host+parsed.Path), "/")
	if !strings.EqualFold(action, "profile-transfer") {
		return ProfileTransferDeepLink{}, false
	}
	target, err := a.resolveProfileTransferShareTarget(text, "")
	if err != nil {
		return ProfileTransferDeepLink{}, false
	}
	return ProfileTransferDeepLink{
		Action:    "profile-transfer",
		URL:       text,
		ServerURL: target.ServerURL,
		Code:      target.Code,
		Source:    strings.TrimSpace(source),
	}, true
}
