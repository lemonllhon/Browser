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
| 3 | 浏览器实例列表 | 拆分筛选、实例操作、批量操作、状态订阅和弹窗管理，降低列表页耦合 | `frontend/src/modules/browser/pages/BrowserListPage.tsx` 及相关组件 | `npm run build`，实例启动/停止/筛选人工检查 | 已完成：表格列配置、拖拽顺序存储、显示列菜单、批量操作工具栏、顶部操作区、统计/筛选区、实例行操作、卡片操作区、运行状态订阅 Hook、基础配置/内核管理弹窗、窗口同步弹窗、轻量反馈/确认弹窗、列表单元格组件、拖拽排序 Hook、列表格式化工具、视图偏好 Hook、列表数据加载 Hook、窗口同步状态 Hook、列表筛选/核心解析工具、基础配置/内核管理 Hook、批量/复制/删除 Hook、单实例运行时动作 Hook 和代理展示工具拆分均已落地 |
| 4 | 窗口同步后端 | 按状态管理、窗口枚举/布局、事件广播、平台差异拆分，补充核心状态测试 | `backend/window_sync.go` 及拆分后的后端文件 | `go test ./backend/...` 中不依赖 WebView 的子包，新增单测 | 进行中：已完成类型/常量、状态管理和候选窗口/自动启动前置逻辑拆分 |
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
- [ ] 任务 4：窗口同步后端拆分与测试，按状态管理、窗口枚举/布局、事件广播、平台差异拆分并补充核心状态测试。当前已完成类型/常量拆分与状态管理拆分。
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

### 本轮范围：运行状态订阅 Hook

- 优化对象：浏览器实例生命周期事件订阅、profiles/groups 静默刷新、启动/停止 pending 状态清理、窗口同步状态订阅和轮询刷新。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/hooks/useBrowserListRuntimeSync.ts`。
- 当前问题：运行状态订阅和窗口同步监听直接写在页面初始化 effect 中，和初始数据加载、筛选、表格渲染混在一起，后续拆弹窗管理时仍会牵扯运行态刷新逻辑。
- 落地内容：把 runtime event、window sync state change、初始窗口同步配置读取和可见状态轮询抽到 `useBrowserListRuntimeSync`；页面保留初始 profiles/groups/proxies/cores 加载和传入必要 setter/刷新函数。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过。
- 下一步：继续拆分弹窗管理，优先处理基础配置/内核管理弹窗。

### 本轮范围：基础配置与内核管理弹窗

- 优化对象：浏览器实例列表里的基础配置弹窗、内核管理表格和内核新增/编辑弹窗。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/components/browser-list/BrowserListSettingsModal.tsx`、`frontend/src/modules/browser/components/browser-list/BrowserCoreEditModal.tsx`。
- 当前问题：基础配置、内核列表和内核路径验证 UI 仍以内联 JSX 形式留在 `BrowserListPage.tsx` 中，和窗口同步、复制实例、代理错误提示等其他弹窗混在一起，弹窗管理继续膨胀页面主体。
- 落地内容：把基础配置与内核管理列表抽到 `BrowserListSettingsModal.tsx`，把内核新增/编辑和路径验证反馈抽到 `BrowserCoreEditModal.tsx`；页面只保留状态、保存/验证/删除/设默认等业务处理函数，并通过 props 连接新组件。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：继续处理任务 3 的剩余弹窗管理，优先拆分窗口同步配置弹窗，再收敛复制实例、代理错误提示、删除确认等轻量弹窗。

### 本轮范围：窗口同步弹窗管理

- 优化对象：浏览器实例列表里的窗口同步选择弹窗、窗口布局弹窗和窗口同步基础设置弹窗。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/components/browser-list/BrowserWindowSyncModals.tsx`。
- 当前问题：窗口同步的候选窗口表、布局模式选择、自定义布局输入和主控颜色/键鼠同步设置仍以内联 JSX 形式堆在 `BrowserListPage.tsx` 中，导致任务 3 的弹窗管理拆分还不完整。
- 落地内容：新增 `BrowserWindowSyncModal`、`BrowserWindowSyncLayoutModal` 和 `BrowserWindowSyncSettingsModal`，把三类窗口同步弹窗 UI 收拢到同一业务组件文件；页面保留候选窗口加载、开始/停止同步、布局应用和设置保存等业务逻辑，并通过 props 连接。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：继续处理任务 3 剩余轻量弹窗，优先收敛复制实例弹窗、代理错误提示和删除/清理确认弹窗。

### 本轮范围：轻量反馈与确认弹窗

- 优化对象：浏览器实例列表里的代理错误提示、扩容说明、复制实例、操作失败提示、Cookie/用户数据清理确认、单个删除确认和批量删除确认弹窗。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/components/browser-list/BrowserListFeedbackModals.tsx`。
- 当前问题：任务 3 的主要弹窗拆分后，页面底部仍保留多组轻量 `Modal` / `ConfirmModal`，这些弹窗虽然逻辑较轻，但持续占用页面主体并让复制/删除/错误反馈状态和 UI 混在一起。
- 落地内容：新增 `BrowserListFeedbackModals.tsx`，统一承载轻量反馈与确认弹窗；页面只保留目标状态、确认处理函数和关闭回调，并通过 props 连接。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：复核 `BrowserListPage.tsx` 剩余内联 UI 与辅助函数，评估是否继续拆分 LaunchCode/名称复制单元格等小组件，或在任务 3 收尾后转入任务 4。

### 本轮范围：列表单元格小组件

- 优化对象：浏览器实例列表里的快捷码单元格、实例名称复制按钮和关键字折叠展示行。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/components/browser-list/BrowserListCells.tsx`。
- 当前问题：任务 3 的弹窗拆分完成后，页面顶部仍保留若干带自身状态和事件处理的小单元格组件；其中快捷码单元格还直接依赖快捷码重新生成/自定义 API，使页面入口继续混合表格展示和单元格行为。
- 落地内容：新增 `BrowserListCells.tsx`，集中承载 `LaunchCodeCell`、`CopyProfileNameButton` 和 `KeywordInlineRow`；页面只在表格/卡片渲染处引用这些组件，并移除不再需要的快捷码 API 与图标导入。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：复核 `BrowserListPage.tsx` 剩余纯函数/拖拽排序逻辑，确认任务 3 是否可以收尾，或继续把拖拽排序状态拆为 Hook。

### 本轮范围：拖拽排序 Hook

- 优化对象：浏览器实例列表里的自定义排序持久化、跨标签页同步和表格/卡片拖拽排序交互。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/hooks/useBrowserProfileOrderDnD.tsx`。
- 当前问题：列表页仍直接维护排序 localStorage、BroadcastChannel 同步、拖拽 hover/placement 状态和拖拽句柄渲染，导致页面中业务操作、表格排序和拖拽交互继续耦合。
- 落地内容：新增 `useBrowserProfileOrderDnD`，封装排序读写、跨标签页同步、profile 顺序 reconcile、拖拽开始/悬停/离开/放下/结束处理、拖拽样式和拖拽句柄渲染；页面只消费 `profileOrder` 与 Hook 返回的处理函数。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：复核任务 3 剩余页面纯函数和运行/批量操作状态，确认浏览器实例列表拆分是否可以阶段性收尾。

### 本轮范围：列表格式化工具函数

- 优化对象：浏览器实例列表里的自然排序、状态标签解析、实例编号展示、时间格式化、Cookie 文件名清洗/下载、Cookie 操作提示和窗口同步颜色归一化等纯函数。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/hooks/useBrowserProfileOrderDnD.tsx`、`frontend/src/modules/browser/utils/browserListFormat.ts`。
- 当前问题：任务 3 的 UI/Hook 拆分后，页面顶部仍保留多组纯函数，且拖拽排序 Hook 内重复实现自然排序，导致格式化/排序规则分散。
- 落地内容：新增 `browserListFormat.ts`，统一导出列表格式化、排序、下载和提示辅助函数；页面与拖拽排序 Hook 改为复用该工具模块。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：复核任务 3 剩余业务操作状态（启动/停止/批量/窗口同步数据加载）是否需要继续拆 Hook；如无明显收益，任务 3 可阶段性收尾并转入任务 4。

### 本轮范围：视图偏好与筛选持久化 Hook

- 优化对象：浏览器实例列表里的视图模式、显示列、筛选条件和顶部统计/筛选面板折叠状态。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/hooks/useBrowserListViewState.ts`。
- 当前问题：页面仍直接维护多组 localStorage 读写 effect，包括 `browser:viewMode`、`browser:filters`、`browser:headerCollapsed` 和显示列配置，导致页面顶部状态初始化与持久化逻辑偏重。
- 落地内容：新增 `useBrowserListViewState`，统一封装视图模式、显示列、筛选条件、面板折叠状态及其持久化，并内置显示列锁定/归一化切换逻辑；页面只消费 Hook 返回的状态和回调。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：复核任务 3 剩余业务操作状态（启动/停止/批量/窗口同步数据加载），确认是否继续拆业务操作 Hook 或阶段性收尾任务 3。

### 本轮范围：列表数据加载 Hook

- 优化对象：浏览器实例列表里的 profiles/proxies/groups/cores 数据加载、静默刷新去重、profiles ref 同步和运行态刷新时的启动/停止 pending 状态清理。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/hooks/useBrowserListData.ts`、`frontend/src/modules/browser/hooks/useBrowserProfileOrderDnD.tsx`。
- 当前问题：页面仍直接维护 profiles、proxies、groups、cores、loading、静默刷新 ref 和 profiles 状态合并逻辑；这些逻辑和启动/停止/批量操作、运行状态订阅交织在一起，页面状态边界仍偏大。
- 落地内容：新增 `useBrowserListData`，封装列表数据状态、初始加载、profiles 合并/替换、静默刷新去重、运行态刷新 pending 清理、groups/proxies/cores 加载；拖拽排序 Hook 改为根据 `profiles` 自行 reconcile 顺序。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：复核任务 3 剩余业务操作处理函数，如继续拆分收益不大，则将浏览器实例列表拆分标记为阶段性完成并转入任务 4。

### 本轮范围：窗口同步状态与动作 Hook

- 优化对象：浏览器实例列表里的窗口同步候选加载、勾选/主控选择、开始/停止同步、布局应用和同步基础设置保存。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/hooks/useBrowserWindowSync.ts`。
- 当前问题：窗口同步 UI 已拆分为弹窗组件，但页面仍直接维护候选窗口、主控窗口、布局、设置、加载态以及多组同步动作处理函数。
- 落地内容：新增 `useBrowserWindowSync`，封装窗口同步状态、候选窗口刷新、全选/清空、开始/停止、布局和基础设置保存逻辑；页面只保留 Hook 返回的状态/回调并传给运行状态订阅和弹窗组件。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：复核任务 3 剩余启动/停止/批量操作处理函数，如果没有明显可拆收益，标记任务 3 阶段性完成并进入任务 4。

### 本轮范围：列表筛选与核心解析工具函数

- 优化对象：浏览器实例列表里的分组/关键字/状态/代理/内核/标签筛选、拖拽顺序排序、自然排序以及实例使用内核解析展示。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/utils/browserListFilters.ts`。
- 当前问题：页面已经拆出视图状态、数据加载和窗口同步 Hook，但筛选排序与内核解析仍内联在页面中，后续调整筛选条件或排序规则时需要直接改页面主体。
- 落地内容：新增 `browserListFilters.ts`，集中提供 `filterAndSortBrowserProfiles`、`resolveBrowserProfileCore` 和 `getBrowserProfileCoreLabel`；页面仅通过 `useMemo` 调用工具函数并复用核心解析展示逻辑。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：继续复核任务 3 剩余启动/停止/批量/复制/删除等业务操作处理函数，按可控范围拆分或确认阶段性收尾。

### 本轮范围：基础配置与内核管理 Hook

- 优化对象：浏览器实例列表里的基础配置弹窗状态、默认指纹/启动参数文本、内核新增/编辑/校验/删除/默认设置等管理动作。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/hooks/useBrowserCoreSettings.ts`。
- 当前问题：基础配置和内核管理弹窗 UI 已组件化，但页面仍直接保存 settings/coreForm/saving/validation 状态并内联多组 API 调用处理函数。
- 落地内容：新增 `useBrowserCoreSettings`，封装设置加载/保存、内核表单打开、路径校验、保存、删除和设为默认逻辑；页面只保留 Hook 返回值与弹窗组件绑定。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：继续复核任务 3 剩余启动/停止/批量/复制/删除等实例业务操作处理函数，按可控范围拆分或确认阶段性收尾。

### 本轮范围：批量选择、复制与删除操作 Hook

- 优化对象：浏览器实例列表里的勾选状态联动、批量启动/停止/删除、复制弹窗状态和单实例删除确认流程。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/hooks/useBrowserProfileBatchActions.ts`。
- 当前问题：列表页面仍直接维护批量 loading、复制/删除确认状态，并内联批量启动/停止/删除、复制和选择切换逻辑，和表格/卡片渲染交织。
- 落地内容：新增 `useBrowserProfileBatchActions`，集中封装选中项批量操作、复制弹窗、删除确认、批量 pending 状态更新和批量结果提示；页面只保留选中 ID 状态并消费 Hook 返回的动作。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：继续复核任务 3 剩余单实例启动/停止/重启/代理切换/Cookie/窗口定位等运行时动作，按可控范围拆分或确认阶段性收尾。

### 本轮范围：单实例运行时动作 Hook

- 优化对象：浏览器实例列表里的单实例启动、停止、重启、代理手动切换、窗口置顶居中、Cookie 导出/清理，以及代理不支持提示状态。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/hooks/useBrowserProfileRuntimeActions.ts`。
- 当前问题：批量/复制/删除动作拆分后，页面仍直接维护运行时 pending 集合和代理错误/Cookie 清理状态，并内联多组单实例运行时 API 调用与提示逻辑。
- 落地内容：新增 `useBrowserProfileRuntimeActions`，封装单实例运行时动作、代理校验弹窗、Cookie 清理确认目标、运行时 pending 集合和相关提示；页面只负责把 Hook 返回的状态和动作传给行操作/反馈弹窗。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：任务 3 的主要拆分项已基本完成，下一轮复核页面剩余渲染体积；如果无高收益拆分点，则标记任务 3 阶段性完成并进入任务 4。

### 本轮范围：代理展示工具函数与任务 3 收尾

- 优化对象：浏览器实例列表里的代理展示名解析，尤其是自动切换代理时的模式/分组/最近出口展示。
- 文件范围：`frontend/src/modules/browser/pages/BrowserListPage.tsx`、`frontend/src/modules/browser/utils/browserListProxyDisplay.ts`。
- 当前问题：任务 3 的状态、动作、弹窗和筛选逻辑已经拆分，但页面仍保留一个代理展示名解析纯函数；后续调整自动切换展示文案时仍要进入页面文件。
- 落地内容：新增 `browserListProxyDisplay.ts`，集中提供 `getBrowserProfileProxyDisplayName`；页面改为只通过该工具函数获取代理展示名称。同时将任务 3 标记为已完成，下一步正式进入任务 4。
- 验证方式：运行 `npm run build`，确认 TypeScript 与 Vite 生产构建通过；同时运行 `git diff --check` 检查补丁格式。
- 下一步：开始 **任务 4：窗口同步后端拆分与测试**，优先按状态管理、窗口枚举/布局、事件广播和平台差异拆分，避免继续扩大前端页面改动。

## 进行中：任务 4 - 窗口同步后端拆分与测试

### 本轮范围：窗口同步类型与常量拆分

- 优化对象：窗口同步后端里的公开输入/输出 DTO、内部同步目标结构、默认颜色、事件绑定名和布局 scope 常量。
- 文件范围：`backend/window_sync.go`、`backend/window_sync_types.go`。
- 当前问题：`backend/window_sync.go` 同时承载类型定义、状态变更、候选窗口枚举、布局、事件广播和 DevTools 操作，文件入口区域过长，不利于后续按功能拆分和补充状态测试。
- 落地内容：新增 `window_sync_types.go`，先把类型和常量从主实现文件中抽离，保持同一 `backend` 包内可见性不变，为后续状态管理、窗口枚举/布局、事件广播和平台差异拆分建立清晰边界。
- 验证方式：运行 `gofmt`、`git diff --check`、`go test ./backend/internal/apppath` 和不依赖桌面环境的窗口同步相关包测试；顶层 `go test ./...` 仍需桌面依赖环境验证。
- 下一步：继续任务 4，优先拆分窗口同步状态管理函数（`WindowSyncGetState`、`WindowSyncStop`、设置保存、暂停/恢复、状态 clone/默认设置等），并补充纯状态单测。

### 本轮范围：窗口同步状态管理拆分与纯函数测试

- 优化对象：窗口同步状态读取/停止、设置读取/保存、暂停/恢复、运行态状态要求、默认设置、设置归一化、主控颜色归一化和状态 clone。
- 文件范围：`backend/window_sync.go`、`backend/window_sync_state.go`、`backend/window_sync_state_test.go`。
- 当前问题：类型/常量拆分后，主实现文件仍承载状态生命周期和纯状态辅助函数；这些逻辑和候选窗口枚举、布局、事件广播、DevTools 操作混在同一文件里，不便于优先补单测。
- 落地内容：新增 `window_sync_state.go`，抽离 `WindowSyncGetState`、`WindowSyncStop`、`WindowSyncGetSettings`、`WindowSyncSaveSettings`、`WindowSyncPause`、`WindowSyncResume`、`requireWindowSyncState`、settings 归一化和 `cloneWindowSyncState`；新增 `window_sync_state_test.go` 覆盖颜色归一化、默认颜色回退和 clone slice 深拷贝。
- 验证方式：运行 `gofmt`、`git diff --check`、`go test ./backend`、`go test ./backend/internal/apppath ./backend/internal/transport/protoipc`；顶层 `go test ./...` 仍需桌面依赖环境验证。
- 下一步：继续任务 4，拆分候选窗口枚举和调试端口可达性检测，随后拆 layout、事件广播、DevTools/输入动作和平台差异逻辑。

### 本轮范围：候选窗口枚举与启动前置逻辑拆分

- 优化对象：窗口同步候选列表、profile ID 归一化、同步启动前自动启动实例、启动窗口预排、实例快照、实例 ready 等待和候选窗口解析。
- 文件范围：`backend/window_sync.go`、`backend/window_sync_candidates.go`、`backend/window_sync_candidates_test.go`。
- 当前问题：状态管理拆分后，主实现文件顶部仍包含候选窗口枚举和同步启动前置检查；这些逻辑依赖 browser manager、调试端口可达性和自动启动实例，与后续 layout/事件/DevTools 拆分边界不同。
- 落地内容：新增 `window_sync_candidates.go`，抽离 `WindowSyncListCandidates`、`ensureWindowSyncProfilesReady`、`plannedWindowSyncStartupRects`、`windowSyncProfileSnapshot`、`waitWindowSyncProfileReady`、`resolveWindowSyncCandidates` 和 `normalizeWindowSyncProfileIds`；新增 `window_sync_candidates_test.go` 覆盖 profile ID 去重、裁剪和顺序保留。
- 验证方式：运行 `gofmt`、`git diff --check`、`go test ./backend/internal/apppath ./backend/internal/transport/protoipc`、`npm run build`；顶层 `go test ./...` 仍需桌面依赖环境验证。
- 下一步：继续任务 4，拆分 layout scope/屏幕区域/窗口排列与工具栏尺寸逻辑，随后拆事件广播、DevTools/输入动作和平台差异逻辑。

### 任务 4 剩余计划

- [x] 状态管理拆分：抽离窗口同步状态读写、clone、默认设置、暂停/恢复、设置保存与状态变更事件触发，并补充 settings/clone 纯函数单测。
- [x] 候选窗口枚举拆分：抽离候选实例扫描、调试端口可达性检测、自动启动前置检查和 profile ID 归一化。
- [ ] 布局拆分：抽离 layout scope、屏幕区域计算、窗口排列和工具栏尺寸更新逻辑。
- [ ] 事件广播拆分：抽离前端事件绑定、状态变更 emit、toolbar 更新/隐藏等事件侧逻辑。
- [ ] DevTools/输入动作拆分：抽离批量输入、标签页关闭/刷新/URL 打开等 Chrome DevTools 操作。
- [ ] 平台差异拆分：将窗口定位、置顶、显示、屏幕/toolbar 区域相关平台实现整理成更清晰的边界。
- [ ] 测试补充：优先为纯状态函数、settings 归一化、layout 归一化、候选排序/过滤和结果聚合补单元测试。

### 后续未完成总计划

- 任务 4：窗口同步后端拆分与测试（进行中，剩余项见上）。
- 任务 5：前端类型与 IPC，减少 `Record<string, any>` 和重复编解码逻辑，提升 IPC 数据边界类型安全。
- 任务 6：构建与质量门禁，增加独立 lint/typecheck 脚本或文档化现有检查，统一 CI 可执行命令。
- 任务 7：文档与发布说明，梳理运行时、Linux/macOS/Windows 发布路径和依赖限制，减少环境问题误判。

## 下一步执行顺序

1. 下一步处理 **任务 4：窗口同步后端拆分与测试**，避免前后端同时大范围变更。
2. 任务 4 完成并验证后，再处理任务 5（前端类型与 IPC）。
3. 之后依次处理任务 6（构建与质量门禁）和任务 7（文档与发布说明）。
