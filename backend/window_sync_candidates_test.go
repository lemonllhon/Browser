package backend

import (
	"reflect"
	"testing"
)

func TestNormalizeWindowSyncProfileIds(t *testing.T) {
	got := normalizeWindowSyncProfileIds([]string{" p1 ", "", "p2", "p1", "\t", "p3", "p2"})
	want := []string{"p1", "p2", "p3"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected normalized ids %#v, got %#v", want, got)
	}
}

func TestWindowSyncStartupLaunchArgs(t *testing.T) {
	got := windowSyncStartupLaunchArgs(workAreaRect{Left: 12, Top: 34, Width: 800, Height: 600})
	want := []string{"--window-position=12,34", "--window-size=800,600"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected launch args %#v, got %#v", want, got)
	}

	if args := windowSyncStartupLaunchArgs(workAreaRect{Left: 12, Top: 34, Width: 0, Height: 600}); args != nil {
		t.Fatalf("expected nil launch args for invalid rect, got %#v", args)
	}
}
