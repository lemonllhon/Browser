package backend

import (
	"fmt"
	"math"
	"strings"
	"time"
)

const (
	windowSyncMouseMoveDelay       = 24 * time.Millisecond
	windowSyncWheelCoalesceDelay   = 16 * time.Millisecond
	windowSyncDispatchFailCooldown = 900 * time.Millisecond
)

type windowSyncPendingEvent struct {
	Seq   int
	Event windowSyncEvent
	Timer *time.Timer
}

func (a *App) resetWindowSyncThrottle() {
	if a == nil {
		return
	}
	a.windowSyncThrottleMu.Lock()
	defer a.windowSyncThrottleMu.Unlock()
	for _, pending := range a.windowSyncThrottleTimers {
		if pending != nil && pending.Timer != nil {
			pending.Timer.Stop()
		}
	}
	a.windowSyncThrottleTimers = nil
	a.windowSyncLastMouseMoves = nil
	a.windowSyncDispatchFails = nil
}

func (a *App) dispatchOrThrottleWindowSyncEvent(seq int, event windowSyncEvent) {
	switch event.Type {
	case "mouseMove":
		if a.enqueueWindowSyncMouseMove(seq, event) {
			return
		}
	case "wheel":
		a.enqueueWindowSyncWheel(seq, event)
		return
	}
	a.dispatchWindowSyncEventWithCurrentState(seq, event)
}

func (a *App) enqueueWindowSyncMouseMove(seq int, event windowSyncEvent) bool {
	if a == nil {
		return false
	}
	key := windowSyncEventThrottleKey(event)
	a.windowSyncThrottleMu.Lock()
	defer a.windowSyncThrottleMu.Unlock()
	if a.windowSyncThrottleTimers == nil {
		a.windowSyncThrottleTimers = make(map[string]*windowSyncPendingEvent)
	}
	if a.windowSyncLastMouseMoves == nil {
		a.windowSyncLastMouseMoves = make(map[string]windowSyncEvent)
	}
	if last, ok := a.windowSyncLastMouseMoves[key]; ok && windowSyncMouseMoveSame(last, event) {
		return true
	}
	a.windowSyncLastMouseMoves[key] = event
	if pending := a.windowSyncThrottleTimers[key]; pending != nil {
		pending.Seq = seq
		pending.Event = event
		return true
	}
	pending := &windowSyncPendingEvent{Seq: seq, Event: event}
	pending.Timer = time.AfterFunc(windowSyncMouseMoveDelay, func() {
		a.flushWindowSyncThrottledEvent(key)
	})
	a.windowSyncThrottleTimers[key] = pending
	return true
}

func (a *App) enqueueWindowSyncWheel(seq int, event windowSyncEvent) {
	if a == nil {
		return
	}
	key := windowSyncEventThrottleKey(event)
	a.windowSyncThrottleMu.Lock()
	defer a.windowSyncThrottleMu.Unlock()
	if a.windowSyncThrottleTimers == nil {
		a.windowSyncThrottleTimers = make(map[string]*windowSyncPendingEvent)
	}
	if pending := a.windowSyncThrottleTimers[key]; pending != nil {
		pending.Seq = seq
		pending.Event = mergeWindowSyncWheelEvent(pending.Event, event)
		return
	}
	pending := &windowSyncPendingEvent{Seq: seq, Event: event}
	pending.Timer = time.AfterFunc(windowSyncWheelCoalesceDelay, func() {
		a.flushWindowSyncThrottledEvent(key)
	})
	a.windowSyncThrottleTimers[key] = pending
}

func (a *App) flushWindowSyncThrottledEvent(key string) {
	if a == nil {
		return
	}
	a.windowSyncThrottleMu.Lock()
	pending := a.windowSyncThrottleTimers[key]
	if pending != nil {
		delete(a.windowSyncThrottleTimers, key)
	}
	a.windowSyncThrottleMu.Unlock()
	if pending == nil {
		return
	}
	a.dispatchWindowSyncEventWithCurrentState(pending.Seq, pending.Event)
}

func (a *App) windowSyncDispatchInCooldown(debugPort int) bool {
	if a == nil || debugPort <= 0 {
		return false
	}
	a.windowSyncThrottleMu.Lock()
	defer a.windowSyncThrottleMu.Unlock()
	if a.windowSyncDispatchFails == nil {
		return false
	}
	until := a.windowSyncDispatchFails[debugPort]
	if until.IsZero() {
		return false
	}
	if time.Now().Before(until) {
		return true
	}
	delete(a.windowSyncDispatchFails, debugPort)
	return false
}

func (a *App) markWindowSyncDispatchFailure(debugPort int) bool {
	if a == nil || debugPort <= 0 {
		return true
	}
	a.windowSyncThrottleMu.Lock()
	defer a.windowSyncThrottleMu.Unlock()
	if a.windowSyncDispatchFails == nil {
		a.windowSyncDispatchFails = make(map[int]time.Time)
	}
	now := time.Now()
	if until := a.windowSyncDispatchFails[debugPort]; now.Before(until) {
		return false
	}
	a.windowSyncDispatchFails[debugPort] = now.Add(windowSyncDispatchFailCooldown)
	return true
}

func (a *App) clearWindowSyncDispatchFailure(debugPort int) {
	if a == nil || debugPort <= 0 {
		return
	}
	a.windowSyncThrottleMu.Lock()
	defer a.windowSyncThrottleMu.Unlock()
	if a.windowSyncDispatchFails != nil {
		delete(a.windowSyncDispatchFails, debugPort)
	}
}

func windowSyncEventThrottleKey(event windowSyncEvent) string {
	target := strings.TrimSpace(event.TargetId)
	if target == "" {
		target = strings.TrimSpace(normalizeWindowSyncTargetURL(event.TargetUrl))
	}
	if target == "" {
		target = fmt.Sprintf("index:%d", event.TargetIndex)
	}
	return event.Type + "|" + target
}

func windowSyncMouseMoveSame(a windowSyncEvent, b windowSyncEvent) bool {
	return strings.TrimSpace(a.TargetId) == strings.TrimSpace(b.TargetId) &&
		a.TargetIndex == b.TargetIndex &&
		normalizeWindowSyncTargetURL(a.TargetUrl) == normalizeWindowSyncTargetURL(b.TargetUrl) &&
		a.Buttons == b.Buttons &&
		a.Modifiers == b.Modifiers &&
		floatEqual(a.X, b.X) &&
		floatEqual(a.Y, b.Y)
}

func mergeWindowSyncWheelEvent(previous windowSyncEvent, next windowSyncEvent) windowSyncEvent {
	merged := next
	merged.DeltaX = previous.DeltaX + next.DeltaX
	merged.DeltaY = previous.DeltaY + next.DeltaY
	return merged
}

func floatEqual(a float64, b float64) bool {
	return math.Abs(a-b) < 0.001
}
