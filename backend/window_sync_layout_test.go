package backend

import (
	"reflect"
	"testing"
)

func TestNormalizeWindowSyncLayoutSettings(t *testing.T) {
	settings := normalizeWindowSyncLayoutSettings(WindowSyncLayoutSettings{
		Mode:   "unknown",
		Scope:  "all-screen",
		Width:  -1,
		Height: 0,
		GapX:   -5,
		GapY:   12,
		PerRow: 0,
	})

	if settings.Mode != "grid" {
		t.Fatalf("expected invalid mode to fall back to grid, got %q", settings.Mode)
	}
	if settings.Scope != windowSyncLayoutScopeAllScreens {
		t.Fatalf("expected all-screen scope to normalize to %q, got %q", windowSyncLayoutScopeAllScreens, settings.Scope)
	}
	if settings.Width != 1500 || settings.Height != 500 || settings.PerRow != 2 {
		t.Fatalf("expected default dimensions/per-row, got %#v", settings)
	}
	if settings.GapX != 0 || settings.GapY != 12 {
		t.Fatalf("expected negative gap to clamp and positive gap to preserve, got %#v", settings)
	}
}

func TestOrderedWindowSyncWindowsPutsMasterFirst(t *testing.T) {
	state := &WindowSyncState{
		MasterProfileId: "p2",
		Windows: []WindowSyncCandidate{
			{ProfileId: "p1"},
			{ProfileId: "p2"},
			{ProfileId: "p3"},
		},
	}

	got := orderedWindowSyncWindows(state)
	want := []WindowSyncCandidate{{ProfileId: "p2"}, {ProfileId: "p1"}, {ProfileId: "p3"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected master-first order %#v, got %#v", want, got)
	}
	if state.Windows[0].ProfileId != "p1" {
		t.Fatalf("expected source state order to remain unchanged, got %#v", state.Windows)
	}
}

func TestCalculateWindowSyncLayoutRectsCustomMode(t *testing.T) {
	settings := WindowSyncLayoutSettings{Mode: "custom", Width: 400, Height: 300, GapX: 10, GapY: 20, PerRow: 2}
	windows := []WindowSyncCandidate{{ProfileId: "p1"}, {ProfileId: "p2"}, {ProfileId: "p3"}}
	area := workAreaRect{Left: 100, Top: 200, Width: 1200, Height: 800}

	rects := calculateWindowSyncLayoutRects(settings, windows, area)
	want := map[string]workAreaRect{
		"p1": {Left: 100, Top: 200, Width: 400, Height: 300},
		"p2": {Left: 510, Top: 200, Width: 400, Height: 300},
		"p3": {Left: 100, Top: 520, Width: 400, Height: 300},
	}
	if !reflect.DeepEqual(rects, want) {
		t.Fatalf("expected custom layout rects %#v, got %#v", want, rects)
	}
}
