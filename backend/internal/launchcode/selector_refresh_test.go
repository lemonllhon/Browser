package launchcode

import (
	"net/http"
	"testing"

	"ant-chrome/backend/internal/browser"
)

func TestLaunchServerSelectorRefreshesProfileCatalogBeforeGroupMatch(t *testing.T) {
	mgr := browser.NewManager(nil, "")
	mgr.Profiles["profile-1"] = &browser.Profile{
		ProfileId: "profile-1",
		GroupId:   "old-group",
	}

	starter := &profileCatalogRefreshStarter{refresh: func() {
		mgr.Mutex.Lock()
		mgr.Profiles = map[string]*browser.Profile{
			"profile-1": {
				ProfileId:   "profile-1",
				ProfileName: "Updated",
				GroupId:     "new-group",
			},
		}
		mgr.Mutex.Unlock()
	}}
	server := NewLaunchServer(NewLaunchCodeService(NewMemoryLaunchCodeDAO()), starter, mgr, 0)

	profile, status, errMsg := server.findProfileBySelector(LaunchSelector{GroupID: "new-group"})
	if errMsg != "" {
		t.Fatalf("findProfileBySelector failed: status=%d error=%s", status, errMsg)
	}
	if status != http.StatusOK {
		t.Fatalf("unexpected status: got=%d want=%d", status, http.StatusOK)
	}
	if profile.ProfileId != "profile-1" || profile.GroupId != "new-group" {
		t.Fatalf("expected refreshed profile catalog to be used, got %#v", profile)
	}
	if starter.refreshCount != 1 {
		t.Fatalf("expected one profile catalog refresh, got %d", starter.refreshCount)
	}
}

type profileCatalogRefreshStarter struct {
	refresh      func()
	refreshCount int
}

func (s *profileCatalogRefreshStarter) StartInstance(profileID string) (*browser.Profile, error) {
	return &browser.Profile{ProfileId: profileID}, nil
}

func (s *profileCatalogRefreshStarter) RefreshProfileCatalog() {
	s.refreshCount++
	if s.refresh != nil {
		s.refresh()
	}
}
