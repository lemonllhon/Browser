package cloudsync

type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Nickname string `json:"nickname"`
	Role     string `json:"role"`
}

type Device struct {
	ID                      string `json:"id"`
	UserID                  string `json:"userId"`
	WorkspaceID             string `json:"workspaceId"`
	DeviceName              string `json:"deviceName"`
	DeviceFingerprint       string `json:"deviceFingerprint,omitempty"`
	DeviceFingerprintDigest string `json:"deviceFingerprintDigest,omitempty"`
	OS                      string `json:"os"`
	AppVersion              string `json:"appVersion"`
	ClientVersion           string `json:"clientVersion"`
	BindingID               string `json:"bindingId"`
	Status                  string `json:"status"`
	Online                  bool   `json:"online"`
	LastSeenAt              string `json:"lastSeenAt"`
	RevokedAt               string `json:"revokedAt"`
	CreatedAt               string `json:"createdAt"`
	UpdatedAt               string `json:"updatedAt"`
}

type Status struct {
	Configured      bool             `json:"configured"`
	Authorized      bool             `json:"authorized"`
	AuthState       string           `json:"authState"`
	ServerURL       string           `json:"serverURL"`
	ServerInstance  string           `json:"serverInstanceId"`
	ExpiresAt       string           `json:"expiresAt"`
	ConnectedAt     string           `json:"connectedAt"`
	LastHeartbeatAt string           `json:"lastHeartbeatAt"`
	ServerTime      string           `json:"serverTime"`
	Online          bool             `json:"online"`
	User            User             `json:"user"`
	Device          Device           `json:"device"`
	Encryption      EncryptionStatus `json:"encryption"`
	Error           string           `json:"error,omitempty"`
}

type TransferProgress struct {
	TransferredBytes int64
	TotalBytes       int64
}

type TransferProgressFunc func(TransferProgress)

type LoginBindInput struct {
	ServerURL  string `json:"serverURL"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	DeviceName string `json:"deviceName"`
}

type OAuthStartInput struct {
	ServerURL  string `json:"serverURL"`
	DeviceName string `json:"deviceName"`
}

type loginBindRequest struct {
	Username          string `json:"username"`
	Password          string `json:"password"`
	DeviceName        string `json:"deviceName"`
	DeviceFingerprint string `json:"deviceFingerprint"`
	OS                string `json:"os"`
	AppVersion        string `json:"appVersion"`
	ClientVersion     string `json:"clientVersion"`
}

type loginBindResponse struct {
	AccessToken      string `json:"accessToken"`
	RefreshToken     string `json:"refreshToken"`
	ExpiresAt        string `json:"expiresAt"`
	ServerInstanceID string `json:"serverInstanceId"`
	BindingID        string `json:"bindingId"`
	User             User   `json:"user"`
	Device           Device `json:"device"`
}

type oauthTokenRequest struct {
	GrantType         string `json:"grant_type"`
	Code              string `json:"code"`
	RedirectURI       string `json:"redirect_uri"`
	ClientID          string `json:"client_id"`
	CodeVerifier      string `json:"code_verifier"`
	DeviceName        string `json:"deviceName"`
	DeviceFingerprint string `json:"deviceFingerprint"`
	OS                string `json:"os"`
	AppVersion        string `json:"appVersion"`
	ClientVersion     string `json:"clientVersion"`
}

type heartbeatRequest struct {
	DeviceID      string `json:"deviceId"`
	BindingID     string `json:"bindingId"`
	DeviceName    string `json:"deviceName"`
	OS            string `json:"os"`
	AppVersion    string `json:"appVersion"`
	ClientVersion string `json:"clientVersion"`
}

type heartbeatResponse struct {
	Online     bool   `json:"online"`
	ServerTime string `json:"serverTime"`
	User       User   `json:"user"`
	Device     Device `json:"device"`
}

type refreshTokenResponse struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int64  `json:"expiresIn"`
}

type BackupItem struct {
	ID             string `json:"id"`
	UserID         string `json:"userId"`
	WorkspaceID    string `json:"workspaceId"`
	DeviceID       string `json:"deviceId"`
	BackupType     string `json:"backupType"`
	PackageFormat  string `json:"packageFormat"`
	PackageVersion string `json:"packageVersion"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	AppName        string `json:"appName"`
	AppVersion     string `json:"appVersion"`
	SourceOS       string `json:"sourceOs"`
	SizeBytes      int64  `json:"sizeBytes"`
	ChecksumSHA256 string `json:"checksumSha256"`
	Encrypted      bool   `json:"encrypted"`
	EncryptionAlg  string `json:"encryptionAlg"`
	Status         string `json:"status"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
	DeletedAt      string `json:"deletedAt"`
}

type BackupListInput struct {
	Page       int    `json:"page"`
	PageSize   int    `json:"pageSize"`
	BackupType string `json:"backupType"`
	Status     string `json:"status"`
}

type BackupListResult struct {
	List  []BackupItem `json:"list"`
	Total int64        `json:"total"`
}

type BackupUploadInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type BackupUploadResult struct {
	Backup          BackupItem `json:"backup"`
	LocalPath       string     `json:"localPath"`
	IncludedEntries int        `json:"includedEntries"`
	SkippedEntries  int        `json:"skippedEntries"`
	FileCount       int        `json:"fileCount"`
	Message         string     `json:"message"`
}

type BackupDownloadInput struct {
	BackupID string `json:"backupId"`
}

type BackupDownloadResult struct {
	Backup    BackupItem `json:"backup"`
	LocalPath string     `json:"localPath"`
	Message   string     `json:"message"`
}

type BackupRestoreInput struct {
	BackupID   string `json:"backupId"`
	ResetFirst bool   `json:"resetFirst"`
}

type BackupRestoreResult struct {
	Backup           BackupItem `json:"backup"`
	DownloadedPath   string     `json:"downloadedPath"`
	RestorePointPath string     `json:"restorePointPath"`
	Imported         int        `json:"imported"`
	Skipped          int        `json:"skipped"`
	Conflicts        int        `json:"conflicts"`
	Partial          bool       `json:"partial"`
	Message          string     `json:"message"`
}

type BackupDeleteInput struct {
	BackupID string `json:"backupId"`
}

type BackupShareItem struct {
	ID              string     `json:"id"`
	BackupID        string     `json:"backupId"`
	UserID          string     `json:"userId"`
	WorkspaceID     string     `json:"workspaceId"`
	DeviceID        string     `json:"deviceId"`
	CodeHint        string     `json:"codeHint"`
	Note            string     `json:"note"`
	Status          string     `json:"status"`
	EffectiveStatus string     `json:"effectiveStatus"`
	ExpiresAt       string     `json:"expiresAt"`
	UsedAt          string     `json:"usedAt"`
	UsedBy          string     `json:"usedBy"`
	UsedIP          string     `json:"usedIp"`
	RevokedAt       string     `json:"revokedAt"`
	RevokedBy       string     `json:"revokedBy"`
	CreatedAt       string     `json:"createdAt"`
	UpdatedAt       string     `json:"updatedAt"`
	DeletedAt       string     `json:"deletedAt"`
	Backup          BackupItem `json:"backup"`
}

type BackupShareCreateInput struct {
	BackupID       string `json:"backupId"`
	ExpiresInHours int    `json:"expiresInHours"`
	Note           string `json:"note"`
}

type BackupShareCreateResult struct {
	Share     BackupShareItem `json:"share"`
	Backup    BackupItem      `json:"backup"`
	Code      string          `json:"code"`
	ShareURL  string          `json:"shareUrl"`
	DirectURL string          `json:"directUrl"`
	ExpiresAt string          `json:"expiresAt"`
}

type BackupShareResolveInput struct {
	ServerURL string `json:"serverURL"`
	Code      string `json:"code"`
}

type BackupShareResolveResult struct {
	Share      BackupShareItem `json:"share"`
	Backup     BackupItem      `json:"backup"`
	ServerURL  string          `json:"serverURL"`
	ServerTime string          `json:"serverTime"`
	ReceivedAt string          `json:"receivedAt"`
}

type BackupShareDownloadInput struct {
	ServerURL string `json:"serverURL"`
	Code      string `json:"code"`
}

type BackupShareDownloadResult struct {
	Share     BackupShareItem `json:"share"`
	Backup    BackupItem      `json:"backup"`
	ServerURL string          `json:"serverURL"`
	LocalPath string          `json:"localPath"`
	Message   string          `json:"message"`
}

type backupListResponse struct {
	List  []BackupItem `json:"list"`
	Total int64        `json:"total"`
}

type backupUploadResponse struct {
	Backup BackupItem `json:"backup"`
}

type backupShareCreateRequest struct {
	ExpiresInHours int    `json:"expiresInHours"`
	Note           string `json:"note"`
}

type backupShareCreateResponse struct {
	Share     BackupShareItem `json:"share"`
	Backup    BackupItem      `json:"backup"`
	Code      string          `json:"code"`
	ShareURL  string          `json:"shareUrl"`
	DirectURL string          `json:"directUrl"`
	ExpiresAt string          `json:"expiresAt"`
}

type backupShareResolveResponse struct {
	Share      BackupShareItem `json:"share"`
	Backup     BackupItem      `json:"backup"`
	ServerTime string          `json:"serverTime"`
	ReceivedAt string          `json:"receivedAt"`
}
