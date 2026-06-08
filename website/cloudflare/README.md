# Trace Browser Cloudflare 静态官网

这个目录是可直接部署到 Cloudflare Pages 的自包含静态项目。

## 目录内容

- `index.html`：官网页面
- `styles.css`：页面样式
- `script.js`：导航、动效和轮播逻辑
- `assets/`：logo、favicon 和官网截图资源
- `_headers`：Cloudflare Pages 响应头配置

## Cloudflare Pages 直接上传

1. 进入 Cloudflare Dashboard。
2. 创建 Pages 项目。
3. 选择直接上传。
4. 上传整个 `website/cloudflare` 目录内的文件。

## 连接 Git 仓库部署

如果 Cloudflare 连接的是整个仓库：

- Build command：留空
- Build output directory：`website/cloudflare`
- Root directory：仓库根目录

这个项目不需要安装依赖，也不需要构建命令。
