package backend

import "testing"

func TestProfileTransferDeepLinkParsingAndConsume(t *testing.T) {
	app := NewApp(t.TempDir(), "test")
	raw := "trace-browser://profile-transfer?code=TB-42ZZ-4X3G&server=http%3A%2F%2F192.168.126.130%3A8000"

	if !app.HandleProfileTransferDeepLink(raw, "test") {
		t.Fatal("expected profile transfer deep link to be accepted")
	}
	link, ok := app.ConsumePendingProfileTransferDeepLink()
	if !ok {
		t.Fatal("expected pending profile transfer deep link")
	}
	if link.Action != "profile-transfer" {
		t.Fatalf("unexpected action: %q", link.Action)
	}
	if link.Code != "TB-42ZZ-4X3G" {
		t.Fatalf("unexpected code: %q", link.Code)
	}
	if link.ServerURL != "http://192.168.126.130:8000" {
		t.Fatalf("unexpected server URL: %q", link.ServerURL)
	}
	if link.URL != raw {
		t.Fatalf("unexpected raw URL: %q", link.URL)
	}
}

func TestProfileTransferDeepLinkRejectsOtherActions(t *testing.T) {
	app := NewApp(t.TempDir(), "test")
	if app.HandleProfileTransferDeepLink("trace-browser://settings?code=TB-42ZZ-4X3G&server=http%3A%2F%2F127.0.0.1%3A8000", "test") {
		t.Fatal("expected non profile-transfer deep link to be rejected")
	}
}
