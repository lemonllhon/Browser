package cloudsync

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestCloudSyncEncryptDecryptBackupFile(t *testing.T) {
	manager := NewManager(t.TempDir(), "test")
	if _, err := manager.SetupEncryption("correct horse battery staple"); err != nil {
		t.Fatalf("SetupEncryption failed: %v", err)
	}

	src := filepath.Join(t.TempDir(), "backup.zip")
	plain := bytes.Repeat([]byte("trace-browser-backup-data\n"), 128*1024)
	if err := os.WriteFile(src, plain, 0600); err != nil {
		t.Fatal(err)
	}
	encrypted := filepath.Join(t.TempDir(), "backup.enc")
	decrypted := filepath.Join(t.TempDir(), "backup.out.zip")

	if err := manager.EncryptBackupFile(src, encrypted, nil); err != nil {
		t.Fatalf("EncryptBackupFile failed: %v", err)
	}
	encryptedData, err := os.ReadFile(encrypted)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(encryptedData, []byte("trace-browser-backup-data")) {
		t.Fatalf("encrypted payload leaked plaintext marker")
	}
	if err := manager.DecryptBackupFile(encrypted, decrypted, nil); err != nil {
		t.Fatalf("DecryptBackupFile failed: %v", err)
	}
	got, err := os.ReadFile(decrypted)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, plain) {
		t.Fatalf("decrypted payload mismatch")
	}
}

func TestCloudSyncEncryptionRejectsWrongPassword(t *testing.T) {
	storeDir := t.TempDir()
	manager := NewManager(storeDir, "test")
	if _, err := manager.SetupEncryption("correct horse battery staple"); err != nil {
		t.Fatalf("SetupEncryption failed: %v", err)
	}

	lockedManager := NewManager(storeDir, "test")
	status := lockedManager.EncryptionStatus()
	if !status.Configured || !status.Enabled || status.Unlocked {
		t.Fatalf("unexpected initial locked status: %+v", status)
	}
	if _, err := lockedManager.UnlockEncryption("wrong password"); err == nil {
		t.Fatalf("wrong password should be rejected")
	}
	if _, err := lockedManager.UnlockEncryption("correct horse battery staple"); err != nil {
		t.Fatalf("correct password should unlock: %v", err)
	}
	status = lockedManager.EncryptionStatus()
	if !status.Unlocked {
		t.Fatalf("encryption should be unlocked: %+v", status)
	}
}
