package browser

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"ant-chrome/backend/internal/logger"
	"github.com/google/uuid"
)

// DownloadProgress 进度信息载体
type DownloadProgress struct {
	Phase    string `json:"phase"`    // "downloading"、"extracting"、"done"、"cancelled" 或 "error"
	Progress int    `json:"progress"` // 进度百分比 0-100
	Message  string `json:"message"`  // 附加详情
	CorePath string `json:"corePath"` // 下载完成后保存的内核路径
}

type coreDownloadWriter struct {
	writeFunc func(p []byte) (n int, err error)
	ctx       context.Context
}

type EventEmitter func(eventName string, optionalData ...any)

func (cw *coreDownloadWriter) Write(p []byte) (int, error) {
	select {
	case <-cw.ctx.Done():
		return 0, cw.ctx.Err()
	default:
	}
	return cw.writeFunc(p)
}

// DownloadAndExtractCore 执行异步下载解压并在过程中发送事件
func (m *Manager) DownloadAndExtractCore(ctx context.Context, coreName string, targetUrl string, proxyConfig string, emitEvent EventEmitter) {
	log := logger.New("Browser")
	t := time.Now()
	coreName = strings.TrimSpace(coreName)
	targetUrl = strings.TrimSpace(targetUrl)
	proxyConfig = strings.TrimSpace(proxyConfig)
	corePath := ""
	if coreName != "" {
		corePath = filepath.ToSlash(filepath.Join("chrome", coreName))
	}

	sendEvent := func(phase string, progress int, msg string) {
		if emitEvent == nil {
			return
		}
		emitEvent("download:progress", DownloadProgress{
			Phase:    phase,
			Progress: progress,
			Message:  msg,
			CorePath: corePath,
		})
	}
	sendCancelled := func(msg string) {
		if strings.TrimSpace(msg) == "" {
			msg = "下载已中断"
		}
		sendEvent("cancelled", 0, msg)
		log.Info("内核下载已中断", logger.F("core_name", coreName), logger.F("cost", time.Since(t).String()))
	}
	if err := ctx.Err(); err != nil {
		sendCancelled("下载已中断")
		return
	}

	sendEvent("downloading", 0, "开始解析地址并创建下载请求: "+targetUrl)
	log.Info("内核下载开始", logger.F("core_name", coreName), logger.F("url", targetUrl), logger.F("proxy_mode", describeCoreDownloadProxy(proxyConfig)))

	// 1. 检查名称重复
	if coreName == "" {
		sendEvent("error", 0, "内核名称不能为空")
		return
	}
	if targetUrl == "" {
		sendEvent("error", 0, "下载地址不能为空")
		return
	}
	for _, c := range m.ListCores() {
		if strings.EqualFold(c.CoreName, coreName) || filepath.Base(c.CorePath) == coreName {
			sendEvent("error", 0, "名称已存在，请换一个名称")
			return
		}
	}

	// 确保外层 chrome/ 目录存在
	chromeDir := m.ResolveRelativePath("chrome")
	if err := os.MkdirAll(chromeDir, 0755); err != nil {
		sendEvent("error", 0, "创建 chrome 目录失败")
		return
	}

	targetDir := filepath.Join(chromeDir, coreName)
	if _, err := os.Stat(targetDir); !os.IsNotExist(err) {
		sendEvent("error", 0, "同名文件夹已存在: "+coreName)
		return
	}
	// 2. 准备 HttpClient（优先从 Windows 注册表读取真实系统代理，而非仅靠环境变量）
	transport := &http.Transport{}
	if proxyConfig == "__system__" {
		// http.ProxyFromEnvironment 只读环境变量，而 Clash 的全局代理写在 Windows 注册表里
		// 必须直接读取注册表才能拿到正确的代理地址
		if sysProxy, rErr := readSystemProxy(); rErr == nil && sysProxy != "" {
			if proxyURL, pErr := url.Parse(sysProxy); pErr == nil {
				transport.Proxy = http.ProxyURL(proxyURL)
				sendEvent("downloading", 0, "已从系统注册表读取代理: "+sysProxy)
			} else {
				// 解析失败则回退到环境变量
				transport.Proxy = http.ProxyFromEnvironment
				sendEvent("downloading", 0, "系统代理地址解析失败，使用环境变量兜底: "+pErr.Error())
			}
		} else {
			// 没有系统代理配置或读取失败，尝试环境变量兜底
			transport.Proxy = http.ProxyFromEnvironment
			sendEvent("downloading", 0, "系统注册表无代理配置，使用环境变量兜底: "+rErr.Error())
		}
	} else if proxyConfig != "" && proxyConfig != "direct://" && proxyConfig != "__direct__" {
		if proxyURL, pErr := url.Parse(proxyConfig); pErr == nil {
			transport.Proxy = http.ProxyURL(proxyURL)
			sendEvent("downloading", 0, "已使用指定代理: "+proxyURL.Scheme+"://"+proxyURL.Host)
		} else {
			sendEvent("error", 0, "代理地址解析失败: "+pErr.Error())
			log.Error("内核下载代理地址解析失败", logger.F("proxy_config", proxyConfig), logger.F("error", pErr.Error()))
			return
		}
	} else {
		sendEvent("downloading", 0, "使用直连下载")
	}

	client := &http.Client{
		Timeout:   0, // 取消全局超时，依靠 context 和分片连接维持
		Transport: transport,
	}

	tempFile, err := os.CreateTemp(chromeDir, "download_*"+coreDownloadTempSuffix(targetUrl))
	if err != nil {
		sendEvent("error", 0, "创建临时文件失败: "+err.Error())
		return
	}
	tempFilePath := tempFile.Name()
	defer func() {
		tempFile.Close()
		os.Remove(tempFilePath) // 清理临时文件
	}()

	sendEvent("downloading", 0, "开始分析下载链接(检测多线程支持)...")

	err = doConcurrentDownload(ctx, client, targetUrl, tempFile, sendEvent)
	if err != nil {
		if ctx.Err() != nil {
			sendCancelled("下载已中断")
			return
		}
		sendEvent("error", 0, "下载失败: "+err.Error())
		log.Error("内核下载失败", logger.F("url", targetUrl), logger.F("proxy_mode", describeCoreDownloadProxy(proxyConfig)), logger.F("error", err.Error()), logger.F("cost", time.Since(t).String()))
		return
	}

	tempFile.Close() // 解压前先关闭写句柄
	sendEvent("extracting", 0, "下载完成，正在准备安装文件...")
	log.Info("内核下载完成", logger.F("url", targetUrl), logger.F("temp", tempFilePath), logger.F("cost", time.Since(t).String()))

	// 3. 按平台包类型安装，并在需要时剥离顶层文件夹
	if err := installDownloadedCorePackage(ctx, tempFilePath, targetUrl, targetDir, func(p int, msg string) {
		sendEvent("extracting", p, msg)
	}); err != nil {
		os.RemoveAll(targetDir) // 删除不完整的解压文件
		if ctx.Err() != nil {
			sendCancelled("解压已中断，已清理未完成文件")
			return
		}
		sendEvent("error", 0, "安装内核失败: "+err.Error())
		log.Error("内核安装失败", logger.F("temp", tempFilePath), logger.F("target", targetDir), logger.F("error", err.Error()))
		return
	}

	// 4. 将新内核配置入库
	if m.ValidateCorePath(corePath).Valid {
		newCore := CoreInput{
			CoreId:    uuid.NewString(), // 使用固定的 UUID 或生成新的
			CoreName:  coreName,
			CorePath:  corePath,
			IsDefault: len(m.ListCores()) == 0, // 如果没有其他内核，这设为默认
		}
		if err := m.SaveCore(newCore); err != nil {
			sendEvent("error", 0, "保存配置入库失败: "+err.Error())
			log.Error("内核下载后保存配置失败", logger.F("core_name", coreName), logger.F("error", err.Error()))
			return
		}
		sendEvent("done", 100, "内核下载与配置成功: "+corePath)
		log.Info("内核下载配置入库成功", logger.F("core_name", coreName), logger.F("core_path", corePath))
	} else {
		os.RemoveAll(targetDir) // 删除不正确的解压内容
		sendEvent("error", 0, fmt.Sprintf("安装后未找到浏览器可执行文件（候选：%s），请检查下载包内容！", strings.Join(CoreExecutableCandidates(), ", ")))
		log.Error("内核安装内容无效", logger.F("target", targetDir), logger.F("candidates", strings.Join(CoreExecutableCandidates(), ",")))
	}
}

func describeCoreDownloadProxy(proxyConfig string) string {
	lower := strings.ToLower(strings.TrimSpace(proxyConfig))
	switch {
	case lower == "", lower == "__direct__", lower == "direct://":
		return "direct"
	case lower == "__system__":
		return "system"
	case strings.HasPrefix(lower, "http://"), strings.HasPrefix(lower, "https://"):
		return "http"
	case strings.HasPrefix(lower, "socks5://"):
		return "socks5"
	default:
		return "custom"
	}
}

func coreDownloadTempSuffix(targetURL string) string {
	lower := strings.ToLower(strings.TrimSpace(targetURL))
	if u, err := url.Parse(lower); err == nil && u.Path != "" {
		lower = u.Path
	}
	switch {
	case strings.HasSuffix(lower, ".tar.xz") || strings.HasSuffix(lower, ".txz"):
		return ".tar.xz"
	case strings.HasSuffix(lower, ".appimage"):
		return ".AppImage"
	case strings.HasSuffix(lower, ".dmg"):
		return ".dmg"
	case strings.HasSuffix(lower, ".zip"):
		return ".zip"
	default:
		return ".download"
	}
}

func installDownloadedCorePackage(ctx context.Context, packagePath, sourceURL, dest string, progressCb func(int, string)) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	kind := detectCorePackageKind(packagePath, sourceURL)
	switch kind {
	case "zip":
		return extractZipAndStripRoot(ctx, packagePath, dest, progressCb)
	case "tar.xz":
		return extractTarXZAndStripRoot(ctx, packagePath, dest, progressCb)
	case "appimage":
		return installAppImageCore(ctx, packagePath, sourceURL, dest, progressCb)
	case "dmg":
		return installDMGCore(ctx, packagePath, dest, progressCb)
	default:
		return fmt.Errorf("不支持的内核包格式：%s（当前平台建议 Windows 使用 .zip，Linux 使用 .tar.xz 或 .AppImage，macOS 使用 .dmg）", filepath.Base(sourceURL))
	}
}

func detectCorePackageKind(packagePath, sourceURL string) string {
	name := strings.ToLower(strings.TrimSpace(sourceURL))
	if u, err := url.Parse(name); err == nil && u.Path != "" {
		name = u.Path
	}
	if name == "" {
		name = packagePath
	}
	switch {
	case strings.HasSuffix(name, ".zip"):
		return "zip"
	case strings.HasSuffix(name, ".tar.xz") || strings.HasSuffix(name, ".txz"):
		return "tar.xz"
	case strings.HasSuffix(name, ".appimage"):
		return "appimage"
	case strings.HasSuffix(name, ".dmg"):
		return "dmg"
	}
	return ""
}

// extractZipAndStripRoot 解压 ZIP 包，如果其所有文件全被同一个根目录包裹，则剥离这层根目录解压至 dest
// progressCb 为进度回调 (0-100%, statusType_msg)
func extractZipAndStripRoot(ctx context.Context, zipPath, dest string, progressCb func(int, string)) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	if len(r.File) == 0 {
		return fmt.Errorf("空的压缩包")
	}

	// 探测是否存在单一顶层目录
	var rootPrefix string
	hasCommonRoot := true

	for _, f := range r.File {
		cleanName := filepath.ToSlash(f.Name)
		parts := strings.SplitN(cleanName, "/", 2)

		// 检查空名称文件，理论上不该有
		if len(parts) == 0 || parts[0] == "" {
			continue
		}

		if rootPrefix == "" {
			rootPrefix = parts[0] + "/"
		} else if !strings.HasPrefix(cleanName, rootPrefix) && cleanName != strings.TrimSuffix(rootPrefix, "/") {
			hasCommonRoot = false
			break
		}
	}

	if err := os.MkdirAll(dest, 0755); err != nil {
		return err
	}

	totalFiles := len(r.File)
	for i, f := range r.File {
		if err := ctx.Err(); err != nil {
			return err
		}
		// 报告进度 (逢 5% 更新一下)
		percent := int((float64(i) / float64(totalFiles)) * 100)
		if i%50 == 0 {
			progressCb(percent, fmt.Sprintf("正在解压文件 %d / %d...", i+1, totalFiles))
		}

		cleanName := filepath.ToSlash(f.Name)
		if hasCommonRoot {
			if cleanName == rootPrefix || cleanName == strings.TrimSuffix(rootPrefix, "/") {
				// 忽略外包装本层目录条目
				continue
			}
			cleanName = strings.TrimPrefix(cleanName, rootPrefix)
		}

		if cleanName == "" || cleanName == "/" {
			continue
		}

		fpath := filepath.Join(dest, filepath.FromSlash(cleanName))
		// 防止 Zip Slip 漏洞
		if !strings.HasPrefix(fpath, filepath.Clean(dest)+string(os.PathSeparator)) {
			return fmt.Errorf("非法文件路径: %s", fpath)
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, f.Mode())
			continue
		}
		if err := os.MkdirAll(filepath.Dir(fpath), 0755); err != nil {
			return err
		}

		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			return fmt.Errorf("打开解压文件写入失败 %s: %v", fpath, err)
		}

		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return fmt.Errorf("读取压缩包文件失败 %s: %v", f.Name, err)
		}

		err = copyZipFileWithContext(ctx, outFile, rc)
		outFile.Close()
		rc.Close()

		if err != nil {
			return fmt.Errorf("写入文件流失败 %s: %v", fpath, err)
		}
	}

	progressCb(100, "解压完成！")
	return nil
}

func extractTarXZAndStripRoot(ctx context.Context, archivePath, dest string, progressCb func(int, string)) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	listCmd := exec.CommandContext(ctx, "tar", "-tJf", archivePath)
	listOutput, err := listCmd.Output()
	if err != nil {
		return fmt.Errorf("读取 tar.xz 文件列表失败: %w", err)
	}
	entries := strings.FieldsFunc(string(listOutput), func(r rune) bool { return r == '\n' || r == '\r' })
	if len(entries) == 0 {
		return fmt.Errorf("空的压缩包")
	}
	rootPrefix, hasCommonRoot := archiveCommonRoot(entries)
	if err := validateTarExtractionEntries(entries, rootPrefix, hasCommonRoot); err != nil {
		return err
	}
	if err := os.MkdirAll(dest, 0755); err != nil {
		return err
	}
	progressCb(0, "正在解压 tar.xz 内核包...")
	args := []string{"-xJf", archivePath, "-C", dest}
	if hasCommonRoot && rootPrefix != "" {
		args = append(args, "--strip-components=1")
	}
	cmd := exec.CommandContext(ctx, "tar", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("解压 tar.xz 失败: %w: %s", err, strings.TrimSpace(string(output)))
	}
	progressCb(100, "解压完成！")
	return nil
}

func validateTarExtractionEntries(entries []string, rootPrefix string, hasCommonRoot bool) error {
	for _, entry := range entries {
		name := filepath.ToSlash(strings.TrimSpace(entry))
		if hasCommonRoot {
			if name == rootPrefix || name == strings.TrimSuffix(rootPrefix, "/") {
				continue
			}
			name = strings.TrimPrefix(name, rootPrefix)
		}
		if name == "" || name == "/" {
			continue
		}
		if filepath.IsAbs(name) || strings.HasPrefix(name, "../") || strings.Contains(name, "/../") || name == ".." {
			return fmt.Errorf("非法文件路径: %s", entry)
		}
	}
	return nil
}

func archiveCommonRoot(entries []string) (string, bool) {
	var rootPrefix string
	for _, entry := range entries {
		name := filepath.ToSlash(strings.TrimSpace(entry))
		parts := strings.SplitN(name, "/", 2)
		if len(parts) == 0 || parts[0] == "" {
			continue
		}
		if rootPrefix == "" {
			rootPrefix = parts[0] + "/"
			continue
		}
		if !strings.HasPrefix(name, rootPrefix) && name != strings.TrimSuffix(rootPrefix, "/") {
			return "", false
		}
	}
	return rootPrefix, rootPrefix != ""
}

func installAppImageCore(ctx context.Context, packagePath, sourceURL, dest string, progressCb func(int, string)) error {
	if runtime.GOOS != "linux" {
		return fmt.Errorf("AppImage 仅支持在 Linux 版本中作为内核直接安装；当前平台请下载对应平台的内核包")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.MkdirAll(dest, 0755); err != nil {
		return err
	}
	name := corePackageBaseName(sourceURL)
	if !strings.HasSuffix(strings.ToLower(name), ".appimage") {
		name = "chrome.AppImage"
	}
	outPath := filepath.Join(dest, name)
	progressCb(0, "正在安装 AppImage 内核...")
	if err := copyFile(ctx, packagePath, outPath, 0755); err != nil {
		return err
	}
	progressCb(100, "AppImage 内核安装完成！")
	return nil
}

func installDMGCore(ctx context.Context, dmgPath, dest string, progressCb func(int, string)) error {
	if runtime.GOOS != "darwin" {
		return fmt.Errorf("DMG 只能在 macOS 版本中挂载安装；Linux 请使用 .tar.xz 或 .AppImage，Windows 请使用 .zip")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	mountDir, err := os.MkdirTemp("", "browser-core-dmg-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(mountDir)

	progressCb(0, "正在挂载 DMG...")
	attach := exec.CommandContext(ctx, "hdiutil", "attach", dmgPath, "-nobrowse", "-readonly", "-mountpoint", mountDir)
	if output, err := attach.CombinedOutput(); err != nil {
		return fmt.Errorf("挂载 DMG 失败: %w: %s", err, strings.TrimSpace(string(output)))
	}
	defer exec.Command("hdiutil", "detach", mountDir, "-quiet").Run()

	appPath, err := findFirstAppBundle(mountDir)
	if err != nil {
		return err
	}
	progressCb(35, "正在复制 macOS .app 内核...")
	if err := os.MkdirAll(dest, 0755); err != nil {
		return err
	}
	if err := copyDir(ctx, appPath, filepath.Join(dest, filepath.Base(appPath))); err != nil {
		return err
	}
	progressCb(100, "DMG 内核安装完成！")
	return nil
}

func findFirstAppBundle(root string) (string, error) {
	var found string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if found != "" {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() && strings.HasSuffix(strings.ToLower(d.Name()), ".app") {
			if _, _, ok := findAppBundleExecutable(path); ok {
				found = path
				return filepath.SkipDir
			}
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if found == "" {
		return "", fmt.Errorf("DMG 中未找到可用的 Chromium .app")
	}
	return found, nil
}

func copyDir(ctx context.Context, src, dst string) error {
	return filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		outPath := filepath.Join(dst, rel)
		info, err := d.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			linkTarget, err := os.Readlink(path)
			if err != nil {
				return err
			}
			if err := os.MkdirAll(filepath.Dir(outPath), 0755); err != nil {
				return err
			}
			return os.Symlink(linkTarget, outPath)
		}
		if d.IsDir() {
			return os.MkdirAll(outPath, info.Mode())
		}
		return copyFile(ctx, path, outPath, info.Mode())
	})
}

func copyFile(ctx context.Context, src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(&coreDownloadWriter{ctx: ctx, writeFunc: out.Write}, in)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func corePackageBaseName(sourceURL string) string {
	if u, err := url.Parse(strings.TrimSpace(sourceURL)); err == nil && u.Path != "" {
		return filepath.Base(u.Path)
	}
	return filepath.Base(sourceURL)
}

func copyZipFileWithContext(ctx context.Context, dst io.Writer, src io.Reader) error {
	buf := make([]byte, 1024*1024)
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		n, readErr := src.Read(buf)
		if n > 0 {
			if _, writeErr := dst.Write(buf[:n]); writeErr != nil {
				return writeErr
			}
		}
		if readErr == io.EOF {
			return nil
		}
		if readErr != nil {
			return readErr
		}
	}
}

func doConcurrentDownload(ctx context.Context, client *http.Client, targetUrl string, tempFile *os.File, sendEvent func(string, int, string)) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetUrl, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Range", "bytes=0-0")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		resp.Body.Close()
		return fmt.Errorf("HTTP状态码异常: %d", resp.StatusCode)
	}

	var totalSize int64 = resp.ContentLength
	supportRange := resp.StatusCode == http.StatusPartialContent

	if supportRange {
		cr := resp.Header.Get("Content-Range")
		if cr != "" {
			parts := strings.Split(cr, "/")
			if len(parts) == 2 {
				fmt.Sscanf(parts[1], "%d", &totalSize)
			}
		}
	}
	resp.Body.Close()

	if totalSize <= 0 || !supportRange {
		sendEvent("downloading", 0, "服务器不支持多线程，回退至单流下载...")
		return doSingleThreadDownload(ctx, client, targetUrl, tempFile, totalSize, sendEvent)
	}

	sendEvent("downloading", 0, fmt.Sprintf("支持多线程分片下载，总大小 %.2f MB", float64(totalSize)/1024/1024))

	if err := tempFile.Truncate(totalSize); err != nil {
		return err
	}

	numWorkers := 8
	chunkSize := totalSize / int64(numWorkers)

	var wg sync.WaitGroup
	var downloaded int64
	var mu sync.Mutex
	var lastTick time.Time
	var downloadErr error

	for i := 0; i < numWorkers; i++ {
		start := int64(i) * chunkSize
		end := start + chunkSize - 1
		if i == numWorkers-1 {
			end = totalSize - 1
		}

		wg.Add(1)
		go func(part int, start, end int64) {
			defer wg.Done()

			for retry := 0; retry < 3; retry++ {
				if ctx.Err() != nil {
					return
				}

				req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetUrl, nil)
				if err != nil {
					mu.Lock()
					if downloadErr == nil {
						downloadErr = err
					}
					mu.Unlock()
					return
				}
				req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, end))
				pResp, err := client.Do(req)
				if err != nil {
					time.Sleep(2 * time.Second)
					continue
				}

				buf := make([]byte, 256*1024)
				var written int64

				for {
					if ctx.Err() != nil {
						pResp.Body.Close()
						return
					}
					n, rErr := pResp.Body.Read(buf)
					if n > 0 {
						tempFile.WriteAt(buf[:n], start+written)
						written += int64(n)

						mu.Lock()
						downloaded += int64(n)
						if time.Since(lastTick) > time.Second {
							percent := int((float64(downloaded) / float64(totalSize)) * 100)
							sendEvent("downloading", percent, fmt.Sprintf("并行下载中... %.2f MB / %.2f MB", float64(downloaded)/1024/1024, float64(totalSize)/1024/1024))
							lastTick = time.Now()
						}
						mu.Unlock()
					}
					if rErr == io.EOF {
						break
					}
					if rErr != nil {
						mu.Lock()
						if downloadErr == nil {
							downloadErr = rErr
						}
						mu.Unlock()
						pResp.Body.Close()
						return
					}
				}
				pResp.Body.Close()
				return
			}
		}(i, start, end)
	}

	wg.Wait()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return downloadErr
}

func doSingleThreadDownload(ctx context.Context, client *http.Client, targetUrl string, tempFile *os.File, totalSize int64, sendEvent func(string, int, string)) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetUrl, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP状态码异常: %d", resp.StatusCode)
	}

	var downloaded int64
	var lastTick time.Time

	pw := &coreDownloadWriter{
		writeFunc: func(p []byte) (n int, err error) {
			n, err = tempFile.Write(p)
			if n > 0 {
				downloaded += int64(n)
				if totalSize > 0 && time.Since(lastTick) > time.Second {
					percent := int((float64(downloaded) / float64(totalSize)) * 100)
					sendEvent("downloading", percent, fmt.Sprintf("单流下载中... %.2f MB / %.2f MB", float64(downloaded)/1024/1024, float64(totalSize)/1024/1024))
					lastTick = time.Now()
				}
			}
			return n, err
		},
		ctx: ctx,
	}

	buf := make([]byte, 1024*1024)
	_, err = io.CopyBuffer(pw, resp.Body, buf)
	return err
}
