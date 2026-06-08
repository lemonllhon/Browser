package cloudsync

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"runtime"
	"strings"
	"time"
)

const (
	oauthDesktopClientID = "trace-browser-desktop"
	oauthDefaultScopes   = "sync:read sync:write device:register device:heartbeat"
)

type OpenURLFunc func(string) error

func (m *Manager) StartOAuth(ctx context.Context, input OAuthStartInput, openURL OpenURLFunc) (Status, error) {
	if m == nil {
		return Status{AuthState: "disconnected"}, fmt.Errorf("cloud sync manager is not initialized")
	}
	if openURL == nil {
		return Status{}, fmt.Errorf("无法打开系统浏览器")
	}
	serverURL, err := NormalizeServerURL(input.ServerURL)
	if err != nil {
		return Status{}, err
	}
	deviceName := strings.TrimSpace(input.DeviceName)
	if deviceName == "" {
		deviceName = DefaultDeviceName()
	}
	fingerprint, err := deviceFingerprint(m.store)
	if err != nil {
		return Status{}, err
	}
	verifier, err := randomOAuthToken(48)
	if err != nil {
		return Status{}, err
	}
	state, err := randomOAuthToken(32)
	if err != nil {
		return Status{}, err
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return Status{}, fmt.Errorf("启动本地 OAuth 回调监听失败: %w", err)
	}
	defer listener.Close()

	redirectURI := fmt.Sprintf("http://127.0.0.1:%d/oauth/callback", listener.Addr().(*net.TCPAddr).Port)
	resultCh := make(chan oauthCallbackResult, 1)
	mux := http.NewServeMux()
	mux.HandleFunc("/oauth/callback", func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		result := oauthCallbackResult{
			Code:  strings.TrimSpace(query.Get("code")),
			State: strings.TrimSpace(query.Get("state")),
			Error: strings.TrimSpace(query.Get("error")),
		}
		select {
		case resultCh <- result:
		default:
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(oauthCallbackHTML(result.Error)))
	})
	server := &http.Server{Handler: mux}
	go func() {
		_ = server.Serve(listener)
	}()
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	authorizeURL, err := buildOAuthAuthorizeURL(serverURL, redirectURI, verifier, state, deviceName)
	if err != nil {
		return Status{}, err
	}
	if err := openURL(authorizeURL); err != nil {
		return Status{}, fmt.Errorf("打开 OAuth 授权页失败: %w", err)
	}

	var result oauthCallbackResult
	select {
	case <-ctx.Done():
		return Status{}, fmt.Errorf("OAuth 授权超时或已取消")
	case result = <-resultCh:
	}
	if result.Error != "" {
		return Status{}, fmt.Errorf("OAuth 授权失败: %s", result.Error)
	}
	if result.Code == "" || result.State != state {
		return Status{}, fmt.Errorf("OAuth 回调校验失败")
	}

	login, err := m.client.ExchangeOAuthCode(ctx, serverURL, oauthTokenRequest{
		GrantType:         "authorization_code",
		Code:              result.Code,
		RedirectURI:       redirectURI,
		ClientID:          oauthDesktopClientID,
		CodeVerifier:      verifier,
		DeviceName:        deviceName,
		DeviceFingerprint: fingerprint,
		OS:                runtime.GOOS,
		AppVersion:        m.appVersion,
		ClientVersion:     m.appVersion,
	})
	if err != nil {
		return Status{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
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

type oauthCallbackResult struct {
	Code  string
	State string
	Error string
}

func buildOAuthAuthorizeURL(serverURL, redirectURI, verifier, state, deviceName string) (string, error) {
	baseURL, err := url.Parse(strings.TrimRight(serverURL, "/") + "/oauth/authorize")
	if err != nil {
		return "", err
	}
	query := baseURL.Query()
	query.Set("client_id", oauthDesktopClientID)
	query.Set("response_type", "code")
	query.Set("redirect_uri", redirectURI)
	query.Set("code_challenge", oauthCodeChallenge(verifier))
	query.Set("code_challenge_method", "S256")
	query.Set("scope", oauthDefaultScopes)
	query.Set("state", state)
	query.Set("device_name", deviceName)
	baseURL.RawQuery = query.Encode()
	return baseURL.String(), nil
}

func oauthCodeChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func randomOAuthToken(size int) (string, error) {
	if size <= 0 {
		size = 32
	}
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func oauthCallbackHTML(errorText string) string {
	if strings.TrimSpace(errorText) != "" {
		return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Trace-Browser OAuth</title></head><body style="font-family:sans-serif;padding:32px"><h2>授权失败</h2><p>请回到 Trace-Browser 重新发起授权。</p></body></html>`
	}
	return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Trace-Browser OAuth</title></head><body style="font-family:sans-serif;padding:32px"><h2>授权完成</h2><p>可以关闭此页面并回到 Trace-Browser。</p></body></html>`
}
