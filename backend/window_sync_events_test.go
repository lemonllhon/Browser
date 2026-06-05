package backend

import "testing"

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
