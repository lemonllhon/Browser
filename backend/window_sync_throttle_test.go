package backend

import "testing"

func TestWindowSyncMouseMoveSame(t *testing.T) {
	first := windowSyncEvent{Type: "mouseMove", TargetId: "t1", TargetIndex: 1, TargetUrl: "https://example.com/", X: 12, Y: 34, Buttons: 1, Modifiers: 2}
	second := windowSyncEvent{Type: "mouseMove", TargetId: "t1", TargetIndex: 1, TargetUrl: "https://example.com", X: 12.0004, Y: 34.0003, Buttons: 1, Modifiers: 2}
	if !windowSyncMouseMoveSame(first, second) {
		t.Fatalf("expected equivalent mousemove events")
	}
	third := second
	third.Y = 35
	if windowSyncMouseMoveSame(first, third) {
		t.Fatalf("expected changed coordinates to be different")
	}
}

func TestMergeWindowSyncWheelEvent(t *testing.T) {
	previous := windowSyncEvent{Type: "wheel", TargetId: "t1", X: 1, Y: 2, DeltaX: 3, DeltaY: 4}
	next := windowSyncEvent{Type: "wheel", TargetId: "t1", X: 5, Y: 6, DeltaX: 7, DeltaY: 8}
	merged := mergeWindowSyncWheelEvent(previous, next)
	if merged.X != 5 || merged.Y != 6 {
		t.Fatalf("expected latest coordinates to win, got x=%v y=%v", merged.X, merged.Y)
	}
	if merged.DeltaX != 10 || merged.DeltaY != 12 {
		t.Fatalf("expected wheel deltas to merge, got dx=%v dy=%v", merged.DeltaX, merged.DeltaY)
	}
}

func TestWindowSyncEventThrottleKeyFallsBackToNormalizedURL(t *testing.T) {
	key := windowSyncEventThrottleKey(windowSyncEvent{Type: "wheel", TargetUrl: "HTTPS://Example.COM/"})
	if key != "wheel|https://example.com" {
		t.Fatalf("unexpected throttle key: %s", key)
	}
}
