package backend

import "testing"

func TestBrowserDataVersionPayloadIncrementsDomainAndCarriesSnapshot(t *testing.T) {
	app := NewApp("", "test")

	profilePayload := app.browserDataVersionPayload(browserDataDomainProfiles, []string{"p1", "p1", " "}, nil)
	if profilePayload["domain"] != browserDataDomainProfiles || profilePayload["version"] != int64(1) {
		t.Fatalf("unexpected profile payload: %#v", profilePayload)
	}
	changedIDs, ok := profilePayload["changedIds"].([]string)
	if !ok || len(changedIDs) != 1 || changedIDs[0] != "p1" {
		t.Fatalf("unexpected changed ids: %#v", profilePayload["changedIds"])
	}

	groupPayload := app.browserDataVersionPayload(browserDataDomainGroups, nil, map[string]interface{}{"reason": "manual"})
	if groupPayload["groupsVersion"] != int64(1) || groupPayload["profilesVersion"] != int64(1) {
		t.Fatalf("version snapshot did not include prior domains: %#v", groupPayload)
	}
	if groupPayload["reason"] != "manual" {
		t.Fatalf("extras should be able to override reason: %#v", groupPayload)
	}

	versions := app.GetDataVersions()
	if versions.ProfilesVersion != 1 || versions.GroupsVersion != 1 {
		t.Fatalf("unexpected versions: %#v", versions)
	}
}

func TestGetDataVersionsAllowsNilApp(t *testing.T) {
	var app *App
	versions := app.GetDataVersions()
	if versions.TimestampMS <= 0 {
		t.Fatalf("expected timestamp for nil app: %#v", versions)
	}
}
