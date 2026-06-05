package backend

import "testing"

func TestWindowSyncVisibleWindowBoundsCopiesNumericBounds(t *testing.T) {
	bounds := windowSyncVisibleWindowBounds(map[string]any{
		"left":   float64(10),
		"top":    int32(20),
		"width":  int64(800),
		"height": "ignored",
	})

	if bounds["windowState"] != "normal" {
		t.Fatalf("expected normal window state, got %#v", bounds)
	}
	if bounds["left"] != 10 || bounds["top"] != 20 || bounds["width"] != 800 {
		t.Fatalf("expected numeric bounds to be copied, got %#v", bounds)
	}
	if _, ok := bounds["height"]; ok {
		t.Fatalf("expected non-numeric height to be ignored, got %#v", bounds)
	}
}

func TestWindowSyncVisibleWindowBoundsDefaultsForInvalidInput(t *testing.T) {
	bounds := windowSyncVisibleWindowBounds(nil)
	if len(bounds) != 1 || bounds["windowState"] != "normal" {
		t.Fatalf("expected default normal bounds, got %#v", bounds)
	}
}
