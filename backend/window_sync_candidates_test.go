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

func TestWindowSyncListCandidatesClearsStaleRuntimeState(t *testing.T) {
	app := newRuntimeStateTestApp(t.TempDir())
	app.browserMgr.Profiles["profile-1"] = &BrowserProfile{
		ProfileId:   "profile-1",
		ProfileName: "Profile 1",
		Running:     true,
		DebugReady:  true,
		DebugPort:   9,
	}

	candidates := app.WindowSyncListCandidates()
	if len(candidates) != 1 {
		t.Fatalf("expected one candidate, got %#v", candidates)
	}
	got := candidates[0]
	if got.Running || got.CanSync || !got.CanAutoStart {
		t.Fatalf("expected stale running state to be cleared for auto-start candidate, got %#v", got)
	}
}
