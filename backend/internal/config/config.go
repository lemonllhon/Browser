package config

import (
	"fmt"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	DefaultMaxProfileLimit          = 0
	StandardCDKeyProfileBonus       = 10
	GithubStarRewardKey             = "GITHUB_STAR_REWARD"
	GithubStarProfileBonus          = 50
	GithubStarProfileTotal          = DefaultMaxProfileLimit + GithubStarProfileBonus
	DefaultLaunchServerPort         = 19876
	DefaultLaunchServerAPIKeyHeader = "X-Ant-Api-Key"
)

// RewardForUsedKey 返回指定兑换记录对应的永久额度奖励。
func RewardForUsedKey(key string) int {
	normalized := strings.ToUpper(strings.TrimSpace(key))
	if normalized == "" {
		return 0
	}
	if normalized == GithubStarRewardKey {
		return GithubStarProfileBonus
	}
	return StandardCDKeyProfileBonus
}

// MinimumProfileLimitForUsedKeys 根据兑换记录计算最低应得实例额度。
func MinimumProfileLimitForUsedKeys(keys []string) int {
	return DefaultMaxProfileLimit
}

// LaunchServerConfig Launch HTTP 服务配置
type LaunchServerConfig struct {
	// Port 为对外暴露的固定入口端口。
	// Launch API 与 CDP 代理共用此端口，便于外部工具固定接入。
	Port int `yaml:"port"`
	// Auth 为 Launch API 的可选本地认证配置。
	Auth LaunchServerAuthConfig `yaml:"auth"`
}

type LaunchServerAuthConfig struct {
	Enabled bool   `yaml:"enabled"`
	APIKey  string `yaml:"api_key"`
	Header  string `yaml:"header"`
}

// Config 应用配置
type Config struct {
	Database     DatabaseConfig     `yaml:"database"`
	App          AppConfig          `yaml:"app"`
	Runtime      RuntimeConfig      `yaml:"runtime"`
	Logging      LoggingConfig      `yaml:"logging"`
	Browser      BrowserConfig      `yaml:"browser"`
	LaunchServer LaunchServerConfig `yaml:"launch_server"`
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Type   string       `yaml:"type"`
	SQLite SQLiteConfig `yaml:"sqlite"`
}

// SQLiteConfig SQLite 配置
type SQLiteConfig struct {
	Path string `yaml:"path"`
}

// AppConfig 应用配置
type AppConfig struct {
	Name            string       `yaml:"name"`
	Window          WindowConfig `yaml:"window"`
	MaxProfileLimit int          `yaml:"max_profile_limit"`
	UsedCDKeys      []string     `yaml:"used_cd_keys"`
}

// WindowConfig 窗口配置
type WindowConfig struct {
	Width     int `yaml:"width"`
	Height    int `yaml:"height"`
	MinWidth  int `yaml:"min_width"`
	MinHeight int `yaml:"min_height"`
}

// RuntimeConfig 运行时配置
type RuntimeConfig struct {
	MaxMemoryMB int `yaml:"max_memory_mb"` // 最大内存软限制（MB），0 表示禁用
	GCPercent   int `yaml:"gc_percent"`    // GC 触发百分比
}

type BrowserBookmark struct {
	Name string `yaml:"name" json:"name"`
	URL  string `yaml:"url" json:"url"`
}

type BrowserStartURL struct {
	Name string `yaml:"name" json:"name"`
	URL  string `yaml:"url" json:"url"`
}

type BrowserDefaultContentRule struct {
	RuleId                string            `yaml:"rule_id" json:"ruleId"`
	Scope                 string            `yaml:"scope" json:"scope"`
	TargetId              string            `yaml:"target_id,omitempty" json:"targetId,omitempty"`
	TargetName            string            `yaml:"target_name" json:"targetName"`
	StartURLs             []BrowserStartURL `yaml:"start_urls,omitempty" json:"startUrls"`
	Bookmarks             []BrowserBookmark `yaml:"bookmarks,omitempty" json:"bookmarks"`
	Enabled               bool              `yaml:"enabled" json:"enabled"`
	ApplyToChilds         bool              `yaml:"apply_to_childs,omitempty" json:"applyToChilds,omitempty"`
	IncludeGlobalDefaults *bool             `yaml:"include_global_defaults,omitempty" json:"includeGlobalDefaults,omitempty"`
}

type BrowserConfig struct {
	UserDataRoot           string                      `yaml:"user_data_root"`
	DefaultFingerprintArgs []string                    `yaml:"default_fingerprint_args"`
	DefaultLaunchArgs      []string                    `yaml:"default_launch_args"`
	DefaultProxy           string                      `yaml:"default_proxy"`
	StartReadyTimeoutMs    int                         `yaml:"start_ready_timeout_ms,omitempty"`
	StartStableWindowMs    int                         `yaml:"start_stable_window_ms,omitempty"`
	DefaultStartURLs       []BrowserStartURL           `yaml:"default_start_urls,omitempty"`
	DefaultStartURLsSet    bool                        `yaml:"default_start_urls_set,omitempty"`
	DefaultBookmarks       []BrowserBookmark           `yaml:"default_bookmarks,omitempty"`
	DefaultContentRules    []BrowserDefaultContentRule `yaml:"default_content_rules,omitempty"`
	Cores                  []BrowserCore               `yaml:"cores,omitempty"`
	Proxies                []BrowserProxy              `yaml:"proxies,omitempty"`
	Profiles               []BrowserProfileConfig      `yaml:"profiles,omitempty"`
	// 废弃字段，保留用于迁移
	ChromeBinaryPath     string               `yaml:"chrome_binary_path,omitempty"`
	ClashBinaryPath      string               `yaml:"clash_binary_path,omitempty"`
	XrayBinaryPath       string               `yaml:"xray_binary_path,omitempty"`
	SingBoxBinaryPath    string               `yaml:"singbox_binary_path,omitempty"`
	CoreRoot             string               `yaml:"core_root,omitempty"`
	DefaultCoreId        string               `yaml:"default_core_id,omitempty"`
	DefaultConnectorType string               `yaml:"default_connector_type,omitempty"`
	Environments         []BrowserEnvironment `yaml:"environments,omitempty"`
}

type BrowserCore struct {
	CoreId    string `yaml:"core_id" json:"coreId"`
	CoreName  string `yaml:"core_name" json:"coreName"`
	CorePath  string `yaml:"core_path" json:"corePath"`
	IsDefault bool   `yaml:"is_default" json:"isDefault"`
}

type BrowserProxy struct {
	ProxyId     string `yaml:"proxy_id" json:"proxyId"`
	ProxyName   string `yaml:"proxy_name" json:"proxyName"`
	ProxyConfig string `yaml:"proxy_config" json:"proxyConfig"`
	DnsServers  string `yaml:"dns_servers,omitempty" json:"dnsServers,omitempty"`
	GroupName   string `yaml:"group_name,omitempty" json:"groupName,omitempty"`
	SortOrder   int    `yaml:"sort_order,omitempty" json:"sortOrder,omitempty"`
	SourceID    string `yaml:"source_id,omitempty" json:"sourceId,omitempty"`
	SourceURL   string `yaml:"source_url,omitempty" json:"sourceUrl,omitempty"`
	// URL 导入时的名称前缀，用于后续自动刷新时重建同名策略
	SourceNamePrefix string `yaml:"source_name_prefix,omitempty" json:"sourceNamePrefix,omitempty"`
	// URL 导入时的预览筛选策略，用于刷新订阅时定向重建节点
	SourceFilterJSON string `yaml:"source_filter_json,omitempty" json:"sourceFilterJson,omitempty"`
	// URL 导入自动刷新开关与间隔（分钟）
	SourceAutoRefresh      bool   `yaml:"source_auto_refresh,omitempty" json:"sourceAutoRefresh,omitempty"`
	SourceRefreshIntervalM int    `yaml:"source_refresh_interval_m,omitempty" json:"sourceRefreshIntervalM,omitempty"`
	SourceLastRefreshAt    string `yaml:"source_last_refresh_at,omitempty" json:"sourceLastRefreshAt,omitempty"`
	// 测速结果（运行时字段，不写入 yaml）
	LastLatencyMs int64  `yaml:"-" json:"lastLatencyMs"`
	LastTestOk    bool   `yaml:"-" json:"lastTestOk"`
	LastTestedAt  string `yaml:"-" json:"lastTestedAt"`
	// IP 健康检测原始结果（运行时字段，不写入 yaml）
	LastIPHealthJSON string `yaml:"-" json:"lastIPHealthJson,omitempty"`
}

type BrowserEnvironment struct {
	CoreId        string `yaml:"core_id" json:"coreId"`
	CoreName      string `yaml:"core_name" json:"coreName"`
	CorePath      string `yaml:"core_path" json:"corePath"`
	ProxyConfig   string `yaml:"proxy_config" json:"proxyConfig"`
	ConnectorType string `yaml:"connector_type" json:"connectorType"`
	IsDefault     bool   `yaml:"is_default" json:"isDefault"`
}

type BrowserProfileConfig struct {
	ProfileId                    string   `yaml:"profile_id" json:"profileId"`
	ProfileName                  string   `yaml:"profile_name" json:"profileName"`
	UserDataDir                  string   `yaml:"user_data_dir" json:"userDataDir"`
	CoreId                       string   `yaml:"core_id" json:"coreId"`
	FingerprintArgs              []string `yaml:"fingerprint_args" json:"fingerprintArgs"`
	ProxyId                      string   `yaml:"proxy_id" json:"proxyId"`
	ProxyConfig                  string   `yaml:"proxy_config" json:"proxyConfig"`
	ProxyBindSourceID            string   `yaml:"proxy_bind_source_id,omitempty" json:"proxyBindSourceId,omitempty"`
	ProxyBindSourceURL           string   `yaml:"proxy_bind_source_url,omitempty" json:"proxyBindSourceUrl,omitempty"`
	ProxyBindName                string   `yaml:"proxy_bind_name,omitempty" json:"proxyBindName,omitempty"`
	ProxyBindUpdatedAt           string   `yaml:"proxy_bind_updated_at,omitempty" json:"proxyBindUpdatedAt,omitempty"`
	AutoProxySwitchEnabled       bool     `yaml:"auto_proxy_switch_enabled,omitempty" json:"autoProxySwitchEnabled,omitempty"`
	AutoProxySwitchGroupName     string   `yaml:"auto_proxy_switch_group_name,omitempty" json:"autoProxySwitchGroupName,omitempty"`
	AutoProxySwitchMode          string   `yaml:"auto_proxy_switch_mode,omitempty" json:"autoProxySwitchMode,omitempty"`
	AutoProxySwitchIntervalM     int      `yaml:"auto_proxy_switch_interval_m,omitempty" json:"autoProxySwitchIntervalM,omitempty"`
	AutoProxySwitchRotateByGroup bool     `yaml:"auto_proxy_switch_rotate_by_group,omitempty" json:"autoProxySwitchRotateByGroup,omitempty"`
	AutoProxySwitchLastProxyId   string   `yaml:"auto_proxy_switch_last_proxy_id,omitempty" json:"autoProxySwitchLastProxyId,omitempty"`
	LaunchArgs                   []string `yaml:"launch_args" json:"launchArgs"`
	Tags                         []string `yaml:"tags" json:"tags"`
	Keywords                     []string `yaml:"keywords,omitempty" json:"keywords,omitempty"`
	GroupId                      string   `yaml:"group_id,omitempty" json:"groupId,omitempty"`
	CreatedAt                    string   `yaml:"created_at" json:"createdAt"`
	UpdatedAt                    string   `yaml:"updated_at" json:"updatedAt"`
}

// LoggingConfig 日志配置
type LoggingConfig struct {
	Level       string `yaml:"level"`
	FileEnabled bool   `yaml:"file_enabled"`
	FilePath    string `yaml:"file_path"`
	Format      string `yaml:"format"` // "text" or "json"

	// 性能配置
	BufferSize      int `yaml:"buffer_size"`       // 缓冲区大小（KB）
	AsyncQueueSize  int `yaml:"async_queue_size"`  // 异步队列大小
	FlushIntervalMs int `yaml:"flush_interval_ms"` // 刷新间隔（毫秒）

	// 分片配置
	Rotation RotationConfig `yaml:"rotation"`

	// 方法拦截配置
	Interceptor InterceptorConfig `yaml:"interceptor"`
}

// RotationConfig 日志分片配置
type RotationConfig struct {
	Enabled      bool   `yaml:"enabled"`
	MaxSizeMB    int    `yaml:"max_size_mb"`   // 单文件最大大小（MB）
	MaxAge       int    `yaml:"max_age"`       // 保留天数
	MaxBackups   int    `yaml:"max_backups"`   // 保留文件数
	TimeInterval string `yaml:"time_interval"` // 时间间隔: "daily", "hourly"
}

// InterceptorConfig 方法拦截器配置
type InterceptorConfig struct {
	Enabled         bool     `yaml:"enabled"`
	LogParameters   bool     `yaml:"log_parameters"`   // 是否记录参数
	LogResults      bool     `yaml:"log_results"`      // 是否记录返回值
	SensitiveFields []string `yaml:"sensitive_fields"` // 敏感字段（脱敏）
}

// Load 加载配置文件
func Load(configPath string) (*Config, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return DefaultConfig(), nil
		}
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("解析配置文件失败: %w", err)
	}

	normalizeConfig(&config)

	return &config, nil
}

// normalizeConfig 对历史配置进行字段补齐，不覆盖用户已配置值。
func normalizeConfig(config *Config) {
	defaultConfig := DefaultConfig()

	if strings.TrimSpace(config.Database.Type) == "" {
		config.Database.Type = defaultConfig.Database.Type
	}
	if strings.TrimSpace(config.Database.SQLite.Path) == "" {
		config.Database.SQLite.Path = defaultConfig.Database.SQLite.Path
	}

	if strings.TrimSpace(config.App.Name) == "" {
		config.App.Name = defaultConfig.App.Name
	}
	if config.App.Window.Width <= 0 {
		config.App.Window.Width = defaultConfig.App.Window.Width
	}
	if config.App.Window.Height <= 0 {
		config.App.Window.Height = defaultConfig.App.Window.Height
	}
	if config.App.Window.MinWidth <= 0 {
		config.App.Window.MinWidth = defaultConfig.App.Window.MinWidth
	}
	if config.App.Window.MinHeight <= 0 {
		config.App.Window.MinHeight = defaultConfig.App.Window.MinHeight
	}
	if config.App.UsedCDKeys == nil {
		config.App.UsedCDKeys = []string{}
	}

	// 0 表示实例数量无限制。新版不再通过兑换码扩容，旧配置中的额度值统一迁移为无限制。
	config.App.MaxProfileLimit = DefaultMaxProfileLimit

	if config.Runtime.MaxMemoryMB <= 0 {
		config.Runtime.MaxMemoryMB = defaultConfig.Runtime.MaxMemoryMB
	}
	if config.Runtime.GCPercent <= 0 {
		config.Runtime.GCPercent = defaultConfig.Runtime.GCPercent
	}

	if strings.TrimSpace(config.Logging.Level) == "" {
		config.Logging.Level = defaultConfig.Logging.Level
	}
	if isLegacyDefaultLogPath(config.Logging.FilePath) || strings.TrimSpace(config.Logging.FilePath) == "" {
		config.Logging.FilePath = defaultConfig.Logging.FilePath
	}
	if strings.TrimSpace(config.Logging.Format) == "" {
		config.Logging.Format = defaultConfig.Logging.Format
	}
	if config.Logging.BufferSize <= 0 {
		config.Logging.BufferSize = defaultConfig.Logging.BufferSize
	}
	if config.Logging.AsyncQueueSize <= 0 {
		config.Logging.AsyncQueueSize = defaultConfig.Logging.AsyncQueueSize
	}
	if config.Logging.FlushIntervalMs <= 0 {
		config.Logging.FlushIntervalMs = defaultConfig.Logging.FlushIntervalMs
	}
	if config.Logging.Rotation.MaxSizeMB <= 0 {
		config.Logging.Rotation.MaxSizeMB = defaultConfig.Logging.Rotation.MaxSizeMB
	}
	if config.Logging.Rotation.MaxAge <= 0 {
		config.Logging.Rotation.MaxAge = defaultConfig.Logging.Rotation.MaxAge
	}
	if config.Logging.Rotation.MaxBackups <= 0 {
		config.Logging.Rotation.MaxBackups = defaultConfig.Logging.Rotation.MaxBackups
	}
	if strings.TrimSpace(config.Logging.Rotation.TimeInterval) == "" {
		config.Logging.Rotation.TimeInterval = defaultConfig.Logging.Rotation.TimeInterval
	}

	interceptorAllZero := !config.Logging.Interceptor.Enabled &&
		!config.Logging.Interceptor.LogParameters &&
		!config.Logging.Interceptor.LogResults &&
		config.Logging.Interceptor.SensitiveFields == nil
	if interceptorAllZero {
		config.Logging.Interceptor = cloneInterceptorConfig(defaultConfig.Logging.Interceptor)
	} else if config.Logging.Interceptor.SensitiveFields == nil {
		config.Logging.Interceptor.SensitiveFields = append([]string{}, defaultConfig.Logging.Interceptor.SensitiveFields...)
	}

	if strings.TrimSpace(config.Browser.UserDataRoot) == "" {
		config.Browser.UserDataRoot = defaultConfig.Browser.UserDataRoot
	}
	if len(config.Browser.DefaultFingerprintArgs) == 0 {
		config.Browser.DefaultFingerprintArgs = append([]string{}, defaultConfig.Browser.DefaultFingerprintArgs...)
	}
	if len(config.Browser.DefaultLaunchArgs) == 0 {
		config.Browser.DefaultLaunchArgs = append([]string{}, defaultConfig.Browser.DefaultLaunchArgs...)
	}
	if config.Browser.StartReadyTimeoutMs <= 0 {
		config.Browser.StartReadyTimeoutMs = defaultConfig.Browser.StartReadyTimeoutMs
	}
	if config.Browser.StartStableWindowMs <= 0 {
		config.Browser.StartStableWindowMs = defaultConfig.Browser.StartStableWindowMs
	}
	if config.Browser.DefaultBookmarks == nil {
		config.Browser.DefaultBookmarks = []BrowserBookmark{}
	}
	if config.Browser.DefaultStartURLs == nil {
		config.Browser.DefaultStartURLs = []BrowserStartURL{}
	}
	if config.Browser.DefaultContentRules == nil {
		config.Browser.DefaultContentRules = []BrowserDefaultContentRule{}
	}
	if config.Browser.Cores == nil {
		config.Browser.Cores = []BrowserCore{}
	}
	if config.Browser.Proxies == nil {
		config.Browser.Proxies = []BrowserProxy{}
	}
	if config.Browser.Profiles == nil {
		config.Browser.Profiles = []BrowserProfileConfig{}
	}

	if config.LaunchServer.Port <= 0 {
		config.LaunchServer.Port = defaultConfig.LaunchServer.Port
	}
	config.LaunchServer.Auth.APIKey = strings.TrimSpace(config.LaunchServer.Auth.APIKey)
	if strings.TrimSpace(config.LaunchServer.Auth.Header) == "" {
		config.LaunchServer.Auth.Header = defaultConfig.LaunchServer.Auth.Header
	}
}

func cloneInterceptorConfig(src InterceptorConfig) InterceptorConfig {
	dst := src
	dst.SensitiveFields = append([]string{}, src.SensitiveFields...)
	return dst
}

func isLegacyDefaultLogPath(path string) bool {
	return strings.EqualFold(filepath.ToSlash(strings.TrimSpace(path)), "logs/app.log")
}

func defaultFingerprintPlatformForOS(goos string) string {
	switch strings.ToLower(strings.TrimSpace(goos)) {
	case "darwin":
		return "mac"
	case "linux":
		return "linux"
	case "windows":
		return "windows"
	default:
		return "windows"
	}
}

// DefaultConfig 返回默认配置
func DefaultConfig() *Config {
	return &Config{
		Database: DatabaseConfig{
			Type: "sqlite",
			SQLite: SQLiteConfig{
				Path: "data/app.db",
			},
		},
		App: AppConfig{
			Name: "Trace Browser",
			Window: WindowConfig{
				Width:     1180,
				Height:    720,
				MinWidth:  900,
				MinHeight: 560,
			},
			MaxProfileLimit: DefaultMaxProfileLimit,
			UsedCDKeys:      []string{},
		},
		Runtime: RuntimeConfig{
			MaxMemoryMB: 0,   // 默认禁用软限制，避免把运行中的前后端直接顶死
			GCPercent:   100, // 默认 100%
		},
		Browser: BrowserConfig{
			UserDataRoot:           "data",
			DefaultFingerprintArgs: []string{"--fingerprint-brand=Chrome", "--fingerprint-platform=" + defaultFingerprintPlatformForOS(goruntime.GOOS)},
			DefaultLaunchArgs:      []string{"--disable-sync", "--no-first-run"},
			DefaultProxy:           "",
			StartReadyTimeoutMs:    3000,
			StartStableWindowMs:    1200,
		},
		Logging: LoggingConfig{
			Level:           "info",
			FileEnabled:     false,
			FilePath:        "data/logs/app.log",
			Format:          "text",
			BufferSize:      4, // 4KB
			AsyncQueueSize:  1000,
			FlushIntervalMs: 1000, // 1秒
			Rotation: RotationConfig{
				Enabled:      false,
				MaxSizeMB:    100,
				MaxAge:       7,
				MaxBackups:   5,
				TimeInterval: "daily",
			},
			Interceptor: InterceptorConfig{
				Enabled:         true,
				LogParameters:   true,
				LogResults:      true,
				SensitiveFields: []string{"password", "token", "secret"},
			},
		},
		LaunchServer: LaunchServerConfig{
			Port: DefaultLaunchServerPort,
			Auth: LaunchServerAuthConfig{
				Enabled: false,
				APIKey:  "",
				Header:  DefaultLaunchServerAPIKeyHeader,
			},
		},
	}
}

// Save 保存配置到文件
func (c *Config) Save(configPath string) error {
	data, err := yaml.Marshal(c)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}
	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}

	return nil
}

// ProxyStore 代理数据文件结构
type ProxyStore struct {
	Proxies []BrowserProxy `yaml:"proxies"`
}

// LoadProxies 从独立文件加载代理列表
func LoadProxies(path string) ([]BrowserProxy, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("读取代理文件失败: %w", err)
	}
	var store ProxyStore
	if err := yaml.Unmarshal(data, &store); err != nil {
		return nil, fmt.Errorf("解析代理文件失败: %w", err)
	}
	return store.Proxies, nil
}

// SaveProxies 将代理列表保存到独立文件
func SaveProxies(path string, proxies []BrowserProxy) error {
	store := ProxyStore{Proxies: proxies}
	data, err := yaml.Marshal(store)
	if err != nil {
		return fmt.Errorf("序列化代理数据失败: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("创建代理目录失败: %w", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("写入代理文件失败: %w", err)
	}
	return nil
}
