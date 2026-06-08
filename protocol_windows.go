//go:build windows

package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

func ensureURLProtocolRegistration(scheme string, description string, startupDebugEnabled bool) error {
	scheme = strings.TrimSpace(strings.ToLower(scheme))
	if scheme == "" {
		return fmt.Errorf("protocol scheme is empty")
	}

	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve executable path: %w", err)
	}
	exePath, err = filepath.Abs(exePath)
	if err != nil {
		return fmt.Errorf("resolve absolute executable path: %w", err)
	}

	if isTemporaryExecutable(exePath) {
		if startupDebugEnabled {
			log.Printf("跳过临时可执行文件的 URL 协议注册: scheme=%s exe=%s", scheme, exePath)
		}
		return nil
	}

	if strings.TrimSpace(description) == "" {
		description = "Trace Browser URL"
	}
	command := fmt.Sprintf("%q \"%%1\"", exePath)
	rootPath := `Software\Classes\` + scheme

	rootKey, _, err := registry.CreateKey(registry.CURRENT_USER, rootPath, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("create protocol key %s: %w", rootPath, err)
	}
	defer rootKey.Close()

	if err := rootKey.SetStringValue("", "URL:"+description); err != nil {
		return fmt.Errorf("write protocol description: %w", err)
	}
	if err := rootKey.SetStringValue("URL Protocol", ""); err != nil {
		return fmt.Errorf("write URL Protocol marker: %w", err)
	}
	if err := rootKey.SetStringValue("FriendlyTypeName", description); err != nil {
		return fmt.Errorf("write protocol friendly name: %w", err)
	}

	iconKey, _, err := registry.CreateKey(registry.CURRENT_USER, rootPath+`\DefaultIcon`, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("create protocol icon key: %w", err)
	}
	if err := iconKey.SetStringValue("", exePath+",0"); err != nil {
		_ = iconKey.Close()
		return fmt.Errorf("write protocol icon: %w", err)
	}
	if err := iconKey.Close(); err != nil {
		return fmt.Errorf("close protocol icon key: %w", err)
	}

	commandKey, _, err := registry.CreateKey(registry.CURRENT_USER, rootPath+`\shell\open\command`, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("create protocol command key: %w", err)
	}
	if err := commandKey.SetStringValue("", command); err != nil {
		_ = commandKey.Close()
		return fmt.Errorf("write protocol command: %w", err)
	}
	if err := commandKey.Close(); err != nil {
		return fmt.Errorf("close protocol command key: %w", err)
	}

	if startupDebugEnabled {
		log.Printf("URL 协议注册完成: scheme=%s command=%s", scheme, command)
	}
	return nil
}

func isTemporaryExecutable(exePath string) bool {
	tempDir := strings.TrimSpace(os.TempDir())
	if tempDir == "" {
		return false
	}
	exeDir := filepath.Dir(exePath)
	if resolved, err := filepath.EvalSymlinks(exeDir); err == nil {
		exeDir = resolved
	}
	if resolved, err := filepath.EvalSymlinks(tempDir); err == nil {
		tempDir = resolved
	}
	exeDir = strings.ToLower(filepath.Clean(exeDir))
	tempDir = strings.ToLower(filepath.Clean(tempDir))
	return exeDir == tempDir || strings.HasPrefix(exeDir, tempDir+string(filepath.Separator))
}
