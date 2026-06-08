package backend

import (
	"fmt"
	"net"
	"net/http"
	"reflect"
	"sync/atomic"
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

func TestPageWebSocketTargetsUsesShortCache(t *testing.T) {
	var requests atomic.Int32
	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requests.Add(1)
			w.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprint(w, `[{"id":"target-1","type":"page","title":"A","url":"https://example.com","webSocketDebuggerUrl":"ws://127.0.0.1/devtools/page/target-1"}]`)
		}),
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen failed: %v", err)
	}
	defer listener.Close()
	go func() { _ = server.Serve(listener) }()
	defer server.Close()

	port := listener.Addr().(*net.TCPAddr).Port
	invalidatePageWebSocketTargets(port)
	first, err := pageWebSocketTargets(port)
	if err != nil {
		t.Fatalf("first target fetch failed: %v", err)
	}
	second, err := pageWebSocketTargets(port)
	if err != nil {
		t.Fatalf("second target fetch failed: %v", err)
	}
	if len(first) != 1 || len(second) != 1 || first[0].Id != "target-1" || second[0].Id != "target-1" {
		t.Fatalf("unexpected targets: first=%#v second=%#v", first, second)
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("expected cached second fetch, got %d requests", got)
	}

	invalidatePageWebSocketTargets(port)
	if _, err := pageWebSocketTargets(port); err != nil {
		t.Fatalf("third target fetch failed: %v", err)
	}
	if got := requests.Load(); got != 2 {
		t.Fatalf("expected invalidation to refetch, got %d requests", got)
	}
}
