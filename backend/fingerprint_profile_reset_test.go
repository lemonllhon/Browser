package backend

import (
	"strings"
	"testing"
)

func TestRegenerateFingerprintArgsForProfileResetReplacesSeed(t *testing.T) {
	got := regenerateFingerprintArgsForProfileReset([]string{
		"--fingerprint=123",
		"--fingerprint-brand=Chrome",
		"--lang=zh-CN",
	}, nil)

	if len(got) != 3 {
		t.Fatalf("unexpected arg count: got=%d args=%v", len(got), got)
	}
	if got[0] == "--fingerprint=123" || !strings.HasPrefix(got[0], "--fingerprint=") {
		t.Fatalf("seed was not regenerated: %v", got)
	}
	if got[1] != "--fingerprint-brand=Chrome" || got[2] != "--lang=zh-CN" {
		t.Fatalf("non-seed args were not preserved: %v", got)
	}
}

func TestRegenerateFingerprintArgsForProfileResetUsesDefaultWhenProfileEmpty(t *testing.T) {
	got := regenerateFingerprintArgsForProfileReset(nil, []string{
		"--fingerprint=456",
		"--timezone=Asia/Shanghai",
	})

	if len(got) != 2 {
		t.Fatalf("unexpected arg count: got=%d args=%v", len(got), got)
	}
	if got[0] == "--fingerprint=456" || !strings.HasPrefix(got[0], "--fingerprint=") {
		t.Fatalf("default seed was not regenerated: %v", got)
	}
	if got[1] != "--timezone=Asia/Shanghai" {
		t.Fatalf("default non-seed args were not preserved: %v", got)
	}
}

func TestRegenerateFingerprintArgsForProfileResetAutoHardwareBuildsStoredFingerprint(t *testing.T) {
	got := regenerateFingerprintArgsForProfileReset([]string{
		"--fingerprint-auto-hardware=true",
		"--fingerprint=789",
		"--fingerprint-platform=windows",
		"--fingerprint-region=CN",
		"--lang=zh-CN",
		"--timezone=Asia/Shanghai",
		"--custom-flag=keep",
	}, nil)

	if containsLaunchArg(got, "--fingerprint-auto-hardware=true") {
		t.Fatalf("auto hardware marker should be materialized for storage: %v", got)
	}
	if containsLaunchArg(got, "--fingerprint=789") {
		t.Fatalf("auto hardware reset should generate a new seed: %v", got)
	}
	for _, want := range []string{"--fingerprint-region=CN", "--lang=zh-CN", "--timezone=Asia/Shanghai", "--custom-flag=keep"} {
		if !containsLaunchArg(got, want) {
			t.Fatalf("expected preserved arg %q in %v", want, got)
		}
	}
	for _, prefix := range []string{"--fingerprint=", "--fingerprint-brand=", "--fingerprint-platform=", "--fingerprint-webgl-vendor=", "--fingerprint-fonts="} {
		if !hasArgPrefix(got, prefix) {
			t.Fatalf("expected generated arg prefix %q in %v", prefix, got)
		}
	}
}

func hasArgPrefix(args []string, prefix string) bool {
	for _, arg := range args {
		if strings.HasPrefix(arg, prefix) {
			return true
		}
	}
	return false
}
