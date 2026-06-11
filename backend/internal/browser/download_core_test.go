package browser

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestDetectCorePackageKindFromReleaseAssetURL(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"https://github.com/adryfish/fingerprint-chromium/releases/download/v142/ungoogled-chromium_142.0.7444.175-1.1_windows_x64.zip":          "zip",
		"https://github.com/adryfish/fingerprint-chromium/releases/download/v142/ungoogled-chromium-142.0.7444.175-1-x86_64_linux.tar.xz":        "tar.xz",
		"https://github.com/adryfish/fingerprint-chromium/releases/download/v142/ungoogled-chromium-142.0.7444.175-1-x86_64.AppImage?download=1": "appimage",
		"https://github.com/adryfish/fingerprint-chromium/releases/download/v142/ungoogled-chromium_142.0.7444.175-1.1_macos.dmg":                "dmg",
	}
	for rawURL, want := range cases {
		if got := detectCorePackageKind("", rawURL); got != want {
			t.Fatalf("detectCorePackageKind(%q) = %q, want %q", rawURL, got, want)
		}
	}
}

func TestArchiveCommonRoot(t *testing.T) {
	t.Parallel()

	root, ok := archiveCommonRoot([]string{
		"ungoogled-chromium/",
		"ungoogled-chromium/chrome",
		"ungoogled-chromium/locales/en-US.pak",
	})
	if !ok || root != "ungoogled-chromium/" {
		t.Fatalf("archiveCommonRoot with wrapper = (%q, %v), want common root", root, ok)
	}

	root, ok = archiveCommonRoot([]string{"chrome", "locales/en-US.pak"})
	if ok || root != "" {
		t.Fatalf("archiveCommonRoot without wrapper = (%q, %v), want no common root", root, ok)
	}
}

func TestInstallAppImageCoreAndFindExecutableOnLinux(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("AppImage installation is Linux-only")
	}
	t.Parallel()

	root := t.TempDir()
	src := filepath.Join(root, "ungoogled-chromium-142.AppImage")
	if err := os.WriteFile(src, []byte("appimage"), 0o644); err != nil {
		t.Fatalf("写入 AppImage fixture 失败: %v", err)
	}
	dest := filepath.Join(root, "core")
	if err := installAppImageCore(context.Background(), src, "https://example.test/ungoogled-chromium-142.AppImage", dest, func(int, string) {}); err != nil {
		t.Fatalf("installAppImageCore 返回错误: %v", err)
	}
	exePath, candidate, ok := FindCoreExecutable(dest)
	if !ok {
		t.Fatalf("FindCoreExecutable 未找到 AppImage")
	}
	if candidate != "*.AppImage" && candidate != "chrome.AppImage" {
		t.Fatalf("候选名错误: got %q", candidate)
	}
	if mode := mustStatMode(t, exePath); mode&0o111 == 0 {
		t.Fatalf("AppImage 未设置可执行权限: %s mode=%v", exePath, mode)
	}
}

func mustStatMode(t *testing.T, path string) os.FileMode {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat %s failed: %v", path, err)
	}
	return info.Mode()
}
