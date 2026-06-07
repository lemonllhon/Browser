package proxy

import (
	"ant-chrome/backend/internal/apppath"
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/fsutil"
	"ant-chrome/backend/internal/logger"
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

const (
	clashBridgeIdleTTL         = 45 * time.Second
	clashBridgeCleanupInterval = 15 * time.Second
)

type ClashBridge struct {
	NodeKey    string
	Port       int
	Cmd        *exec.Cmd
	Pid        int
	Running    bool
	LastError  string
	RefCount   int
	LastUsedAt time.Time
	Stopping   bool
}

type ClashBridgeManager struct {
	Config       *config.Config
	AppRoot      string
	Bridges      map[string]*ClashBridge
	launchLocks  map[string]*sync.Mutex
	OnBridgeDied func(key string, err error)
	mu           sync.Mutex
	stopCh       chan struct{}
	stopOnce     sync.Once
}

func NewClashBridgeManager(cfg *config.Config, appRoot string) *ClashBridgeManager {
	manager := &ClashBridgeManager{
		Config:      cfg,
		AppRoot:     appRoot,
		Bridges:     make(map[string]*ClashBridge),
		launchLocks: make(map[string]*sync.Mutex),
		stopCh:      make(chan struct{}),
	}
	go manager.cleanupLoop()
	return manager
}

func IsClashNativeProtocol(proxyConfig string) bool {
	l := strings.ToLower(strings.TrimSpace(proxyConfig))
	if l == "" {
		return false
	}
	if strings.HasPrefix(l, "clash://") {
		return true
	}
	return strings.Contains(l, "proxies:") || strings.Contains(l, "proxy:") || strings.Contains(l, "type:")
}

func RequiresClashBridge(proxyConfig string, proxies []config.BrowserProxy, proxyId string) bool {
	src := strings.TrimSpace(proxyConfig)
	if proxyId != "" {
		for _, item := range proxies {
			if strings.EqualFold(item.ProxyId, proxyId) {
				src = strings.TrimSpace(item.ProxyConfig)
				break
			}
		}
	}
	return IsClashNativeProtocol(src)
}

func ValidateClashNativeConfig(proxyConfig string) error {
	_, _, err := parseClashBridgeNode(proxyConfig)
	return err
}

func (m *ClashBridgeManager) EnsureBridge(proxyConfig string, proxies []config.BrowserProxy, proxyId string) (string, error) {
	socksURL, _, err := m.ensureBridge(proxyConfig, proxies, proxyId, false)
	return socksURL, err
}

func (m *ClashBridgeManager) AcquireBridge(proxyConfig string, proxies []config.BrowserProxy, proxyId string) (string, string, error) {
	return m.ensureBridge(proxyConfig, proxies, proxyId, true)
}

func (m *ClashBridgeManager) ReleaseBridge(key string) {
	key = strings.TrimSpace(key)
	if key == "" {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	bridge, ok := m.Bridges[key]
	if !ok || bridge == nil {
		return
	}
	if bridge.RefCount > 0 {
		bridge.RefCount--
	}
	bridge.LastUsedAt = time.Now()
}

func (m *ClashBridgeManager) StopAll() {
	m.stopOnce.Do(func() {
		close(m.stopCh)
	})

	m.mu.Lock()
	bridges := make([]*ClashBridge, 0, len(m.Bridges))
	for key, bridge := range m.Bridges {
		if bridge != nil {
			bridge.Stopping = true
			bridges = append(bridges, bridge)
		}
		delete(m.Bridges, key)
	}
	m.mu.Unlock()

	for _, bridge := range bridges {
		m.stopBridgeProcess(bridge)
	}
}

func (m *ClashBridgeManager) ensureBridge(proxyConfig string, proxies []config.BrowserProxy, proxyId string, pin bool) (string, string, error) {
	log := logger.New("Mihomo")
	src := strings.TrimSpace(proxyConfig)
	dnsServers := ""
	if proxyId != "" {
		for _, item := range proxies {
			if strings.EqualFold(item.ProxyId, proxyId) {
				src = strings.TrimSpace(item.ProxyConfig)
				dnsServers = item.DnsServers
				break
			}
		}
	}
	if src == "" {
		return "", "", fmt.Errorf("未找到代理节点")
	}
	src = normalizeNodeScheme(src)
	if err := ValidateClashNativeConfig(src); err != nil {
		log.Error("mihomo 节点解析失败", logger.F("error", err))
		return "", "", err
	}

	key := computeNodeKey(src + "\x00" + dnsServers)
	if socksURL, reused := m.tryReuseBridge(key, pin); reused {
		log.Info("复用 mihomo 桥接", logger.F("key", shortNodeKey(key)), logger.F("socks_url", socksURL))
		return socksURL, key, nil
	}

	launchLock := m.launchLockFor(key)
	launchLock.Lock()
	defer launchLock.Unlock()

	if socksURL, reused := m.tryReuseBridge(key, pin); reused {
		log.Info("复用 mihomo 桥接", logger.F("key", shortNodeKey(key)), logger.F("socks_url", socksURL))
		return socksURL, key, nil
	}

	binaryPath, err := m.resolveBinary()
	if err != nil {
		log.Error("mihomo 不可用", logger.F("error", err))
		return "", "", err
	}

	const maxLaunchRetries = 3
	var lastErr error
	for attempt := 1; attempt <= maxLaunchRetries; attempt++ {
		reservation, err := reserveAvailablePort()
		if err != nil {
			log.Error("mihomo 端口分配失败", logger.F("error", err), logger.F("attempt", attempt))
			lastErr = err
			continue
		}
		port := reservation.Port
		cfgPath, err := m.buildRuntimeConfig(key, src, port, dnsServers)
		if err != nil {
			reservation.Close()
			log.Error("mihomo 配置生成失败", logger.F("error", err))
			return "", "", err
		}

		cmd := exec.Command(binaryPath, "-f", cfgPath, "-d", filepath.Dir(cfgPath))
		hideWindow(cmd)
		cmd.Dir = filepath.Dir(cfgPath)
		stderrPath := filepath.Join(filepath.Dir(cfgPath), "mihomo-stderr.log")
		stderrFile, _ := os.Create(stderrPath)
		if stderrFile != nil {
			cmd.Stderr = stderrFile
		}

		if err := reservation.Close(); err != nil {
			if stderrFile != nil {
				stderrFile.Close()
			}
			log.Error("mihomo 端口释放失败", logger.F("error", err), logger.F("port", port), logger.F("attempt", attempt))
			lastErr = err
			continue
		}
		if err := cmd.Start(); err != nil {
			if stderrFile != nil {
				stderrFile.Close()
			}
			log.Error("mihomo 启动失败", logger.F("error", err), logger.F("attempt", attempt))
			lastErr = err
			continue
		}

		bridge := &ClashBridge{
			NodeKey:    key,
			Port:       port,
			Cmd:        cmd,
			Pid:        cmd.Process.Pid,
			Running:    true,
			LastUsedAt: time.Now(),
		}
		log.Info("mihomo 启动", logger.F("key", shortNodeKey(key)), logger.F("pid", bridge.Pid), logger.F("port", bridge.Port), logger.F("attempt", attempt))
		if err := waitPortReadyForProcess("127.0.0.1", port, cmd, 10*time.Second); err != nil {
			if stderrFile != nil {
				stderrFile.Close()
			}
			if content, readErr := os.ReadFile(stderrPath); readErr == nil && len(content) > 0 {
				log.Error("mihomo stderr", logger.F("output", string(content)))
			}
			bridge.Stopping = true
			m.stopBridgeProcess(bridge)
			bridge.Running = false
			bridge.Pid = 0
			bridge.LastError = err.Error()
			log.Error("mihomo 端口不可用，重试", logger.F("key", shortNodeKey(key)), logger.F("error", err), logger.F("port", port), logger.F("attempt", attempt))
			lastErr = err
			time.Sleep(200 * time.Millisecond)
			continue
		}
		if stderrFile != nil {
			stderrFile.Close()
		}

		if socksURL, reused := m.registerBridge(key, bridge, pin); reused {
			log.Info("复用已就绪 mihomo 桥接", logger.F("key", shortNodeKey(key)), logger.F("socks_url", socksURL))
			bridge.Stopping = true
			m.stopBridgeProcess(bridge)
			return socksURL, key, nil
		}

		go m.watchBridge(bridge, key)
		return fmt.Sprintf("socks5://127.0.0.1:%d", port), key, nil
	}
	return "", "", fmt.Errorf("mihomo 启动失败（已重试 %d 次）: %w", maxLaunchRetries, lastErr)
}

func (m *ClashBridgeManager) launchLockFor(key string) *sync.Mutex {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.launchLocks == nil {
		m.launchLocks = make(map[string]*sync.Mutex)
	}
	lock, ok := m.launchLocks[key]
	if !ok || lock == nil {
		lock = &sync.Mutex{}
		m.launchLocks[key] = lock
	}
	return lock
}

func (m *ClashBridgeManager) tryReuseBridge(key string, pin bool) (string, bool) {
	var stale *ClashBridge

	m.mu.Lock()
	if bridge, ok := m.Bridges[key]; ok && bridge != nil {
		alive := bridge.Running && bridge.Cmd != nil && bridge.Cmd.Process != nil && bridge.Cmd.ProcessState == nil
		if alive && waitPortReady("127.0.0.1", bridge.Port, 800*time.Millisecond) == nil {
			if pin {
				bridge.RefCount++
			}
			bridge.LastUsedAt = time.Now()
			socksURL := fmt.Sprintf("socks5://127.0.0.1:%d", bridge.Port)
			m.mu.Unlock()
			return socksURL, true
		}

		bridge.Stopping = true
		stale = bridge
		delete(m.Bridges, key)
	}
	m.mu.Unlock()

	if stale != nil {
		m.stopBridgeProcess(stale)
	}
	return "", false
}

func (m *ClashBridgeManager) registerBridge(key string, bridge *ClashBridge, pin bool) (string, bool) {
	var duplicate *ClashBridge

	m.mu.Lock()
	if existing, ok := m.Bridges[key]; ok && existing != nil {
		if existing == bridge {
			m.mu.Unlock()
			return "", false
		}

		alive := existing.Running && existing.Cmd != nil && existing.Cmd.Process != nil && existing.Cmd.ProcessState == nil
		if alive && waitPortReady("127.0.0.1", existing.Port, 800*time.Millisecond) == nil {
			if pin {
				existing.RefCount++
			}
			existing.LastUsedAt = time.Now()
			duplicate = bridge
			socksURL := fmt.Sprintf("socks5://127.0.0.1:%d", existing.Port)
			m.mu.Unlock()
			if duplicate != nil {
				duplicate.Stopping = true
				m.stopBridgeProcess(duplicate)
			}
			return socksURL, true
		}

		existing.Stopping = true
		delete(m.Bridges, key)
		duplicate = existing
	}

	if pin {
		bridge.RefCount = 1
	}
	bridge.LastUsedAt = time.Now()
	m.Bridges[key] = bridge
	m.mu.Unlock()

	if duplicate != nil {
		m.stopBridgeProcess(duplicate)
	}
	return "", false
}

func (m *ClashBridgeManager) watchBridge(bridge *ClashBridge, key string) {
	if bridge == nil || bridge.Cmd == nil {
		return
	}
	_ = bridge.Cmd.Wait()

	m.mu.Lock()
	wasCurrent := false
	if current, ok := m.Bridges[key]; ok && current == bridge {
		delete(m.Bridges, key)
		wasCurrent = true
	}
	bridge.Running = false
	stopping := bridge.Stopping
	m.mu.Unlock()

	if wasCurrent && !stopping && m.OnBridgeDied != nil {
		m.OnBridgeDied(key, fmt.Errorf("mihomo 桥接进程意外退出"))
	}
}

func (m *ClashBridgeManager) cleanupLoop() {
	ticker := time.NewTicker(clashBridgeCleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			m.recycleIdleBridges()
		case <-m.stopCh:
			return
		}
	}
}

func (m *ClashBridgeManager) recycleIdleBridges() {
	now := time.Now()
	var stale []*ClashBridge

	m.mu.Lock()
	for key, bridge := range m.Bridges {
		if bridge == nil {
			delete(m.Bridges, key)
			continue
		}
		if bridge.RefCount > 0 {
			continue
		}
		if now.Sub(bridge.LastUsedAt) < clashBridgeIdleTTL {
			continue
		}

		bridge.Stopping = true
		stale = append(stale, bridge)
		delete(m.Bridges, key)
	}
	m.mu.Unlock()

	if len(stale) == 0 {
		return
	}

	log := logger.New("Mihomo")
	for _, bridge := range stale {
		log.Info("回收空闲 mihomo 桥接进程", logger.F("key", shortNodeKey(bridge.NodeKey)), logger.F("pid", bridge.Pid))
		m.stopBridgeProcess(bridge)
	}
}

func (m *ClashBridgeManager) stopBridgeProcess(bridge *ClashBridge) {
	if bridge == nil || bridge.Cmd == nil || bridge.Cmd.Process == nil {
		return
	}
	if err := stopProcessTree(bridge.Cmd); err != nil {
		logger.New("Mihomo").Warn("mihomo 桥接进程停止失败", logger.F("pid", bridge.Pid), logger.F("error", err.Error()))
	}
}

func (m *ClashBridgeManager) resolveBinary() (string, error) {
	configPath := ""
	if m.Config != nil {
		configPath = strings.TrimSpace(m.Config.Browser.ClashBinaryPath)
	}
	if configPath != "" {
		resolved := resolveEnvPath(configPath, m.AppRoot)
		if resolved != "" {
			if _, err := os.Stat(resolved); err == nil {
				return ensureMihomoBinary(resolved)
			}
		}
	}
	for _, envName := range []string{"MIHOMO_BINARY_PATH", "CLASH_META_BINARY_PATH"} {
		env := strings.TrimSpace(os.Getenv(envName))
		if env == "" {
			continue
		}
		if _, err := os.Stat(env); err == nil {
			return ensureMihomoBinary(env)
		}
	}

	binaryNames := []string{"mihomo", "clash-meta"}
	if goruntime.GOOS == "windows" {
		binaryNames = []string{"mihomo.exe", "clash-meta.exe", "mihomo", "clash-meta"}
	}
	platformDir := fmt.Sprintf("%s-%s", goruntime.GOOS, goruntime.GOARCH)

	searchDirs := make([]string, 0, 4)
	if m.AppRoot != "" {
		searchDirs = append(searchDirs,
			filepath.Join(m.AppRoot, "bin", platformDir),
			filepath.Join(m.AppRoot, "bin"),
		)
	}
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		searchDirs = append(searchDirs,
			filepath.Join(exeDir, "bin", platformDir),
			filepath.Join(exeDir, "bin"),
		)
	}

	for _, dir := range searchDirs {
		for _, name := range binaryNames {
			candidate := filepath.Join(dir, name)
			if _, err := os.Stat(candidate); err == nil {
				return ensureMihomoBinary(candidate)
			}
		}
	}

	for _, name := range binaryNames {
		if path, err := exec.LookPath(name); err == nil {
			return ensureMihomoBinary(path)
		}
	}

	return "", fmt.Errorf("未找到 mihomo/Clash.Meta 可执行文件。请将 mihomo 放到 bin/%s/ 或 bin/ 目录，或在配置中设置 ClashBinaryPath", platformDir)
}

func ensureMihomoBinary(path string) (string, error) {
	if err := fsutil.EnsureExecutable(path); err != nil {
		return "", fmt.Errorf("mihomo 文件不可执行: %s: %w", path, err)
	}
	if err := verifyMihomoCompatibleBinary(path); err != nil {
		return "", err
	}
	return path, nil
}

func verifyMihomoCompatibleBinary(path string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, path, "-v")
	hideWindow(cmd)
	output, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		return fmt.Errorf("mihomo 版本检测超时: %s: %w", path, ctx.Err())
	}

	text := strings.TrimSpace(string(output))
	if isMihomoVersionText(text) {
		return nil
	}
	if err != nil && text == "" {
		return fmt.Errorf("mihomo 版本检测失败: %s: %w", path, err)
	}
	return fmt.Errorf("不是 mihomo/Clash.Meta 兼容内核: %s: %s", path, binaryVersionSnippet(text))
}

func isMihomoVersionText(text string) bool {
	lower := strings.ToLower(strings.TrimSpace(text))
	return strings.Contains(lower, "mihomo") ||
		strings.Contains(lower, "clash.meta") ||
		strings.Contains(lower, "clash meta")
}

func binaryVersionSnippet(text string) string {
	text = strings.TrimSpace(strings.ReplaceAll(text, "\r", " "))
	text = strings.ReplaceAll(text, "\n", " ")
	if text == "" {
		return "版本输出为空"
	}
	if len(text) > 160 {
		return text[:160] + "..."
	}
	return text
}

func (m *ClashBridgeManager) buildRuntimeConfig(key string, src string, port int, dnsServers string) (string, error) {
	baseDir := m.resolveWorkdir(key)
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return "", err
	}

	cfg, err := buildClashBridgeConfig(src, port, dnsServers)
	if err != nil {
		return "", err
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return "", err
	}

	cfgPath := filepath.Join(baseDir, "mihomo-config.yaml")
	if err := os.WriteFile(cfgPath, data, 0644); err != nil {
		return "", err
	}
	return cfgPath, nil
}

func (m *ClashBridgeManager) resolveWorkdir(key string) string {
	root := "data"
	if m.Config != nil {
		root = strings.TrimSpace(m.Config.Browser.UserDataRoot)
	}
	if root == "" {
		root = "data"
	}
	if !filepath.IsAbs(root) {
		root = apppath.Resolve(m.AppRoot, root)
	}
	return filepath.Join(root, "_mihomo", key)
}

func buildClashBridgeConfig(src string, port int, dnsServers string) (map[string]interface{}, error) {
	node, root, err := parseClashBridgeNode(src)
	if err != nil {
		return nil, err
	}

	proxyName := strings.TrimSpace(getMapString(node, "name"))
	if proxyName == "" {
		proxyName = "TRACE-PROXY"
		node["name"] = proxyName
	}

	groupName := "TRACE-SELECT"
	cfg := map[string]interface{}{
		"mixed-port":     port,
		"allow-lan":      false,
		"bind-address":   "127.0.0.1",
		"mode":           "rule",
		"log-level":      "info",
		"unified-delay":  true,
		"tcp-concurrent": true,
		"ipv6":           true,
		"profile": map[string]interface{}{
			"store-selected": false,
			"store-fake-ip":  false,
		},
		"proxies": []interface{}{node},
		"proxy-groups": []interface{}{
			map[string]interface{}{
				"name":    groupName,
				"type":    "select",
				"proxies": []interface{}{proxyName},
			},
		},
		"rules": []interface{}{
			fmt.Sprintf("MATCH,%s", groupName),
		},
	}

	if dns := parseClashDNSConfig(dnsServers); dns != nil {
		cfg["dns"] = dns
	} else if root != nil {
		if dnsRaw, ok := root["dns"]; ok && dnsRaw != nil {
			cfg["dns"] = normalizeClashYAMLValue(dnsRaw)
		}
	}

	return cfg, nil
}

func parseClashBridgeNode(src string) (map[string]interface{}, map[string]interface{}, error) {
	data := strings.TrimSpace(src)
	if strings.HasPrefix(strings.ToLower(data), "clash://") {
		raw := data[len("clash://"):]
		raw, _ = urlQueryUnescape(raw)
		decoded, err := decodeBase64String(raw)
		if err != nil {
			return nil, nil, err
		}
		data = string(decoded)
	}

	var payload interface{}
	if err := yaml.Unmarshal([]byte(data), &payload); err != nil {
		return nil, nil, fmt.Errorf("Clash YAML 解析失败: %w", err)
	}
	payload = normalizeClashYAMLValue(payload)

	root := toStringMap(payload)
	node := pickClashNode(payload)
	if node == nil {
		return nil, root, fmt.Errorf("Clash 节点解析失败")
	}
	node = normalizeClashYAMLValue(node).(map[string]interface{})

	nodeType := strings.ToLower(strings.TrimSpace(getMapString(node, "type")))
	if nodeType == "" {
		return nil, root, fmt.Errorf("Clash 节点缺少 type 字段")
	}
	if getMapString(node, "server") == "" && nodeType != "direct" {
		return nil, root, fmt.Errorf("Clash 节点缺少 server 字段")
	}
	if getMapInt(node, "port") == 0 && nodeType != "direct" {
		return nil, root, fmt.Errorf("Clash 节点缺少 port 字段")
	}
	return node, root, nil
}

func parseClashDNSConfig(raw string) interface{} {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}

	var payload interface{}
	if err := yaml.Unmarshal([]byte(raw), &payload); err != nil {
		return nil
	}
	payload = normalizeClashYAMLValue(payload)
	if m := toStringMap(payload); m != nil {
		if dnsRaw, ok := m["dns"]; ok && dnsRaw != nil {
			return normalizeClashYAMLValue(dnsRaw)
		}
		return m
	}
	return nil
}

func normalizeClashYAMLValue(input interface{}) interface{} {
	switch v := input.(type) {
	case map[string]interface{}:
		out := make(map[string]interface{}, len(v))
		for key, value := range v {
			out[key] = normalizeClashYAMLValue(value)
		}
		return out
	case map[interface{}]interface{}:
		out := make(map[string]interface{}, len(v))
		for key, value := range v {
			out[fmt.Sprint(key)] = normalizeClashYAMLValue(value)
		}
		return out
	case []interface{}:
		out := make([]interface{}, len(v))
		for i, value := range v {
			out[i] = normalizeClashYAMLValue(value)
		}
		return out
	default:
		return input
	}
}

func urlQueryUnescape(raw string) (string, error) {
	if strings.Contains(raw, "%") {
		if decoded, err := url.QueryUnescape(raw); err == nil {
			return decoded, nil
		}
	}
	return raw, nil
}
