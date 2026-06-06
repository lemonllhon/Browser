package backend

import "testing"

func TestProtoRuntimeEventIncludesBrowserDefaultsUpdated(t *testing.T) {
	if !isProtoRuntimeEvent(browserDefaultsUpdatedEvent) {
		t.Fatalf("%s should be forwarded through proto runtime events", browserDefaultsUpdatedEvent)
	}
}
