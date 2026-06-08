package cloudsync

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Store struct {
	mu   sync.Mutex
	dir  string
	path string
}

type Session struct {
	ServerURL         string `json:"serverURL"`
	AccessToken       string `json:"accessToken"`
	RefreshToken      string `json:"refreshToken"`
	ExpiresAt         string `json:"expiresAt"`
	ServerInstanceID  string `json:"serverInstanceId"`
	ConnectedAt       string `json:"connectedAt"`
	LastHeartbeatAt   string `json:"lastHeartbeatAt"`
	ServerTime        string `json:"serverTime"`
	DeviceFingerprint string `json:"deviceFingerprint"`
	User              User   `json:"user"`
	Device            Device `json:"device"`
	AuthState         string `json:"authState"`
	LastError         string `json:"lastError,omitempty"`
}

func NewStore(dir string) *Store {
	return &Store{dir: dir, path: filepath.Join(dir, "session.json")}
}

func (s *Store) Load() (*Session, error) {
	if s == nil {
		return nil, os.ErrNotExist
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := os.ReadFile(s.path)
	if err != nil {
		return nil, err
	}
	var session Session
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, err
	}
	if strings.TrimSpace(session.ServerURL) == "" || strings.TrimSpace(session.AccessToken) == "" {
		return nil, os.ErrNotExist
	}
	return &session, nil
}

func (s *Store) Save(session *Session) error {
	if s == nil || session == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(s.path), 0700); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, payload, 0600)
}

func (s *Store) Clear() error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.Remove(s.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *Store) LoadEncryptionConfig() (encryptionConfig, error) {
	if s == nil {
		return encryptionConfig{}, os.ErrNotExist
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := os.ReadFile(filepath.Join(s.dir, "encryption.json"))
	if err != nil {
		return encryptionConfig{}, err
	}
	var cfg encryptionConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return encryptionConfig{}, err
	}
	if strings.TrimSpace(cfg.Salt) == "" || strings.TrimSpace(cfg.Verifier) == "" {
		return encryptionConfig{}, os.ErrNotExist
	}
	return cfg, nil
}

func (s *Store) SaveEncryptionConfig(cfg encryptionConfig) error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(s.dir, 0700); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(s.dir, "encryption.json"), payload, 0600)
}

func (s *Store) ClearEncryptionConfig() error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.Remove(filepath.Join(s.dir, "encryption.json")); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *Store) LoadFingerprint() (string, error) {
	if s == nil {
		return "", os.ErrNotExist
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := os.ReadFile(filepath.Join(s.dir, "device-fingerprint"))
	if err != nil {
		return "", err
	}
	value := strings.TrimSpace(string(data))
	if value == "" {
		return "", os.ErrNotExist
	}
	return value, nil
}

func (s *Store) SaveFingerprint(value string) error {
	if s == nil {
		return nil
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(s.dir, 0700); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(s.dir, "device-fingerprint"), []byte(value), 0600)
}

func (s *Session) Status() Status {
	if s == nil {
		return Status{AuthState: "disconnected"}
	}
	online := false
	if s.Device.Status != "revoked" {
		online = s.Device.Online || recentlySeen(s.LastHeartbeatAt, 70*time.Second)
	}
	authState := strings.TrimSpace(s.AuthState)
	if authState == "" {
		authState = "authorized"
	}
	if !online && authState == "authorized" {
		authState = "offline"
	}
	if s.Device.Status == "revoked" {
		authState = "invalid"
		online = false
	}
	return Status{
		Configured:      strings.TrimSpace(s.ServerURL) != "",
		Authorized:      strings.TrimSpace(s.AccessToken) != "" && authState != "invalid",
		AuthState:       authState,
		ServerURL:       s.ServerURL,
		ServerInstance:  s.ServerInstanceID,
		ExpiresAt:       s.ExpiresAt,
		ConnectedAt:     s.ConnectedAt,
		LastHeartbeatAt: s.LastHeartbeatAt,
		ServerTime:      s.ServerTime,
		Online:          online,
		User:            s.User,
		Device:          s.Device,
		Error:           s.LastError,
	}
}

func recentlySeen(value string, ttl time.Duration) bool {
	if strings.TrimSpace(value) == "" {
		return false
	}
	seenAt, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return false
	}
	return time.Since(seenAt) <= ttl
}
