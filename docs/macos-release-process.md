# macOS 发布流程与手动修正手册

本文档记录当前 `mac` 分支的 macOS 发布流程。目标是后续遇到 macOS 发布失败时，可以按步骤手动修正、重新打 tag、重新触发构建。

当前有效流程基于：

- `.github/workflows/publish-macos.yml`
- `publish/mac/publish-mac.sh`
- `publish/config.init.mac.yaml`
- `publish/runtime-manifest.json`
- `bin/darwin-arm64/*`
- `bin/darwin-amd64/*`

## 当前状态

当前 macOS 发布 workflow 已经可以构建两个架构：

- `arm64` 使用 GitHub runner `macos-15`
- `amd64` 使用 GitHub runner `macos-15-intel`

当前发布产物名称格式：

- `TraceBrowser-<version>-macos-arm64.zip`
- `TraceBrowser-<version>-macos-arm64.sha256.txt`
- `TraceBrowser-<version>-macos-amd64.zip`
- `TraceBrowser-<version>-macos-amd64.sha256.txt`

GitHub Actions artifact 名称格式：

- `trace-browser-macos-arm64-<version>`
- `trace-browser-macos-amd64-<version>`

当前 `.app` 内部会放置：

- `Trace Browser.app/Contents/MacOS/trace-browser`
- `Trace Browser.app/Contents/MacOS/config.yaml`
- `Trace Browser.app/Contents/MacOS/bin/darwin-<arch>/xray`
- `Trace Browser.app/Contents/MacOS/bin/darwin-<arch>/sing-box`
- `Trace Browser.app/Contents/MacOS/bin/darwin-<arch>/mihomo`
- `Trace Browser.app/Contents/MacOS/bin/xray`
- `Trace Browser.app/Contents/MacOS/bin/sing-box`
- `Trace Browser.app/Contents/MacOS/bin/mihomo`

其中平铺的 `Contents/MacOS/bin/*` 是兼容兜底，平台目录 `Contents/MacOS/bin/darwin-<arch>/*` 是主要运行时查找位置。

## 发布前检查

先确认当前在 `mac` 分支：

```powershell
git status --short --branch
git log --oneline -5 --decorate
```

如果本地有其他业务改动，不要使用 `git add .`。只 stage 你本次修 mac 发布需要的文件，例如：

```powershell
git add .github/workflows/publish-macos.yml publish/mac/publish-mac.sh docs/macos-release-process.md
```

检查 Darwin runtime 是否存在并且 hash 正确：

```powershell
bash tools/runtime/verify-runtime.sh darwin-arm64
bash tools/runtime/verify-runtime.sh darwin-amd64
```

检查 shell 脚本语法：

```powershell
bash -n publish/mac/publish-mac.sh
```

检查空白和行尾问题：

```powershell
git diff --check
git ls-files --eol .github/workflows/publish-macos.yml publish/mac/publish-mac.sh .gitattributes
```

`.sh`、`.yml`、`.yaml` 应保持 LF。当前仓库用 `.gitattributes` 固定这些文件的行尾。

## 手动触发 GitHub Actions

进入 GitHub Actions，选择：

- workflow: `Publish macOS Packages`
- branch: `mac`
- `version`: 可以留空，默认读取 `build/config.yml` 的 `info.version`
- `release_tag`: 例如 `mac-v0.0.87`
- `arch`: 建议先选 `arm64` 验证；稳定后选 `all`
- `environment`: 测试用 `staging`，正式用 `production`

如果 `release_tag` 留空，手动触发时 workflow 会使用 `v<version>` 作为 release tag。做 mac 专项测试时建议显式填写 `mac-v<version>`，避免污染普通全平台 tag。

## 用 tag 自动触发

mac 专项测试 tag 推荐使用：

```powershell
git tag -f mac-v0.0.87
git push --force lemonllhon mac-v0.0.87
```

如果本次有代码修正，需要先提交并推分支：

```powershell
git add <changed-files>
git commit -m "fix: <message>"
git tag -f mac-v0.0.87
git push lemonllhon mac
git push --force lemonllhon mac-v0.0.87
```

远端确认：

```powershell
git ls-remote lemonllhon refs/heads/mac refs/tags/mac-v0.0.87
```

分支和 tag 应该指向同一个最新提交。

## 版本解析规则

workflow 的 `Resolve version` 会按以下顺序决定版本：

1. `workflow_dispatch` 输入的 `version`
2. 当前 release/tag，例如 `mac-v0.0.87`
3. `build/config.yml` 里的 `info.version`

tag 会做归一化：

- `mac-v0.0.87` -> `0.0.87`
- `mac-0.0.87` -> `0.0.87`
- `v0.0.87` -> `0.0.87`

版本必须符合：

```text
<major>.<minor>.<patch>
```

允许后缀，例如 `0.0.87-beta.1`。

## 发布仓库与 release 位置

workflow 支持两种 release 上传方式：

1. 如果 `vars.PUBLIC_RELEASE_REPOSITORY` 为空，上传到当前仓库 release。
2. 如果 `vars.PUBLIC_RELEASE_REPOSITORY` 不为空，上传到该公开发布仓库。

当前成功 run 里，`Upload macOS packages to current repository release` 是 skipped，`Upload macOS packages to public release repository` 是 success。这表示产物上传到了 GitHub Environment 里配置的 `PUBLIC_RELEASE_REPOSITORY`，不在 `lemonllhon/Browser` 当前仓库 release 列表里。

需要在 GitHub 仓库的 Environments 中检查：

- `staging` / `production`
- Environment variable: `PUBLIC_RELEASE_REPOSITORY`
- Environment secret: `PUBLIC_RELEASE_TOKEN`

`PUBLIC_RELEASE_TOKEN` 需要有目标发布仓库的 release 写入权限。

## 本地 Mac 手动构建

在真实 macOS 机器上安装依赖：

```bash
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-alpha.96
```

Apple Silicon：

```bash
bash publish/mac/publish-mac.sh --arch arm64 --version 0.0.87
```

Intel Mac：

```bash
bash publish/mac/publish-mac.sh --arch amd64 --version 0.0.87
```

脚本要求 host 架构和 target 架构一致：

- `uname -m` 是 `arm64` 时只能构建 `--arch arm64`
- `uname -m` 是 `x86_64` 时只能构建 `--arch amd64`

脚本会输出：

- `publish/output/TraceBrowser-<version>-macos-<arch>.app`
- `publish/output/TraceBrowser-<version>-macos-<arch>.zip`

如果想保留中间 staging `.app` 方便检查：

```bash
bash publish/mac/publish-mac.sh --arch arm64 --version 0.0.87 --keep-staging
```

## 手动检查 `.app`

在 macOS 上检查 bundle 结构：

```bash
APP="publish/output/TraceBrowser-0.0.87-macos-arm64.app"
test -f "$APP/Contents/MacOS/trace-browser"
test -f "$APP/Contents/Info.plist"
test -f "$APP/Contents/MacOS/config.yaml"
test -x "$APP/Contents/MacOS/bin/xray"
test -x "$APP/Contents/MacOS/bin/sing-box"
test -x "$APP/Contents/MacOS/bin/mihomo"
plutil -lint "$APP/Contents/Info.plist"
```

检查架构：

```bash
file "$APP/Contents/MacOS/trace-browser"
file "$APP/Contents/MacOS/bin/xray"
file "$APP/Contents/MacOS/bin/sing-box"
file "$APP/Contents/MacOS/bin/mihomo"
```

检查压缩包：

```bash
ditto -x -k publish/output/TraceBrowser-0.0.87-macos-arm64.zip /tmp/trace-browser-mac-test
find /tmp/trace-browser-mac-test -maxdepth 4 -type f | sort | head
```

## 常见失败和处理

### Invalid workflow file: matrix

现象：

```text
Unrecognized named-value: 'matrix'
```

原因通常是在 job-level `if` 里引用了 `matrix.arch`。matrix 还没展开时不能在 job-level `if` 里使用。

处理：

- 保留 `prepare-matrix` job。
- 在 `prepare-matrix` 中根据输入生成 matrix JSON。
- `build` job 使用 `fromJSON(needs.prepare-matrix.outputs.matrix)`。

### unexpected EOF while looking for matching `)`

现象：

```text
unexpected EOF while looking for matching `)'
```

原因通常是 GitHub Actions 的 bash step 里在 `$()` 中使用了缩进 heredoc，或者 Windows 行尾影响 shell 解析。

处理：

- workflow 和 `publish/mac/publish-mac.sh` 中尽量使用 `python3 -c`，避免把 Python heredoc 放进 `$()`。
- 确认 `.sh` 和 `.yml` 是 LF：

```powershell
git ls-files --eol publish/mac/publish-mac.sh .github/workflows/publish-macos.yml
```

### failed to locate built `.app`

现象：

```text
failed to locate built .app bundle under .../build/bin
```

当前 Wails3 build 实际可能只生成：

```text
build/bin/trace-browser
```

处理：

- `publish/mac/publish-mac.sh` 已经有 fallback：找不到 Wails 生成的 `.app` 时，会用 `build/bin/trace-browser` 手动组装 `Trace Browser.app`。
- 如果再次失败，检查 `Build macOS package` 步骤里是否真的生成了 `build/bin/trace-browser`。
- 检查 `Taskfile.yml` 的 `darwin:build` 输出名是否仍然是 `trace-browser`。

### Darwin runtime missing

现象：

```text
runtime file missing for darwin-arm64
runtime manifest has no entries for darwin-arm64
```

处理：

```powershell
bash tools/runtime/verify-runtime.sh darwin-arm64
bash tools/runtime/verify-runtime.sh darwin-amd64
```

确认这些文件存在：

- `bin/darwin-arm64/xray`
- `bin/darwin-arm64/sing-box`
- `bin/darwin-arm64/mihomo`
- `bin/darwin-amd64/xray`
- `bin/darwin-amd64/sing-box`
- `bin/darwin-amd64/mihomo`

如果需要重建 runtime manifest，使用项目里的 runtime 工具更新 `publish/runtime-manifest.json`，再重新 verify。

### Release 在当前仓库查不到

如果 workflow 成功，但当前仓库 `lemonllhon/Browser` 查不到 `mac-v<version>` release，先看 job steps：

- `Upload macOS packages to current repository release`
- `Upload macOS packages to public release repository`

如果前者 skipped、后者 success，说明 release 上传到了 `PUBLIC_RELEASE_REPOSITORY` 指向的仓库。这是正常情况。

### Node.js 20 action runtime warning

GitHub Actions 可能提示 JavaScript action runtime 从 Node 20 切到 Node 24。当前 mac workflow 已设置：

```yaml
env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
```

这只影响 GitHub JavaScript actions 自身的运行时，不影响 `actions/setup-node` 给前端安装的 Node 20。

## 成功标准

一次 macOS 发布成功应满足：

- `Prepare macOS matrix`: success
- `Build macOS arm64`: success
- `Build macOS amd64`: success
- `Upload macOS artifacts`: success
- `Upload macOS packages to current repository release` 或 `Upload macOS packages to public release repository`: success

Artifacts 至少包含：

- `trace-browser-macos-arm64-<version>`
- `trace-browser-macos-amd64-<version>`

Release assets 至少包含：

- `TraceBrowser-<version>-macos-arm64.zip`
- `TraceBrowser-<version>-macos-arm64.sha256.txt`
- `TraceBrowser-<version>-macos-amd64.zip`
- `TraceBrowser-<version>-macos-amd64.sha256.txt`

## 当前限制

当前 macOS 包是 unsigned internal build：

- 没有 codesign
- 没有 notarization
- 没有 `.dmg`

对外正式发布前，需要补：

1. Apple Developer ID 证书
2. helper binaries 签名
3. `.app` 签名
4. notarization
5. staple
6. 可选 `.dmg` 生成

在未签名阶段，用户第一次启动可能需要通过 Finder 的右键打开，或在系统安全设置中允许打开。
