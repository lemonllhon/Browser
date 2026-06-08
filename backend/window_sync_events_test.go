package backend

import (
	"ant-chrome/backend/internal/transport/protoipc"
	"sync/atomic"
	"testing"
	"time"
)

type countingWindowSyncToolbarAdapter struct {
	updateCount atomic.Int32
	hideCount   atomic.Int32
}

func (a *countingWindowSyncToolbarAdapter) Show(_ *App, _ *WindowSyncState) error { return nil }
func (a *countingWindowSyncToolbarAdapter) Update(_ *WindowSyncState) error {
	a.updateCount.Add(1)
	return nil
}
func (a *countingWindowSyncToolbarAdapter) Hide() error {
	a.hideCount.Add(1)
	return nil
}
func (a *countingWindowSyncToolbarAdapter) SetSize(_ int, _ int) error    { return nil }
func (a *countingWindowSyncToolbarAdapter) CenterPoint() (int, int, bool) { return 0, 0, false }

func TestMasterClosedEventPayloadCopiesRemainingSlices(t *testing.T) {
	prompt := &WindowSyncMasterClosedPrompt{
		ProfileId:             "p1",
		ProfileName:           "Master",
		RemainingProfileIds:   []string{"p2", "p3"},
		RemainingProfileNames: []string{"Follower 2", "Follower 3"},
		Reason:                "closed",
	}

	payload := masterClosedEventPayload(prompt)
	ids, ok := payload["remainingProfileIds"].([]string)
	if !ok {
		t.Fatalf("expected remainingProfileIds slice, got %#v", payload["remainingProfileIds"])
	}
	names, ok := payload["remainingProfileNames"].([]string)
	if !ok {
		t.Fatalf("expected remainingProfileNames slice, got %#v", payload["remainingProfileNames"])
	}
	ids[0] = "changed"
	names[0] = "Changed"

	if prompt.RemainingProfileIds[0] != "p2" || prompt.RemainingProfileNames[0] != "Follower 2" {
		t.Fatalf("expected payload slices to be copied, prompt was mutated: %#v", prompt)
	}
	if payload["key"] != "p2\np3" || payload["engine"] != "closed" {
		t.Fatalf("unexpected compatibility payload fields: %#v", payload)
	}
}

func TestEmitWindowSyncStateChangedDebouncesActiveState(t *testing.T) {
	app := NewApp(t.TempDir())
	var count atomic.Int32
	app.setProtoEventSink(func(eventName string, _ []byte) {
		if eventName == protoipc.EventWindowSyncStateChanged {
			count.Add(1)
		}
	})

	first := testWindowSyncState([]string{"p1", "p2"}, "p1")
	first.UpdatedAt = "first"
	second := cloneWindowSyncState(first)
	second.UpdatedAt = "second"
	app.emitWindowSyncStateChanged(first)
	app.emitWindowSyncStateChanged(second)

	time.Sleep(windowSyncStateUpdateDebounce + 50*time.Millisecond)
	if got := count.Load(); got != 1 {
		t.Fatalf("expected active state updates to be debounced to one event, got %d", got)
	}
}

func TestEmitWindowSyncStateChangedInactiveStateIsImmediate(t *testing.T) {
	app := NewApp(t.TempDir())
	var count atomic.Int32
	app.setProtoEventSink(func(eventName string, _ []byte) {
		if eventName == protoipc.EventWindowSyncStateChanged {
			count.Add(1)
		}
	})

	active := testWindowSyncState([]string{"p1", "p2"}, "p1")
	app.emitWindowSyncStateChanged(active)
	inactive := cloneWindowSyncState(active)
	inactive.Active = false
	app.emitWindowSyncStateChanged(inactive)

	if got := count.Load(); got != 1 {
		t.Fatalf("expected inactive state to emit immediately and cancel pending active update, got %d", got)
	}
	time.Sleep(windowSyncStateUpdateDebounce + 50*time.Millisecond)
	if got := count.Load(); got != 1 {
		t.Fatalf("expected canceled active update to stay canceled, got %d", got)
	}
}

func TestUpdateWindowSyncToolbarDebouncesActiveState(t *testing.T) {
	app := NewApp(t.TempDir())
	adapter := &countingWindowSyncToolbarAdapter{}
	app.SetWindowSyncToolbarAdapter(adapter)
	first := testWindowSyncState([]string{"p1", "p2"}, "p1")
	second := cloneWindowSyncState(first)
	second.UpdatedAt = "second"

	app.updateWindowSyncToolbar(first)
	app.updateWindowSyncToolbar(second)

	time.Sleep(windowSyncStateUpdateDebounce + 50*time.Millisecond)
	if got := adapter.updateCount.Load(); got != 1 {
		t.Fatalf("expected toolbar updates to be debounced to one update, got %d", got)
	}
	app.hideWindowSyncToolbar()
	if got := adapter.hideCount.Load(); got != 1 {
		t.Fatalf("expected toolbar hide to be immediate, got %d", got)
	}
}
