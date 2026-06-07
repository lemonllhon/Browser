package proxy

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/logger"
)

const defaultIPPureInfoURL = "https://my.ippure.com/v1/info"

// FetchIPPureInfo 通过指定代理链路查询 IPPure 的出口 IP 健康信息。
// 返回值为第三方接口原始 JSON（map 形式），不做本地评分计算。
func FetchIPPureInfo(
	proxyId string,
	proxies []config.BrowserProxy,
	xrayMgr *XrayManager,
	singboxMgr *SingBoxManager,
) (map[string]interface{}, error) {
	return FetchIPPureInfoWithClash(proxyId, proxies, xrayMgr, singboxMgr, nil)
}

func FetchIPPureInfoWithClash(
	proxyId string,
	proxies []config.BrowserProxy,
	xrayMgr *XrayManager,
	singboxMgr *SingBoxManager,
	clashMgr *ClashBridgeManager,
) (map[string]interface{}, error) {
	log := logger.New("IPPure")
	src := ""
	for _, item := range proxies {
		if strings.EqualFold(item.ProxyId, proxyId) {
			src = strings.TrimSpace(item.ProxyConfig)
			break
		}
	}
	if src == "" {
		log.Warn("IPPure 检测跳过：未找到代理配置", logger.F("proxy_id", proxyId), logger.F("proxy_count", len(proxies)))
		return nil, fmt.Errorf("未找到代理配置")
	}
	log.Info("IPPure 检测开始", logger.F("proxy_id", proxyId), logger.F("proxy_type", describeProxySource(src)))

	client, err := buildIPPureHTTPClient(src, proxyId, proxies, xrayMgr, singboxMgr, clashMgr, 20*time.Second)
	if err != nil {
		log.Error("IPPure HTTP 客户端创建失败", logger.F("proxy_id", proxyId), logger.F("error", err.Error()))
		return nil, err
	}

	req, _ := http.NewRequest(http.MethodGet, defaultIPPureInfoURL, nil)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "AntChrome/1.0")

	resp, err := client.Do(req)
	if err != nil {
		log.Error("IPPure 请求失败", logger.F("proxy_id", proxyId), logger.F("error", err.Error()))
		return nil, fmt.Errorf("调用 IPPure 接口失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Error("IPPure 响应读取失败", logger.F("proxy_id", proxyId), logger.F("error", err.Error()))
		return nil, fmt.Errorf("读取 IPPure 响应失败: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Error("IPPure HTTP 状态异常", logger.F("proxy_id", proxyId), logger.F("status", resp.StatusCode), logger.F("body", bodySnippet(body, 180)))
		return nil, fmt.Errorf("IPPure HTTP %d: %s", resp.StatusCode, bodySnippet(body, 180))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		log.Error("IPPure JSON 解析失败", logger.F("proxy_id", proxyId), logger.F("error", err.Error()))
		return nil, fmt.Errorf("IPPure JSON 解析失败: %w", err)
	}
	log.Info("IPPure 检测完成", logger.F("proxy_id", proxyId), logger.F("status", resp.StatusCode))
	return result, nil
}

func buildIPPureHTTPClient(
	src string,
	proxyId string,
	proxies []config.BrowserProxy,
	xrayMgr *XrayManager,
	singboxMgr *SingBoxManager,
	clashMgr *ClashBridgeManager,
	timeout time.Duration,
) (*http.Client, error) {
	return buildProxyHTTPClient(src, proxyId, proxies, xrayMgr, singboxMgr, clashMgr, timeout)
}

func bodySnippet(body []byte, max int) string {
	s := strings.TrimSpace(string(body))
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func describeProxySource(src string) string {
	lower := strings.ToLower(strings.TrimSpace(src))
	switch {
	case lower == "", lower == "direct://", lower == "__direct__":
		return "direct"
	case strings.HasPrefix(lower, "http://"), strings.HasPrefix(lower, "https://"):
		return "http"
	case strings.HasPrefix(lower, "socks5://"):
		return "socks5"
	case IsClashNativeProtocol(src):
		return "mihomo"
	case strings.HasPrefix(lower, "hysteria2://"), strings.HasPrefix(lower, "hy2://"):
		return "sing-box"
	default:
		return "xray"
	}
}
