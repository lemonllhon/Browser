# CPU/GPU 与多窗口优化方案

> 目标：在现有 Wails3 + React + SQLite + Protobuf IPC 架构上，降低大量实例和多窗口场景下的 CPU/GPU 占用，同时修复多窗口数据不一致、重复刷新和同步事件放大问题。本文只设计可落地方案，后续按阶段小步执行。

## 执行记录

- 2026-06-08：已完成阶段 0 基线能力。新增 `trace.app.PerformanceSnapshotGet`，可采集主进程内存、goroutine、实例运行数、浏览器进程引用、代理桥引用、窗口同步窗口数和窗口同步事件/派发计数；前端新增 `window.__TRACE_PERF__` 最近指标与计数缓冲，用于观察列表刷新耗时和事件触发次数。
- 2026-06-08：已完成阶段 2 后台刷新降载首轮。实例列表运行态同步从 3 秒固定轮询改为事件 debounce、可见窗口低频兜底轮询、后台窗口延后刷新，并按 profiles/groups/proxies/cores 分通道合并请求。
- 2026-06-08：已完成阶段 3 多窗口共享数据一致性首轮。新增 `trace.app.DataVersionsGet` 和共享数据版本事件 payload，覆盖实例、组织、默认内容、内核、代理池、扩展插件、浏览器设置、日志；前端新增 `browserSharedDataStore`，通过 Protobuf 事件、BroadcastChannel 和可见恢复版本对比统一刷新，已接入实例列表/详情/编辑/复制、快速启动、代理选择、组织管理、默认内容、代理池、内核管理、扩展插件、日志查看、控制台统计与系统设置本地存储同步。
- 2026-06-08：已完成阶段 4 窗口同步降载。后端新增 mousemove 去重/24ms 合并、wheel 16ms delta 合并、被控窗口派发失败 900ms 短冷却、CDP `/json` target 750ms 短 TTL 缓存与失效重试，并将单次 CDP WebSocket 命令改为按 target URL 复用连接；同时把窗口同步状态事件和工具栏更新做 100ms debounce，主控标记从 1 秒固定重打改为仅在 session/color/target 变化时重打，降低同步高频事件下的连接 churn、重复 target 查询和 UI 状态抖动。

## 当前项目相关现状

- 浏览器实例启动集中在 `backend/app_instance.go`，启动参数目前包含 `--user-data-dir`、`--remote-debugging-port`、`--disable-session-crashed-bubble`、代理参数、扩展参数、指纹参数、用户自定义 `launchArgs`。
- 全局默认启动参数由 `backend/internal/config/config.go` 的 `Browser.DefaultLaunchArgs` 提供，当前默认是 `--disable-sync`、`--no-first-run`；前端设置入口在 `frontend/src/modules/browser/hooks/useBrowserCoreSettings.ts` 和实例编辑页。
- 实例运行态已经写入共享 runtime 文件，核心逻辑在 `backend/browser_runtime_shared_state.go`；多窗口/多进程能通过重新读取数据库和 runtime 文件恢复状态。
- 浏览器列表页已拆分，但仍会在 `frontend/src/modules/browser/hooks/useBrowserListRuntimeSync.ts` 中对可见页面每 3 秒刷新 profile/group；多个主窗口同时打开时会放大为多份轮询。
- 业务事件通过 Protobuf IPC 广播，前端入口在 `frontend/src/shared/ipc/transport.ts` 和 `frontend/src/shared/backend/runtime.ts`；同进程 Wails 多窗口可以收到事件，但跨进程或重复主窗口仍需要数据版本/本地广播兜底。
- 窗口同步后端已拆分，主循环在 `backend/window_sync.go`；当前会监听主控页 CDP 事件，并每 500ms 检查标签页/重打主控标记。鼠标移动、滚轮、输入事件可能在多窗口下形成高频派发。
- 表格组件 `frontend/src/shared/components/Table.tsx` 目前直接渲染全部 rows；实例数量或代理数量很大时，列表页和代理池页都有前端渲染压力。

## 优化目标

1. 大量实例运行时，主应用空闲 CPU 明显下降，后台窗口不再持续高频刷新。
2. 单个浏览器实例可按模式降低 GPU/CPU 压力，同时不破坏指纹、代理、扩展和窗口同步能力。
3. 多个主窗口打开时，组织管理、实例列表、代理池、内核/扩展设置的数据能及时一致，不靠每个窗口盲目轮询。
4. 窗口同步只同步必要事件，对 mousemove、wheel、标签页检测等高频动作做限流/合并，降低被控窗口数量增加时的线性放大。
5. 方案具备开关、回滚路径和可验证指标。

## 阶段 0：性能观测基线

### 目标

先建立可复测的 CPU/GPU/渲染/事件基线，否则优化后无法判断收益。

### 落地内容

- 新增后端轻量性能采样工具：
  - 采集主进程内存、goroutine 数、运行实例数、代理桥接进程数、窗口同步状态。
  - Windows 下可选采集本应用和浏览器子进程 CPU 粗略占用；采集失败不影响主流程。
  - 暴露为内部日志或 `trace.app.PerformanceSnapshotGet` Protobuf 方法，优先只给开发/调试入口使用。
- 前端增加开发态性能标记：
  - 浏览器列表/代理池刷新耗时。
  - 一次 `browser:profiles:updated` 到页面完成状态更新的耗时。
  - 窗口同步事件每秒接收/派发数量。

### 文件范围

- `backend/proto_app.go`
- `backend/internal/transport/protoipc/wire_app.go`
- `frontend/src/shared/ipc/app.ts`
- `frontend/src/modules/browser/hooks/useBrowserListRuntimeSync.ts`
- `backend/window_sync.go`

### 验证方式

- `go test ./backend/internal/transport/protoipc ./backend`
- `cd frontend && npm run build`
- 人工场景：0/5/20 个实例、1/2/3 个主窗口分别记录空闲 CPU、刷新次数和事件数。

## 阶段 1：浏览器实例 CPU/GPU 启动策略

### 目标

给浏览器实例增加可配置的性能模式，不把所有用户都强行塞进同一组 Chromium 参数。

### 建议模式

| 模式 | 适用场景 | 默认行为 |
| --- | --- | --- |
| `balanced` | 默认用户 | 保持现有参数，只补无副作用参数 |
| `low-cpu` | 多实例批量运行、后台挂机 | 降低后台活动、禁用部分后台联网和媒体后台行为 |
| `low-gpu` | GPU 占用高、显卡驱动异常 | 可选禁用 GPU 或降低 GPU 后台活动 |
| `compat` | 指纹/网页兼容优先 | 尽量不添加可能改变 WebGL/Canvas 表现的参数 |

### 可候选参数

优先放入 `low-cpu`：

- `--disable-background-networking`
- `--disable-component-update`
- `--disable-domain-reliability`
- `--disable-features=Translate,MediaRouter,OptimizationHints`
- `--metrics-recording-only`
- `--no-default-browser-check`
- `--disable-notifications`

谨慎放入 `low-gpu`，必须做显式开关：

- `--disable-gpu`
- `--disable-software-rasterizer`
- `--disable-gpu-compositing`

不建议默认开启：

- `--single-process`：稳定性差。
- `--disable-dev-shm-usage`：更偏 Linux 容器场景，桌面默认收益不确定。
- 任何会明显改变 WebGL renderer/vendor 的参数：可能影响指纹一致性。

### 落地设计

- 在配置层增加：
  - `browser.performance_mode`
  - `browser.performance_launch_args`
  - `browser.enable_low_gpu_mode`
- 后端新增 `resolvePerformanceLaunchArgs(profile, settings)`，在 `backend/app_instance.go` 组装启动参数时插入，插入位置在系统接管参数之后、用户自定义参数之前。
- `sanitizeManagedLaunchArgs` 继续保护 `--user-data-dir`、`--remote-debugging-port`、`--proxy-server`、`--load-extension` 等系统接管参数。
- 用户自定义参数仍允许覆盖性能模式中的非接管参数；保存时给出重复参数提示。
- 前端设置页增加性能模式选择和“GPU 兼容优先/降低 GPU 占用”开关。

### 文件范围

- `backend/internal/config/config.go`
- `backend/internal/browser/types.go`
- `backend/app_instance.go`
- `backend/browser_launch_args.go`
- `backend/proto_browser_settings.go`
- `backend/internal/transport/protoipc/wire_browser_settings.go`
- `frontend/src/modules/browser/hooks/useBrowserCoreSettings.ts`
- `frontend/src/modules/browser/components/browser-list/BrowserListSettingsModal.tsx`
- `frontend/src/modules/browser/pages/BrowserEditPage.tsx`
- `frontend/src/modules/browser/components/BatchRandomFingerprintModal.tsx`

### 验证方式

- 单测：
  - 性能模式默认值迁移。
  - 启动参数去重和用户参数覆盖。
  - `low-gpu` 不默认注入。
- 人工：
  - 分别用 balanced/low-cpu/low-gpu 启动实例，确认页面可打开、代理可用、窗口同步可用、指纹参数仍存在。

## 阶段 2：前端列表渲染与后台刷新降载

### 目标

减少多个窗口同时打开时的重复 IPC、重复 React 渲染和大列表 DOM 压力。

### 落地内容

- 把 `useBrowserListRuntimeSync.ts` 的 3 秒轮询改为自适应：
  - 页面可见且没有收到事件时才低频轮询。
  - 收到 `browser:*:updated` 后做 debounce 合并，100-300ms 内只刷新一次。
  - `profiles/groups/proxies/cores` 分通道刷新，避免一个事件导致全量刷新。
  - 后台窗口暂停定时刷新，只保留事件驱动和恢复可见时一次同步。
- 浏览器列表和代理池引入虚拟列表/虚拟表格：
  - 先从实例列表 `BrowserListPage.tsx` 的表格和卡片模式开始。
  - 代理池 `ProxyPoolPage.tsx` 第二批处理。
  - 建议引入 `@tanstack/react-virtual`，只渲染可见 rows。
- `Table.tsx` 支持可选 virtual mode：
  - 保持默认行为不变，避免一次改动影响全部表格。
  - 只在实例列表/代理池明确开启。
- 对派生数据继续 `useMemo`，但避免在每行 render 中重复创建大对象或重复解析代理展示名。

### 文件范围

- `frontend/src/modules/browser/hooks/useBrowserListRuntimeSync.ts`
- `frontend/src/modules/browser/hooks/useVisibleRefresh.ts`
- `frontend/src/modules/browser/pages/BrowserListPage.tsx`
- `frontend/src/modules/browser/pages/ProxyPoolPage.tsx`
- `frontend/src/shared/components/Table.tsx`
- `frontend/package.json`

### 验证方式

- `cd frontend && npm run build`
- 100/500/1000 条实例或代理数据下检查滚动、筛选、选择、拖拽、批量操作。
- 多开 2 个主窗口，修改分组/标签/代理后确认另一个窗口在 1 秒内同步，不出现持续高频刷新。

## 阶段 3：多窗口共享数据与事件一致性

### 目标

把“每个窗口自己拉全量数据”改为“后端统一版本号 + 事件增量通知 + 前端集中缓存”，解决多窗口状态不一致和刷新风暴。

### 落地内容

- 后端增加数据版本：
  - `profilesVersion`
  - `groupsVersion`
  - `proxiesVersion`
  - `coresVersion`
  - `extensionsVersion`
  - `defaultsVersion`
- 每次写操作后递增对应版本，事件 payload 带版本号和变更范围，例如：
  - `browser:profiles:updated` -> `{ version, profileIds, reason }`
  - `browser:groups:updated` -> `{ version, groupIds, reason }`
- 前端建立模块级共享 store：
  - 可用 `useSyncExternalStore` 或现有 store 风格封装 `browserDataStore`。
  - 多个页面/窗口订阅同一个数据源，事件只触发 store 刷新。
  - 同一窗口内多个组件不重复请求。
- 跨主窗口兜底：
  - 同进程 Wails 多窗口继续依赖 Protobuf event。
  - 如果允许多个应用进程同时打开，增加 `BroadcastChannel('trace-browser-data')` 本地广播；收到其他窗口广播后按版本判断是否刷新。
  - 启动/恢复可见时读取后端版本，发现版本落后再拉全量。
- 组织管理、默认内容、标签/分组页面纳入同一套缓存，不再各页面各自维护孤岛刷新。

### 文件范围

- `backend/app_events.go`
- `backend/app_group.go`
- `backend/app_profile.go`
- `backend/app_proxy_binding.go`
- `backend/app_extension.go`
- `backend/app_default_content.go`
- `backend/proto_app_runtime_event_test.go`
- `frontend/src/shared/backend/runtime.ts`
- `frontend/src/shared/ipc/app.ts`
- `frontend/src/modules/browser/hooks/useBrowserListData.ts`
- `frontend/src/modules/browser/pages/GroupManagementPage.tsx`
- `frontend/src/modules/browser/pages/TagManagementPage.tsx`
- `frontend/src/modules/browser/pages/DefaultContentLinkPage.tsx`
- `frontend/src/modules/browser/pages/OrganizationManagementPage.tsx`

### 验证方式

- 两个窗口分别停留在实例列表和组织管理。
- A 窗口新增/改名/删除分组，B 窗口无需手动刷新即可更新。
- B 窗口移动实例到分组，A 窗口实例列表和分组计数同步。
- 快速连续修改 10 次，只触发少量合并刷新。

## 阶段 4：窗口同步事件节流与 CDP 连接复用

### 目标

窗口同步时，被控窗口数量越多，CPU 不应按事件频率无限放大。

### 落地内容

- 高频事件节流：
  - `mouseMove` 合并为每 16-33ms 最多派发一次。
  - `wheel` 在 16ms 内合并 delta。
  - 键盘输入保持低延迟，不做明显 debounce。
- 事件去重：
  - 同一 target、同一坐标、同一 buttons 的连续 mousemove 跳过。
  - 标签页激活事件只在 active target 变化后派发。
- CDP target 缓存：
  - `pageWebSocketTargets(debugPort)` 当前在标签同步中会反复请求；为每个 debugPort 增加短 TTL 缓存，标签变更或连接失败时主动失效。
  - 被控窗口派发失败时按 profile 做短时间熔断，避免 500ms 内连续失败反复打日志/探测。
- 主控标记降频：
  - 现在 `listenWindowSyncMaster` 每 1 秒重打 marker，可调整为仅 session 切换、settings 改变、target 变化、恢复连接时执行。
- 工具栏状态更新合并：
  - `emitWindowSyncStateChanged` 和 `updateWindowSyncToolbar` 做 100ms debounce，避免连续状态变化造成多窗口 UI 抖动。

### 文件范围

- `backend/window_sync.go`
- `backend/window_sync_actions.go`
- `backend/window_sync_events.go`
- `backend/window_sync_state.go`
- `frontend/src/modules/browser/hooks/useBrowserWindowSync.ts`
- `frontend/src/modules/browser/components/WindowSyncFloatingToolbar.tsx`

### 验证方式

- `go test ./backend`
- 新增纯函数测试：
  - mousemove 合并。
  - wheel delta 合并。
  - target cache TTL/失效。
  - dispatch failure 熔断。
- 人工：
  - 2/5/10 个窗口同步移动鼠标和滚轮，观察主进程 CPU、被控窗口响应和日志量。

## 阶段 5：代理内核与后台任务降载

### 目标

减少 xray/sing-box/mihomo 桥接进程、代理测速/IP 健康检测、订阅刷新对 CPU 和端口资源的瞬时冲击。

### 落地内容

- 代理桥接进程复用现有 `AcquireBridge/ReleaseBridge` 方向，继续强化引用计数，确保同一节点不会重复启动多个内核。
- 端口重试增加退避和短期黑名单：
  - 最近失败端口 30-60 秒内不再立即复用。
  - 失败日志合并，避免连续启动时刷屏。
- 测速/IP 健康检测增加全局并发限制：
  - 主表检测和预览弹窗检测共享队列。
  - 后台窗口不自动发起检测。
- 订阅自动刷新错峰：
  - 多个来源不要同一秒刷新。
  - 应用启动后延迟一段时间再跑自动刷新，避免和实例启动抢资源。

### 文件范围

- `backend/internal/proxy/*`
- `backend/proxy_switch_bridge.go`
- `frontend/src/modules/browser/hooks/useProxyProbeState.ts`
- `frontend/src/modules/browser/hooks/useProxyPreviewProbeState.ts`
- `frontend/src/modules/browser/pages/ProxyPoolPage.tsx`
- `frontend/src/modules/browser/utils/proxySourceRefresh.ts`

### 验证方式

- `go test ./backend/internal/proxy ./backend`
- 批量启动使用同一代理的实例，确认内核进程复用。
- 批量测速 100 个代理，确认并发受控、UI 可取消、主窗口不卡顿。

## 推荐执行顺序

1. 阶段 0：先做性能观测基线。
2. 阶段 2 的后台刷新 debounce：风险低，能立刻改善多窗口空闲 CPU。
3. 阶段 3 的数据版本和共享 store：解决多窗口一致性的根问题。
4. 阶段 1 的浏览器性能模式：涉及启动参数和兼容性，必须有开关。
5. 阶段 4 的窗口同步节流：对同步体验影响较大，单独开发和回归。
6. 阶段 5 的代理后台任务降载：和代理稳定性强相关，最后分批做。

## 风险与回滚

- GPU 参数可能影响 WebGL 指纹、Canvas、视频播放和部分网站渲染，所以必须默认关闭 `low-gpu`，只作为用户显式模式。
- 虚拟列表可能影响拖拽排序和批量选择，应先只在表格模式启用，卡片模式单独回归。
- 事件 debounce 可能带来 100-300ms 的状态延迟，组织管理和实例运行态要区分：配置更新可以 debounce，启动/停止状态应尽量即时。
- 窗口同步节流不能影响键盘输入顺序，键盘和文本输入优先保持原始顺序。
- 多进程 BroadcastChannel 只能覆盖前端窗口间广播，最终一致性仍以后端版本号和数据库为准。

## 验收标准

- 单窗口空闲状态下，实例列表页不再每 3 秒无条件拉取全部 profile/group。
- 两个主窗口同时打开，任意一边修改标签、分组、默认内容、代理或内核后，另一边能自动同步。
- 20 个实例运行时，主应用自身 CPU 空闲占用低于优化前基线。
- 5 个窗口同步鼠标移动时，主进程日志不刷屏，CPU 峰值明显低于优化前。
- `go test ./backend/...`、`cd frontend && npm run build` 通过；桌面相关顶层测试在具备 Wails/WebView 依赖环境补跑。
