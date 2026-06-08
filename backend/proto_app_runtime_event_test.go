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
		browserLogsUpdatedEvent,
	}
	for _, eventName := range events {
		if !isProtoRuntimeEvent(eventName) {
			t.Fatalf("%s should be forwarded through proto runtime events", eventName)
		}
	}
}

func TestAppRuntimeEventPayloadMapsDataVersions(t *testing.T) {
	payload := appRuntimeEventPayloadToProto(map[string]interface{}{
		"domain":            "profiles",
		"reason":            "data-updated",
		"version":           int64(3),
		"profilesVersion":   int64(3),
		"groupsVersion":     int64(4),
		"proxiesVersion":    int64(5),
		"coresVersion":      int64(6),
		"extensionsVersion": int64(7),
		"defaultsVersion":   int64(8),
		"settingsVersion":   int64(9),
		"cookiesVersion":    int64(10),
		"snapshotsVersion":  int64(11),
		"logsVersion":       int64(12),
		"changedIds":        []interface{}{"p1", "p2"},
	})

	if payload.Domain != "profiles" || payload.Version != 3 || payload.LogsVersion != 12 {
		t.Fatalf("data versions were not mapped: %#v", payload)
	}
	if len(payload.ChangedIDs) != 2 || payload.ChangedIDs[1] != "p2" {
		t.Fatalf("changed ids were not mapped: %#v", payload)
	}
}
