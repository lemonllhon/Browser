package protoipc

import "google.golang.org/protobuf/encoding/protowire"

const (
	MethodAppConfigGet           = "trace.app.ConfigGet"
	MethodAppPathOpen            = "trace.app.PathOpen"
	MethodAppReleasePageOpen     = "trace.app.ReleasePageOpen"
	MethodAppDashboardStats      = "trace.app.DashboardStatsGet"
	MethodAppPerformanceSnapshot = "trace.app.PerformanceSnapshotGet"
	MethodAppLicenseStatus       = "trace.app.LicenseStatusGet"
	MethodAppCDKeyRedeem         = "trace.app.CDKeyRedeem"
	MethodAppGithubStarRedeem    = "trace.app.GithubStarRedeem"
	MethodAppConfigReload        = "trace.app.ConfigReload"
	MethodAppCDKeysGenerate      = "trace.app.CDKeysGenerate"
	MethodAppRemoteProfileFetch  = "trace.app.RemoteAuthorProfileFetch"
	MethodAppLogList             = "trace.app.LogList"
	MethodAppLogClear            = "trace.app.LogClear"
	MethodAppForceQuit           = "trace.app.ForceQuit"
	MethodAppQuitOnly            = "trace.app.QuitOnly"
	MethodAppWindowStateSave     = "trace.app.WindowStateSave"
	MethodAppEnvironmentGet      = "trace.app.EnvironmentGet"
	MethodAppWindowSizeGet       = "trace.app.WindowSizeGet"
	MethodAppWindowStateGet      = "trace.app.WindowStateGet"
	MethodAppWindowHide          = "trace.app.WindowHide"
	MethodAppWindowMinimise      = "trace.app.WindowMinimise"
	MethodBackupInitialize       = "trace.backup.Initialize"
	MethodBackupExport           = "trace.backup.Export"
	MethodBackupImport           = "trace.backup.Import"
)

type AppConfigInfo struct {
	Name             string
	Version          string
	ProjectGithubURL string
}

type AppPathRequest struct {
	Path string
}

type AppReleasePageRequest struct {
	URL string
}

type AppDashboardStats struct {
	TotalInstances   int32
	RunningInstances int32
	ProxyCount       int32
	CoreCount        int32
	MemUsedMB        int32
	AppVersion       string
}

type AppPerformanceSnapshot struct {
	TimestampMS             int64
	AppVersion              string
	Platform                string
	Arch                    string
	MemAllocMB              int32
	MemSysMB                int32
	MemHeapInuseMB          int32
	MemNumGC                int32
	Goroutines              int32
	TotalInstances          int32
	RunningInstances        int32
	BrowserProcesses        int32
	ProxyBridgeRefs         int32
	XrayBridgeRefs          int32
	ClashBridgeRefs         int32
	SwitchBridgeRefs        int32
	AuthProxyBridgeRefs     int32
	WindowSyncActive        bool
	WindowSyncWindows       int32
	WindowSyncControllable  int32
	WindowSyncEventsTotal   int64
	WindowSyncDispatchTotal int64
}

type AppLicenseStatus struct {
	MaxLimit  int32
	UsedCount int32
	UsedKeys  []string
}

type AppCDKeyRedeemRequest struct {
	CDKey string
}

type AppCDKeysGenerateRequest struct {
	Count int32
}

type AppCDKeysGenerateResponse struct {
	Keys []string
}

type AppRemoteAuthorProfileRequest struct {
	URL       string
	TimeoutMs int32
}

type AppRemoteAuthorProfileResponse struct {
	JSON string
}

type AppLogEntry struct {
	Time       string
	Level      string
	Component  string
	Message    string
	FieldsJSON string
}

type AppLogListResponse struct {
	Entries []AppLogEntry
}

type AppWindowStateSaveRequest struct {
	Width  int32
	Height int32
}

type AppRuntimeEventPayload struct {
	ProfileID      string
	ProfileName    string
	Error          string
	Key            string
	Engine         string
	DebugPort      int32
	PID            int32
	Reused         bool
	Running        bool
	DebugReady     bool
	RuntimeWarning string
}

type AppWindowSize struct {
	Width  int32
	Height int32
}

type AppWindowState struct {
	Normal    bool
	Maximised bool
	Minimised bool
}

type AppEnvironmentInfo struct {
	BuildType string
	Platform  string
	Arch      string
}

type AppFileDropPayload struct {
	X     int32
	Y     int32
	Paths []string
}

type BackupImportRequest struct {
	ResetFirst bool
}

type BackupFailedComponent struct {
	ComponentID   string
	ComponentName string
	Error         string
}

type BackupActionResult struct {
	Cancelled        bool
	Message          string
	ZipPath          string
	ResetFirst       bool
	Imported         int32
	Skipped          int32
	Conflicts        int32
	Partial          bool
	ComponentTotal   int32
	ComponentSuccess int32
	ComponentFailed  int32
	FailedComponents []BackupFailedComponent
	IncludedEntries  int32
	SkippedEntries   int32
	FileCount        int32
}

type BackupProgress struct {
	Phase         string
	Progress      int32
	Message       string
	ComponentID   string
	ComponentName string
	EntryIndex    int32
	EntryTotal    int32
	Timestamp     string
}

func EncodeAppConfigInfo(message AppConfigInfo) []byte {
	var out []byte
	out = appendStringField(out, 1, message.Name)
	out = appendStringField(out, 2, message.Version)
	out = appendStringField(out, 3, message.ProjectGithubURL)
	return out
}

func DecodeAppConfigInfo(payload []byte) (AppConfigInfo, error) {
	var result AppConfigInfo
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			text, err := consumeStringValue(wireType, value)
			result.Name = text
			return err
		case 2:
			text, err := consumeStringValue(wireType, value)
			result.Version = text
			return err
		case 3:
			text, err := consumeStringValue(wireType, value)
			result.ProjectGithubURL = text
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return AppConfigInfo{}, err
	}
	return result, nil
}

func EncodeAppPathRequest(message AppPathRequest) []byte {
	var out []byte
	out = appendStringField(out, 1, message.Path)
	return out
}

func DecodeAppPathRequest(payload []byte) (AppPathRequest, error) {
	var result AppPathRequest
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		if field != 1 {
			return nil
		}
		text, err := consumeStringValue(wireType, value)
		result.Path = text
		return err
	})
	if err != nil {
		return AppPathRequest{}, err
	}
	return result, nil
}

func EncodeAppReleasePageRequest(message AppReleasePageRequest) []byte {
	var out []byte
	out = appendStringField(out, 1, message.URL)
	return out
}

func DecodeAppReleasePageRequest(payload []byte) (AppReleasePageRequest, error) {
	var result AppReleasePageRequest
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		if field != 1 {
			return nil
		}
		text, err := consumeStringValue(wireType, value)
		result.URL = text
		return err
	})
	if err != nil {
		return AppReleasePageRequest{}, err
	}
	return result, nil
}

func EncodeAppDashboardStats(message AppDashboardStats) []byte {
	var out []byte
	out = appendInt32Field(out, 1, message.TotalInstances)
	out = appendInt32Field(out, 2, message.RunningInstances)
	out = appendInt32Field(out, 3, message.ProxyCount)
	out = appendInt32Field(out, 4, message.CoreCount)
	out = appendInt32Field(out, 5, message.MemUsedMB)
	out = appendStringField(out, 6, message.AppVersion)
	return out
}

func DecodeAppDashboardStats(payload []byte) (AppDashboardStats, error) {
	var result AppDashboardStats
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			number, err := consumeVarintValue(wireType, value)
			result.TotalInstances = int32(number)
			return err
		case 2:
			number, err := consumeVarintValue(wireType, value)
			result.RunningInstances = int32(number)
			return err
		case 3:
			number, err := consumeVarintValue(wireType, value)
			result.ProxyCount = int32(number)
			return err
		case 4:
			number, err := consumeVarintValue(wireType, value)
			result.CoreCount = int32(number)
			return err
		case 5:
			number, err := consumeVarintValue(wireType, value)
			result.MemUsedMB = int32(number)
			return err
		case 6:
			text, err := consumeStringValue(wireType, value)
			result.AppVersion = text
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return AppDashboardStats{}, err
	}
	return result, nil
}

func EncodeAppPerformanceSnapshot(message AppPerformanceSnapshot) []byte {
	var out []byte
	out = appendInt64Field(out, 1, message.TimestampMS)
	out = appendStringField(out, 2, message.AppVersion)
	out = appendStringField(out, 3, message.Platform)
	out = appendStringField(out, 4, message.Arch)
	out = appendInt32Field(out, 5, message.MemAllocMB)
	out = appendInt32Field(out, 6, message.MemSysMB)
	out = appendInt32Field(out, 7, message.MemHeapInuseMB)
	out = appendInt32Field(out, 8, message.MemNumGC)
	out = appendInt32Field(out, 9, message.Goroutines)
	out = appendInt32Field(out, 10, message.TotalInstances)
	out = appendInt32Field(out, 11, message.RunningInstances)
	out = appendInt32Field(out, 12, message.BrowserProcesses)
	out = appendInt32Field(out, 13, message.ProxyBridgeRefs)
	out = appendInt32Field(out, 14, message.XrayBridgeRefs)
	out = appendInt32Field(out, 15, message.ClashBridgeRefs)
	out = appendInt32Field(out, 16, message.SwitchBridgeRefs)
	out = appendInt32Field(out, 17, message.AuthProxyBridgeRefs)
	out = appendBoolField(out, 18, message.WindowSyncActive)
	out = appendInt32Field(out, 19, message.WindowSyncWindows)
	out = appendInt32Field(out, 20, message.WindowSyncControllable)
	out = appendInt64Field(out, 21, message.WindowSyncEventsTotal)
	out = appendInt64Field(out, 22, message.WindowSyncDispatchTotal)
	return out
}

func DecodeAppPerformanceSnapshot(payload []byte) (AppPerformanceSnapshot, error) {
	var result AppPerformanceSnapshot
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			number, err := consumeVarintValue(wireType, value)
			result.TimestampMS = int64(number)
			return err
		case 2:
			text, err := consumeStringValue(wireType, value)
			result.AppVersion = text
			return err
		case 3:
			text, err := consumeStringValue(wireType, value)
			result.Platform = text
			return err
		case 4:
			text, err := consumeStringValue(wireType, value)
			result.Arch = text
			return err
		case 5:
			number, err := consumeVarintValue(wireType, value)
			result.MemAllocMB = int32(number)
			return err
		case 6:
			number, err := consumeVarintValue(wireType, value)
			result.MemSysMB = int32(number)
			return err
		case 7:
			number, err := consumeVarintValue(wireType, value)
			result.MemHeapInuseMB = int32(number)
			return err
		case 8:
			number, err := consumeVarintValue(wireType, value)
			result.MemNumGC = int32(number)
			return err
		case 9:
			number, err := consumeVarintValue(wireType, value)
			result.Goroutines = int32(number)
			return err
		case 10:
			number, err := consumeVarintValue(wireType, value)
			result.TotalInstances = int32(number)
			return err
		case 11:
			number, err := consumeVarintValue(wireType, value)
			result.RunningInstances = int32(number)
			return err
		case 12:
			number, err := consumeVarintValue(wireType, value)
			result.BrowserProcesses = int32(number)
			return err
		case 13:
			number, err := consumeVarintValue(wireType, value)
			result.ProxyBridgeRefs = int32(number)
			return err
		case 14:
			number, err := consumeVarintValue(wireType, value)
			result.XrayBridgeRefs = int32(number)
			return err
		case 15:
			number, err := consumeVarintValue(wireType, value)
			result.ClashBridgeRefs = int32(number)
			return err
		case 16:
			number, err := consumeVarintValue(wireType, value)
			result.SwitchBridgeRefs = int32(number)
			return err
		case 17:
			number, err := consumeVarintValue(wireType, value)
			result.AuthProxyBridgeRefs = int32(number)
			return err
		case 18:
			boolValue, err := consumeBoolValue(wireType, value)
			result.WindowSyncActive = boolValue
			return err
		case 19:
			number, err := consumeVarintValue(wireType, value)
			result.WindowSyncWindows = int32(number)
			return err
		case 20:
			number, err := consumeVarintValue(wireType, value)
			result.WindowSyncControllable = int32(number)
			return err
		case 21:
			number, err := consumeVarintValue(wireType, value)
			result.WindowSyncEventsTotal = int64(number)
			return err
		case 22:
			number, err := consumeVarintValue(wireType, value)
			result.WindowSyncDispatchTotal = int64(number)
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return AppPerformanceSnapshot{}, err
	}
	return result, nil
}

func EncodeAppLicenseStatus(message AppLicenseStatus) []byte {
	var out []byte
	out = appendInt32Field(out, 1, message.MaxLimit)
	out = appendInt32Field(out, 2, message.UsedCount)
	out = appendRepeatedStringField(out, 3, message.UsedKeys)
	return out
}

func DecodeAppLicenseStatus(payload []byte) (AppLicenseStatus, error) {
	var result AppLicenseStatus
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			number, err := consumeVarintValue(wireType, value)
			result.MaxLimit = int32(number)
			return err
		case 2:
			number, err := consumeVarintValue(wireType, value)
			result.UsedCount = int32(number)
			return err
		case 3:
			text, err := consumeStringValue(wireType, value)
			result.UsedKeys = append(result.UsedKeys, text)
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return AppLicenseStatus{}, err
	}
	return result, nil
}

func EncodeAppCDKeyRedeemRequest(message AppCDKeyRedeemRequest) []byte {
	var out []byte
	out = appendStringField(out, 1, message.CDKey)
	return out
}

func DecodeAppCDKeyRedeemRequest(payload []byte) (AppCDKeyRedeemRequest, error) {
	var result AppCDKeyRedeemRequest
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		if field != 1 {
			return nil
		}
		text, err := consumeStringValue(wireType, value)
		result.CDKey = text
		return err
	})
	if err != nil {
		return AppCDKeyRedeemRequest{}, err
	}
	return result, nil
}

func EncodeAppCDKeysGenerateRequest(message AppCDKeysGenerateRequest) []byte {
	var out []byte
	out = appendInt32Field(out, 1, message.Count)
	return out
}

func DecodeAppCDKeysGenerateRequest(payload []byte) (AppCDKeysGenerateRequest, error) {
	var result AppCDKeysGenerateRequest
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		if field != 1 {
			return nil
		}
		number, err := consumeVarintValue(wireType, value)
		result.Count = int32(number)
		return err
	})
	if err != nil {
		return AppCDKeysGenerateRequest{}, err
	}
	return result, nil
}

func EncodeAppCDKeysGenerateResponse(message AppCDKeysGenerateResponse) []byte {
	var out []byte
	out = appendRepeatedStringField(out, 1, message.Keys)
	return out
}

func DecodeAppCDKeysGenerateResponse(payload []byte) (AppCDKeysGenerateResponse, error) {
	var result AppCDKeysGenerateResponse
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		if field != 1 {
			return nil
		}
		text, err := consumeStringValue(wireType, value)
		result.Keys = append(result.Keys, text)
		return err
	})
	if err != nil {
		return AppCDKeysGenerateResponse{}, err
	}
	return result, nil
}

func EncodeAppRemoteAuthorProfileRequest(message AppRemoteAuthorProfileRequest) []byte {
	var out []byte
	out = appendStringField(out, 1, message.URL)
	out = appendInt32Field(out, 2, message.TimeoutMs)
	return out
}

func DecodeAppRemoteAuthorProfileRequest(payload []byte) (AppRemoteAuthorProfileRequest, error) {
	var result AppRemoteAuthorProfileRequest
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			text, err := consumeStringValue(wireType, value)
			result.URL = text
			return err
		case 2:
			number, err := consumeVarintValue(wireType, value)
			result.TimeoutMs = int32(number)
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return AppRemoteAuthorProfileRequest{}, err
	}
	return result, nil
}

func EncodeAppRemoteAuthorProfileResponse(message AppRemoteAuthorProfileResponse) []byte {
	var out []byte
	out = appendStringField(out, 1, message.JSON)
	return out
}

func DecodeAppRemoteAuthorProfileResponse(payload []byte) (AppRemoteAuthorProfileResponse, error) {
	var result AppRemoteAuthorProfileResponse
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		if field != 1 {
			return nil
		}
		text, err := consumeStringValue(wireType, value)
		result.JSON = text
		return err
	})
	if err != nil {
		return AppRemoteAuthorProfileResponse{}, err
	}
	return result, nil
}

func EncodeAppLogListResponse(message AppLogListResponse) []byte {
	var out []byte
	for _, entry := range message.Entries {
		out = appendBytesField(out, 1, EncodeAppLogEntry(entry))
	}
	return out
}

func DecodeAppLogListResponse(payload []byte) (AppLogListResponse, error) {
	var result AppLogListResponse
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		if field != 1 {
			return nil
		}
		data, err := consumeBytesValue(wireType, value)
		if err != nil {
			return err
		}
		entry, err := DecodeAppLogEntry(data)
		if err != nil {
			return err
		}
		result.Entries = append(result.Entries, entry)
		return nil
	})
	if err != nil {
		return AppLogListResponse{}, err
	}
	return result, nil
}

func EncodeAppLogEntry(message AppLogEntry) []byte {
	var out []byte
	out = appendStringField(out, 1, message.Time)
	out = appendStringField(out, 2, message.Level)
	out = appendStringField(out, 3, message.Component)
	out = appendStringField(out, 4, message.Message)
	out = appendStringField(out, 5, message.FieldsJSON)
	return out
}

func DecodeAppLogEntry(payload []byte) (AppLogEntry, error) {
	var result AppLogEntry
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			text, err := consumeStringValue(wireType, value)
			result.Time = text
			return err
		case 2:
			text, err := consumeStringValue(wireType, value)
			result.Level = text
			return err
		case 3:
			text, err := consumeStringValue(wireType, value)
			result.Component = text
			return err
		case 4:
			text, err := consumeStringValue(wireType, value)
			result.Message = text
			return err
		case 5:
			text, err := consumeStringValue(wireType, value)
			result.FieldsJSON = text
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return AppLogEntry{}, err
	}
	return result, nil
}

func EncodeAppWindowStateSaveRequest(message AppWindowStateSaveRequest) []byte {
	var out []byte
	out = appendInt32Field(out, 1, message.Width)
	out = appendInt32Field(out, 2, message.Height)
	return out
}

func DecodeAppWindowStateSaveRequest(payload []byte) (AppWindowStateSaveRequest, error) {
	var result AppWindowStateSaveRequest
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			number, err := consumeVarintValue(wireType, value)
			result.Width = int32(number)
			return err
		case 2:
			number, err := consumeVarintValue(wireType, value)
			result.Height = int32(number)
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return AppWindowStateSaveRequest{}, err
	}
	return result, nil
}

func EncodeAppRuntimeEventPayload(message AppRuntimeEventPayload) []byte {
	var out []byte
	out = appendStringField(out, 1, message.ProfileID)
	out = appendStringField(out, 2, message.ProfileName)
	out = appendStringField(out, 3, message.Error)
	out = appendStringField(out, 4, message.Key)
	out = appendStringField(out, 5, message.Engine)
	out = appendInt32Field(out, 6, message.DebugPort)
	out = appendInt32Field(out, 7, message.PID)
	out = appendBoolField(out, 8, message.Reused)
	out = appendBoolField(out, 9, message.Running)
	out = appendBoolField(out, 10, message.DebugReady)
	out = appendStringField(out, 11, message.RuntimeWarning)
	return out
}

func DecodeAppRuntimeEventPayload(payload []byte) (AppRuntimeEventPayload, error) {
	var result AppRuntimeEventPayload
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			text, err := consumeStringValue(wireType, value)
			result.ProfileID = text
			return err
		case 2:
			text, err := consumeStringValue(wireType, value)
			result.ProfileName = text
			return err
		case 3:
			text, err := consumeStringValue(wireType, value)
			result.Error = text
			return err
		case 4:
			text, err := consumeStringValue(wireType, value)
			result.Key = text
			return err
		case 5:
			text, err := consumeStringValue(wireType, value)
			result.Engine = text
			return err
		case 6:
			number, err := consumeVarintValue(wireType, value)
			result.DebugPort = int32(number)
			return err
		case 7:
			number, err := consumeVarintValue(wireType, value)
			result.PID = int32(number)
			return err
		case 8:
			value, err := consumeBoolValue(wireType, value)
			result.Reused = value
			return err
		case 9:
			value, err := consumeBoolValue(wireType, value)
			result.Running = value
			return err
		case 10:
			value, err := consumeBoolValue(wireType, value)
			result.DebugReady = value
			return err
		case 11:
			text, err := consumeStringValue(wireType, value)
			result.RuntimeWarning = text
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return AppRuntimeEventPayload{}, err
	}
	return result, nil
}

func EncodeAppWindowSize(message AppWindowSize) []byte {
	var out []byte
	out = appendInt32Field(out, 1, message.Width)
	out = appendInt32Field(out, 2, message.Height)
	return out
}

func DecodeAppWindowSize(payload []byte) (AppWindowSize, error) {
	var result AppWindowSize
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			number, err := consumeVarintValue(wireType, value)
			result.Width = int32(number)
			return err
		case 2:
			number, err := consumeVarintValue(wireType, value)
			result.Height = int32(number)
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return AppWindowSize{}, err
	}
	return result, nil
}

func EncodeAppWindowState(message AppWindowState) []byte {
	var out []byte
	out = appendBoolField(out, 1, message.Normal)
	out = appendBoolField(out, 2, message.Maximised)
	out = appendBoolField(out, 3, message.Minimised)
	return out
}

func DecodeAppWindowState(payload []byte) (AppWindowState, error) {
	var result AppWindowState
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			value, err := consumeBoolValue(wireType, value)
			result.Normal = value
			return err
		case 2:
			value, err := consumeBoolValue(wireType, value)
			result.Maximised = value
			return err
		case 3:
			value, err := consumeBoolValue(wireType, value)
			result.Minimised = value
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return AppWindowState{}, err
	}
	return result, nil
}

func EncodeAppEnvironmentInfo(message AppEnvironmentInfo) []byte {
	var out []byte
	out = appendStringField(out, 1, message.BuildType)
	out = appendStringField(out, 2, message.Platform)
	out = appendStringField(out, 3, message.Arch)
	return out
}

func DecodeAppEnvironmentInfo(payload []byte) (AppEnvironmentInfo, error) {
	var result AppEnvironmentInfo
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			text, err := consumeStringValue(wireType, value)
			result.BuildType = text
			return err
		case 2:
			text, err := consumeStringValue(wireType, value)
			result.Platform = text
			return err
		case 3:
			text, err := consumeStringValue(wireType, value)
			result.Arch = text
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return AppEnvironmentInfo{}, err
	}
	return result, nil
}

func EncodeAppFileDropPayload(message AppFileDropPayload) []byte {
	var out []byte
	out = appendInt32Field(out, 1, message.X)
	out = appendInt32Field(out, 2, message.Y)
	out = appendRepeatedStringField(out, 3, message.Paths)
	return out
}

func DecodeAppFileDropPayload(payload []byte) (AppFileDropPayload, error) {
	var result AppFileDropPayload
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			number, err := consumeVarintValue(wireType, value)
			result.X = int32(number)
			return err
		case 2:
			number, err := consumeVarintValue(wireType, value)
			result.Y = int32(number)
			return err
		case 3:
			text, err := consumeStringValue(wireType, value)
			result.Paths = append(result.Paths, text)
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return AppFileDropPayload{}, err
	}
	return result, nil
}

func EncodeBackupImportRequest(message BackupImportRequest) []byte {
	var out []byte
	out = appendBoolField(out, 1, message.ResetFirst)
	return out
}

func DecodeBackupImportRequest(payload []byte) (BackupImportRequest, error) {
	var result BackupImportRequest
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		if field != 1 {
			return nil
		}
		boolValue, err := consumeBoolValue(wireType, value)
		result.ResetFirst = boolValue
		return err
	})
	if err != nil {
		return BackupImportRequest{}, err
	}
	return result, nil
}

func EncodeBackupActionResult(message BackupActionResult) []byte {
	var out []byte
	out = appendBoolField(out, 1, message.Cancelled)
	out = appendStringField(out, 2, message.Message)
	out = appendStringField(out, 3, message.ZipPath)
	out = appendBoolField(out, 4, message.ResetFirst)
	out = appendInt32Field(out, 5, message.Imported)
	out = appendInt32Field(out, 6, message.Skipped)
	out = appendInt32Field(out, 7, message.Conflicts)
	out = appendBoolField(out, 8, message.Partial)
	out = appendInt32Field(out, 9, message.ComponentTotal)
	out = appendInt32Field(out, 10, message.ComponentSuccess)
	out = appendInt32Field(out, 11, message.ComponentFailed)
	for _, item := range message.FailedComponents {
		out = appendBytesField(out, 12, EncodeBackupFailedComponent(item))
	}
	out = appendInt32Field(out, 13, message.IncludedEntries)
	out = appendInt32Field(out, 14, message.SkippedEntries)
	out = appendInt32Field(out, 15, message.FileCount)
	return out
}

func DecodeBackupActionResult(payload []byte) (BackupActionResult, error) {
	var result BackupActionResult
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			value, err := consumeBoolValue(wireType, value)
			result.Cancelled = value
			return err
		case 2:
			text, err := consumeStringValue(wireType, value)
			result.Message = text
			return err
		case 3:
			text, err := consumeStringValue(wireType, value)
			result.ZipPath = text
			return err
		case 4:
			value, err := consumeBoolValue(wireType, value)
			result.ResetFirst = value
			return err
		case 5:
			number, err := consumeVarintValue(wireType, value)
			result.Imported = int32(number)
			return err
		case 6:
			number, err := consumeVarintValue(wireType, value)
			result.Skipped = int32(number)
			return err
		case 7:
			number, err := consumeVarintValue(wireType, value)
			result.Conflicts = int32(number)
			return err
		case 8:
			value, err := consumeBoolValue(wireType, value)
			result.Partial = value
			return err
		case 9:
			number, err := consumeVarintValue(wireType, value)
			result.ComponentTotal = int32(number)
			return err
		case 10:
			number, err := consumeVarintValue(wireType, value)
			result.ComponentSuccess = int32(number)
			return err
		case 11:
			number, err := consumeVarintValue(wireType, value)
			result.ComponentFailed = int32(number)
			return err
		case 12:
			data, err := consumeBytesValue(wireType, value)
			if err != nil {
				return err
			}
			item, err := DecodeBackupFailedComponent(data)
			if err != nil {
				return err
			}
			result.FailedComponents = append(result.FailedComponents, item)
			return nil
		case 13:
			number, err := consumeVarintValue(wireType, value)
			result.IncludedEntries = int32(number)
			return err
		case 14:
			number, err := consumeVarintValue(wireType, value)
			result.SkippedEntries = int32(number)
			return err
		case 15:
			number, err := consumeVarintValue(wireType, value)
			result.FileCount = int32(number)
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return BackupActionResult{}, err
	}
	return result, nil
}

func EncodeBackupFailedComponent(message BackupFailedComponent) []byte {
	var out []byte
	out = appendStringField(out, 1, message.ComponentID)
	out = appendStringField(out, 2, message.ComponentName)
	out = appendStringField(out, 3, message.Error)
	return out
}

func DecodeBackupFailedComponent(payload []byte) (BackupFailedComponent, error) {
	var result BackupFailedComponent
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			text, err := consumeStringValue(wireType, value)
			result.ComponentID = text
			return err
		case 2:
			text, err := consumeStringValue(wireType, value)
			result.ComponentName = text
			return err
		case 3:
			text, err := consumeStringValue(wireType, value)
			result.Error = text
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return BackupFailedComponent{}, err
	}
	return result, nil
}

func EncodeBackupProgress(message BackupProgress) []byte {
	var out []byte
	out = appendStringField(out, 1, message.Phase)
	out = appendInt32Field(out, 2, message.Progress)
	out = appendStringField(out, 3, message.Message)
	out = appendStringField(out, 4, message.ComponentID)
	out = appendStringField(out, 5, message.ComponentName)
	out = appendInt32Field(out, 6, message.EntryIndex)
	out = appendInt32Field(out, 7, message.EntryTotal)
	out = appendStringField(out, 8, message.Timestamp)
	return out
}

func DecodeBackupProgress(payload []byte) (BackupProgress, error) {
	var result BackupProgress
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		switch field {
		case 1:
			text, err := consumeStringValue(wireType, value)
			result.Phase = text
			return err
		case 2:
			number, err := consumeVarintValue(wireType, value)
			result.Progress = int32(number)
			return err
		case 3:
			text, err := consumeStringValue(wireType, value)
			result.Message = text
			return err
		case 4:
			text, err := consumeStringValue(wireType, value)
			result.ComponentID = text
			return err
		case 5:
			text, err := consumeStringValue(wireType, value)
			result.ComponentName = text
			return err
		case 6:
			number, err := consumeVarintValue(wireType, value)
			result.EntryIndex = int32(number)
			return err
		case 7:
			number, err := consumeVarintValue(wireType, value)
			result.EntryTotal = int32(number)
			return err
		case 8:
			text, err := consumeStringValue(wireType, value)
			result.Timestamp = text
			return err
		default:
			return nil
		}
	})
	if err != nil {
		return BackupProgress{}, err
	}
	return result, nil
}
