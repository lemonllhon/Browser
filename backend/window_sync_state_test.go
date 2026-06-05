package backend

import "testing"

type noopWindowSyncToolbarAdapter struct{}

func (noopWindowSyncToolbarAdapter) Show(_ *App, _ *WindowSyncState) error { return nil }
func (noopWindowSyncToolbarAdapter) Update(_ *WindowSyncState) error       { return nil }
func (noopWindowSyncToolbarAdapter) Hide() error                           { return nil }
func (noopWindowSyncToolbarAdapter) SetSize(_ int, _ int) error            { return nil }
func (noopWindowSyncToolbarAdapter) CenterPoint() (int, int, bool)         { return 0, 0, false }

type recordingWindowSyncPromptAdapter struct {
	called bool
	prompt WindowSyncMasterClosedPrompt
}

func (a *recordingWindowSyncPromptAdapter) ShowMasterClosedPrompt(_ *App, prompt WindowSyncMasterClosedPrompt) bool {
	a.called = true
	a.prompt = prompt
	return true
}

func TestHandleWindowSyncControlledStoppedRemovesWindow(t *testing.T) {
	app := NewApp(t.TempDir())
	app.SetWindowSyncToolbarAdapter(noopWindowSyncToolbarAdapter{})
	app.windowSyncState = testWindowSyncState([]string{"p1", "p2", "p3"}, "p1")

	app.handleWindowSyncProfileStopped("p2", "stopped")

	state := app.windowSyncState
	if state == nil || !state.Active {
		t.Fatalf("expected window sync to remain active, got %#v", state)
	}
	if len(state.Windows) != 2 || len(state.ProfileIds) != 2 {
		t.Fatalf("expected one controlled window to be removed, got %#v", state)
	}
	if windowSyncStateHasProfile(state, "p2") {
		t.Fatalf("expected removed profile to disappear from state: %#v", state)
	}
	if !windowSyncStateHasProfile(state, "p1") || !windowSyncStateHasProfile(state, "p3") {
		t.Fatalf("expected remaining profiles to stay in sync state: %#v", state)
	}
}

func TestHandleWindowSyncControlledStoppedKeepsRemainingLiveWindows(t *testing.T) {
	app := NewApp(t.TempDir())
	app.SetWindowSyncToolbarAdapter(noopWindowSyncToolbarAdapter{})
	app.windowSyncState = testWindowSyncState([]string{"p1", "p2", "p3", "p4"}, "p1")
	markWindowSyncCandidateStopped(app.windowSyncState, "p3")

	app.handleWindowSyncProfileStopped("p2", "stopped")

	state := app.windowSyncState
	if state == nil || !state.Active {
		t.Fatalf("expected window sync to remain active while master and p4 are still controllable, got %#v", state)
	}
	if windowSyncStateHasProfile(state, "p2") || windowSyncStateHasProfile(state, "p3") {
		t.Fatalf("expected closed/unavailable controlled windows to be removed, got %#v", state)
	}
	if !windowSyncStateHasProfile(state, "p1") || !windowSyncStateHasProfile(state, "p4") {
		t.Fatalf("expected live master and controlled window to remain, got %#v", state)
	}
}

func TestHandleWindowSyncControlledStoppedStopsWhenNoControllableControlledRemain(t *testing.T) {
	app := NewApp(t.TempDir())
	app.SetWindowSyncToolbarAdapter(noopWindowSyncToolbarAdapter{})
	app.windowSyncState = testWindowSyncState([]string{"p1", "p2", "p3"}, "p1")
	markWindowSyncCandidateStopped(app.windowSyncState, "p3")

	app.handleWindowSyncProfileStopped("p2", "stopped")

	if app.windowSyncState != nil {
		t.Fatalf("expected window sync to stop when no controllable controlled windows remain, got %#v", app.windowSyncState)
	}
}

func TestHandleWindowSyncControlledStoppedStopsWhenOnlyMasterRemains(t *testing.T) {
	app := NewApp(t.TempDir())
	app.SetWindowSyncToolbarAdapter(noopWindowSyncToolbarAdapter{})
	app.windowSyncState = testWindowSyncState([]string{"p1", "p2"}, "p1")

	app.handleWindowSyncProfileStopped("p2", "stopped")

	if app.windowSyncState != nil {
		t.Fatalf("expected window sync to stop when fewer than two windows remain, got %#v", app.windowSyncState)
	}
}

func TestHandleWindowSyncMasterStoppedStopsSession(t *testing.T) {
	app := NewApp(t.TempDir())
	app.SetWindowSyncToolbarAdapter(noopWindowSyncToolbarAdapter{})
	app.windowSyncState = testWindowSyncState([]string{"p1", "p2", "p3"}, "p1")

	app.handleWindowSyncProfileStopped("p1", "stopped")

	if app.windowSyncState != nil {
		t.Fatalf("expected master stop to clear active window sync state, got %#v", app.windowSyncState)
	}
}

func TestHandleWindowSyncMasterStoppedUsesPromptAdapter(t *testing.T) {
	app := NewApp(t.TempDir())
	app.SetWindowSyncToolbarAdapter(noopWindowSyncToolbarAdapter{})
	promptAdapter := &recordingWindowSyncPromptAdapter{}
	app.SetWindowSyncPromptAdapter(promptAdapter)
	app.windowSyncState = testWindowSyncState([]string{"p1", "p2", "p3"}, "p1")

	app.handleWindowSyncProfileStopped("p1", "stopped")

	if !promptAdapter.called {
		t.Fatal("expected master close prompt adapter to be called")
	}
	if promptAdapter.prompt.ProfileId != "p1" || promptAdapter.prompt.ProfileName != "p1" {
		t.Fatalf("unexpected master prompt profile: %#v", promptAdapter.prompt)
	}
	if got := promptAdapter.prompt.RemainingProfileIds; len(got) != 2 || got[0] != "p2" || got[1] != "p3" {
		t.Fatalf("unexpected remaining profiles: %#v", got)
	}
	if promptAdapter.prompt.Reason != "stopped" {
		t.Fatalf("unexpected prompt reason: %q", promptAdapter.prompt.Reason)
	}
}

func testWindowSyncState(profileIds []string, masterProfileId string) *WindowSyncState {
	windows := make([]WindowSyncCandidate, 0, len(profileIds))
	for index, profileId := range profileIds {
		isMaster := profileId == masterProfileId
		role := "controlled"
		if isMaster {
			role = "master"
		}
		windows = append(windows, WindowSyncCandidate{
			ProfileId:   profileId,
			ProfileName: profileId,
			DebugPort:   9000 + index,
			Pid:         1000 + index,
			Running:     true,
			DebugReady:  true,
			Role:        role,
			Master:      isMaster,
			CanSync:     true,
		})
	}
	return &WindowSyncState{
		SessionId:       "test-session",
		Active:          true,
		MasterProfileId: masterProfileId,
		ProfileIds:      append([]string{}, profileIds...),
		Windows:         windows,
		MasterColor:     defaultWindowSyncMasterColor,
		SyncKeyboard:    true,
		SyncMouse:       true,
		Layout:          defaultWindowSyncLayoutSettings(),
	}
}

func TestNormalizeWindowSyncSettings(t *testing.T) {
	settings := normalizeWindowSyncSettings(WindowSyncSettings{
		MasterColor:  "abc",
		SyncKeyboard: false,
		SyncMouse:    true,
	})

	if settings.MasterColor != "#aabbcc" {
		t.Fatalf("expected short hex color normalized, got %q", settings.MasterColor)
	}
	if settings.SyncKeyboard {
		t.Fatalf("expected SyncKeyboard to preserve false")
	}
	if !settings.SyncMouse {
		t.Fatalf("expected SyncMouse to preserve true")
	}
}

func TestNormalizeWindowSyncSettingsFallsBackToDefaultColor(t *testing.T) {
	settings := normalizeWindowSyncSettings(WindowSyncSettings{MasterColor: "not-a-color"})

	if settings.MasterColor != defaultWindowSyncMasterColor {
		t.Fatalf("expected invalid color to fall back to %q, got %q", defaultWindowSyncMasterColor, settings.MasterColor)
	}
}

func TestCloneWindowSyncStateCopiesSlices(t *testing.T) {
	original := &WindowSyncState{
		SessionId:       "session-1",
		Active:          true,
		MasterProfileId: "p1",
		ProfileIds:      []string{"p1", "p2"},
		Windows: []WindowSyncCandidate{
			{ProfileId: "p1", ProfileName: "Master", Master: true},
			{ProfileId: "p2", ProfileName: "Follower"},
		},
	}

	cloned := cloneWindowSyncState(original)
	if cloned == nil {
		t.Fatalf("expected cloned state")
	}
	cloned.ProfileIds[0] = "changed"
	cloned.Windows[0].ProfileName = "Changed"

	if original.ProfileIds[0] != "p1" {
		t.Fatalf("expected ProfileIds slice to be copied, original was mutated to %q", original.ProfileIds[0])
	}
	if original.Windows[0].ProfileName != "Master" {
		t.Fatalf("expected Windows slice to be copied, original was mutated to %q", original.Windows[0].ProfileName)
	}
}
