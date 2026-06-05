package backend

import (
	"reflect"
	"testing"
)

func TestNormalizeWindowSyncOpenUrlsSplitsLinesAndDefaultsScheme(t *testing.T) {
	got, err := normalizeWindowSyncOpenUrls([]string{"example.com\nhttps://openai.com/path", "about:blank", "ftp://invalid"})
	if err != nil {
		t.Fatalf("unexpected normalize error: %v", err)
	}
	want := []string{"https://example.com", "https://openai.com/path", "about:blank", "ftp://invalid"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected URLs %#v, got %#v", want, got)
	}
}

func TestWindowSyncVirtualKeyCode(t *testing.T) {
	if got := windowSyncVirtualKeyCode(windowSyncEvent{Key: "a"}); got != 65 {
		t.Fatalf("expected key A virtual code 65, got %d", got)
	}
	if got := windowSyncVirtualKeyCode(windowSyncEvent{Key: "ArrowLeft"}); got != 37 {
		t.Fatalf("expected ArrowLeft virtual code 37, got %d", got)
	}
	if got := windowSyncVirtualKeyCode(windowSyncEvent{Key: "Unmapped"}); got != 0 {
		t.Fatalf("expected unmapped virtual code 0, got %d", got)
	}
}
