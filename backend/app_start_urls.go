package backend

import (
	"strings"

	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/logger"
)

type BrowserStartURL = config.BrowserStartURL

var defaultStartURLList = []BrowserStartURL{
	{Name: "IPPure", URL: "https://ippure.com/"},
	{Name: "IPLark", URL: "https://iplark.com/"},
	{Name: "Ping0", URL: "https://ping0.cc/"},
}

func normalizeStartURLItems(items []BrowserStartURL) []BrowserStartURL {
	valid := make([]BrowserStartURL, 0, len(items))
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
		valid = append(valid, BrowserStartURL{Name: name, URL: url})
	}
	return valid
}

func (a *App) DefaultStartURLList() []BrowserStartURL {
	_ = a.refreshConfigCacheFromDiskIfPresent()
	if a.config.Browser.DefaultStartURLsSet {
		return append([]BrowserStartURL{}, a.config.Browser.DefaultStartURLs...)
	}
	if len(a.config.Browser.DefaultStartURLs) > 0 {
		return append([]BrowserStartURL{}, a.config.Browser.DefaultStartURLs...)
	}
	return append([]BrowserStartURL{}, defaultStartURLList...)
}

func (a *App) DefaultStartURLValues() []string {
	items := a.DefaultStartURLList()
	urls := make([]string, 0, len(items))
	for _, item := range items {
		if url := strings.TrimSpace(item.URL); url != "" {
			urls = append(urls, url)
		}
	}
	return urls
}

func (a *App) DefaultStartURLSave(items []BrowserStartURL) error {
	log := logger.New("StartURL")
	valid := normalizeStartURLItems(items)
	if err := a.refreshConfigCacheFromDiskIfPresent(); err != nil {
		log.Error("配置重载失败", logger.F("error", err.Error()))
		return err
	}
	a.config.Browser.DefaultStartURLs = valid
	a.config.Browser.DefaultStartURLsSet = true
	if err := a.config.Save(a.resolveAppPath("config.yaml")); err != nil {
		log.Error("默认打开页保存失败", logger.F("error", err.Error()))
		return err
	}
	log.Info("默认打开页已保存", logger.F("count", len(valid)))
	a.emitBrowserDefaultsUpdated()
	return nil
}

func (a *App) DefaultStartURLReset() error {
	return a.DefaultStartURLSave(append([]BrowserStartURL{}, defaultStartURLList...))
}
