package backend

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/logger"
	"ant-chrome/backend/internal/proxy"
	xproxy "golang.org/x/net/proxy"
)

type switchingProxyBridge struct {
	app           *App
	profileID     string
	groupName     string
	mode          string
	interval      time.Duration
	rotateByGroup bool
	proxyURL      string
	controlToken  string

	server   *http.Server
	listener net.Listener

	mu          sync.RWMutex
	current     config.BrowserProxy
	hasCurrent  bool
	generation  uint64
	recent      []string
	stopped     chan struct{}
	stopOnce    sync.Once
	rng         *rand.Rand
	activeMu    sync.Mutex
	activeConns map[net.Conn]uint64
}

func newSwitchingProxyBridge(app *App, profile *BrowserProfile) *switchingProxyBridge {
	intervalM := profile.AutoProxySwitchIntervalM
	if intervalM <= 0 {
		intervalM = 5
	}
	if intervalM > 24*60 {
		intervalM = 24 * 60
	}
	return &switchingProxyBridge{
		app:           app,
		profileID:     strings.TrimSpace(profile.ProfileId),
		groupName:     strings.TrimSpace(profile.AutoProxySwitchGroupName),
		mode:          normalizeProxySwitchMode(profile.AutoProxySwitchMode),
		interval:      time.Duration(intervalM) * time.Minute,
		rotateByGroup: profile.AutoProxySwitchRotateByGroup && strings.TrimSpace(profile.AutoProxySwitchGroupName) == "",
		controlToken:  newSwitchProxyControlToken(),
		stopped:       make(chan struct{}),
		rng:           rand.New(rand.NewSource(time.Now().UnixNano())),
		activeConns:   make(map[net.Conn]uint64),
	}
}

func (b *switchingProxyBridge) start() (string, error) {
	if err := b.switchNow(); err != nil {
		return "", err
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", fmt.Errorf("启动代理中转端口失败: %w", err)
	}
	b.listener = ln
	b.server = &http.Server{Handler: b}
	go func() {
		if err := b.server.Serve(ln); err != nil && err != http.ErrServerClosed {
			logger.New("ProxySwitch").Error("代理自动切换中转异常退出", logger.F("profile_id", b.profileID), logger.F("error", err.Error()))
		}
	}()
	if b.mode == proxySwitchModeInterval {
		go b.rotationLoop()
	}
	b.proxyURL = "http://" + ln.Addr().String()
	return b.proxyURL, nil
}

func (b *switchingProxyBridge) stop() {
	b.stopOnce.Do(func() {
		close(b.stopped)
		b.closeActiveConnections("代理中转停止")
		if b.server != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			_ = b.server.Shutdown(ctx)
			cancel()
		}
	})
}

func (b *switchingProxyBridge) rotationLoop() {
	ticker := time.NewTicker(b.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if err := b.switchNow(); err != nil {
				logger.New("ProxySwitch").Warn("代理自动切换失败", logger.F("profile_id", b.profileID), logger.F("error", err.Error()))
			}
		case <-b.stopped:
			return
		}
	}
}

func (b *switchingProxyBridge) switchNow() error {
	candidates := b.candidateProxies()
	if len(candidates) == 0 {
		return fmt.Errorf("代理池分组 %q 没有可用代理", b.groupName)
	}

	b.mu.Lock()

	currentID := ""
	currentConfig := ""
	if b.hasCurrent {
		currentID = b.current.ProxyId
		currentConfig = b.current.ProxyConfig
	}
	if b.rotateByGroup && b.groupName == "" {
		candidates = b.pickNextGroupCandidates(candidates)
	}
	if b.mode == proxySwitchModeInterval {
		candidates = preferHealthyProxyCandidates(candidates)
	}
	filtered := make([]config.BrowserProxy, 0, len(candidates))
	recent := make(map[string]struct{}, len(b.recent)+1)
	if currentID != "" {
		recent[currentID] = struct{}{}
	}
	for _, id := range b.recent {
		recent[id] = struct{}{}
	}
	for _, item := range candidates {
		if _, ok := recent[item.ProxyId]; !ok {
			filtered = append(filtered, item)
		}
	}
	if len(filtered) == 0 && len(candidates) > 1 {
		for _, item := range candidates {
			if item.ProxyId != currentID {
				filtered = append(filtered, item)
			}
		}
	}
	if len(filtered) == 0 {
		filtered = candidates
	}
	next := filtered[b.rng.Intn(len(filtered))]
	if b.hasCurrent && b.current.ProxyId != "" {
		b.recent = append(b.recent, b.current.ProxyId)
		limit := len(candidates) - 1
		if limit > 20 {
			limit = 20
		}
		if limit < 1 {
			limit = 1
		}
		if len(b.recent) > limit {
			b.recent = b.recent[len(b.recent)-limit:]
		}
	}
	b.current = next
	b.hasCurrent = true
	changed := currentID != "" && (currentID != next.ProxyId || strings.TrimSpace(currentConfig) != strings.TrimSpace(next.ProxyConfig))
	closeBeforeGeneration := b.generation
	if changed {
		b.generation++
		closeBeforeGeneration = b.generation
	}
	b.mu.Unlock()

	logger.New("ProxySwitch").Info("代理自动切换出口已更新",
		logger.F("profile_id", b.profileID),
		logger.F("proxy_id", next.ProxyId),
		logger.F("proxy_name", next.ProxyName),
		logger.F("group", b.groupName),
		logger.F("mode", b.mode),
	)
	if changed {
		b.closeConnectionsBefore("代理出口切换", closeBeforeGeneration)
		b.syncCurrentProxyToProfile(next.ProxyId)
	}
	return nil
}

func (b *switchingProxyBridge) pickNextGroupCandidates(candidates []config.BrowserProxy) []config.BrowserProxy {
	if b == nil || len(candidates) == 0 {
		return candidates
	}
	currentGroup := ""
	if b.hasCurrent {
		currentGroup = strings.TrimSpace(b.current.GroupName)
	}
	grouped := make(map[string][]config.BrowserProxy)
	groups := make([]string, 0)
	for _, item := range candidates {
		group := strings.TrimSpace(item.GroupName)
		if group == "" {
			continue
		}
		if _, ok := grouped[group]; !ok {
			groups = append(groups, group)
		}
		grouped[group] = append(grouped[group], item)
	}
	if len(groups) == 0 {
		return candidates
	}
	availableGroups := groups
	if currentGroup != "" && len(groups) > 1 {
		availableGroups = make([]string, 0, len(groups)-1)
		for _, group := range groups {
			if group != currentGroup {
				availableGroups = append(availableGroups, group)
			}
		}
	}
	if len(availableGroups) == 0 {
		availableGroups = groups
	}
	nextGroup := availableGroups[b.rng.Intn(len(availableGroups))]
	return grouped[nextGroup]
}

func (b *switchingProxyBridge) candidateProxies() []config.BrowserProxy {
	proxies := b.app.getLatestProxies()
	items := make([]config.BrowserProxy, 0, len(proxies))
	for _, item := range proxies {
		if strings.TrimSpace(item.ProxyId) == "" || strings.TrimSpace(item.ProxyConfig) == "" {
			continue
		}
		if strings.EqualFold(item.ProxyId, "__direct__") || strings.EqualFold(strings.TrimSpace(item.ProxyConfig), "direct://") {
			continue
		}
		if b.groupName != "" && item.GroupName != b.groupName {
			continue
		}
		items = append(items, item)
	}
	return items
}

func (b *switchingProxyBridge) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !r.URL.IsAbs() && r.URL.Path == switchProxyControlPath {
		b.handleSwitchProxyControl(w, r)
		return
	}
	if r.Method == http.MethodConnect {
		b.handleConnect(w, r)
		return
	}
	b.handleHTTP(w, r)
}

func (b *switchingProxyBridge) handleSwitchProxyControl(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(switchProxyControlResponse{OK: false, Error: "method not allowed"})
		return
	}
	if strings.TrimSpace(b.controlToken) == "" || r.Header.Get(switchProxyControlTokenHeader) != b.controlToken {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(switchProxyControlResponse{OK: false, Error: "forbidden"})
		return
	}
	if err := b.switchNow(); err != nil {
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(switchProxyControlResponse{OK: false, Error: err.Error()})
		return
	}
	b.mu.RLock()
	current := b.current
	hasCurrent := b.hasCurrent
	b.mu.RUnlock()
	resp := switchProxyControlResponse{OK: true}
	if hasCurrent {
		resp.ProxyID = current.ProxyId
		resp.ProxyName = current.ProxyName
	}
	_ = json.NewEncoder(w).Encode(resp)
}

func (b *switchingProxyBridge) handleConnect(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	dst, err := b.dialTarget(ctx, r.Host)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		_ = dst.Close()
		http.Error(w, "hijacking not supported", http.StatusInternalServerError)
		return
	}
	client, _, err := hj.Hijack()
	if err != nil {
		_ = dst.Close()
		return
	}
	_, _ = client.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))
	go tunnel(dst, client)
	go tunnel(client, dst)
}

func (b *switchingProxyBridge) handleHTTP(w http.ResponseWriter, r *http.Request) {
	resp, release, err := b.roundTripHTTP(r)
	if err != nil && b.canFailoverOnRequestError() && shouldRetryProxyRequest(r) {
		firstErr := err
		if switchErr := b.switchNow(); switchErr == nil {
			resp, release, err = b.roundTripHTTP(r)
			if err != nil {
				err = fmt.Errorf("%v; 切换后仍失败: %w", firstErr, err)
			}
		}
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer release()
	defer resp.Body.Close()
	copyHeader(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (b *switchingProxyBridge) dialTarget(ctx context.Context, target string) (net.Conn, error) {
	conn, err := b.dialTargetOnce(ctx, target)
	if err == nil {
		return conn, nil
	}

	firstErr := err
	if !b.canFailoverOnRequestError() {
		return nil, firstErr
	}
	if switchErr := b.switchNow(); switchErr != nil {
		return nil, firstErr
	}
	conn, err = b.dialTargetOnce(ctx, target)
	if err != nil {
		return nil, fmt.Errorf("%v; 切换后仍失败: %w", firstErr, err)
	}
	return conn, nil
}

func (b *switchingProxyBridge) dialTargetOnce(ctx context.Context, target string) (net.Conn, error) {
	upstream, generation, release, err := b.effectiveProxyURL()
	if err != nil {
		return nil, err
	}
	if upstream == "" {
		var d net.Dialer
		conn, err := d.DialContext(ctx, "tcp", target)
		if err != nil {
			release()
			return nil, err
		}
		return b.trackConn(newReleaseOnCloseConn(conn, release), generation), nil
	}
	u, err := url.Parse(upstream)
	if err != nil {
		release()
		return nil, err
	}
	var conn net.Conn
	switch strings.ToLower(u.Scheme) {
	case "socks5":
		conn, err = socksDialContext(u)(ctx, "tcp", target)
	case "http", "https":
		conn, err = dialHTTPProxyConnect(ctx, u, target)
	default:
		release()
		return nil, fmt.Errorf("不支持的中转上游协议: %s", u.Scheme)
	}
	if err != nil {
		release()
		return nil, err
	}
	return b.trackConn(newReleaseOnCloseConn(conn, release), generation), nil
}

func (b *switchingProxyBridge) roundTripHTTP(r *http.Request) (*http.Response, func(), error) {
	upstream, _, release, err := b.effectiveProxyURL()
	if err != nil {
		return nil, nil, err
	}
	transport := &http.Transport{
		DisableKeepAlives: true,
	}
	if upstream != "" {
		u, err := url.Parse(upstream)
		if err != nil {
			release()
			return nil, nil, err
		}
		switch strings.ToLower(u.Scheme) {
		case "http", "https":
			transport.Proxy = http.ProxyURL(u)
		case "socks5":
			transport.Proxy = nil
			transport.DialContext = socksDialContext(u)
		}
	}
	req := r.Clone(r.Context())
	req.RequestURI = ""
	removeHopHeaders(req.Header)
	resp, err := transport.RoundTrip(req)
	if err != nil {
		release()
		return nil, nil, err
	}
	return resp, release, nil
}

func (b *switchingProxyBridge) effectiveProxyURL() (string, uint64, func(), error) {
	noopRelease := func() {}
	b.mu.RLock()
	current := b.current
	hasCurrent := b.hasCurrent
	generation := b.generation
	b.mu.RUnlock()
	if !hasCurrent {
		if err := b.switchNow(); err != nil {
			return "", 0, nil, err
		}
		b.mu.RLock()
		current = b.current
		generation = b.generation
		b.mu.RUnlock()
	}
	proxies := b.app.getLatestProxies()
	src := strings.TrimSpace(current.ProxyConfig)
	if supported, errorMsg := proxy.ValidateProxyConfig(src, proxies, current.ProxyId); !supported {
		return "", generation, nil, fmt.Errorf("%s", errorMsg)
	}
	if strings.EqualFold(src, "direct://") {
		return "", generation, noopRelease, nil
	}
	if proxy.RequiresClashBridge(src, proxies, current.ProxyId) {
		if b.app.clashBridgeMgr == nil {
			return "", generation, nil, fmt.Errorf("mihomo 管理器未初始化")
		}
		socksURL, bridgeKey, err := b.app.clashBridgeMgr.AcquireBridge(src, proxies, current.ProxyId)
		if err != nil {
			return "", generation, nil, err
		}
		return socksURL, generation, func() {
			if bridgeKey != "" {
				b.app.clashBridgeMgr.ReleaseBridge(bridgeKey)
			}
		}, nil
	}
	if proxy.IsSingBoxProtocol(src) {
		if b.app.singboxMgr == nil {
			return "", generation, nil, fmt.Errorf("sing-box 管理器未初始化")
		}
		socksURL, err := b.app.singboxMgr.EnsureBridge(src, proxies, current.ProxyId)
		return socksURL, generation, noopRelease, err
	}
	if proxy.RequiresBridge(src, proxies, current.ProxyId) {
		if b.app.xrayMgr == nil {
			return "", generation, nil, fmt.Errorf("xray 管理器未初始化")
		}
		socksURL, bridgeKey, err := b.app.xrayMgr.AcquireBridge(src, proxies, current.ProxyId)
		if err != nil {
			return "", generation, nil, err
		}
		return socksURL, generation, func() {
			if bridgeKey != "" {
				b.app.xrayMgr.ReleaseBridge(bridgeKey)
			}
		}, nil
	}
	standard, _, err := proxy.ParseProxyNode(src)
	if err != nil {
		return "", generation, nil, err
	}
	if standard == "" {
		return "", generation, nil, fmt.Errorf("代理节点无法转换为标准中转地址")
	}
	return standard, generation, noopRelease, nil
}

func (b *switchingProxyBridge) canFailoverOnRequestError() bool {
	return b != nil && b.mode == proxySwitchModeInterval
}

func (b *switchingProxyBridge) syncCurrentProxyToProfile(proxyID string) {
	if b == nil || b.app == nil || strings.TrimSpace(proxyID) == "" {
		return
	}
	b.app.updateProfileSwitchProxyID(b.profileID, proxyID)
}

func (b *switchingProxyBridge) trackConn(conn net.Conn, generation uint64) net.Conn {
	if b == nil || conn == nil {
		return conn
	}
	tracked := &trackedSwitchConn{Conn: conn, bridge: b}
	b.activeMu.Lock()
	if b.activeConns == nil {
		b.activeConns = make(map[net.Conn]uint64)
	}
	b.activeConns[tracked] = generation
	b.activeMu.Unlock()
	return tracked
}

func (b *switchingProxyBridge) untrackConn(conn net.Conn) {
	if b == nil || conn == nil {
		return
	}
	b.activeMu.Lock()
	delete(b.activeConns, conn)
	b.activeMu.Unlock()
}

func (b *switchingProxyBridge) closeConnectionsBefore(reason string, generation uint64) {
	if b == nil {
		return
	}
	b.activeMu.Lock()
	conns := make([]net.Conn, 0, len(b.activeConns))
	for conn, connGeneration := range b.activeConns {
		if connGeneration < generation {
			conns = append(conns, conn)
		}
	}
	b.activeMu.Unlock()

	b.closeConnections(reason, conns)
}

func (b *switchingProxyBridge) closeActiveConnections(reason string) {
	if b == nil {
		return
	}
	b.activeMu.Lock()
	conns := make([]net.Conn, 0, len(b.activeConns))
	for conn := range b.activeConns {
		conns = append(conns, conn)
	}
	b.activeMu.Unlock()

	b.closeConnections(reason, conns)
}

func (b *switchingProxyBridge) closeConnections(reason string, conns []net.Conn) {
	if len(conns) == 0 {
		return
	}
	log := logger.New("ProxySwitch")
	log.Info("关闭旧代理连接", logger.F("profile_id", b.profileID), logger.F("reason", reason), logger.F("count", len(conns)))
	for _, conn := range conns {
		_ = conn.Close()
	}
}

type trackedSwitchConn struct {
	net.Conn
	bridge *switchingProxyBridge
	once   sync.Once
}

func (c *trackedSwitchConn) Close() error {
	err := c.Conn.Close()
	c.once.Do(func() {
		if c.bridge != nil {
			c.bridge.untrackConn(c)
		}
	})
	return err
}

type releaseOnCloseConn struct {
	net.Conn
	release func()
	once    sync.Once
}

func newReleaseOnCloseConn(conn net.Conn, release func()) net.Conn {
	if conn == nil || release == nil {
		return conn
	}
	return &releaseOnCloseConn{Conn: conn, release: release}
}

func (c *releaseOnCloseConn) Close() error {
	err := c.Conn.Close()
	c.once.Do(c.release)
	return err
}

func socksDialContext(u *url.URL) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		var auth *xproxy.Auth
		if u.User != nil {
			auth = &xproxy.Auth{User: u.User.Username()}
			auth.Password, _ = u.User.Password()
		}
		dialer, err := xproxy.SOCKS5(network, u.Host, auth, xproxy.Direct)
		if err != nil {
			return nil, err
		}
		type contextDialer interface {
			DialContext(context.Context, string, string) (net.Conn, error)
		}
		if cd, ok := dialer.(contextDialer); ok {
			return cd.DialContext(ctx, network, address)
		}
		done := make(chan struct{})
		var conn net.Conn
		var dialErr error
		go func() {
			conn, dialErr = dialer.Dial(network, address)
			close(done)
		}()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-done:
			return conn, dialErr
		}
	}
}

func dialHTTPProxyConnect(ctx context.Context, u *url.URL, target string) (net.Conn, error) {
	var d net.Dialer
	conn, err := d.DialContext(ctx, "tcp", u.Host)
	if err != nil {
		return nil, err
	}
	if strings.EqualFold(u.Scheme, "https") {
		conn = tls.Client(conn, &tls.Config{ServerName: u.Hostname()})
	}
	req := &http.Request{
		Method: http.MethodConnect,
		URL:    &url.URL{Opaque: target},
		Host:   target,
		Header: make(http.Header),
	}
	if u.User != nil {
		pass, _ := u.User.Password()
		req.Header.Set("Proxy-Authorization", "Basic "+basicAuth(u.User.Username(), pass))
	}
	if err := req.Write(conn); err != nil {
		_ = conn.Close()
		return nil, err
	}
	resp, err := http.ReadResponse(bufio.NewReader(conn), req)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		_ = conn.Close()
		return nil, fmt.Errorf("上游 HTTP 代理 CONNECT 失败: %s", resp.Status)
	}
	return conn, nil
}

func basicAuth(username, password string) string {
	auth := username + ":" + password
	return base64.StdEncoding.EncodeToString([]byte(auth))
}

func tunnel(dst io.WriteCloser, src io.ReadCloser) {
	defer dst.Close()
	defer src.Close()
	_, _ = io.Copy(dst, src)
}

func removeHopHeaders(h http.Header) {
	for _, key := range []string{"Proxy-Connection", "Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization", "Te", "Trailer", "Transfer-Encoding", "Upgrade"} {
		h.Del(key)
	}
}

func copyHeader(dst, src http.Header) {
	for k, vv := range src {
		for _, v := range vv {
			dst.Add(k, v)
		}
	}
}

func shouldRetryProxyRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	default:
		return false
	}
}

func preferHealthyProxyCandidates(candidates []config.BrowserProxy) []config.BrowserProxy {
	healthy := make([]config.BrowserProxy, 0, len(candidates))
	for _, item := range candidates {
		if item.LastTestOk {
			healthy = append(healthy, item)
		}
	}
	if len(healthy) == 0 {
		return candidates
	}
	return healthy
}

const (
	proxySwitchModeInterval = "interval"
	proxySwitchModeManual   = "manual"
)

func normalizeProxySwitchMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case proxySwitchModeManual:
		return proxySwitchModeManual
	default:
		return proxySwitchModeInterval
	}
}
