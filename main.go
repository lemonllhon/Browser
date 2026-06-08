package main

import (
	"ant-chrome/backend"
	"context"
	"embed"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"gopkg.in/yaml.v3"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/config.yml
var buildConfigYAML []byte

//go:embed build/appicon.png
var appIcon []byte

// appBuildVersion is injected by release builds with:
// go build -ldflags "-X main.appBuildVersion=0.0.87"
var appBuildVersion string

var appRoot string
var isDevMode bool

type App struct {
	*backend.App
}

type wailsBuildConfig struct {
	Info struct {
		Version string `yaml:"version"`
	} `yaml:"info"`
}

func normalizeStartupWindowSize(width int, height int) (int, int) {
	const (
		defaultWidth  = 1180
		defaultHeight = 720
	)
	if width <= 0 {
		width = defaultWidth
	}
	if height <= 0 {
		height = defaultHeight
	}
	return width, height
}

func clampStartupWindowSize(width int, height int, minWidth int, minHeight int) (int, int) {
	const (
		fallbackMinWidth  = 900
		fallbackMinHeight = 560
		maxWidth          = 1360
		maxHeight         = 860
	)
	if minWidth <= 0 {
		minWidth = fallbackMinWidth
	}
	if minHeight <= 0 {
		minHeight = fallbackMinHeight
	}
	if width < minWidth {
		width = minWidth
	}
	if height < minHeight {
		height = minHeight
	}
	if width > maxWidth {
		width = maxWidth
	}
	if height > maxHeight {
		height = maxHeight
	}
	return width, height
}

func envFlagEnabled(name string) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(name)))
	switch value {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func normalizeBuildVersion(value string) string {
	version := strings.TrimSpace(value)
	if version == "" || strings.EqualFold(version, "unknown") {
		return ""
	}
	if len(version) > 1 && (version[0] == 'v' || version[0] == 'V') {
		version = strings.TrimSpace(version[1:])
	}
	return version
}

func resolveBuildVersion() string {
	if version := normalizeBuildVersion(appBuildVersion); version != "" {
		return version
	}
	if version := normalizeBuildVersion(os.Getenv("TRACE_BROWSER_VERSION")); version != "" {
		return version
	}

	var cfg wailsBuildConfig
	if err := yaml.Unmarshal(buildConfigYAML, &cfg); err != nil {
		log.Printf("解析 build/config.yml 版本信息失败: %v", err)
		return "dev"
	}

	version := normalizeBuildVersion(cfg.Info.Version)
	if version == "" {
		log.Printf("build/config.yml 未配置 info.version，回退为 dev")
		return "dev"
	}

	return version
}

func NewApp(appRoot, version string) *App {
	return &App{App: backend.NewApp(appRoot, version)}
}

func initBootstrapLogFile(root string) *os.File {
	logPath := backend.ResolveRuntimePath(root, filepath.Join("logs", "app.log"))
	if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
		return nil
	}
	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil
	}
	log.SetOutput(file)
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.Printf("Trace Browser bootstrap log initialized: %s", logPath)
	return file
}

func scheduleProtoConfigInjection(window application.Window, protoIPC *backend.Wails3ProtoIPC, label string, startupDebugEnabled bool) {
	if protoIPC == nil || window == nil {
		return
	}
	protoIPC.InjectConfig(window)
	for _, delay := range []time.Duration{
		120 * time.Millisecond,
		350 * time.Millisecond,
		900 * time.Millisecond,
		1800 * time.Millisecond,
		3500 * time.Millisecond,
	} {
		delay := delay
		go func() {
			time.Sleep(delay)
			protoIPC.InjectConfig(window)
			if startupDebugEnabled {
				log.Printf("Wails3 Proto IPC 配置注入重试完成: window=%s delay=%s", label, delay.String())
			}
		}()
	}
}

func registerProtoConfigInjection(window application.Window, protoIPC *backend.Wails3ProtoIPC, label string, startupDebugEnabled bool) {
	if protoIPC == nil || window == nil {
		return
	}
	scheduleProtoConfigInjection(window, protoIPC, label, startupDebugEnabled)
	window.OnWindowEvent(events.Common.WindowRuntimeReady, func(event *application.WindowEvent) {
		if startupDebugEnabled {
			log.Printf("Wails3 WindowRuntimeReady 已触发，注入 Proto IPC 配置: window=%s", label)
		}
		scheduleProtoConfigInjection(window, protoIPC, label, startupDebugEnabled)
	})
	window.OnWindowEvent(events.Common.WindowShow, func(event *application.WindowEvent) {
		scheduleProtoConfigInjection(window, protoIPC, label, startupDebugEnabled)
	})
}

const (
	wails3WindowSyncToolbarName           = "window-sync-toolbar"
	wails3WindowSyncToolbarExpandedWidth  = 900
	wails3WindowSyncToolbarExpandedHeight = 430
	wails3WindowSyncPromptName            = "window-sync-master-closed-prompt"
	wails3WindowSyncPromptWidth           = 480
	wails3WindowSyncPromptHeight          = 330
)

type wails3WindowSyncToolbarAdapter struct {
	mu                  sync.Mutex
	wailsApp            *application.App
	protoIPC            *backend.Wails3ProtoIPC
	window              application.Window
	width               int
	height              int
	startupDebugEnabled bool
}

type wails3WindowSyncPromptAdapter struct {
	mu                  sync.Mutex
	wailsApp            *application.App
	protoIPC            *backend.Wails3ProtoIPC
	window              application.Window
	startupDebugEnabled bool
}

func (a *wails3WindowSyncPromptAdapter) ShowMasterClosedPrompt(app *backend.App, prompt backend.WindowSyncMasterClosedPrompt) bool {
	if a == nil || a.wailsApp == nil || app == nil || len(prompt.RemainingProfileIds) == 0 {
		return false
	}

	a.mu.Lock()
	if a.window != nil {
		window := a.window
		a.mu.Unlock()
		window.Show()
		window.Focus()
		return true
	}

	js := ""
	if a.protoIPC != nil {
		js = a.protoIPC.ConfigScript()
	}
	promptWindow := a.wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             wails3WindowSyncPromptName,
		Title:            "窗口同步已停止",
		Width:            wails3WindowSyncPromptWidth,
		Height:           wails3WindowSyncPromptHeight,
		MinWidth:         wails3WindowSyncPromptWidth,
		MinHeight:        wails3WindowSyncPromptHeight,
		MaxWidth:         wails3WindowSyncPromptWidth,
		MaxHeight:        wails3WindowSyncPromptHeight,
		DisableResize:    true,
		Frameless:        true,
		AlwaysOnTop:      true,
		BackgroundType:   application.BackgroundTypeTransparent,
		BackgroundColour: application.NewRGBA(245, 247, 250, 0),
		InitialPosition:  application.WindowCentered,
		URL:              windowSyncMasterClosedPromptURL(prompt),
		JS:               js,
		Windows: application.WindowsWindow{
			DisableFramelessWindowDecorations: true,
		},
		MinimiseButtonState:   application.ButtonHidden,
		MaximiseButtonState:   application.ButtonHidden,
		CloseButtonState:      application.ButtonHidden,
		FullscreenButtonState: application.ButtonHidden,
	})
	promptWindow.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		a.mu.Lock()
		if a.window == promptWindow {
			a.window = nil
		}
		a.mu.Unlock()
	})
	if a.protoIPC != nil {
		registerProtoConfigInjection(promptWindow, a.protoIPC, wails3WindowSyncPromptName, a.startupDebugEnabled)
	}
	a.window = promptWindow
	a.mu.Unlock()

	promptWindow.Center()
	promptWindow.SetAlwaysOnTop(true)
	promptWindow.Show()
	if a.protoIPC != nil {
		scheduleProtoConfigInjection(promptWindow, a.protoIPC, wails3WindowSyncPromptName, a.startupDebugEnabled)
	}
	if a.startupDebugEnabled {
		log.Printf("Wails3 窗口同步停止提示已创建为独立多窗口: %s", wails3WindowSyncPromptName)
	}
	return true
}

func windowSyncMasterClosedPromptURL(prompt backend.WindowSyncMasterClosedPrompt) string {
	values := url.Values{}
	values.Set("windowSyncPrompt", "master-closed")
	values.Set("profileId", strings.TrimSpace(prompt.ProfileId))
	values.Set("profileName", strings.TrimSpace(prompt.ProfileName))
	values.Set("reason", strings.TrimSpace(prompt.Reason))
	for _, profileId := range prompt.RemainingProfileIds {
		if trimmed := strings.TrimSpace(profileId); trimmed != "" {
			values.Add("remainingProfileIds", trimmed)
		}
	}
	for _, profileName := range prompt.RemainingProfileNames {
		values.Add("remainingProfileNames", strings.TrimSpace(profileName))
	}
	return "/?" + values.Encode()
}

func (a *wails3WindowSyncToolbarAdapter) Show(_ *backend.App, state *backend.WindowSyncState) error {
	if a == nil || state == nil || !state.Active {
		return nil
	}
	if a.protoIPC == nil {
		log.Printf("Wails3 Proto IPC 未初始化，窗口同步工具栏不会回退到旧 HTTP/子进程通道")
		return fmt.Errorf("wails3 proto ipc is not initialized")
	}
	cfg := backend.DefaultWindowSyncToolbarConfig()
	a.resetSize(cfg.Width, cfg.Height)
	return a.showWithConfig(cfg)
}

func (a *wails3WindowSyncToolbarAdapter) Update(state *backend.WindowSyncState) error {
	if a == nil || state == nil || !state.Active {
		return a.Hide()
	}
	if a.protoIPC == nil {
		return fmt.Errorf("wails3 proto ipc is not initialized")
	}
	return a.showWithConfig(backend.DefaultWindowSyncToolbarConfig())
}

func (a *wails3WindowSyncToolbarAdapter) Hide() error {
	if a == nil {
		return nil
	}
	a.mu.Lock()
	window := a.window
	a.mu.Unlock()
	if window != nil {
		window.Close()
	}
	return nil
}

func (a *wails3WindowSyncToolbarAdapter) SetSize(width int, height int) error {
	if a == nil {
		return nil
	}
	if width <= 0 || height <= 0 {
		return fmt.Errorf("invalid toolbar size")
	}
	width = clampInt(width, 320, 900)
	height = clampInt(height, 64, 560)

	a.mu.Lock()
	a.width = width
	a.height = height
	window := a.window
	a.mu.Unlock()

	if window != nil {
		window.SetSize(width, height)
		window.SetAlwaysOnTop(true)
	}
	return nil
}

func (a *wails3WindowSyncToolbarAdapter) CenterPoint() (int, int, bool) {
	if a == nil {
		return 0, 0, false
	}
	a.mu.Lock()
	window := a.window
	a.mu.Unlock()
	if window == nil {
		return 0, 0, false
	}
	x, y := window.Position()
	width, height := window.Size()
	if width <= 0 || height <= 0 {
		return 0, 0, false
	}
	return x + width/2, y + height/2, true
}

func (a *wails3WindowSyncToolbarAdapter) resetSize(width int, height int) {
	a.mu.Lock()
	a.width = width
	a.height = height
	a.mu.Unlock()
}

func (a *wails3WindowSyncToolbarAdapter) showWithConfig(cfg backend.WindowSyncToolbarConfig) error {
	if a.wailsApp == nil {
		return fmt.Errorf("wails3 application is not initialized")
	}
	window := a.ensureWindow(cfg)
	if window == nil {
		return fmt.Errorf("create wails3 toolbar window failed")
	}
	a.mu.Lock()
	width := a.width
	height := a.height
	a.mu.Unlock()
	window.SetSize(width, height)
	window.SetAlwaysOnTop(true)
	window.Show()
	a.injectProtoConfig(window)
	return nil
}

func (a *wails3WindowSyncToolbarAdapter) ensureWindow(cfg backend.WindowSyncToolbarConfig) application.Window {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.width <= 0 {
		a.width = cfg.Width
	}
	if a.height <= 0 {
		a.height = cfg.Height
	}
	if a.window != nil {
		return a.window
	}

	toolbarWindow := a.wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             wails3WindowSyncToolbarName,
		Title:            "窗口同步",
		Width:            a.width,
		Height:           a.height,
		MinWidth:         cfg.Width,
		MinHeight:        cfg.Height,
		MaxWidth:         wails3WindowSyncToolbarExpandedWidth,
		MaxHeight:        wails3WindowSyncToolbarExpandedHeight,
		DisableResize:    true,
		Frameless:        true,
		AlwaysOnTop:      true,
		BackgroundType:   application.BackgroundTypeTransparent,
		BackgroundColour: application.NewRGBA(245, 247, 250, 0),
		InitialPosition:  application.WindowXY,
		X:                cfg.X,
		Y:                cfg.Y,
		URL:              "/?toolbar=1",
		JS:               a.protoIPC.ConfigScript(),
		Windows: application.WindowsWindow{
			DisableFramelessWindowDecorations: true,
			HiddenOnTaskbar:                   true,
		},
		MinimiseButtonState:   application.ButtonHidden,
		MaximiseButtonState:   application.ButtonHidden,
		CloseButtonState:      application.ButtonHidden,
		FullscreenButtonState: application.ButtonHidden,
	})
	toolbarWindow.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		a.mu.Lock()
		if a.window == toolbarWindow {
			a.window = nil
		}
		a.mu.Unlock()
	})
	registerProtoConfigInjection(toolbarWindow, a.protoIPC, wails3WindowSyncToolbarName, a.startupDebugEnabled)
	a.window = toolbarWindow
	if a.startupDebugEnabled {
		log.Printf("Wails3 窗口同步工具栏已创建为同进程多窗口: %s", wails3WindowSyncToolbarName)
	}
	return toolbarWindow
}

func (a *wails3WindowSyncToolbarAdapter) injectProtoConfig(window application.Window) {
	if a == nil || a.protoIPC == nil || window == nil {
		return
	}
	scheduleProtoConfigInjection(window, a.protoIPC, wails3WindowSyncToolbarName, a.startupDebugEnabled)
}

func clampInt(value int, minValue int, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func resolveAppRoot() {
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		tempDir := os.TempDir()
		if resolved, err := filepath.EvalSymlinks(exeDir); err == nil {
			exeDir = resolved
		}
		if resolved, err := filepath.EvalSymlinks(tempDir); err == nil {
			tempDir = resolved
		}

		exeDirLower := strings.ToLower(exeDir)
		inTemp := strings.HasPrefix(exeDirLower, strings.ToLower(tempDir))
		inBuildBin := strings.HasSuffix(filepath.ToSlash(exeDirLower), "/build/bin")
		if inTemp || inBuildBin {
			isDevMode = true
			if cwd, err := os.Getwd(); err == nil {
				appRoot = cwd
			} else {
				appRoot = "."
			}
			return
		}

		isDevMode = false
		appRoot = exeDir
		_ = os.Chdir(exeDir)
		return
	}

	if cwd, err := os.Getwd(); err == nil {
		appRoot = cwd
	} else {
		appRoot = "."
	}
}

func main() {
	resolveAppRoot()
	bootstrapLogFile := initBootstrapLogFile(appRoot)
	if bootstrapLogFile != nil {
		defer bootstrapLogFile.Close()
	}

	startupDebugEnabled := envFlagEnabled("ANT_BROWSER_DEBUG_STARTUP")
	if startupDebugEnabled {
		log.Printf("应用根目录: %s (dev=%v, wails3=true)", appRoot, isDevMode)
	}
	if err := backend.EnsureRuntimeLayout(appRoot); err != nil {
		log.Printf("准备用户数据目录失败: %v", err)
	}
	if startupDebugEnabled && backend.RuntimeUsesDetachedState(appRoot) {
		log.Printf("检测到安装目录需要只读运行，状态目录切换到: %s", backend.RuntimeStateRoot(appRoot))
	}

	buildVersion := resolveBuildVersion()
	if startupDebugEnabled {
		log.Printf("应用版本: %s", buildVersion)
		log.Printf(
			"Wails3 启动环境: GOOS=%s GOARCH=%s DISPLAY=%q WAYLAND_DISPLAY=%q XDG_SESSION_TYPE=%q XDG_CURRENT_DESKTOP=%q",
			goruntime.GOOS,
			goruntime.GOARCH,
			os.Getenv("DISPLAY"),
			os.Getenv("WAYLAND_DISPLAY"),
			os.Getenv("XDG_SESSION_TYPE"),
			os.Getenv("XDG_CURRENT_DESKTOP"),
		)
	}
	if startupDebugEnabled && goruntime.GOOS == "linux" && strings.TrimSpace(os.Getenv("DISPLAY")) == "" && strings.TrimSpace(os.Getenv("WAYLAND_DISPLAY")) == "" {
		log.Printf("检测到 Linux 图形环境变量为空：DISPLAY / WAYLAND_DISPLAY 都未设置，GUI 窗口大概率无法创建")
	}

	cfg, err := backend.LoadConfig(backend.ResolveRuntimePath(appRoot, "config.yaml"))
	if err != nil {
		log.Printf("加载配置失败，使用默认配置: %v", err)
		cfg = backend.DefaultConfig()
	}

	app := NewApp(appRoot, buildVersion)
	windowWidth, windowHeight := normalizeStartupWindowSize(cfg.App.Window.Width, cfg.App.Window.Height)
	if state, err := backend.LoadWindowState(appRoot); err == nil {
		windowWidth, windowHeight = normalizeStartupWindowSize(state.Width, state.Height)
	}
	windowWidth, windowHeight = clampStartupWindowSize(windowWidth, windowHeight, cfg.App.Window.MinWidth, cfg.App.Window.MinHeight)

	var (
		wailsApp       *application.App
		mainWindow     application.Window
		startupReached = make(chan struct{})
		startupOnce    sync.Once
	)

	if startupDebugEnabled {
		go func() {
			select {
			case <-startupReached:
				return
			case <-time.After(12 * time.Second):
				log.Printf("Wails3 ApplicationStarted 在 12 秒内未触发。若终端一直转圈但没有窗口，优先检查图形环境和 WebView 依赖")
			}
		}()
	}

	shutdownContext := func() context.Context {
		if wailsApp != nil && wailsApp.Context() != nil {
			return wailsApp.Context()
		}
		return context.Background()
	}

	protoIPC, err := backend.NewWails3ProtoIPC(app.App, shutdownContext)
	if err != nil {
		log.Printf("Wails3 Proto IPC 二进制服务启动失败，将保留 Wails3 raw message Protobuf 备用通道: %v", err)
	}
	protoConfigScript := ""
	rawMessageHandler := backend.NewWails3ProtoRawMessageHandler(app.App, shutdownContext)
	if protoIPC != nil {
		rawMessageHandler = protoIPC.RawMessageHandler()
		protoConfigScript = protoIPC.ConfigScript()
		log.Printf("Wails3 Proto IPC 已初始化，主窗口将通过 Wails3 runtime 注入 Protobuf 通道配置")
		defer protoIPC.Close()
	}

	focusMainWindow := func() {
		if mainWindow == nil {
			return
		}
		mainWindow.Show()
		mainWindow.UnMinimise()
		mainWindow.Restore()
		mainWindow.Focus()
	}

	wailsApp = application.New(application.Options{
		Name:        cfg.App.Name,
		Description: "Trace Browser",
		Icon:        appIcon,
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		OnShutdown: func() {
			if startupDebugEnabled {
				log.Printf("Wails3 OnShutdown 已触发")
			}
			backend.QuitTray()
			if protoIPC != nil {
				protoIPC.Close()
			}
			backend.Stop(app.App, shutdownContext())
		},
		RawMessageHandler: rawMessageHandler,
		ShouldQuit: func() bool {
			return !backend.ShouldBlockClose(app.App, shutdownContext())
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.tracebrowser.app",
			OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
				if startupDebugEnabled {
					log.Printf("收到第二实例启动参数: %v", data.Args)
				}
				app.HandleProfileTransferLaunchArgs(data.Args, "second-instance")
				focusMainWindow()
			},
		},
	})

	wailsRuntime := backend.ConfigureWails3Runtime(app.App, wailsApp, nil)
	app.ConfigureOfficialWailsUpdater(wailsApp)
	app.SetWindowSyncToolbarAdapter(&wails3WindowSyncToolbarAdapter{
		wailsApp:            wailsApp,
		protoIPC:            protoIPC,
		startupDebugEnabled: startupDebugEnabled,
	})
	app.SetWindowSyncPromptAdapter(&wails3WindowSyncPromptAdapter{
		wailsApp:            wailsApp,
		protoIPC:            protoIPC,
		startupDebugEnabled: startupDebugEnabled,
	})

	mainWindow = wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            cfg.App.Name,
		Width:            windowWidth,
		Height:           windowHeight,
		MinWidth:         cfg.App.Window.MinWidth,
		MinHeight:        cfg.App.Window.MinHeight,
		BackgroundType:   application.BackgroundTypeSolid,
		BackgroundColour: application.NewRGBA(245, 247, 250, 255),
		EnableFileDrop:   true,
		URL:              "/",
		JS:               protoConfigScript,
	})
	wailsRuntime.SetWindow(mainWindow)
	if protoIPC != nil {
		registerProtoConfigInjection(mainWindow, protoIPC, "main", startupDebugEnabled)
	}

	mainWindow.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		if event == nil {
			return
		}
		ctx := event.Context()
		files := ctx.DroppedFiles()
		if len(files) == 0 {
			return
		}
		x, y := 0, 0
		if details := ctx.DropTargetDetails(); details != nil {
			x = details.X
			y = details.Y
		}
		app.EmitFileDropEvent(files, x, y)
	})

	wailsApp.Event.OnApplicationEvent(events.Common.ApplicationLaunchedWithUrl, func(event *application.ApplicationEvent) {
		if event == nil || event.Context() == nil {
			return
		}
		launchURL := strings.TrimSpace(event.Context().URL())
		if startupDebugEnabled {
			log.Printf("收到 URL 协议唤起: %s", launchURL)
		}
		if app.HandleProfileTransferDeepLink(launchURL, "application-url") {
			focusMainWindow()
		}
	})

	mainWindow.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if backend.ShouldBlockClose(app.App, shutdownContext()) {
			event.Cancel()
		}
	})

	wailsApp.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(event *application.ApplicationEvent) {
		startupOnce.Do(func() {
			close(startupReached)
			log.Printf("Wails3 ApplicationStarted 已触发，开始初始化后端服务")
			mainWindow.Center()
			backend.Start(app.App, shutdownContext())
			log.Printf("Wails3 后端服务初始化完成")
			if !app.HandleProfileTransferLaunchArgs(os.Args, "startup") {
				app.EmitPendingProfileTransferDeepLink()
			}
			go backend.RunTray(backend.TrayCallbacks{
				OnShow: func() {
					mainWindow.Show()
					mainWindow.UnMinimise()
				},
				OnQuitAppOnly: func() {
					app.QuitAppOnly()
				},
				OnQuit: func() {
					app.ForceQuit()
				},
			})
		})
	})

	if startupDebugEnabled {
		log.Printf("准备调用 Wails3 application.Run 创建 GUI 窗口")
	}
	if err := wailsApp.Run(); err != nil {
		log.Fatal("启动 Wails3 应用失败:", err)
	}
	if startupDebugEnabled {
		log.Printf("Wails3 application.Run 已退出")
	}
}
