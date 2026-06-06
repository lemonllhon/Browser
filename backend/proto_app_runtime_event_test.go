package backend

import "testing"

func TestProtoRuntimeEventIncludesBrowserDefaultsUpdated(t *testing.T) {
	if !isProtoRuntimeEvent(browserDefaultsUpdatedEvent) {
		t.Fatalf("%s should be forwarded through proto runtime events", browserDefaultsUpdatedEvent)
	}
}

func TestProtoRuntimeEventIncludesBrowserSharedDataUpdates(t *testing.T) {
	events := []string{
		browserSettingsUpdatedEvent,
		browserCoresUpdatedEvent,
		browserProxiesUpdatedEvent,
		browserExtensionsUpdatedEvent,
		browserCookiesUpdatedEvent,
		browserSnapshotsUpdatedEvent,
	}
	for _, eventName := range events {
		if !isProtoRuntimeEvent(eventName) {
			t.Fatalf("%s should be forwarded through proto runtime events", eventName)
		}
	}
}
