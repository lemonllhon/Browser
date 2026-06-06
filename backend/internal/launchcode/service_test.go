package launchcode

import "testing"

func TestLaunchCodeServiceResolveUsesLatestDAOState(t *testing.T) {
	dao := NewMemoryLaunchCodeDAO()
	if err := dao.Upsert("profile-1", "OLD1"); err != nil {
		t.Fatalf("seed old code: %v", err)
	}

	staleWindow := NewLaunchCodeService(dao)
	if err := staleWindow.LoadAll(); err != nil {
		t.Fatalf("LoadAll failed: %v", err)
	}
	if got, err := staleWindow.Resolve("OLD1"); err != nil || got != "profile-1" {
		t.Fatalf("expected old code to resolve before external update, got=%q err=%v", got, err)
	}

	otherWindow := NewLaunchCodeService(dao)
	if _, err := otherWindow.SetCode("profile-1", "NEW1"); err != nil {
		t.Fatalf("SetCode from other window failed: %v", err)
	}

	got, err := staleWindow.Resolve("NEW1")
	if err != nil || got != "profile-1" {
		t.Fatalf("expected new code from shared DAO to resolve, got=%q err=%v", got, err)
	}
	if _, err := staleWindow.Resolve("OLD1"); err == nil {
		t.Fatalf("expected stale cached old code to be invalidated")
	}
}

func TestLaunchCodeServiceEnsureCodeUsesLatestDAOState(t *testing.T) {
	dao := NewMemoryLaunchCodeDAO()
	staleWindow := NewLaunchCodeService(dao)

	code, err := staleWindow.EnsureCode("profile-1")
	if err != nil {
		t.Fatalf("EnsureCode failed: %v", err)
	}
	if code == "" {
		t.Fatalf("expected generated code")
	}

	otherWindow := NewLaunchCodeService(dao)
	if _, err := otherWindow.SetCode("profile-1", "SHARED1"); err != nil {
		t.Fatalf("SetCode from other window failed: %v", err)
	}

	got, err := staleWindow.EnsureCode("profile-1")
	if err != nil {
		t.Fatalf("EnsureCode after shared update failed: %v", err)
	}
	if got != "SHARED1" {
		t.Fatalf("expected latest shared code, got=%q", got)
	}
	if _, err := staleWindow.Resolve(code); err == nil {
		t.Fatalf("expected stale generated code to be invalidated")
	}
}
