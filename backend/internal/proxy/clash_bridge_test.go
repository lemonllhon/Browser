package proxy

import (
	"ant-chrome/backend/internal/config"
	"testing"
)

func TestBuildClashBridgeConfigSingleTrojanNode(t *testing.T) {
	cfg, err := buildClashBridgeConfig(`proxies:
  - name: test-trojan
    type: trojan
    server: example.com
    port: 443
    password: secret
    skip-cert-verify: true
    alpn:
      - h2
      - http/1.1
`, 23001, `dns:
  enable: true
  nameserver:
    - 1.1.1.1
`)
	if err != nil {
		t.Fatalf("buildClashBridgeConfig returned error: %v", err)
	}
	if cfg["mixed-port"] != 23001 {
		t.Fatalf("unexpected mixed-port: %#v", cfg["mixed-port"])
	}
	if cfg["mode"] != "rule" {
		t.Fatalf("unexpected mode: %#v", cfg["mode"])
	}
	proxies, ok := cfg["proxies"].([]interface{})
	if !ok || len(proxies) != 1 {
		t.Fatalf("expected one proxy, got %#v", cfg["proxies"])
	}
	node, ok := proxies[0].(map[string]interface{})
	if !ok {
		t.Fatalf("proxy was not a map: %#v", proxies[0])
	}
	if node["name"] != "test-trojan" || node["type"] != "trojan" {
		t.Fatalf("unexpected proxy node: %#v", node)
	}
	if _, ok := cfg["dns"]; !ok {
		t.Fatalf("expected dns config to be preserved")
	}
}

func TestBuildClashBridgeConfigAddsDefaultProxyName(t *testing.T) {
	cfg, err := buildClashBridgeConfig(`type: trojan
server: example.com
port: 443
password: secret
`, 23002, "")
	if err != nil {
		t.Fatalf("buildClashBridgeConfig returned error: %v", err)
	}
	proxies := cfg["proxies"].([]interface{})
	node := proxies[0].(map[string]interface{})
	if node["name"] != "TRACE-PROXY" {
		t.Fatalf("expected default proxy name, got %#v", node["name"])
	}
	groups := cfg["proxy-groups"].([]interface{})
	group := groups[0].(map[string]interface{})
	names := group["proxies"].([]interface{})
	if len(names) != 1 || names[0] != "TRACE-PROXY" {
		t.Fatalf("expected proxy group to point at default proxy name, got %#v", names)
	}
}

func TestValidateProxyConfigAcceptsClashHysteria2ViaMihomo(t *testing.T) {
	ok, msg := ValidateProxyConfig(`proxies:
  - name: hy2
    type: hysteria2
    server: example.com
    port: 8443
    password: secret
`, nil, "")
	if !ok {
		t.Fatalf("expected Clash hysteria2 YAML to validate through mihomo, msg=%s", msg)
	}
}

func TestRequiresClashBridgeResolvesProxyID(t *testing.T) {
	proxies := []config.BrowserProxy{
		{
			ProxyId: "p1",
			ProxyConfig: `proxies:
  - name: test
    type: trojan
    server: example.com
    port: 443
    password: secret
`,
		},
	}
	if !RequiresClashBridge("", proxies, "p1") {
		t.Fatalf("expected proxyId-backed Clash YAML to require mihomo bridge")
	}
}

func TestMihomoVersionTextDetection(t *testing.T) {
	if !isMihomoVersionText("Mihomo Meta v1.19.27 windows amd64") {
		t.Fatalf("expected Mihomo version text to be accepted")
	}
	if !isMihomoVersionText("Clash.Meta v1.18.0 linux amd64") {
		t.Fatalf("expected Clash.Meta version text to be accepted")
	}
	if isMihomoVersionText("Clash v1.18.0 windows amd64") {
		t.Fatalf("plain Clash must not be accepted as mihomo-compatible")
	}
}
