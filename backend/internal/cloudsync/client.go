package cloudsync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	apiCodeOK                 = 0
	apiCodeAccessTokenExpired = 40101
	apiCodeSyncDeviceRevoked  = 3001
	apiCodeSyncDeviceInvalid  = 3002
)

type Client struct {
	httpClient *http.Client
}

type APIError struct {
	StatusCode int
	Code       int
	Message    string
}

func (e *APIError) Error() string {
	if e == nil {
		return ""
	}
	if strings.TrimSpace(e.Message) != "" {
		return e.Message
	}
	if e.Code != 0 {
		return fmt.Sprintf("sync api error: code=%d", e.Code)
	}
	return fmt.Sprintf("sync api http error: status=%d", e.StatusCode)
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func NormalizeServerURL(value string) (string, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(value), "/")
	if trimmed == "" {
		return "", fmt.Errorf("请填写同步服务地址")
	}
	if !strings.Contains(trimmed, "://") {
		trimmed = "http://" + trimmed
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("同步服务地址无效")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("同步服务地址仅支持 http 或 https")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/"), nil
}

func (c *Client) LoginBind(ctx context.Context, serverURL string, req loginBindRequest) (loginBindResponse, error) {
	var out loginBindResponse
	err := c.post(ctx, serverURL+"/v1/sync/auth/login-bind", "", req, &out)
	return out, err
}

func (c *Client) ExchangeOAuthCode(ctx context.Context, serverURL string, req oauthTokenRequest) (loginBindResponse, error) {
	var out loginBindResponse
	err := c.post(ctx, serverURL+"/oauth/token", "", req, &out)
	return out, err
}

func (c *Client) Heartbeat(ctx context.Context, session *Session, req heartbeatRequest) (heartbeatResponse, error) {
	var out heartbeatResponse
	err := c.post(ctx, session.ServerURL+"/v1/sync/devices/heartbeat", session.AccessToken, req, &out)
	return out, err
}

func (c *Client) RefreshToken(ctx context.Context, session *Session) (refreshTokenResponse, error) {
	var out refreshTokenResponse
	err := c.post(ctx, session.ServerURL+"/v1/refresh-token", "", map[string]string{
		"refreshToken": session.RefreshToken,
	}, &out)
	return out, err
}

func (c *Client) Logout(ctx context.Context, session *Session) error {
	if session == nil {
		return nil
	}
	var out map[string]interface{}
	return c.post(ctx, session.ServerURL+"/v1/sync/auth/logout", session.AccessToken, map[string]string{
		"deviceId":     session.Device.ID,
		"bindingId":    session.Device.BindingID,
		"refreshToken": session.RefreshToken,
	}, &out)
}

func (c *Client) ListBackups(ctx context.Context, session *Session, input BackupListInput) (BackupListResult, error) {
	var out backupListResponse
	endpoint, err := buildBackupsURL(session.ServerURL, input)
	if err != nil {
		return BackupListResult{}, err
	}
	if err := c.getJSON(ctx, endpoint, session.AccessToken, &out); err != nil {
		return BackupListResult{}, err
	}
	return BackupListResult{List: out.List, Total: out.Total}, nil
}

func (c *Client) UploadBackup(ctx context.Context, session *Session, filePath string, fields map[string]string, onProgress TransferProgressFunc) (BackupItem, error) {
	var out backupUploadResponse
	err := c.postMultipart(ctx, session.ServerURL+"/v1/sync/backups", session.AccessToken, filePath, fields, &out, onProgress)
	return out.Backup, err
}

func (c *Client) DownloadBackup(ctx context.Context, session *Session, backupID string, targetPath string, expectedSize int64, onProgress TransferProgressFunc) error {
	backupID = strings.TrimSpace(backupID)
	if backupID == "" {
		return fmt.Errorf("backup id missing")
	}
	endpoint := session.ServerURL + "/v1/sync/backups/" + url.PathEscape(backupID) + "/download"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+session.AccessToken)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || strings.Contains(contentType, "application/json") {
		return decodeAPIResponse(resp, nil)
	}
	totalBytes := resp.ContentLength
	if totalBytes <= 0 && expectedSize > 0 {
		totalBytes = expectedSize
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0700); err != nil {
		return err
	}
	tmpPath := targetPath + ".tmp"
	out, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	tracker := newTransferProgressTracker(totalBytes, onProgress)
	tracker.emit(true)
	_, copyErr := io.Copy(out, &transferProgressReader{reader: resp.Body, tracker: tracker})
	tracker.done()
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(tmpPath)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return closeErr
	}
	return os.Rename(tmpPath, targetPath)
}

func (c *Client) DeleteBackup(ctx context.Context, session *Session, backupID string) error {
	backupID = strings.TrimSpace(backupID)
	if backupID == "" {
		return fmt.Errorf("backup id missing")
	}
	endpoint := session.ServerURL + "/v1/sync/backups/" + url.PathEscape(backupID)
	return c.requestJSON(ctx, http.MethodDelete, endpoint, session.AccessToken, nil, nil)
}

type transferProgressTracker struct {
	total       int64
	transferred int64
	lastEmit    time.Time
	onProgress  TransferProgressFunc
}

func newTransferProgressTracker(total int64, onProgress TransferProgressFunc) *transferProgressTracker {
	return &transferProgressTracker{
		total:      total,
		onProgress: onProgress,
	}
}

func (t *transferProgressTracker) add(n int) {
	if t == nil || n <= 0 {
		return
	}
	t.transferred += int64(n)
	t.emit(false)
}

func (t *transferProgressTracker) done() {
	if t == nil {
		return
	}
	if t.total > 0 && t.transferred < t.total {
		t.transferred = t.total
	}
	t.emit(true)
}

func (t *transferProgressTracker) emit(force bool) {
	if t == nil || t.onProgress == nil {
		return
	}
	now := time.Now()
	if !force && !t.lastEmit.IsZero() && now.Sub(t.lastEmit) < 150*time.Millisecond {
		return
	}
	t.lastEmit = now
	t.onProgress(TransferProgress{
		TransferredBytes: t.transferred,
		TotalBytes:       t.total,
	})
}

type transferProgressReader struct {
	reader  io.Reader
	tracker *transferProgressTracker
}

func (r *transferProgressReader) Read(p []byte) (int, error) {
	n, err := r.reader.Read(p)
	if n > 0 {
		r.tracker.add(n)
	}
	return n, err
}

func (c *Client) post(ctx context.Context, endpoint string, accessToken string, body interface{}, out interface{}) error {
	return c.requestJSON(ctx, http.MethodPost, endpoint, accessToken, body, out)
}

func (c *Client) getJSON(ctx context.Context, endpoint string, accessToken string, out interface{}) error {
	return c.requestJSON(ctx, http.MethodGet, endpoint, accessToken, nil, out)
}

func (c *Client) requestJSON(ctx context.Context, method string, endpoint string, accessToken string, body interface{}, out interface{}) error {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if strings.TrimSpace(accessToken) != "" {
		req.Header.Set("Authorization", "Bearer "+accessToken)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return decodeAPIResponse(resp, out)
}

func (c *Client) postMultipart(ctx context.Context, endpoint string, accessToken string, filePath string, fields map[string]string, out interface{}, onProgress TransferProgressFunc) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	fileSize := int64(0)
	if info, statErr := file.Stat(); statErr == nil {
		fileSize = info.Size()
	}

	reader, writerPipe := io.Pipe()
	multipartWriter := multipart.NewWriter(writerPipe)
	go func() {
		defer file.Close()
		writeErr := func() error {
			for key, value := range fields {
				if strings.TrimSpace(key) == "" {
					continue
				}
				if err := multipartWriter.WriteField(key, value); err != nil {
					return err
				}
			}
			part, err := multipartWriter.CreateFormFile("file", filepath.Base(filePath))
			if err != nil {
				return err
			}
			tracker := newTransferProgressTracker(fileSize, onProgress)
			tracker.emit(true)
			if _, err := io.Copy(part, &transferProgressReader{reader: file, tracker: tracker}); err != nil {
				return err
			}
			tracker.done()
			return multipartWriter.Close()
		}()
		if writeErr != nil {
			_ = writerPipe.CloseWithError(writeErr)
			return
		}
		_ = writerPipe.Close()
	}()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", multipartWriter.FormDataContentType())
	if strings.TrimSpace(accessToken) != "" {
		req.Header.Set("Authorization", "Bearer "+accessToken)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return decodeAPIResponse(resp, out)
}

func buildBackupsURL(serverURL string, input BackupListInput) (string, error) {
	parsed, err := url.Parse(strings.TrimRight(serverURL, "/") + "/v1/sync/backups")
	if err != nil {
		return "", err
	}
	query := parsed.Query()
	if input.Page > 0 {
		query.Set("page", fmt.Sprintf("%d", input.Page))
	}
	if input.PageSize > 0 {
		query.Set("pageSize", fmt.Sprintf("%d", input.PageSize))
	}
	if strings.TrimSpace(input.BackupType) != "" {
		query.Set("backupType", strings.TrimSpace(input.BackupType))
	}
	if strings.TrimSpace(input.Status) != "" {
		query.Set("status", strings.TrimSpace(input.Status))
	}
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func decodeAPIResponse(resp *http.Response, out interface{}) error {
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	var envelope struct {
		Code    int             `json:"code"`
		Message string          `json:"message"`
		Msg     string          `json:"msg"`
		Data    json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return &APIError{StatusCode: resp.StatusCode, Message: strings.TrimSpace(string(body))}
		}
		return err
	}
	message := envelope.Message
	if message == "" {
		message = envelope.Msg
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || envelope.Code != apiCodeOK {
		return &APIError{StatusCode: resp.StatusCode, Code: envelope.Code, Message: message}
	}
	if out == nil || len(envelope.Data) == 0 {
		return nil
	}
	return json.Unmarshal(envelope.Data, out)
}
