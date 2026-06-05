# Trace Browser 分模块优化落地计划

> 目标：把“全面优化”拆成可验证、可回滚的小任务。任何功能优化都必须先完成检查清单，确认无误后再进入下一项，避免多个功能交叉修改导致回归难以定位。

## 执行原则

1. **一次只优化一个功能模块**：每个任务只允许触碰当前模块必要文件；如发现跨模块问题，先记录到本文档，不在同一轮混改。
2. **先检查再修改**：开始编码前必须确认现状、风险、验证命令和回滚边界。
3. **每项优化必须闭环验证**：完成后至少运行该模块单元测试或构建检查；无法运行时必须记录环境限制。
4. **文档同步更新**：任务开始、完成、延期或发现新风险时，都要更新本文档的状态与备注。
5. **小步提交**：一个提交只对应一个清晰优化点，便于审查、回滚和继续迭代。

## 单项优化检查清单

每开始一个优化项前，必须逐项确认：

- [ ] 明确优化对象和文件范围。
- [ ] 明确当前问题、用户影响和预期收益。
- [ ] 明确验证方式，包括自动化测试、构建或人工检查。
- [ ] 确认不会与正在进行的其他功能优化交叉。
- [ ] 完成修改后运行验证，并把结果写入 PR / 提交说明。

## 优化任务总表

| 序号 | 模块 | 优化目标 | 文件范围 | 验证方式 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 应用路径与安装布局 | 修复并固化 Linux 只读安装目录识别，避免配置/数据写回安装目录 | `backend/internal/apppath/*` | `go test ./backend/internal/apppath` | 已完成 |
| 2 | 代理池页面 | 拆分超大页面，把订阅导入、测速/IP 健康检测、表格列配置和批量操作拆为独立组件/Hook | `frontend/src/modules/browser/pages/ProxyPoolPage.tsx` 及新增同目录组件/Hook | `npm run build`，必要时补充组件级人工检查 | 已完成：表格列配置、直连导入解析、Clash/订阅解析、来源元数据、检测缓存、预览过滤、展示模型、来源刷新、刷新配置、导入/预览/编辑/详情弹窗拆分、测速/IP 健康检测 Hook、主工具栏/筛选栏、订阅资源列表、代理主表行操作拆分均已落地 |
| 3 | 浏览器实例列表 | 拆分筛选、实例操作、批量操作、状态订阅和弹窗管理，降低列表页耦合 | `frontend/src/modules/browser/pages/BrowserListPage.tsx` 及相关组件 | `npm run build`，实例启动/停止/筛选人工检查 | 进行中：已完成表格列配置、拖拽顺序存储、显示列菜单、批量操作工具栏、顶部操作区、统计/筛选区、实例行操作和卡片操作区拆分 |
| 4 | 窗口同步后端 | 按状态管理、窗口枚举/布局、事件广播、平台差异拆分，补充核心状态测试 | `backend/window_sync.go` 及拆分后的后端文件 | `go test ./backend/...` 中不依赖 WebView 的子包，新增单测 | 待处理 |
| 5 | 前端类型与 IPC | 减少 `Record<string, any>` 和重复编解码逻辑，提升 IPC 数据边界类型安全 | `frontend/src/shared/ipc/*`、相关 API 文件 | `npm run build` | 待处理 |
| 6 | 构建与质量门禁 | 增加独立 lint/typecheck 脚本或文档化现有检查，统一 CI 可执行命令 | `frontend/package.json`、CI/README 相关文件 | `npm run build`，新增脚本自检 | 待处理 |
| 7 | 文档与发布说明 | 梳理运行时、Linux/macOS/Windows 发布路径和依赖限制，减少环境问题误判 | `README.md`、`publish/*/README.md`、`docs/*` | 文档链接检查，发布脚本 dry-run（如可用） | 待处理 |

## 已完成：任务 1 - 应用路径与安装布局

### 检查结论

- 问题集中在 `backend/internal/apppath`，不需要改动前端或其他业务模块。
- 风险点是 Linux 打包安装目录可能被设置为 `0555` 等只读权限，但测试/运行进程如果具备 root 或 capability，单纯创建临时文件仍可能成功，从而误判安装目录可写。
- 预期行为是：无写位的安装目录应启用 detached state，除 `bin/` 之外的配置、数据、`chrome/` 目录迁移到用户状态目录。

### 落地内容

- `dirWritable` 先检查目标路径存在且是目录。
- `dirWritable` 在临时写入探测前先检查权限写位；目录没有 owner/group/other 任意写位时，直接视为不可写。
- 保留临时文件探测，用于继续识别 ACL、只读文件系统或其他运行时写入失败情况。
- 增加单元测试覆盖无写位目录，确保具备权限绕过能力的环境也不会误判为可写。

### 验证结果

- `go test ./backend/internal/apppath`：通过。
- `npm run build`：通过。
- `go test ./...`：当前环境缺少 GTK/WebKitGTK/pkg-config 开发依赖，顶层 Wails 相关包无法编译；该限制需要在具备桌面依赖的 Linux 构建环境中复测。


## 已完成：任务 2 - 代理池页面拆分

### 本轮范围：表格列显示配置

- 优化对象：代理池主表的“显示列”配置、列选项常量、本地存储读写逻辑。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/config/proxyPoolColumns.ts`、`frontend/src/modules/browser/components/proxy-pool/ProxyColumnVisibilityMenu.tsx`。
- 当前问题：列配置常量、存储归一化、弹出菜单 UI 都直接堆在 `ProxyPoolPage.tsx` 中，增加主页面体积并让后续拆分订阅导入/测速逻辑时更容易冲突。
- 落地内容：先把列配置与 localStorage 读写封装到独立配置模块，再把列选择弹出菜单拆成独立组件；不触碰代理导入、测速、IP 健康检测等其他功能逻辑。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续在任务 2 内拆分订阅导入相关状态与弹窗，完成验证后再进入测速/IP 健康检测拆分。

### 本轮范围：直连代理导入解析

- 优化对象：直连导入表单类型、协议选项、初始表单、批量文本解析、手动代理候选构建等纯函数。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/utils/directProxyImport.ts`。
- 当前问题：直连代理导入解析和校验逻辑与代理池页面 UI/状态混在一起，使导入弹窗后续拆分时需要同时移动大量纯函数。
- 落地内容：把直连代理导入类型、常量和纯解析/构建函数抽到 `directProxyImport.ts`，页面仅保留状态编排和调用入口；不触碰 Clash/订阅解析、预览弹窗、测速或保存流程。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分 Clash/订阅解析纯函数，完成验证后再处理导入弹窗 UI 与状态。

### 本轮范围：Clash/订阅解析

- 优化对象：Clash YAML 输出、导入内容解析、Base64/分享链接订阅解析和分享链接转 Clash 节点的纯函数。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/utils/clashProxyImport.ts`。
- 当前问题：Clash/订阅解析函数体量较大，长期堆在页面中会影响导入弹窗、订阅刷新、预览过滤等后续拆分的边界。
- 落地内容：把 `ClashProxy` 类型、`parseClashImportText`、`proxyToYaml` 以及内部分享链接解析辅助函数抽到 `clashProxyImport.ts`；页面只保留展示、状态编排、来源刷新和导入候选组装。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分导入弹窗 UI 与导入状态，完成验证后再进入测速/IP 健康检测拆分。

### 本轮范围：来源元数据与手动来源标识

- 优化对象：手动来源 URL、来源展示名称、来源 URL 标准化、来源 ID 生成、来源元数据归一化和 localStorage 持久化。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/utils/proxySourceMeta.ts`。
- 当前问题：来源元数据读写和手动来源标识逻辑仍在页面内，导入弹窗、订阅刷新和订阅列表都会引用这些纯函数，继续留在页面中会阻碍后续 UI/状态拆分。
- 落地内容：把 `URLImportSourceMeta` 类型、手动来源解析/构建、来源 ID 解析、来源归档读写和来源聚合逻辑抽到 `proxySourceMeta.ts`；页面只保留调用入口与状态更新。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分导入弹窗 UI 与导入状态，完成验证后再进入测速/IP 健康检测拆分。

### 本轮范围：测速/IP 健康检测缓存

- 优化对象：测速结果转换、本地测速缓存读写、IP 健康检测缓存读写和缓存有效期控制。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/utils/proxyProbeCache.ts`。
- 当前问题：检测结果缓存属于纯持久化逻辑，但仍在页面中维护 key、TTL、清洗规则和 localStorage 读写，影响后续拆分测速/IP 健康检测流程。
- 落地内容：把 `toLatencyValue`、测速缓存、IP 健康缓存和清洗逻辑抽到 `proxyProbeCache.ts`；页面只保留检测状态、事件订阅和 UI 渲染。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分导入弹窗 UI 与导入状态，完成验证后再进入测速/IP 健康检测流程组件/Hook 拆分。

### 本轮范围：预览筛选与来源刷新筛选

- 优化对象：预览延迟/健康筛选类型、筛选选项、来源刷新筛选 JSON 编解码、筛选标签和预览项匹配逻辑。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/utils/proxyPreviewFilters.ts`。
- 当前问题：预览筛选规则同时服务导入预览、订阅刷新筛选和来源列表展示，继续放在页面内会让导入弹窗 UI/状态拆分时边界不清。
- 落地内容：把筛选类型、选项和纯匹配/编解码函数抽到 `proxyPreviewFilters.ts`；页面只保留筛选状态、异步检测编排和 UI 绑定。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分导入弹窗 UI 与导入状态，完成验证后再进入测速/IP 健康检测流程组件/Hook 拆分。

### 本轮范围：代理展示模型与内置代理

- 优化对象：内置代理定义、内置代理判断、代理配置展示信息解析、列表展示模型构建和导入预览列表构建。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/utils/proxyDisplay.ts`。
- 当前问题：代理展示模型和内置代理规则被多个表格、导入预览和批量操作复用，继续放在页面内会阻碍表格/弹窗组件拆分。
- 落地内容：把 `BUILTIN_PROXY_IDS`、`ProxyDisplayInfo`、内置代理工具、`parseProxyInfo`、`toDisplayList` 和 `buildImportPreview` 抽到 `proxyDisplay.ts`；页面只保留状态、操作编排和渲染绑定。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分导入弹窗 UI 与导入状态，完成验证后再进入测速/IP 健康检测流程组件/Hook 拆分。

### 本轮范围：来源刷新代理构建与忽略名单

- 优化对象：导入候选构建、刷新来源代理重建、已有代理 ID 复用、来源代理重命名、订阅忽略名单读写和忽略名单过滤。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/utils/proxySourceRefresh.ts`。
- 当前问题：来源刷新和导入保存流程共用的纯函数仍在页面内，导致后续拆分导入弹窗状态和订阅刷新 Hook 时会继续牵扯页面实现细节。
- 落地内容：把 `buildImportCandidatesFromClash`、`nextProxyID`、`resolveImportedProxyName`、`buildRefreshedSourceProxies`、来源代理重命名和订阅忽略名单工具抽到 `proxySourceRefresh.ts`；页面保留异步刷新、保存和 UI 事件编排。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分导入弹窗 UI 与导入状态，完成验证后再进入测速/IP 健康检测流程组件/Hook 拆分。

### 本轮范围：全局刷新配置

- 优化对象：自动刷新开关、刷新间隔 localStorage 读写、刷新间隔归一化和时间戳解析。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/utils/proxyRefreshConfig.ts`。
- 当前问题：全局刷新配置读写属于纯持久化/格式化逻辑，继续留在页面中会影响后续拆分订阅刷新 Hook。
- 落地内容：把 `normalizeRefreshIntervalM`、`parseTimestampMs`、`readGlobalRefreshConfig` 和 `writeGlobalRefreshConfig` 抽到 `proxyRefreshConfig.ts`；页面保留自动刷新调度和状态绑定。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分导入弹窗 UI 与导入状态，完成验证后再进入测速/IP 健康检测流程组件/Hook 拆分。

### 本轮范围：导入中心弹窗 UI

- 优化对象：订阅/YAML 与 HTTP/HTTPS/SOCKS5 导入中心弹窗的表单 UI、模式切换 UI 和解析按钮 footer。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/components/proxy-pool/ProxyImportModal.tsx`。
- 当前问题：导入中心 JSX 体量较大且与页面状态编排混在一起，后续拆分导入状态时仍会造成审查噪音。
- 落地内容：把导入中心 Modal UI 抽到 `ProxyImportModal.tsx`，页面通过 props 传入当前状态、状态更新回调、URL 获取和解析入口；不改变解析、预览或保存流程。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分确认导入预览弹窗 UI，然后再进入测速/IP 健康检测流程组件/Hook 拆分。

### 本轮范围：确认导入预览弹窗 UI

- 优化对象：导入预览弹窗、预览筛选栏、预览批量操作按钮、选中/删除统计和预览表格容器。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/components/proxy-pool/ProxyImportPreviewModal.tsx`。
- 当前问题：确认导入预览弹窗的 UI 与页面内的筛选、测速、IP 健康检测和选择状态编排混在一起，继续阻碍后续拆分导入状态 Hook。
- 落地内容：把预览弹窗 UI 抽到 `ProxyImportPreviewModal.tsx`，页面继续保留过滤结果、列定义、测速/IP 健康检测和导入确认回调；不改变筛选、删除、选择或导入保存行为。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分代理编辑/订阅编辑弹窗 UI，然后再进入测速/IP 健康检测流程组件/Hook 拆分。

### 本轮范围：代理编辑弹窗 UI

- 优化对象：单个代理编辑弹窗、代理名称/分组/配置/DNS 表单和保存 footer。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/components/proxy-pool/ProxyEditModal.tsx`。
- 当前问题：代理编辑表单仍留在页面尾部，与订阅编辑、IP 健康详情和删除确认弹窗堆叠在一起，影响后续继续拆分弹窗和表单状态。
- 落地内容：把代理编辑 Modal UI 抽到 `ProxyEditModal.tsx`，页面继续保留编辑对象、保存逻辑和表单状态；不改变代理保存、分组 datalist 或 DNS 配置行为。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分订阅编辑弹窗 UI，然后再进入测速/IP 健康检测流程组件/Hook 拆分。

### 本轮范围：订阅编辑弹窗 UI

- 优化对象：订阅编辑弹窗、订阅 URL/手动资源标识、分组、名称前缀、批量 DNS 表单和保存 footer。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/components/proxy-pool/ProxySourceEditModal.tsx`。
- 当前问题：订阅编辑表单仍直接堆在页面尾部，和 IP 健康详情、删除确认弹窗混在一起，后续拆分来源刷新 Hook 时会产生额外审查噪音。
- 落地内容：把订阅编辑 Modal UI 抽到 `ProxySourceEditModal.tsx`，页面继续保留来源编辑状态、保存逻辑和来源元数据更新；不改变手动资源标识、分组 datalist、名称前缀或批量 DNS 行为。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分 IP 健康原始返回弹窗 UI，然后再进入测速/IP 健康检测流程组件/Hook 拆分。

### 本轮范围：IP 健康原始返回弹窗 UI

- 优化对象：IP 健康原始返回弹窗、检测元信息、失败提示和原始 JSON 展示容器。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/components/proxy-pool/ProxyIPHealthDetailModal.tsx`。
- 当前问题：IP 健康详情弹窗仍在页面尾部直接渲染，和删除确认、主表操作混在一起；后续拆测速/IP 健康检测 Hook 时还会继续牵扯 UI 代码。
- 落地内容：把 IP 健康原始返回 Modal UI 抽到 `ProxyIPHealthDetailModal.tsx`，页面继续保留详情选择、打开/关闭状态和检测结果来源；不改变主表/预览表打开原始返回的行为。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：进入测速/IP 健康检测流程 Hook 拆分，先拆主表单个/批量检测状态，再处理预览弹窗检测状态。

### 本轮范围：任务 2 剩余项收尾

- 优化对象：主表测速/IP 健康检测流程、导入预览检测流程、代理池主工具栏/筛选栏、订阅资源列表、代理主表行操作、剩余状态边界。
- 文件范围：`frontend/src/modules/browser/pages/ProxyPoolPage.tsx`、`frontend/src/modules/browser/hooks/useProxyProbeState.ts`、`frontend/src/modules/browser/hooks/useProxyPreviewProbeState.ts`、`frontend/src/modules/browser/components/proxy-pool/ProxyPoolHeader.tsx`、`frontend/src/modules/browser/components/proxy-pool/ProxyResourcePanel.tsx`、`frontend/src/modules/browser/components/proxy-pool/ProxyRowActions.tsx`、`frontend/src/modules/browser/components/proxy-pool/ProxySourceRowActions.tsx`。
- 当前问题：任务 2 仍剩余检测流程状态、主区域工具栏/筛选/表格和行操作渲染散落在页面中，导致页面仍承担过多 UI 与异步检测编排职责。
- 落地内容：把主表检测状态与缓存写入抽到 `useProxyProbeState`，把导入预览检测状态抽到 `useProxyPreviewProbeState`；把顶部批量操作抽到 `ProxyPoolHeader`，把资源标签、订阅表、筛选栏、自动刷新控件和代理表容器抽到 `ProxyResourcePanel`，把代理行操作和订阅行操作分别抽到 `ProxyRowActions`、`ProxySourceRowActions`。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 结论：任务 2 规划项已全部完成；后续进入任务 3。


## 未完成计划清单

### 任务 2：代理池页面拆分

- [x] 拆分主表测速/IP 健康检测流程 Hook：单个测速、批量测速、单个 IP 健康检测、批量 IP 健康检测、事件订阅回写与缓存写入。
- [x] 拆分导入预览检测流程 Hook：预览列表测速、预览 IP 健康检测、预览检测状态与结果映射。
- [x] 拆分代理池主工具栏/筛选栏组件：协议筛选、分组筛选、关键字搜索、自动刷新开关、刷新间隔输入和批量操作入口。
- [x] 拆分订阅资源列表组件：来源展示、刷新状态、忽略筛选标签、编辑/删除入口和全局刷新配置展示。
- [x] 拆分代理主表列/行操作组件：测速、IP 健康、编辑、删除、刷新订阅等行内操作，进一步降低页面内 render 函数数量。
- [x] 复核 `ProxyPoolPage.tsx` 剩余状态边界，已将检测状态与主要 UI 容器继续收窄到 Hook/组件中。

### 后续全局任务（任务 2 完成后）

- [ ] 任务 3：浏览器实例列表拆分，按筛选、实例操作、批量操作、状态订阅和弹窗管理拆分 `BrowserListPage.tsx`。
- [ ] 任务 4：窗口同步后端拆分与测试，按状态管理、窗口枚举/布局、事件广播、平台差异拆分并补充核心状态测试。
- [ ] 任务 5：前端类型与 IPC，减少 `Record<string, any>` 和重复编解码逻辑，提升 IPC 数据边界类型安全。
- [ ] 任务 6：构建与质量门禁，增加独立 lint/typecheck 脚本或文档化现有检查，统一 CI 可执行命令。
- [ ] 任务 7：文档与发布说明，梳理运行时、Linux/macOS/Windows 发布路径和依赖限制，减少环境问题误判。

## 进行中：任务 3 - 浏览器实例列表拆分

### 本轮范围：表格列配置与批量操作工具栏

- 优化对象：实例列表表格显示列配置、列 localStorage 读写、拖拽顺序存储/同步、显示列菜单和批量操作工具栏。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/config/browserListTable.ts`、`frontend/src/modules/browser/components/browser-list/BrowserColumnVisibilityMenu.tsx`、`frontend/src/modules/browser/components/browser-list/BrowserBatchToolbar.tsx`。
- 当前问题：列配置、顺序存储和批量工具栏直接堆在 `BrowserListPage.tsx` 中，任务 3 后续拆筛选、实例操作、状态订阅和弹窗管理时容易交叉冲突。
- 落地内容：把列配置、显示列存储、拖拽顺序存储/广播辅助函数抽到 `browserListTable.ts`；把显示列菜单抽到 `BrowserColumnVisibilityMenu.tsx`；把批量操作工具栏抽到 `BrowserBatchToolbar.tsx`；页面继续保留选择状态和批量启动/停止/删除行为。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分实例列表顶部操作区和可折叠统计/筛选区，然后再进入实例行操作与状态订阅拆分。

### 本轮范围：顶部操作区与统计/筛选区

- 优化对象：实例列表页头、刷新/批量生成/备份/窗口同步/基础配置/扩容入口、视图切换、列显示入口、统计卡片和筛选栏容器。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/components/browser-list/BrowserListHeaderPanel.tsx`。
- 当前问题：页头操作区和可折叠统计/筛选区 JSX 仍在页面主体内，和表格、卡片列表、弹窗管理混在一起，继续影响任务 3 后续拆行操作和状态订阅。
- 落地内容：把页头与筛选统计区域抽到 `BrowserListHeaderPanel.tsx`；页面通过 props 传入统计数量、筛选状态、视图模式、按钮事件和列显示回调；不改变刷新、视图切换、筛选或导航行为。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分实例行操作和卡片视图操作区，再进入运行状态订阅 Hook 拆分。

### 本轮范围：实例行操作与卡片操作区

- 优化对象：表格行操作按钮、卡片视图操作按钮、启动/停止/重启/切换代理/置顶/关键字/Cookie/配置/克隆/删除入口。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/components/browser-list/BrowserProfileActions.tsx`。
- 当前问题：同一组实例操作在表格行和卡片视图中重复维护，按钮状态、同步主控禁用、Cookie 权限和 busy 判断分散在页面渲染函数内。
- 落地内容：把表格紧凑模式与卡片完整模式统一抽到 `BrowserProfileActions.tsx`；页面继续计算运行态和权限状态，并通过 props 传入已有操作处理函数；不改变任何实例操作行为。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：拆分运行状态订阅 Hook，再处理弹窗管理拆分。

## 下一步执行顺序

1. 下一步处理 **任务 3：浏览器实例列表拆分**，按筛选、实例操作、批量操作、状态订阅和弹窗管理继续小步拆分。
2. 任务 3 完成并验证后，再处理 **任务 4：窗口同步后端拆分与测试**，避免前后端同时大范围变更。
3. 之后依次处理任务 5（前端类型与 IPC）、任务 6（构建与质量门禁）和任务 7（文档与发布说明）。
