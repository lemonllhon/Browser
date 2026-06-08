package cloudsync

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

type Manager struct {
	mu              sync.Mutex
	store           *Store
	client          *Client
	appVersion      string
	heartbeatCancel context.CancelFunc
}

func NewManager(storeDir, appVersion string) *Manager {
	return &Manager{
		store:      NewStore(storeDir),
		client:     NewClient(),
		appVersion: strings.TrimSpace(appVersion),
	}
}

func (m *Manager) Start(ctx context.Context) {
	if m == nil {
		return
	}
	if session, err := m.store.Load(); err == nil && session != nil {
		m.startHeartbeatLoop(ctx)
	}
}

func (m *Manager) Stop() {
	if m == nil {
		return
	}
	m.mu.Lock()
	cancel := m.heartbeatCancel
	m.heartbeatCancel = nil
	m.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (m *Manager) GetStatus() (Status, error) {
	session, err := m.store.Load()
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Status{AuthState: "disconnected"}, nil
		}
		return Status{AuthState: "disconnected", Error: err.Error()}, err
	}
	return session.Status(), nil
}

func (m *Manager) LoginBind(ctx context.Context, input LoginBindInput) (Status, error) {
	if m == nil {
		return Status{AuthState: "disconnected"}, errors.New("cloud sync manager is not initialized")
	}
	serverURL, err := NormalizeServerURL(input.ServerURL)
	if err != nil {
		return Status{}, err
	}
	username := strings.TrimSpace(input.Username)
	if username == "" {
		return Status{}, errors.New("请填写同步服务账号")
	}
	if input.Password == "" {
		return Status{}, errors.New("请填写同步服务密码")
	}
	fingerprint, err := deviceFingerprint(m.store)
	if err != nil {
		return Status{}, err
	}
	deviceName := strings.TrimSpace(input.DeviceName)
	if deviceName == "" {
		deviceName = DefaultDeviceName()
	}
	now := time.Now().UTC().Format(time.RFC3339)
	login, err := m.client.LoginBind(ctx, serverURL, loginBindRequest{
		Username:          username,
		Password:          input.Password,
		DeviceName:        deviceName,
		DeviceFingerprint: fingerprint,
		OS:                runtime.GOOS,
		AppVersion:        m.appVersion,
		ClientVersion:     m.appVersion,
	})
	if err != nil {
		return Status{}, err
	}
	session := &Session{
		ServerURL:         serverURL,
		AccessToken:       login.AccessToken,
		RefreshToken:      login.RefreshToken,
		ExpiresAt:         login.ExpiresAt,
		ServerInstanceID:  login.ServerInstanceID,
		ConnectedAt:       now,
		LastHeartbeatAt:   now,
		DeviceFingerprint: fingerprint,
		User:              login.User,
		Device:            login.Device,
		AuthState:         "authorized",
	}
	session.Device.DeviceFingerprint = fingerprint
	if err := m.store.Save(session); err != nil {
		return Status{}, err
	}
	status, err := m.RefreshStatus(ctx)
	if err != nil {
		return status, err
	}
	return status, nil
}

func (m *Manager) RefreshStatus(ctx context.Context) (Status, error) {
	session, err := m.store.Load()
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Status{AuthState: "disconnected"}, nil
		}
		return Status{AuthState: "disconnected", Error: err.Error()}, err
	}
	status, err := m.heartbeat(ctx, session)
	if err != nil {
		return status, err
	}
	return status, nil
}

func (m *Manager) Logout(ctx context.Context) error {
	if m == nil {
		return nil
	}
	m.Stop()
	session, err := m.store.Load()
	if err == nil && session != nil {
		_ = m.client.Logout(ctx, session)
	}
	return m.store.Clear()
}

func (m *Manager) ListBackups(ctx context.Context, input BackupListInput) (BackupListResult, error) {
	session, err := m.loadAuthorizedSession()
	if err != nil {
		return BackupListResult{}, err
	}
	var result BackupListResult
	err = m.withTokenRefresh(ctx, session, func() error {
		next, err := m.client.ListBackups(ctx, session, input)
		if err != nil {
			return err
		}
		result = next
		return nil
	})
	return result, err
}

func (m *Manager) UploadBackupFile(ctx context.Context, filePath string, fields map[string]string, onProgress TransferProgressFunc) (BackupItem, error) {
	session, err := m.loadAuthorizedSession()
	if err != nil {
		return BackupItem{}, err
	}
	if strings.TrimSpace(filePath) == "" {
		return BackupItem{}, errors.New("backup file path missing")
	}
	fields = cloneStringMap(fields)
	fields["deviceId"] = session.Device.ID
	fields["bindingId"] = session.Device.BindingID
	var backup BackupItem
	err = m.withTokenRefresh(ctx, session, func() error {
		next, err := m.client.UploadBackup(ctx, session, filePath, fields, onProgress)
		if err != nil {
			return err
		}
		backup = next
		return nil
	})
	return backup, err
}

func (m *Manager) DownloadBackup(ctx context.Context, input BackupDownloadInput, onProgress TransferProgressFunc) (BackupDownloadResult, error) {
	session, err := m.loadAuthorizedSession()
	if err != nil {
		return BackupDownloadResult{}, err
	}
	backupID := strings.TrimSpace(input.BackupID)
	if backupID == "" {
		return BackupDownloadResult{}, errors.New("backup id missing")
	}
	backup := BackupItem{ID: backupID}
	if list, err := m.client.ListBackups(ctx, session, BackupListInput{Page: 1, PageSize: 100, Status: "ready"}); err == nil {
		for _, item := range list.List {
			if item.ID == backupID {
				backup = item
				break
			}
		}
	}
	targetPath := filepath.Join(m.store.dir, "downloads", backupID+".zip")
	err = m.withTokenRefresh(ctx, session, func() error {
		return m.client.DownloadBackup(ctx, session, backupID, targetPath, backup.SizeBytes, onProgress)
	})
	if err != nil {
		return BackupDownloadResult{}, err
	}
	return BackupDownloadResult{
		Backup:    backup,
		LocalPath: targetPath,
		Message:   "下载完成",
	}, nil
}

func (m *Manager) DeleteBackup(ctx context.Context, input BackupDeleteInput) error {
	session, err := m.loadAuthorizedSession()
	if err != nil {
		return err
	}
	backupID := strings.TrimSpace(input.BackupID)
	if backupID == "" {
		return errors.New("backup id missing")
	}
	return m.withTokenRefresh(ctx, session, func() error {
		return m.client.DeleteBackup(ctx, session, backupID)
	})
}

func (m *Manager) startHeartbeatLoop(ctx context.Context) {
	m.mu.Lock()
	if m.heartbeatCancel != nil {
		m.heartbeatCancel()
	}
	loopCtx, cancel := context.WithCancel(ctx)
	m.heartbeatCancel = cancel
	m.mu.Unlock()

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-loopCtx.Done():
				return
			case <-ticker.C:
				session, err := m.store.Load()
				if err != nil || session == nil {
					continue
				}
				_, _ = m.heartbeat(loopCtx, session)
			}
		}
	}()
}

func (m *Manager) heartbeat(ctx context.Context, session *Session) (Status, error) {
	if session == nil {
		return Status{AuthState: "disconnected"}, nil
	}
	resp, err := m.client.Heartbeat(ctx, session, heartbeatRequest{
		DeviceID:      session.Device.ID,
		BindingID:     session.Device.BindingID,
		DeviceName:    session.Device.DeviceName,
		OS:            runtime.GOOS,
		AppVersion:    m.appVersion,
		ClientVersion: m.appVersion,
	})
	if err != nil {
		if apiErr := (*APIError)(nil); errors.As(err, &apiErr) {
			if apiErr.Code == apiCodeAccessTokenExpired {
				if refreshErr := m.refreshToken(ctx, session); refreshErr == nil {
					return m.heartbeat(ctx, session)
				}
			}
			if apiErr.Code == apiCodeSyncDeviceRevoked || apiErr.Code == apiCodeSyncDeviceInvalid {
				session.AuthState = "invalid"
				session.LastError = apiErr.Error()
				session.Device.Online = false
				if apiErr.Code == apiCodeSyncDeviceRevoked {
					session.Device.Status = "revoked"
				}
				_ = m.store.Save(session)
				return session.Status(), err
			}
		}
		session.AuthState = "offline"
		session.LastError = err.Error()
		session.Device.Online = false
		_ = m.store.Save(session)
		return session.Status(), err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	session.User = resp.User
	session.Device = resp.Device
	session.ServerTime = resp.ServerTime
	session.LastHeartbeatAt = now
	session.AuthState = "authorized"
	session.LastError = ""
	session.Device.Online = resp.Online
	if session.Device.DeviceFingerprint == "" {
		session.Device.DeviceFingerprint = session.DeviceFingerprint
	}
	if err := m.store.Save(session); err != nil {
		return session.Status(), err
	}
	return session.Status(), nil
}

func (m *Manager) refreshToken(ctx context.Context, session *Session) error {
	if session == nil || strings.TrimSpace(session.RefreshToken) == "" {
		return errors.New("refresh token missing")
	}
	resp, err := m.client.RefreshToken(ctx, session)
	if err != nil {
		return err
	}
	session.AccessToken = resp.AccessToken
	session.RefreshToken = resp.RefreshToken
	if resp.ExpiresIn > 0 {
		session.ExpiresAt = time.Now().UTC().Add(time.Duration(resp.ExpiresIn) * time.Second).Format(time.RFC3339)
	}
	return m.store.Save(session)
}

func (m *Manager) loadAuthorizedSession() (*Session, error) {
	session, err := m.store.Load()
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, errors.New("请先授权登录同步服务")
		}
		return nil, err
	}
	if session == nil || strings.TrimSpace(session.AccessToken) == "" {
		return nil, errors.New("请先授权登录同步服务")
	}
	if session.AuthState == "invalid" || session.Device.Status == "revoked" {
		return nil, errors.New("同步设备授权已失效，请重新授权")
	}
	return session, nil
}

func (m *Manager) withTokenRefresh(ctx context.Context, session *Session, run func() error) error {
	err := run()
	if err == nil {
		return nil
	}
	if apiErr := (*APIError)(nil); errors.As(err, &apiErr) && apiErr.Code == apiCodeAccessTokenExpired {
		if refreshErr := m.refreshToken(ctx, session); refreshErr != nil {
			return refreshErr
		}
		return run()
	}
	return err
}

func cloneStringMap(input map[string]string) map[string]string {
	out := make(map[string]string, len(input)+2)
	for key, value := range input {
		out[key] = value
	}
	return out
}
