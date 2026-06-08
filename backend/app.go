package backend

import (
	"ant-chrome/backend/internal/apppath"
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/database"
	"ant-chrome/backend/internal/launchcode"
	"ant-chrome/backend/internal/logger"
	"ant-chrome/backend/internal/platform"
	"ant-chrome/backend/internal/proxy"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type quitMode uint8

const (
	quitModeFull quitMode = iota
	quitModeAppOnly
)

// App 应用结构体
type App struct {
	ctx                context.Context
	config             *config.Config
	db                 *database.DB
	interceptor        *logger.MethodInterceptor
	browserMgr         *browser.Manager
	xrayMgr            *proxy.XrayManager
	clashMgr           *proxy.ClashManager
	clashBridgeMgr     *proxy.ClashBridgeManager
	singboxMgr         *proxy.SingBoxManager
	launchCodeSvc      *launchcode.LaunchCodeService
	launchServer       *launchcode.LaunchServer
	speedScheduler     *browser.ProxySpeedScheduler
	platformRuntime    platform.Runtime
	protoEventMu       sync.RWMutex
	protoEventSink     func(eventName string, payload []byte)
	appRoot            string
	version            string
	localDataReady     chan struct{}
	localDataReadyOnce sync.Once
	startupReady       chan struct{}
	startupReadyOnce   sync.Once
	updateRuntimeMu    sync.Mutex
	updateRuntime      *wailsUpdateRuntime
	coreDownloadMu     sync.Mutex
	coreDownloadCancel context.CancelFunc
	coreDownloadSeq    uint64

	forceQuit                bool       // 强制退出标志，用于跳过 OnBeforeClose 的拦截
	quitMode                 quitMode   // 退出模式：全量退出 / 仅退出应用
	maintenanceMu            sync.Mutex // 维护类操作（初始化/导入/导出）互斥锁
	profileOpMu              sync.Mutex
	profileOpLocks           map[string]*sync.Mutex
	bridgeMu                 sync.Mutex
	xrayBridgeRefs           map[string]string
	clashBridgeRefs          map[string]string
	switchBridgeRefs         map[string]*switchingProxyBridge
	authProxyBridgeRefs      map[string]*authenticatedProxyBridge
	windowSyncMu             sync.Mutex
	windowSyncState          *WindowSyncState
	windowSyncLayout         WindowSyncLayoutSettings
	windowSyncCancel         chan struct{}
	windowSyncSeq            int
	windowSyncToolbar        windowSyncToolbarController
	windowSyncToolbarMu      sync.RWMutex
	windowSyncToolbarAdapter WindowSyncToolbarAdapter
	windowSyncPromptMu       sync.RWMutex
	windowSyncPromptAdapter  WindowSyncPromptAdapter
	windowSyncUpdateMu       sync.Mutex
	windowSyncStateEmitTimer *time.Timer
	windowSyncToolbarTimer   *time.Timer
	windowSyncPendingState   *WindowSyncState
	windowSyncPendingToolbar *WindowSyncState
	windowSyncThrottleMu     sync.Mutex
	windowSyncThrottleTimers map[string]*windowSyncPendingEvent
	windowSyncLastMouseMoves map[string]windowSyncEvent
	windowSyncDispatchFails  map[int]time.Time
	windowSyncEventsTotal    atomic.Int64
	windowSyncDispatchTotal  atomic.Int64
	profilesDataVersion      atomic.Int64
	groupsDataVersion        atomic.Int64
	proxiesDataVersion       atomic.Int64
	coresDataVersion         atomic.Int64
	extensionsDataVersion    atomic.Int64
	defaultsDataVersion      atomic.Int64
	settingsDataVersion      atomic.Int64
	cookiesDataVersion       atomic.Int64
	snapshotsDataVersion     atomic.Int64
	logsDataVersion          atomic.Int64
	extensionAutoSyncMu      sync.Mutex
	extensionAutoSyncBlocked map[string]struct{}
	stopServicesOnce         sync.Once
	finalizeOnce             sync.Once
}

// NewApp 创建新的应用实例
func NewApp(appRoot string, appVersion ...string) *App {
	version := ""
	if len(appVersion) > 0 {
		version = strings.TrimSpace(appVersion[0])
	}
	return &App{
		appRoot:             strings.TrimSpace(appRoot),
		version:             version,
		platformRuntime:     platform.DefaultRuntime(),
		profileOpLocks:      make(map[string]*sync.Mutex),
		xrayBridgeRefs:      make(map[string]string),
		clashBridgeRefs:     make(map[string]string),
		switchBridgeRefs:    make(map[string]*switchingProxyBridge),
		authProxyBridgeRefs: make(map[string]*authenticatedProxyBridge),
		localDataReady:      make(chan struct{}),
		startupReady:        make(chan struct{}),
	}
}

func (a *App) appName() string {
	if a.config != nil {
		if name := strings.TrimSpace(a.config.App.Name); name != "" {
			return name
		}
	}
	return "Trace Browser"
}

func (a *App) appVersion() string {
	version := strings.TrimSpace(a.version)
	if version == "" {
		return "dev"
	}
	return version
}

func (a *App) appRuntime() platform.Runtime {
	if a != nil && a.platformRuntime != nil {
		return a.platformRuntime
	}
	return platform.DefaultRuntime()
}

func (a *App) useRuntime(runtime platform.Runtime) {
	if a == nil || runtime == nil {
		return
	}
	a.platformRuntime = runtime
}

func (a *App) emitEvent(eventName string, optionalData ...any) {
	if a == nil || a.ctx == nil {
		return
	}
	a.appRuntime().EmitEvent(a.ctx, eventName, optionalData...)
	a.emitProtoRuntimeEvent(eventName, optionalData...)
}

func (a *App) setProtoEventSink(sink func(eventName string, payload []byte)) {
	if a == nil {
		return
	}
	a.protoEventMu.Lock()
	a.protoEventSink = sink
	a.protoEventMu.Unlock()
}

func (a *App) emitProtoEvent(eventName string, payload []byte) {
	if a == nil {
		return
	}
	a.protoEventMu.RLock()
	sink := a.protoEventSink
	a.protoEventMu.RUnlock()
	if sink == nil {
		return
	}
	sink(eventName, payload)
}

// startup 应用启动时调用
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if err := apppath.EnsureWritableLayout(a.appRoot); err != nil {
		a.appRuntime().LogFatal(ctx, fmt.Sprintf("初始化 Linux 用户数据目录失败: %v", err))
		a.markLocalDataReady()
		a.markStartupReady()
		return
	}
	cfg, err := LoadConfig(a.resolveAppPath("config.yaml"))
	if err != nil {
		cfg = config.DefaultConfig()
	}
	a.config = cfg
	a.applyRuntimeConfig(cfg.Runtime)

	logConfig := logger.LoggerConfig{
		Level:           cfg.Logging.Level,
		FileEnabled:     true,
		FilePath:        a.resolveAppPath(filepath.Join("logs", "app.log")),
		Format:          cfg.Logging.Format,
		BufferSize:      cfg.Logging.BufferSize,
		AsyncQueueSize:  cfg.Logging.AsyncQueueSize,
		FlushIntervalMs: cfg.Logging.FlushIntervalMs,
		Rotation: logger.RotationConfig{
			Enabled:      cfg.Logging.Rotation.Enabled,
			MaxSizeMB:    cfg.Logging.Rotation.MaxSizeMB,
			MaxAge:       cfg.Logging.Rotation.MaxAge,
			MaxBackups:   cfg.Logging.Rotation.MaxBackups,
			TimeInterval: cfg.Logging.Rotation.TimeInterval,
		},
	}
	logger.InitWithConfig(ctx, logConfig)
	logger.InstallStandardLogBridge("Runtime")

	log := logger.New("App")
	log.Info("应用启动中...",
		logger.F("version", a.appVersion()),
		logger.F("log_file", logConfig.FilePath),
		logger.F("max_memory_mb", cfg.Runtime.MaxMemoryMB),
		logger.F("gc_percent", cfg.Runtime.GCPercent),
	)
	if apppath.IsDetached(a.appRoot) {
		log.Info("检测到安装目录需要只读运行，已切换到用户数据目录",
			logger.F("install_root", apppath.InstallRoot(a.appRoot)),
			logger.F("state_root", apppath.StateRoot(a.appRoot)),
		)
	}

	// 确保 data 目录存在（存放数据库、用户数据、快照等）
	if err := os.MkdirAll(a.resolveAppPath("data"), 0755); err != nil {
		log.Error("创建 data 目录失败", logger.F("error", err))
	}

	if cfg.Logging.Interceptor.Enabled {
		interceptorConfig := logger.InterceptorConfig{
			Enabled:         cfg.Logging.Interceptor.Enabled,
			LogParameters:   cfg.Logging.Interceptor.LogParameters,
			LogResults:      cfg.Logging.Interceptor.LogResults,
			SensitiveFields: cfg.Logging.Interceptor.SensitiveFields,
		}
		a.interceptor = logger.NewMethodInterceptor(log, interceptorConfig)
	}

	db, err := database.NewDB(a.resolveAppPath(cfg.Database.SQLite.Path))
	if err != nil {
		log.Error("初始化数据库失败", logger.F("error", err))
		a.appRuntime().LogFatal(ctx, fmt.Sprintf("初始化数据库失败: %v", err))
		a.markLocalDataReady()
		a.markStartupReady()
		return
	}
	a.db = db
	if err := db.Migrate(); err != nil {
		log.Error("数据库迁移失败", logger.F("error", err))
	}

	a.browserMgr = browser.NewManager(cfg, a.appRoot)
	a.xrayMgr = proxy.NewXrayManager(cfg, a.appRoot)
	a.clashMgr = proxy.NewClashManager(cfg, a.appRoot)
	a.clashBridgeMgr = proxy.NewClashBridgeManager(cfg, a.appRoot)
	a.singboxMgr = proxy.NewSingBoxManager(cfg, a.appRoot)

	// 注入 DAO（必须在 InitData 之前）
	conn := db.GetConn()
	a.browserMgr.ProfileDAO = browser.NewSQLiteProfileDAO(conn)
	a.browserMgr.ProxyDAO = browser.NewSQLiteProxyDAO(conn)
	a.browserMgr.CoreDAO = browser.NewSQLiteCoreDAO(conn)
	a.browserMgr.BookmarkDAO = browser.NewSQLiteBookmarkDAO(conn)
	a.browserMgr.GroupDAO = browser.NewSQLiteGroupDAO(conn)
	a.browserMgr.ExtensionDAO = browser.NewSQLiteExtensionDAO(conn)

	// 一次性迁移：若 SQLite 表为空则从旧文件导入
	a.migrateToSQLite()

	a.browserMgr.InitData()
	a.loadProxies()
	a.reconcileProfileProxyBindings()
	a.markLocalDataReady()

	// 初始化 LaunchCode 服务
	launchCodeDAO := launchcode.NewSQLiteLaunchCodeDAO(a.db.GetConn())
	a.launchCodeSvc = launchcode.NewLaunchCodeService(launchCodeDAO)
	if err := a.launchCodeSvc.LoadAll(); err != nil {
		log.Error("LaunchCode 加载失败", logger.F("error", err))
	}
	a.browserMgr.CodeProvider = a.launchCodeSvc

	a.startLaunchServer(log)

	// 连接池失效通知
	a.xrayMgr.OnBridgeDied = func(key string, err error) {
		if a.ctx != nil {
			a.emitEvent("proxy:bridge:died", map[string]interface{}{
				"engine": "xray",
				"key":    shortKeyPrefix(key),
				"error":  err.Error(),
			})
		}
	}
	a.singboxMgr.OnBridgeDied = func(key string, err error) {
		if a.ctx != nil {
			a.emitEvent("proxy:bridge:died", map[string]interface{}{
				"engine": "singbox",
				"key":    shortKeyPrefix(key),
				"error":  err.Error(),
			})
		}
	}
	a.clashBridgeMgr.OnBridgeDied = func(key string, err error) {
		if a.ctx != nil {
			a.emitEvent("proxy:bridge:died", map[string]interface{}{
				"engine": "mihomo",
				"key":    shortKeyPrefix(key),
				"error":  err.Error(),
			})
		}
	}

	// 启动代理测速定时调度器（每5分钟一轮，并发5）
	a.speedScheduler = browser.NewProxySpeedScheduler(
		a.browserMgr.ProxyDAO,
		func(proxyId string) (bool, int64, string) {
			r := proxy.SpeedTestWithClash(proxyId, a.getLatestProxies(), a.xrayMgr, a.singboxMgr, a.clashBridgeMgr, nil)
			return r.Ok, r.LatencyMs, r.Error
		},
		5*time.Minute,
		5,
		a.emitBrowserProxiesUpdated,
	)
	a.speedScheduler.Start()

	go a.runPostStartupLocalDiscovery()

	a.markStartupReady()
	log.Info("应用启动成功")
	a.emitPendingAppUpdateIfNeeded()
}

func (a *App) startLaunchServer(log *logger.Logger) {
	if a == nil || a.config == nil || a.launchCodeSvc == nil || a.browserMgr == nil {
		return
	}
	port := a.config.LaunchServer.Port
	a.launchServer = launchcode.NewLaunchServer(a.launchCodeSvc, a, a.browserMgr, port)
	a.launchServer.SetAPIAuthConfig(launchcode.APIAuthConfig{
		Enabled: a.config.LaunchServer.Auth.Enabled,
		APIKey:  a.config.LaunchServer.Auth.APIKey,
		Header:  a.config.LaunchServer.Auth.Header,
	})
	if err := a.launchServer.Start(); err != nil {
		log.Error("LaunchServer 启动失败", logger.F("error", err))
		return
	}
	log.Info("LaunchServer 监听地址",
		logger.F("url", fmt.Sprintf("http://127.0.0.1:%d", a.launchServer.Port())),
		logger.F("preferred_port", port),
	)
}

func (a *App) runPostStartupLocalDiscovery() {
	if a == nil || a.browserMgr == nil {
		return
	}
	log := logger.New("App")
	startedAt := time.Now()
	a.ensureDefaultCores()
	a.autoDetectCores()
	log.Info("启动后本地资源检测完成", logger.F("elapsed_ms", time.Since(startedAt).Milliseconds()))
}

func (a *App) markLocalDataReady() {
	if a == nil || a.localDataReady == nil {
		return
	}
	a.localDataReadyOnce.Do(func() {
		close(a.localDataReady)
	})
}

func (a *App) markStartupReady() {
	if a == nil || a.startupReady == nil {
		return
	}
	a.startupReadyOnce.Do(func() {
		close(a.startupReady)
	})
}

func (a *App) waitLocalDataReady(ctx context.Context, timeout time.Duration) error {
	if a == nil || a.localDataReady == nil {
		return nil
	}
	select {
	case <-a.localDataReady:
		return nil
	default:
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case <-a.localDataReady:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return fmt.Errorf("本地数据仍在初始化")
	}
}

func (a *App) waitStartupReady(ctx context.Context, timeout time.Duration) error {
	if a == nil || a.startupReady == nil {
		return nil
	}
	select {
	case <-a.startupReady:
		return nil
	default:
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case <-a.startupReady:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return fmt.Errorf("应用启动仍在初始化")
	}
}

// ReloadConfig 开放给前端重新读取配置，用于应对手动修补后的配置重载
func (a *App) ReloadConfig() error {
	log := logger.New("App")
	cfg, err := LoadConfig(a.resolveAppPath("config.yaml"))
	if err != nil {
		log.Error("重载配置文件失败", logger.F("error", err))
		return fmt.Errorf("重载配置文件失败: %w", err)
	}

	a.config = cfg
	a.applyRuntimeConfig(cfg.Runtime)
	// Update browser manager config reference
	if a.browserMgr != nil {
		a.browserMgr.Config = cfg
		a.browserMgr.ListCores()
		a.loadProxies()
		a.reconcileProfileProxyBindings()
	}
	if a.xrayMgr != nil {
		a.xrayMgr.Config = cfg
	}
	if a.clashMgr != nil {
		a.clashMgr.Config = cfg
	}
	if a.clashBridgeMgr != nil {
		a.clashBridgeMgr.Config = cfg
	}
	if a.singboxMgr != nil {
		a.singboxMgr.Config = cfg
	}
	if a.launchServer != nil {
		a.launchServer.SetAPIAuthConfig(launchcode.APIAuthConfig{
			Enabled: cfg.LaunchServer.Auth.Enabled,
			APIKey:  cfg.LaunchServer.Auth.APIKey,
			Header:  cfg.LaunchServer.Auth.Header,
		})
	}

	log.Info("前端触发配置重载成功")
	return nil
}

func (a *App) refreshConfigCacheFromDiskIfPresent() error {
	if a == nil {
		return nil
	}
	configPath := a.resolveAppPath("config.yaml")
	if _, err := os.Stat(configPath); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("检查配置文件失败: %w", err)
	}
	cfg, err := LoadConfig(configPath)
	if err != nil {
		return fmt.Errorf("重载配置文件失败: %w", err)
	}
	a.config = cfg
	if a.browserMgr != nil {
		a.browserMgr.Config = cfg
		a.browserMgr.ListCores()
		a.loadProxies()
	}
	return nil
}

func (a *App) applyRuntimeConfig(cfg config.RuntimeConfig) {
	if cfg.GCPercent > 0 {
		debug.SetGCPercent(cfg.GCPercent)
	}
	if cfg.MaxMemoryMB > 0 {
		maxMemoryBytes := int64(cfg.MaxMemoryMB) * 1024 * 1024
		debug.SetMemoryLimit(maxMemoryBytes)
		return
	}
	// 0 表示禁用自定义软限制，避免 ReloadConfig 后残留旧的 GOMEMLIMIT。
	debug.SetMemoryLimit(1 << 60)
}

func (a *App) shutdown(ctx context.Context) {
	log := logger.New("App")
	a.hideWindowSyncToolbar()
	if a.shouldStopRuntimeServicesOnShutdown() {
		log.Info("应用正在关闭...")
		a.stopRuntimeServices()
	} else {
		log.Info("应用正在关闭（保留当前已打开的浏览器实例）...")
	}
	a.finalizeShutdown()
}

func (a *App) GetInterceptor() *logger.MethodInterceptor {
	return a.interceptor
}

// ForceQuit 设置强制退出标志并调用平台退出能力。
func (a *App) ForceQuit() {
	a.setQuitMode(quitModeFull)
	a.stopRuntimeServices()
	if a.ctx != nil {
		if err := a.saveCurrentWindowState(a.ctx); err != nil {
			logger.New("App").Warn("保存窗口尺寸失败", logger.F("error", err.Error()))
		}
		a.appRuntime().Quit(a.ctx)
	}
}

// QuitAppOnly 仅退出应用本身，保留当前已打开的浏览器实例。
func (a *App) QuitAppOnly() {
	a.setQuitMode(quitModeAppOnly)
	if a.ctx != nil {
		if err := a.saveCurrentWindowState(a.ctx); err != nil {
			logger.New("App").Warn("保存窗口尺寸失败", logger.F("error", err.Error()))
		}
		a.appRuntime().Quit(a.ctx)
	}
}

func Start(a *App, ctx context.Context) {
	a.startup(ctx)
}

func Stop(a *App, ctx context.Context) {
	a.shutdown(ctx)
}

func platformSupportsTrayCloseFlow() bool {
	return platformSupportsTrayCloseFlowForOS(goruntime.GOOS)
}

func platformSupportsTrayCloseFlowForOS(goos string) bool {
	return goos == "windows"
}

func (a *App) setQuitMode(mode quitMode) {
	a.forceQuit = true
	a.quitMode = mode
}

func (a *App) shouldStopRuntimeServicesOnShutdown() bool {
	return a.quitMode != quitModeAppOnly
}

func ShouldBlockClose(a *App, ctx context.Context) bool {
	return shouldBlockClose(a, ctx, platformSupportsTrayCloseFlow())
}

func shouldBlockClose(a *App, ctx context.Context, supportsCloseFlow bool) bool {
	if a == nil {
		return false
	}
	if a.forceQuit {
		return false
	}
	if !supportsCloseFlow {
		return false
	}
	a.appRuntime().EmitEvent(ctx, "app:request-close")
	a.emitProtoRuntimeEvent("app:request-close")
	return true
}

func (a *App) bindProfileXrayBridge(profileId string, bridgeKey string) {
	profileId = strings.TrimSpace(profileId)
	bridgeKey = strings.TrimSpace(bridgeKey)
	if profileId == "" || bridgeKey == "" {
		return
	}

	a.bridgeMu.Lock()
	a.xrayBridgeRefs[profileId] = bridgeKey
	a.bridgeMu.Unlock()
}

func (a *App) releaseProfileXrayBridge(profileId string) {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return
	}

	a.bridgeMu.Lock()
	bridgeKey := a.xrayBridgeRefs[profileId]
	delete(a.xrayBridgeRefs, profileId)
	a.bridgeMu.Unlock()

	if bridgeKey != "" && a.xrayMgr != nil {
		a.xrayMgr.ReleaseBridge(bridgeKey)
	}
}

func (a *App) bindProfileClashBridge(profileId string, bridgeKey string) {
	profileId = strings.TrimSpace(profileId)
	bridgeKey = strings.TrimSpace(bridgeKey)
	if profileId == "" || bridgeKey == "" {
		return
	}

	a.bridgeMu.Lock()
	a.clashBridgeRefs[profileId] = bridgeKey
	a.bridgeMu.Unlock()
}

func (a *App) releaseProfileClashBridge(profileId string) {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return
	}

	a.bridgeMu.Lock()
	bridgeKey := a.clashBridgeRefs[profileId]
	delete(a.clashBridgeRefs, profileId)
	a.bridgeMu.Unlock()

	if bridgeKey != "" && a.clashBridgeMgr != nil {
		a.clashBridgeMgr.ReleaseBridge(bridgeKey)
	}
}

func (a *App) clearProfileXrayBridges() {
	a.bridgeMu.Lock()
	a.xrayBridgeRefs = make(map[string]string)
	a.bridgeMu.Unlock()
}

func (a *App) clearProfileClashBridges() {
	a.bridgeMu.Lock()
	a.clashBridgeRefs = make(map[string]string)
	a.bridgeMu.Unlock()
}

func (a *App) startProfileSwitchBridge(profile *BrowserProfile) (string, error) {
	if profile == nil || !profile.AutoProxySwitchEnabled {
		return "", nil
	}
	a.releaseProfileSwitchBridge(profile.ProfileId)
	bridge := newSwitchingProxyBridge(a, profile)
	proxyURL, err := bridge.start()
	if err != nil {
		return "", err
	}
	bridge.mu.RLock()
	if bridge.hasCurrent {
		profile.AutoProxySwitchLastProxyId = bridge.current.ProxyId
	}
	bridge.mu.RUnlock()
	a.bridgeMu.Lock()
	if a.switchBridgeRefs == nil {
		a.switchBridgeRefs = make(map[string]*switchingProxyBridge)
	}
	a.switchBridgeRefs[profile.ProfileId] = bridge
	a.bridgeMu.Unlock()
	return proxyURL, nil
}

func (a *App) releaseProfileSwitchBridge(profileId string) {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return
	}
	a.bridgeMu.Lock()
	if a.switchBridgeRefs == nil {
		a.switchBridgeRefs = make(map[string]*switchingProxyBridge)
	}
	bridge := a.switchBridgeRefs[profileId]
	delete(a.switchBridgeRefs, profileId)
	a.bridgeMu.Unlock()
	if bridge != nil {
		bridge.stop()
	}
}

func (a *App) startProfileAuthProxyBridge(profileId string, proxyURL string) (string, bool, error) {
	if !proxyNeedsBrowserAuthBridge(proxyURL) {
		return proxyURL, false, nil
	}
	a.releaseProfileAuthProxyBridge(profileId)
	bridge := newAuthenticatedProxyBridge(proxyURL)
	localProxyURL, err := bridge.start()
	if err != nil {
		return "", false, err
	}
	a.bridgeMu.Lock()
	if a.authProxyBridgeRefs == nil {
		a.authProxyBridgeRefs = make(map[string]*authenticatedProxyBridge)
	}
	a.authProxyBridgeRefs[profileId] = bridge
	a.bridgeMu.Unlock()
	return localProxyURL, true, nil
}

func (a *App) releaseProfileAuthProxyBridge(profileId string) {
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return
	}
	a.bridgeMu.Lock()
	if a.authProxyBridgeRefs == nil {
		a.authProxyBridgeRefs = make(map[string]*authenticatedProxyBridge)
	}
	bridge := a.authProxyBridgeRefs[profileId]
	delete(a.authProxyBridgeRefs, profileId)
	a.bridgeMu.Unlock()
	if bridge != nil {
		bridge.stop()
	}
}

func (a *App) BrowserProfileSwitchProxyNow(profileId string) (*BrowserProfile, error) {
	a.refreshBrowserProfileConfigCacheFromStore()
	a.reconcileBrowserProfileRuntimeStates()
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		return nil, fmt.Errorf("profile id is required")
	}

	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists {
		a.browserMgr.Mutex.Unlock()
		return nil, fmt.Errorf("profile not found")
	}
	if !profile.AutoProxySwitchEnabled {
		a.browserMgr.Mutex.Unlock()
		return nil, fmt.Errorf("当前实例未启用代理池切换")
	}
	if !profile.Running {
		a.browserMgr.Mutex.Unlock()
		return nil, fmt.Errorf("实例未运行，启动后才能手动切换出口")
	}
	a.browserMgr.Mutex.Unlock()

	a.bridgeMu.Lock()
	bridge := a.switchBridgeRefs[profileId]
	a.bridgeMu.Unlock()
	if bridge == nil {
		if profile, attempted, err := a.switchProfileProxyNowViaRuntimeBridge(profileId); attempted {
			return profile, err
		}
		return nil, fmt.Errorf("代理切换中转未运行，请先启动实例")
	}

	if err := bridge.switchNow(); err != nil {
		return nil, err
	}

	bridge.mu.RLock()
	currentProxyID := ""
	if bridge.hasCurrent {
		currentProxyID = bridge.current.ProxyId
	}
	bridge.mu.RUnlock()
	snapshot, _, err := a.saveProfileSwitchProxyID(profileId, currentProxyID)
	if err != nil {
		return nil, err
	}
	a.emitBrowserInstanceUpdated(snapshot)
	return snapshot, nil
}

func (a *App) saveProfileSwitchProxyID(profileId string, proxyID string) (*BrowserProfile, bool, error) {
	profileId = strings.TrimSpace(profileId)
	proxyID = strings.TrimSpace(proxyID)
	if a == nil || a.browserMgr == nil {
		return nil, false, fmt.Errorf("browser manager is not initialized")
	}
	if profileId == "" || proxyID == "" {
		return nil, false, fmt.Errorf("profile id and proxy id are required")
	}

	a.refreshBrowserProfileConfigCacheFromStore()
	a.browserMgr.Mutex.Lock()
	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists || profile == nil {
		a.browserMgr.Mutex.Unlock()
		return nil, false, fmt.Errorf("profile not found")
	}
	if profile.AutoProxySwitchLastProxyId == proxyID {
		snapshot := *profile
		a.browserMgr.Mutex.Unlock()
		return &snapshot, false, nil
	}
	profile.AutoProxySwitchLastProxyId = proxyID
	profile.UpdatedAt = time.Now().Format(time.RFC3339)
	var saveErr error
	if a.browserMgr.ProfileDAO != nil {
		saveErr = a.browserMgr.ProfileDAO.Upsert(profile)
	} else {
		saveErr = a.browserMgr.SaveProfiles()
	}
	snapshot := *profile
	a.browserMgr.Mutex.Unlock()
	if saveErr != nil {
		return nil, false, saveErr
	}
	return &snapshot, true, nil
}

func (a *App) updateProfileSwitchProxyID(profileId string, proxyID string) {
	profileId = strings.TrimSpace(profileId)
	proxyID = strings.TrimSpace(proxyID)
	if a == nil || a.browserMgr == nil || profileId == "" || proxyID == "" {
		return
	}

	snapshot, changed, err := a.saveProfileSwitchProxyID(profileId, proxyID)
	if err != nil {
		logger.New("ProxySwitch").Warn("代理切换状态持久化失败", logger.F("profile_id", profileId), logger.F("proxy_id", proxyID), logger.F("error", err.Error()))
		return
	}
	if changed {
		a.emitBrowserInstanceUpdated(snapshot)
	}
}

func (a *App) clearProfileSwitchBridges() {
	a.bridgeMu.Lock()
	bridges := make([]*switchingProxyBridge, 0, len(a.switchBridgeRefs))
	for _, bridge := range a.switchBridgeRefs {
		bridges = append(bridges, bridge)
	}
	a.switchBridgeRefs = make(map[string]*switchingProxyBridge)
	a.bridgeMu.Unlock()
	for _, bridge := range bridges {
		if bridge != nil {
			bridge.stop()
		}
	}
}

func (a *App) clearProfileAuthProxyBridges() {
	a.bridgeMu.Lock()
	bridges := make([]*authenticatedProxyBridge, 0, len(a.authProxyBridgeRefs))
	for _, bridge := range a.authProxyBridgeRefs {
		bridges = append(bridges, bridge)
	}
	a.authProxyBridgeRefs = make(map[string]*authenticatedProxyBridge)
	a.bridgeMu.Unlock()
	for _, bridge := range bridges {
		if bridge != nil {
			bridge.stop()
		}
	}
}

// ============================================================================
// 仪表盘 API
// ============================================================================

func (a *App) GetDashboardStats() map[string]interface{} {
	a.reconcileBrowserProfileRuntimeStates()
	profiles := a.browserMgr.List()
	totalInstances := len(profiles)
	runningInstances := 0
	for _, p := range profiles {
		if p.Running {
			runningInstances++
		}
	}
	proxyCount := len(a.getLatestProxies())
	coreCount := len(a.browserMgr.ListCores())

	var mem goruntime.MemStats
	goruntime.ReadMemStats(&mem)
	memUsedMB := float64(mem.Alloc) / 1024 / 1024

	return map[string]interface{}{
		"totalInstances":   totalInstances,
		"runningInstances": runningInstances,
		"proxyCount":       proxyCount,
		"coreCount":        coreCount,
		"memUsedMB":        int(memUsedMB),
		"appVersion":       a.appVersion(),
	}
}

func (a *App) GetAppConfig() map[string]interface{} {
	return map[string]interface{}{
		"name":             a.appName(),
		"version":          a.appVersion(),
		"projectGithubUrl": PROJECT_GITHUB_URL,
	}
}

func (a *App) GetMemoryStats() map[string]interface{} {
	var m goruntime.MemStats
	goruntime.ReadMemStats(&m)
	return map[string]interface{}{
		"alloc_mb":       float64(m.Alloc) / 1024 / 1024,
		"total_alloc_mb": float64(m.TotalAlloc) / 1024 / 1024,
		"sys_mb":         float64(m.Sys) / 1024 / 1024,
		"num_gc":         m.NumGC,
		"limit_mb":       a.config.Runtime.MaxMemoryMB,
		"gc_percent":     a.config.Runtime.GCPercent,
	}
}

func (a *App) TriggerGC()               { goruntime.GC() }
func (a *App) SetLogLevel(level string) { logger.SetGlobalLevelString(level) }
func (a *App) GetLogLevel() string      { return logger.New("App").GetLevel().String() }

// GetAppLogs 获取内存缓冲日志
func (a *App) GetAppLogs() []logger.MemoryLogEntry {
	return logger.GetMemoryWriter().GetEntries()
}

// ClearAppLogs 清空内存缓冲日志
func (a *App) ClearAppLogs() {
	logger.GetMemoryWriter().Clear()
	a.emitBrowserLogsUpdated()
}

// GetRunningInstances 获取运行中实例的详细信息
func (a *App) GetRunningInstances() []BrowserProfile {
	a.reconcileBrowserProfileRuntimeStates()
	all := a.browserMgr.List()
	result := make([]BrowserProfile, 0)
	for _, p := range all {
		if p.Running {
			result = append(result, p)
		}
	}
	return result
}

// ============================================================================
// 浏览器类型别名 (保持 Wails 绑定兼容)
// ============================================================================

type BrowserProfile = browser.Profile
type BrowserProfileInput = browser.ProfileInput
type BrowserTab = browser.Tab
type BrowserSettings = browser.Settings
type BrowserProxy = browser.Proxy
type BrowserCore = browser.Core
type BrowserCoreInput = browser.CoreInput
type BrowserCoreValidateResult = browser.CoreValidateResult
type BrowserCoreExtendedInfo = browser.CoreExtendedInfo
type BrowserExtension = browser.Extension
type BrowserExtensionBinding = browser.ExtensionBinding

// ============================================================================
// 浏览器配置 API
// ============================================================================

// BrowserProfileList 获取所有实例列表
func (a *App) BrowserProfileList() []BrowserProfile {
	a.reconcileBrowserProfileRuntimeStates()
	return a.browserMgr.List()
}

// BrowserProfileListByTag 按标签筛选实例列表
func (a *App) BrowserProfileListByTag(tag string) []BrowserProfile {
	a.reconcileBrowserProfileRuntimeStates()
	return a.browserMgr.ListByTag(tag)
}

// BrowserGetAllTags 获取所有已使用的标签
func (a *App) BrowserGetAllTags() []string {
	a.refreshBrowserProfileConfigCacheFromStore()
	return a.browserMgr.GetAllTags()
}

// BrowserProfileSetKeywords 设置实例关键字
func (a *App) BrowserProfileSetKeywords(profileId string, keywords []string) (*BrowserProfile, error) {
	a.refreshBrowserProfileConfigCacheFromStore()
	if err := a.ensureWindowSyncProfileMutable(profileId); err != nil {
		return nil, err
	}
	profile, err := a.browserMgr.SetKeywords(profileId, keywords)
	if err != nil {
		return nil, err
	}
	a.emitProfileDataUpdated()
	return profile, nil
}

func (a *App) BrowserProfileCreate(input BrowserProfileInput) (*BrowserProfile, error) {
	_ = a.refreshConfigCacheFromDiskIfPresent()
	a.refreshBrowserProfileConfigCacheFromStore()
	if err := a.validateProfileGroupID(input.GroupId); err != nil {
		return nil, err
	}
	profile, err := a.browserMgr.Create(input)
	if err != nil {
		return nil, err
	}
	if err := a.applyAutoBindExtensionsForProfile(profile.ProfileId); err != nil {
		return nil, err
	}
	a.emitProfileDataUpdated()
	a.emitGroupDataUpdated()
	a.emitBrowserExtensionsUpdated()
	return profile, nil
}

func (a *App) BrowserProfileUpdate(profileId string, input BrowserProfileInput) (*BrowserProfile, error) {
	a.refreshBrowserProfileConfigCacheFromStore()
	if err := a.ensureWindowSyncProfileMutable(profileId); err != nil {
		return nil, err
	}
	if err := a.validateProfileGroupID(input.GroupId); err != nil {
		return nil, err
	}
	profile, err := a.browserMgr.Update(profileId, input)
	if err != nil {
		return nil, err
	}
	a.emitProfileDataUpdated()
	a.emitGroupDataUpdated()
	return profile, nil
}

func (a *App) BrowserProfileDelete(profileId string) error {
	a.reconcileBrowserProfileRuntimeStates()
	if err := a.ensureWindowSyncProfileMutable(profileId); err != nil {
		return err
	}
	if err := a.deleteProfileWithData(profileId); err != nil {
		return err
	}
	a.emitProfileDataUpdated()
	a.emitGroupDataUpdated()
	return nil
}

// BrowserProfileCopy 复制实例配置（除指纹参数外全部复制）
func (a *App) BrowserProfileCopy(profileId string, newName string) (*BrowserProfile, error) {
	_ = a.refreshConfigCacheFromDiskIfPresent()
	a.refreshBrowserProfileConfigCacheFromStore()
	profile, err := a.browserMgr.Copy(profileId, newName)
	if err != nil {
		return nil, err
	}
	if err := a.applyAutoBindExtensionsForProfile(profile.ProfileId); err != nil {
		return nil, err
	}
	a.emitProfileDataUpdated()
	a.emitGroupDataUpdated()
	a.emitBrowserExtensionsUpdated()
	return profile, nil
}

// ============================================================================
// 浏览器设置 API
// ============================================================================

func (a *App) GetBrowserSettings() BrowserSettings {
	_ = a.refreshConfigCacheFromDiskIfPresent()
	cfg := a.config
	if cfg == nil {
		cfg = config.DefaultConfig()
	}
	return BrowserSettings{
		UserDataRoot:           cfg.Browser.UserDataRoot,
		DefaultFingerprintArgs: append([]string{}, cfg.Browser.DefaultFingerprintArgs...),
		DefaultLaunchArgs:      append([]string{}, cfg.Browser.DefaultLaunchArgs...),
		DefaultProxy:           cfg.Browser.DefaultProxy,
		StartReadyTimeoutMs:    browserStartReadyTimeoutMillis(cfg),
		StartStableWindowMs:    browserStartStableWindowMillis(cfg),
	}
}

func (a *App) SaveBrowserSettings(settings BrowserSettings) error {
	log := logger.New("Browser")
	if err := a.refreshConfigCacheFromDiskIfPresent(); err != nil {
		log.Error("浏览器配置重载失败", logger.F("error", err))
		return err
	}
	if a.config == nil {
		a.config = config.DefaultConfig()
		if a.browserMgr != nil {
			a.browserMgr.Config = a.config
		}
	}
	a.config.Browser.UserDataRoot = strings.TrimSpace(settings.UserDataRoot)
	a.config.Browser.DefaultFingerprintArgs = append([]string{}, settings.DefaultFingerprintArgs...)
	a.config.Browser.DefaultLaunchArgs = append([]string{}, settings.DefaultLaunchArgs...)
	a.config.Browser.DefaultProxy = strings.TrimSpace(settings.DefaultProxy)
	if settings.StartReadyTimeoutMs > 0 {
		a.config.Browser.StartReadyTimeoutMs = settings.StartReadyTimeoutMs
	} else if a.config.Browser.StartReadyTimeoutMs <= 0 {
		a.config.Browser.StartReadyTimeoutMs = browserStartReadyTimeoutMillis(nil)
	}
	if settings.StartStableWindowMs > 0 {
		a.config.Browser.StartStableWindowMs = settings.StartStableWindowMs
	} else if a.config.Browser.StartStableWindowMs <= 0 {
		a.config.Browser.StartStableWindowMs = browserStartStableWindowMillis(nil)
	}
	if err := a.config.Save(a.resolveAppPath("config.yaml")); err != nil {
		log.Error("浏览器配置保存失败", logger.F("error", err))
		return err
	}
	a.emitBrowserSettingsUpdated()
	return nil
}

// ============================================================================
// 内核管理 API
// ============================================================================

func (a *App) BrowserCoreList() []BrowserCore {
	if a.browserMgr.CoreDAO == nil {
		_ = a.refreshConfigCacheFromDiskIfPresent()
	}
	return a.browserMgr.ListCores()
}

func (a *App) BrowserCoreSave(input BrowserCoreInput) error {
	if a.browserMgr.CoreDAO == nil {
		_ = a.refreshConfigCacheFromDiskIfPresent()
	}
	if err := a.browserMgr.SaveCore(input); err != nil {
		return err
	}
	a.emitBrowserCoresUpdated()
	return nil
}

func (a *App) BrowserCoreDelete(coreId string) error {
	if a.browserMgr.CoreDAO == nil {
		_ = a.refreshConfigCacheFromDiskIfPresent()
	}
	if err := a.browserMgr.DeleteCore(coreId); err != nil {
		return err
	}
	a.emitBrowserCoresUpdated()
	return nil
}

func (a *App) BrowserCoreSetDefault(coreId string) error {
	if a.browserMgr.CoreDAO == nil {
		_ = a.refreshConfigCacheFromDiskIfPresent()
	}
	if err := a.browserMgr.SetDefaultCore(coreId); err != nil {
		return err
	}
	a.emitBrowserCoresUpdated()
	return nil
}

func (a *App) BrowserCoreValidate(corePath string) BrowserCoreValidateResult {
	return a.browserMgr.ValidateCorePath(corePath)
}

func (a *App) BrowserCoreRenamePath(corePath, newFolderName string) error {
	if a.browserMgr.CoreDAO == nil {
		_ = a.refreshConfigCacheFromDiskIfPresent()
	}
	if err := a.browserMgr.RenameCorePath(corePath, newFolderName); err != nil {
		return err
	}
	a.emitBrowserCoresUpdated()
	return nil
}

func (a *App) BrowserCoreExtendedInfo() []BrowserCoreExtendedInfo {
	a.refreshBrowserProfileConfigCacheFromStore()
	if a.browserMgr.CoreDAO == nil {
		_ = a.refreshConfigCacheFromDiskIfPresent()
	}
	return a.browserMgr.GetCoresExtendedInfo()
}

// BrowserCoreScan 重新扫描 chrome 目录，自动注册新内核
func (a *App) BrowserCoreScan() []BrowserCore {
	a.autoDetectCores()
	cores := a.browserMgr.ListCores()
	a.emitBrowserCoresUpdated()
	return cores
}

// BrowserCoreDownload 在线下载并自动解压配置内核
func (a *App) BrowserCoreDownload(coreName, url, proxyConfig string) error {
	if a.ctx == nil {
		return fmt.Errorf("app context is nil")
	}
	a.coreDownloadMu.Lock()
	if a.coreDownloadCancel != nil {
		a.coreDownloadMu.Unlock()
		return fmt.Errorf("已有内核下载正在进行，请先中断或等待完成")
	}
	downloadCtx, cancel := context.WithCancel(a.ctx)
	a.coreDownloadCancel = cancel
	a.coreDownloadSeq++
	downloadSeq := a.coreDownloadSeq
	a.coreDownloadMu.Unlock()

	go func() {
		defer a.clearCoreDownloadCancel(downloadSeq)
		a.browserMgr.DownloadAndExtractCore(downloadCtx, coreName, url, proxyConfig, a.emitCoreDownloadProgressEvent)
	}()
	return nil
}

// BrowserCoreCancelDownload 中断当前正在进行的内核下载。
func (a *App) BrowserCoreCancelDownload() error {
	a.coreDownloadMu.Lock()
	cancel := a.coreDownloadCancel
	a.coreDownloadMu.Unlock()
	if cancel == nil {
		return nil
	}
	cancel()
	return nil
}

func (a *App) clearCoreDownloadCancel(downloadSeq uint64) {
	a.coreDownloadMu.Lock()
	if a.coreDownloadSeq == downloadSeq {
		a.coreDownloadCancel = nil
	}
	a.coreDownloadMu.Unlock()
}

// ============================================================================
// 代理池 API
// ============================================================================

// ProxyValidationResult 代理验证结果
type ProxyValidationResult struct {
	Supported bool   `json:"supported"`
	ErrorMsg  string `json:"errorMsg"`
}

func (a *App) BrowserProxyList() []BrowserProxy {
	if a.browserMgr.ProxyDAO != nil {
		if list, err := a.browserMgr.ProxyDAO.List(); err == nil {
			a.config.Browser.Proxies = append([]BrowserProxy{}, list...)
			return list
		}
	}
	_ = a.refreshConfigCacheFromDiskIfPresent()
	return append([]BrowserProxy{}, a.config.Browser.Proxies...)
}

// BrowserProxyListGroups 获取所有代理分组名称
func (a *App) BrowserProxyListGroups() []string {
	if a.browserMgr.ProxyDAO != nil {
		if groups, err := a.browserMgr.ProxyDAO.ListGroups(); err == nil {
			return groups
		}
	}
	return nil
}

// BrowserProxyListByGroup 按分组名称查询代理
func (a *App) BrowserProxyListByGroup(groupName string) []BrowserProxy {
	if a.browserMgr.ProxyDAO != nil {
		if list, err := a.browserMgr.ProxyDAO.ListByGroup(groupName); err == nil {
			return list
		}
	}
	_ = a.refreshConfigCacheFromDiskIfPresent()
	// 降级：内存过滤
	var result []BrowserProxy
	for _, p := range a.config.Browser.Proxies {
		if p.GroupName == groupName {
			result = append(result, p)
		}
	}
	return result
}

// ValidateProxyConfig 验证代理配置是否支持
func (a *App) ValidateProxyConfig(proxyConfig string, proxyId string) ProxyValidationResult {
	proxies := a.getLatestProxies()
	supported, errorMsg := proxy.ValidateProxyConfig(proxyConfig, proxies, proxyId)
	return ProxyValidationResult{
		Supported: supported,
		ErrorMsg:  errorMsg,
	}
}

// ProxyTestResult 代理测试结果
type ProxyTestResult struct {
	ProxyId   string `json:"proxyId"`
	Ok        bool   `json:"ok"`
	LatencyMs int64  `json:"latencyMs"`
	Error     string `json:"error"`
}

// ProxyPreviewTestInput 导入预览阶段的临时代理测试输入。
type ProxyPreviewTestInput struct {
	ProxyId     string `json:"proxyId"`
	ProxyConfig string `json:"proxyConfig"`
}

// ProxyIPHealthResult 代理出口 IP 健康信息（透传第三方接口结果）
type ProxyIPHealthResult struct {
	ProxyId        string                 `json:"proxyId"`
	Ok             bool                   `json:"ok"`
	Source         string                 `json:"source"`
	Error          string                 `json:"error"`
	IP             string                 `json:"ip"`
	FraudScore     int64                  `json:"fraudScore"`
	IsResidential  bool                   `json:"isResidential"`
	IsBroadcast    bool                   `json:"isBroadcast"`
	Country        string                 `json:"country"`
	Region         string                 `json:"region"`
	City           string                 `json:"city"`
	AsOrganization string                 `json:"asOrganization"`
	RawData        map[string]interface{} `json:"rawData"`
	UpdatedAt      string                 `json:"updatedAt"`
}

// TestProxyConnectivity 测试代理连通性
func (a *App) TestProxyConnectivity(proxyId string, proxyConfig string) ProxyTestResult {
	proxies := a.getLatestProxies()
	r := proxy.TestConnectivity(proxyId, proxyConfig, proxies, nil)
	return ProxyTestResult{ProxyId: r.ProxyId, Ok: r.Ok, LatencyMs: r.LatencyMs, Error: r.Error}
}

// TestProxyRealConnectivity 通过真实 HTTP 请求测试代理连通性（Wails 绑定）
// 参考 Clash URLTest 策略：多 URL fallback + 复用桥接 + TCP ping 降级
func (a *App) TestProxyRealConnectivity(proxyId string) ProxyTestResult {
	proxies := a.getLatestProxies()
	r := proxy.SpeedTestWithClash(proxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashBridgeMgr, nil)
	return ProxyTestResult{ProxyId: r.ProxyId, Ok: r.Ok, LatencyMs: r.LatencyMs, Error: r.Error}
}

// BrowserProxyTestSpeed 手动触发单个代理测速并持久化结果
func (a *App) BrowserProxyTestSpeed(proxyId string) ProxyTestResult {
	proxies := a.getLatestProxies()
	r := proxy.SpeedTestWithClash(proxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashBridgeMgr, nil)
	if a.browserMgr.ProxyDAO != nil {
		testedAt := time.Now().Format(time.RFC3339)
		if err := a.browserMgr.ProxyDAO.UpdateSpeedResult(proxyId, r.Ok, r.LatencyMs, testedAt); err == nil {
			a.emitBrowserProxiesUpdated()
		}
	}
	return ProxyTestResult{ProxyId: r.ProxyId, Ok: r.Ok, LatencyMs: r.LatencyMs, Error: r.Error}
}

// BrowserProxyBatchTestSpeed 批量并发测速，concurrency 控制并发数（默认 20）
func (a *App) BrowserProxyBatchTestSpeed(proxyIds []string, concurrency int) []ProxyTestResult {
	if len(proxyIds) == 0 {
		return []ProxyTestResult{}
	}
	if concurrency <= 0 {
		concurrency = 20
	}
	if concurrency > len(proxyIds) {
		concurrency = len(proxyIds)
	}
	proxies := a.getLatestProxies()
	results := make([]ProxyTestResult, len(proxyIds))
	type speedJob struct {
		Idx     int
		ProxyId string
	}
	jobs := make(chan speedJob, len(proxyIds))
	var wg sync.WaitGroup
	var persistedMu sync.Mutex
	persistedAny := false

	// 固定大小 worker 池，避免大量代理时创建过多 goroutine
	for worker := 0; worker < concurrency; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				r := proxy.SpeedTestWithClash(job.ProxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashBridgeMgr, nil)
				if a.browserMgr.ProxyDAO != nil {
					testedAt := time.Now().Format(time.RFC3339)
					if err := a.browserMgr.ProxyDAO.UpdateSpeedResult(job.ProxyId, r.Ok, r.LatencyMs, testedAt); err == nil {
						persistedMu.Lock()
						persistedAny = true
						persistedMu.Unlock()
					}
				}
				result := ProxyTestResult{ProxyId: r.ProxyId, Ok: r.Ok, LatencyMs: r.LatencyMs, Error: r.Error}
				results[job.Idx] = result

				// 实时推送单个结果到前端
				if a.ctx != nil {
					a.emitProxyTestResultEvent("proxy:speed:result", result)
				}
			}
		}()
	}

	for i, pid := range proxyIds {
		jobs <- speedJob{Idx: i, ProxyId: pid}
	}
	close(jobs)

	wg.Wait()
	if persistedAny {
		a.emitBrowserProxiesUpdated()
	}
	return results
}

// BrowserProxyPreviewBatchTestSpeed 批量测试导入预览里的临时代理，不持久化结果。
func (a *App) BrowserProxyPreviewBatchTestSpeed(items []ProxyPreviewTestInput, concurrency int) []ProxyTestResult {
	if len(items) == 0 {
		return []ProxyTestResult{}
	}
	if concurrency <= 0 {
		concurrency = 20
	}
	if concurrency > len(items) {
		concurrency = len(items)
	}

	proxies := append([]config.BrowserProxy{}, a.getLatestProxies()...)
	proxies = append(proxies, previewInputsToBrowserProxies(items)...)
	results := make([]ProxyTestResult, len(items))
	type speedJob struct {
		Idx     int
		ProxyId string
	}
	jobs := make(chan speedJob, len(items))
	var wg sync.WaitGroup

	for worker := 0; worker < concurrency; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				r := proxy.SpeedTestWithClash(job.ProxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashBridgeMgr, nil)
				result := ProxyTestResult{ProxyId: r.ProxyId, Ok: r.Ok, LatencyMs: r.LatencyMs, Error: r.Error}
				results[job.Idx] = result
				if a.ctx != nil {
					a.emitProxyTestResultEvent("proxy:preview:speed:result", result)
				}
			}
		}()
	}

	for i, item := range items {
		jobs <- speedJob{Idx: i, ProxyId: strings.TrimSpace(item.ProxyId)}
	}
	close(jobs)

	wg.Wait()
	return results
}

// BrowserProxyCheckIPHealth 检测单个代理的出口 IP 健康信息（通过 IPPure 接口）
func (a *App) BrowserProxyCheckIPHealth(proxyId string) ProxyIPHealthResult {
	proxies := a.getLatestProxies()
	data, err := proxy.FetchIPPureInfoWithClash(proxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashBridgeMgr)
	result := buildProxyIPHealthResult(proxyId, data, err)
	if a.persistProxyIPHealthResult(result) {
		a.emitBrowserProxiesUpdated()
	}
	if a.ctx != nil {
		a.emitProxyIPHealthResultEvent("proxy:iphealth:result", result)
	}
	return result
}

// BrowserProxyBatchCheckIPHealth 批量并发检测代理出口 IP 健康信息
func (a *App) BrowserProxyBatchCheckIPHealth(proxyIds []string, concurrency int) []ProxyIPHealthResult {
	if len(proxyIds) == 0 {
		return []ProxyIPHealthResult{}
	}
	if concurrency <= 0 {
		concurrency = 10
	}
	if concurrency > len(proxyIds) {
		concurrency = len(proxyIds)
	}

	proxies := a.getLatestProxies()
	results := make([]ProxyIPHealthResult, len(proxyIds))
	type healthJob struct {
		Idx     int
		ProxyId string
	}
	jobs := make(chan healthJob, len(proxyIds))
	var wg sync.WaitGroup
	var persistedMu sync.Mutex
	persistedAny := false

	for worker := 0; worker < concurrency; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				data, err := proxy.FetchIPPureInfoWithClash(job.ProxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashBridgeMgr)
				result := buildProxyIPHealthResult(job.ProxyId, data, err)
				if a.persistProxyIPHealthResult(result) {
					persistedMu.Lock()
					persistedAny = true
					persistedMu.Unlock()
				}
				results[job.Idx] = result
				if a.ctx != nil {
					a.emitProxyIPHealthResultEvent("proxy:iphealth:result", result)
				}
			}
		}()
	}

	for i, pid := range proxyIds {
		jobs <- healthJob{Idx: i, ProxyId: pid}
	}
	close(jobs)

	wg.Wait()
	if persistedAny {
		a.emitBrowserProxiesUpdated()
	}
	return results
}

// BrowserProxyPreviewBatchCheckIPHealth 批量检测导入预览里的临时代理出口 IP，不持久化结果。
func (a *App) BrowserProxyPreviewBatchCheckIPHealth(items []ProxyPreviewTestInput, concurrency int) []ProxyIPHealthResult {
	if len(items) == 0 {
		return []ProxyIPHealthResult{}
	}
	if concurrency <= 0 {
		concurrency = 10
	}
	if concurrency > len(items) {
		concurrency = len(items)
	}

	proxies := append([]config.BrowserProxy{}, a.getLatestProxies()...)
	proxies = append(proxies, previewInputsToBrowserProxies(items)...)
	results := make([]ProxyIPHealthResult, len(items))
	type healthJob struct {
		Idx     int
		ProxyId string
	}
	jobs := make(chan healthJob, len(items))
	var wg sync.WaitGroup

	for worker := 0; worker < concurrency; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				data, err := proxy.FetchIPPureInfoWithClash(job.ProxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashBridgeMgr)
				result := buildProxyIPHealthResult(job.ProxyId, data, err)
				results[job.Idx] = result
				if a.ctx != nil {
					a.emitProxyIPHealthResultEvent("proxy:preview:iphealth:result", result)
				}
			}
		}()
	}

	for i, item := range items {
		jobs <- healthJob{Idx: i, ProxyId: strings.TrimSpace(item.ProxyId)}
	}
	close(jobs)

	wg.Wait()
	return results
}

func previewInputsToBrowserProxies(items []ProxyPreviewTestInput) []config.BrowserProxy {
	proxies := make([]config.BrowserProxy, 0, len(items))
	for _, item := range items {
		proxyId := strings.TrimSpace(item.ProxyId)
		if proxyId == "" {
			continue
		}
		proxies = append(proxies, config.BrowserProxy{
			ProxyId:     proxyId,
			ProxyConfig: strings.TrimSpace(item.ProxyConfig),
		})
	}
	return proxies
}

func buildProxyIPHealthResult(proxyId string, data map[string]interface{}, err error) ProxyIPHealthResult {
	if err != nil {
		return ProxyIPHealthResult{
			ProxyId:   proxyId,
			Ok:        false,
			Source:    "ippure",
			Error:     err.Error(),
			RawData:   map[string]interface{}{},
			UpdatedAt: time.Now().Format(time.RFC3339),
		}
	}

	if data == nil {
		data = map[string]interface{}{}
	}

	return ProxyIPHealthResult{
		ProxyId:        proxyId,
		Ok:             true,
		Source:         "ippure",
		Error:          "",
		IP:             mapString(data, "ip"),
		FraudScore:     mapInt64(data, "fraudScore"),
		IsResidential:  mapBool(data, "isResidential"),
		IsBroadcast:    mapBool(data, "isBroadcast"),
		Country:        mapString(data, "country"),
		Region:         mapString(data, "region"),
		City:           mapString(data, "city"),
		AsOrganization: mapString(data, "asOrganization"),
		RawData:        data,
		UpdatedAt:      time.Now().Format(time.RFC3339),
	}
}

func (a *App) persistProxyIPHealthResult(result ProxyIPHealthResult) bool {
	if a.browserMgr.ProxyDAO == nil {
		return false
	}
	payload, err := json.Marshal(result)
	if err != nil {
		return false
	}
	return a.browserMgr.ProxyDAO.UpdateIPHealthResult(result.ProxyId, string(payload)) == nil
}

func mapString(m map[string]interface{}, key string) string {
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	switch s := v.(type) {
	case string:
		return s
	default:
		return fmt.Sprint(v)
	}
}

func mapInt64(m map[string]interface{}, key string) int64 {
	v, ok := m[key]
	if !ok || v == nil {
		return 0
	}
	switch n := v.(type) {
	case int:
		return int64(n)
	case int8:
		return int64(n)
	case int16:
		return int64(n)
	case int32:
		return int64(n)
	case int64:
		return n
	case uint:
		return int64(n)
	case uint8:
		return int64(n)
	case uint16:
		return int64(n)
	case uint32:
		return int64(n)
	case uint64:
		return int64(n)
	case float32:
		return int64(n)
	case float64:
		return int64(n)
	case json.Number:
		if iv, err := n.Int64(); err == nil {
			return iv
		}
		if fv, err := n.Float64(); err == nil {
			return int64(fv)
		}
	case string:
		if iv, err := strconv.ParseInt(n, 10, 64); err == nil {
			return iv
		}
		if fv, err := strconv.ParseFloat(n, 64); err == nil {
			return int64(fv)
		}
	}
	return 0
}

func mapBool(m map[string]interface{}, key string) bool {
	v, ok := m[key]
	if !ok || v == nil {
		return false
	}
	switch b := v.(type) {
	case bool:
		return b
	case string:
		return strings.EqualFold(b, "true") || b == "1"
	case int:
		return b != 0
	case int64:
		return b != 0
	case float64:
		return b != 0
	}
	return false
}

// getLatestProxies 获取最新的代理列表，优先从数据库读取
func (a *App) getLatestProxies() []BrowserProxy {
	if a.browserMgr.ProxyDAO != nil {
		if list, err := a.browserMgr.ProxyDAO.List(); err == nil {
			a.config.Browser.Proxies = append([]BrowserProxy{}, list...)
			return list
		}
	}
	_ = a.refreshConfigCacheFromDiskIfPresent()
	return append([]BrowserProxy{}, a.config.Browser.Proxies...)
}

func (a *App) SaveBrowserProxies(proxies []BrowserProxy) error {
	log := logger.New("Browser")
	normalized := make([]BrowserProxy, 0, len(proxies))
	for i, item := range proxies {
		proxyName := strings.TrimSpace(item.ProxyName)
		proxyConfig := strings.TrimSpace(item.ProxyConfig)
		if proxyName == "" || proxyConfig == "" {
			continue
		}
		proxyId := strings.TrimSpace(item.ProxyId)
		if proxyId == "" {
			proxyId = generateUUID()
		}
		sourceURL := strings.TrimSpace(item.SourceURL)
		sourceID := strings.TrimSpace(item.SourceID)
		sourceNamePrefix := strings.TrimSpace(item.SourceNamePrefix)
		sourceFilterJSON := strings.TrimSpace(item.SourceFilterJSON)
		sourceLastRefreshAt := strings.TrimSpace(item.SourceLastRefreshAt)
		sourceRefreshIntervalM := item.SourceRefreshIntervalM
		if sourceRefreshIntervalM < 0 {
			sourceRefreshIntervalM = 0
		}
		if sourceRefreshIntervalM > 24*60 {
			sourceRefreshIntervalM = 24 * 60
		}
		sourceAutoRefresh := item.SourceAutoRefresh && sourceURL != ""
		if sourceAutoRefresh && sourceRefreshIntervalM <= 0 {
			sourceRefreshIntervalM = 60
		}
		if !sourceAutoRefresh {
			sourceRefreshIntervalM = 0
		}
		if sourceURL == "" {
			sourceID = ""
			sourceNamePrefix = ""
			sourceFilterJSON = ""
			sourceLastRefreshAt = ""
			sourceAutoRefresh = false
			sourceRefreshIntervalM = 0
		}
		normalized = append(normalized, BrowserProxy{
			ProxyId:                proxyId,
			ProxyName:              proxyName,
			ProxyConfig:            proxyConfig,
			DnsServers:             strings.TrimSpace(item.DnsServers),
			GroupName:              strings.TrimSpace(item.GroupName),
			SourceID:               sourceID,
			SourceURL:              sourceURL,
			SourceNamePrefix:       sourceNamePrefix,
			SourceFilterJSON:       sourceFilterJSON,
			SourceAutoRefresh:      sourceAutoRefresh,
			SourceRefreshIntervalM: sourceRefreshIntervalM,
			SourceLastRefreshAt:    sourceLastRefreshAt,
			SortOrder:              i,
		})
	}

	// 确保内置代理始终存在（直连 + 本地代理）
	builtins := []BrowserProxy{
		{ProxyId: "__direct__", ProxyName: "直连（不走代理）", ProxyConfig: "direct://"},
		{ProxyId: "__local__", ProxyName: "本地代理", ProxyConfig: "http://127.0.0.1:7890"},
	}
	for _, b := range builtins {
		found := false
		for _, p := range normalized {
			if p.ProxyId == b.ProxyId {
				found = true
				break
			}
		}
		if !found {
			normalized = append([]BrowserProxy{b}, normalized...)
		}
	}

	a.config.Browser.Proxies = normalized

	// 优先写入 SQLite
	if a.browserMgr.ProxyDAO != nil {
		existing, err := a.browserMgr.ProxyDAO.List()
		if err != nil {
			log.Error("查询代理列表失败", logger.F("error", err))
			return err
		}
		nextIDs := make(map[string]struct{}, len(normalized))
		for _, p := range normalized {
			nextIDs[p.ProxyId] = struct{}{}
		}
		deletedCount := 0
		for _, existingProxy := range existing {
			proxyId := strings.TrimSpace(existingProxy.ProxyId)
			if proxyId == "" {
				continue
			}
			if _, ok := nextIDs[proxyId]; ok {
				continue
			}
			if err := a.browserMgr.ProxyDAO.Delete(proxyId); err != nil {
				log.Error("删除已移除代理失败", logger.F("proxy_id", proxyId), logger.F("error", err))
				return err
			}
			deletedCount++
		}
		for _, p := range normalized {
			if err := a.browserMgr.ProxyDAO.Upsert(p); err != nil {
				log.Error("代理保存失败", logger.F("proxy_id", p.ProxyId), logger.F("error", err))
				return err
			}
		}
		log.Info("代理列表已差异保存到数据库", logger.F("count", len(normalized)), logger.F("deleted", deletedCount))
		a.reconcileProfileProxyBindings()
		a.emitBrowserProxiesUpdated()
		a.emitProfileDataUpdated()
		return nil
	}

	// 降级：写入 proxies.yaml
	if err := config.SaveProxies(a.resolveAppPath("proxies.yaml"), normalized); err != nil {
		log.Error("代理列表保存失败", logger.F("error", err))
		return err
	}
	a.reconcileProfileProxyBindings()
	a.emitBrowserProxiesUpdated()
	a.emitProfileDataUpdated()
	return nil
}

// ============================================================================
// 文件系统 API
// ============================================================================

// OpenUserDataDir 在资源管理器中打开用户数据目录
func (a *App) OpenUserDataDir(userDataDir string) error {
	log := logger.New("Browser")
	if err := a.refreshConfigCacheFromDiskIfPresent(); err != nil {
		log.Error("浏览器配置重载失败", logger.F("error", err))
		return fmt.Errorf("浏览器配置重载失败: %w", err)
	}

	// 解析完整路径
	userDataDir = strings.TrimSpace(userDataDir)
	if userDataDir == "" {
		return fmt.Errorf("用户数据目录不能为空")
	}

	var fullPath string
	if filepath.IsAbs(userDataDir) {
		fullPath = userDataDir
	} else {
		root := strings.TrimSpace(a.config.Browser.UserDataRoot)
		if root == "" {
			root = "data"
		}
		root = a.resolveAppPath(root)
		fullPath = filepath.Join(root, userDataDir)
	}

	// 检查目录是否存在
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		// 目录不存在，尝试创建
		if err := os.MkdirAll(fullPath, 0755); err != nil {
			log.Error("创建用户数据目录失败", logger.F("path", fullPath), logger.F("error", err))
			return fmt.Errorf("创建目录失败: %v", err)
		}
	}

	// 获取绝对路径
	absPath, err := filepath.Abs(fullPath)
	if err != nil {
		log.Error("获取绝对路径失败", logger.F("path", fullPath), logger.F("error", err))
		return err
	}

	if err := openPathInFileManager(absPath); err != nil {
		log.Error("打开资源管理器失败", logger.F("path", absPath), logger.F("error", err))
		return fmt.Errorf("打开目录失败 %s: %w", absPath, err)
	}

	log.Info("已打开用户数据目录", logger.F("path", absPath))
	return nil
}

// OpenCorePath 在资源管理器中打开内核路径
func (a *App) OpenCorePath(corePath string) error {
	log := logger.New("Browser")

	corePath = strings.TrimSpace(corePath)
	if corePath == "" {
		return fmt.Errorf("内核路径不能为空")
	}

	var fullPath string
	if filepath.IsAbs(corePath) {
		fullPath = corePath
	} else {
		fullPath = a.resolveAppPath(corePath)
	}

	// 检查目录是否存在
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return fmt.Errorf("路径不存在: %s", fullPath)
	}

	// 获取绝对路径
	absPath, err := filepath.Abs(fullPath)
	if err != nil {
		log.Error("获取绝对路径失败", logger.F("path", fullPath), logger.F("error", err))
		return err
	}

	if err := openPathInFileManager(absPath); err != nil {
		log.Error("打开资源管理器失败", logger.F("path", absPath), logger.F("error", err))
		return fmt.Errorf("打开路径失败 %s: %w", absPath, err)
	}

	log.Info("已打开内核路径", logger.F("path", absPath))
	return nil
}

// openPathInFileManager 调用系统文件管理器打开路径。
// Windows 下不能复用 hideWindow，否则可能导致资源管理器窗口被隐藏。
func openPathInFileManager(absPath string) error {
	info, err := os.Stat(absPath)
	if err != nil {
		return err
	}

	switch goruntime.GOOS {
	case "windows":
		if info.IsDir() {
			return startWindowsExplorer(absPath)
		}
		return startWindowsExplorer("/select," + absPath)
	case "darwin":
		if info.IsDir() {
			return exec.Command("open", absPath).Start()
		}
		return exec.Command("open", "-R", absPath).Start()
	default:
		target := absPath
		if !info.IsDir() {
			target = filepath.Dir(absPath)
		}
		return exec.Command("xdg-open", target).Start()
	}
}

func startWindowsExplorer(args ...string) error {
	explorerPath := windowsExplorerPath()
	if err := exec.Command(explorerPath, args...).Start(); err != nil {
		if explorerPath != "explorer.exe" {
			if fallbackErr := exec.Command("explorer.exe", args...).Start(); fallbackErr == nil {
				return nil
			}
		}
		return err
	}
	return nil
}

func windowsExplorerPath() string {
	for _, envName := range []string{"WINDIR", "SystemRoot"} {
		root := strings.TrimSpace(os.Getenv(envName))
		if root == "" {
			continue
		}
		candidate := filepath.Join(root, "explorer.exe")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	const defaultExplorer = `C:\Windows\explorer.exe`
	if _, err := os.Stat(defaultExplorer); err == nil {
		return defaultExplorer
	}
	return "explorer.exe"
}

// ============================================================================
// 数据迁移
// ============================================================================

// migrateToSQLite 一次性迁移：若 SQLite 表为空则从旧文件导入数据，或初始化默认数据
// 迁移顺序：cores → proxies → profiles → bookmarks
func (a *App) migrateToSQLite() {
	log := logger.New("Migration")

	// 迁移/初始化内核
	if cores, err := a.browserMgr.CoreDAO.List(); err == nil && len(cores) == 0 {
		// 优先从 config.yaml 迁移
		if len(a.config.Browser.Cores) > 0 {
			for _, c := range a.config.Browser.Cores {
				if err := a.browserMgr.CoreDAO.Upsert(c); err != nil {
					log.Error("内核迁移失败", logger.F("core_id", c.CoreId), logger.F("error", err))
				}
			}
			log.Info("内核数据已迁移", logger.F("count", len(a.config.Browser.Cores)))
		} else {
			// 初始化默认内核（自动检测会补充）
			log.Info("内核表为空，将通过自动检测初始化")
		}
	}

	// 迁移/初始化代理
	if proxies, err := a.browserMgr.ProxyDAO.List(); err == nil && len(proxies) == 0 {
		var srcProxies []browser.Proxy
		// 优先 proxies.yaml，其次 config.yaml
		if loaded, err := config.LoadProxies(a.resolveAppPath("proxies.yaml")); err == nil && len(loaded) > 0 {
			srcProxies = loaded
		} else if len(a.config.Browser.Proxies) > 0 {
			srcProxies = a.config.Browser.Proxies
		} else {
			// 初始化默认代理
			srcProxies = []browser.Proxy{
				{ProxyId: "__direct__", ProxyName: "直连（不走代理）", ProxyConfig: "direct://"},
				{ProxyId: "__local__", ProxyName: "本地代理", ProxyConfig: "http://127.0.0.1:7890"},
			}
			log.Info("代理表为空，初始化默认代理")
		}
		for _, p := range srcProxies {
			if err := a.browserMgr.ProxyDAO.Upsert(p); err != nil {
				log.Error("代理迁移失败", logger.F("proxy_id", p.ProxyId), logger.F("error", err))
			}
		}
		if len(srcProxies) > 0 {
			log.Info("代理数据已初始化", logger.F("count", len(srcProxies)))
		}
	}

	// 迁移实例配置（如果为空则自动创建一个默认实例）
	if profiles, err := a.browserMgr.ProfileDAO.List(); err == nil && len(profiles) == 0 {
		if len(a.config.Browser.Profiles) > 0 {
			for _, pc := range a.config.Browser.Profiles {
				coreId := strings.TrimSpace(pc.CoreId)
				if strings.EqualFold(coreId, "default") {
					coreId = ""
				}
				p := &browser.Profile{
					ProfileId:          pc.ProfileId,
					ProfileName:        pc.ProfileName,
					UserDataDir:        pc.UserDataDir,
					CoreId:             coreId,
					FingerprintArgs:    pc.FingerprintArgs,
					ProxyId:            pc.ProxyId,
					ProxyConfig:        pc.ProxyConfig,
					ProxyBindSourceID:  pc.ProxyBindSourceID,
					ProxyBindSourceURL: pc.ProxyBindSourceURL,
					ProxyBindName:      pc.ProxyBindName,
					ProxyBindUpdatedAt: pc.ProxyBindUpdatedAt,
					LaunchArgs:         pc.LaunchArgs,
					Tags:               pc.Tags,
					Keywords:           pc.Keywords,
					GroupId:            strings.TrimSpace(pc.GroupId),
					CreatedAt:          pc.CreatedAt,
					UpdatedAt:          pc.UpdatedAt,
				}
				if err := a.browserMgr.ProfileDAO.Upsert(p); err != nil {
					log.Error("实例迁移失败", logger.F("profile_id", pc.ProfileId), logger.F("error", err))
				}
			}
			log.Info("实例数据已迁移", logger.F("count", len(a.config.Browser.Profiles)))
		} else {
			log.Info("实例表为空，自动创建默认实例")
			defaultProfile := &browser.Profile{
				ProfileId:       generateUUID(),
				ProfileName:     "默认实例",
				UserDataDir:     "default",
				CoreId:          "",
				FingerprintArgs: a.config.Browser.DefaultFingerprintArgs,
				LaunchArgs:      a.config.Browser.DefaultLaunchArgs,
				Tags:            []string{"默认"},
				ProxyId:         a.config.Browser.DefaultProxy,
				CreatedAt:       time.Now().Format(time.RFC3339),
				UpdatedAt:       time.Now().Format(time.RFC3339),
			}
			if err := a.browserMgr.ProfileDAO.Upsert(defaultProfile); err != nil {
				log.Error("自动创建默认实例失败", logger.F("error", err))
			}
		}
	}

	// 迁移/初始化书签
	if bookmarks, err := a.browserMgr.BookmarkDAO.List(); err == nil && len(bookmarks) == 0 {
		src := a.config.Browser.DefaultBookmarks
		if len(src) == 0 {
			// 初始化默认书签
			src = []config.BrowserBookmark{
				{Name: "Google", URL: "https://www.google.com/"},
				{Name: "Gmail", URL: "https://mail.google.com/"},
				{Name: "Claude", URL: "https://claude.ai/"},
				{Name: "ChatGPT", URL: "https://chatgpt.com/"},
				{Name: "YouTube", URL: "https://www.youtube.com/"},
			}
		}
		if err := a.browserMgr.BookmarkDAO.ReplaceAll(src); err != nil {
			log.Error("书签迁移失败", logger.F("error", err))
		} else {
			log.Info("书签数据已迁移", logger.F("count", len(src)))
		}
	}
}
