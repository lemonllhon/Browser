package cloudsync

import (
	"fmt"
	"os"
	"runtime"
	"strings"

	"github.com/google/uuid"
)

func DefaultDeviceName() string {
	return "Trace Browser " + platformName()
}

func platformName() string {
	switch runtime.GOOS {
	case "windows":
		return "Windows"
	case "darwin":
		return "macOS"
	case "linux":
		return "Linux"
	default:
		return runtime.GOOS
	}
}

func deviceFingerprint(store *Store) (string, error) {
	if existing, err := store.LoadFingerprint(); err == nil && strings.TrimSpace(existing) != "" {
		return existing, nil
	}
	host, _ := os.Hostname()
	host = strings.TrimSpace(host)
	if host == "" {
		host = "desktop"
	}
	value := fmt.Sprintf("trace-desktop-%s-%s", sanitizeFingerprintPart(host), uuid.NewString())
	return value, store.SaveFingerprint(value)
}

func sanitizeFingerprintPart(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var builder strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			builder.WriteRune(r)
			continue
		}
		builder.WriteByte('-')
	}
	out := strings.Trim(builder.String(), "-")
	if out == "" {
		return "desktop"
	}
	if len(out) > 40 {
		return out[:40]
	}
	return out
}
