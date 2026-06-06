package backend

import (
	"ant-chrome/backend/internal/transport/protoipc"
	"context"
	"encoding/json"
	"fmt"
	goruntime "runtime"
	"strings"
	"time"
)

func registerProtoAppHandlers(app *App, dispatcher *protoipc.Dispatcher) {
	if app == nil || dispatcher == nil {
		return
	}
	dispatcher.Register(protoipc.MethodAppConfigGet, app.handleProtoAppConfigGet)
	dispatcher.Register(protoipc.MethodAppPathOpen, app.handleProtoAppPathOpen)
	dispatcher.Register(protoipc.MethodAppReleasePageOpen, app.handleProtoAppReleasePageOpen)
	dispatcher.Register(protoipc.MethodAppDashboardStats, app.handleProtoAppDashboardStats)
	dispatcher.Register(protoipc.MethodAppLicenseStatus, app.handleProtoAppLicenseStatus)
	dispatcher.Register(protoipc.MethodAppCDKeyRedeem, app.handleProtoAppCDKeyRedeem)
	dispatcher.Register(protoipc.MethodAppGithubStarRedeem, app.handleProtoAppGithubStarRedeem)
	dispatcher.Register(protoipc.MethodAppConfigReload, app.handleProtoAppConfigReload)
	dispatcher.Register(protoipc.MethodAppCDKeysGenerate, app.handleProtoAppCDKeysGenerate)
	dispatcher.Register(protoipc.MethodAppRemoteProfileFetch, app.handleProtoAppRemoteProfileFetch)
	dispatcher.Register(protoipc.MethodAppLogList, app.handleProtoAppLogList)
	dispatcher.Register(protoipc.MethodAppLogClear, app.handleProtoAppLogClear)
	dispatcher.Register(protoipc.MethodAppForceQuit, app.handleProtoAppForceQuit)
	dispatcher.Register(protoipc.MethodAppQuitOnly, app.handleProtoAppQuitOnly)
	dispatcher.Register(protoipc.MethodAppWindowStateSave, app.handleProtoAppWindowStateSave)
	dispatcher.Register(protoipc.MethodAppEnvironmentGet, app.handleProtoAppEnvironmentGet)
	dispatcher.Register(protoipc.MethodAppWindowSizeGet, app.handleProtoAppWindowSizeGet)
	dispatcher.Register(protoipc.MethodAppWindowStateGet, app.handleProtoAppWindowStateGet)
	dispatcher.Register(protoipc.MethodAppWindowHide, app.handleProtoAppWindowHide)
	dispatcher.Register(protoipc.MethodAppWindowMinimise, app.handleProtoAppWindowMinimise)
	dispatcher.Register(protoipc.MethodBackupInitialize, app.handleProtoBackupInitialize)
	dispatcher.Register(protoipc.MethodBackupExport, app.handleProtoBackupExport)
	dispatcher.Register(protoipc.MethodBackupImport, app.handleProtoBackupImport)
	registerProtoUpdateHandlers(app, dispatcher)
}

func (a *App) handleProtoAppConfigGet(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	config := a.GetAppConfig()
	return protoipc.EncodeAppConfigInfo(protoipc.AppConfigInfo{
		Name:             mapString(config, "name"),
		Version:          mapString(config, "version"),
		ProjectGithubURL: mapString(config, "projectGithubUrl"),
	}), nil
}

func (a *App) handleProtoAppPathOpen(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	input, err := protoipc.DecodeAppPathRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "AppPathRequest 解码失败",
			Details: err.Error(),
		}
	}
	if err := a.OpenPath(input.Path); err != nil {
		return nil, protoBrowserOperationError("打开路径失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoAppReleasePageOpen(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	input, err := protoipc.DecodeAppReleasePageRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "AppReleasePageRequest 解码失败",
			Details: err.Error(),
		}
	}
	if err := a.OpenAppReleasePage(input.URL); err != nil {
		return nil, protoBrowserOperationError("打开发布页失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoAppDashboardStats(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	stats := a.GetDashboardStats()
	return protoipc.EncodeAppDashboardStats(protoipc.AppDashboardStats{
		TotalInstances:   int32(mapInt64(stats, "totalInstances")),
		RunningInstances: int32(mapInt64(stats, "runningInstances")),
		ProxyCount:       int32(mapInt64(stats, "proxyCount")),
		CoreCount:        int32(mapInt64(stats, "coreCount")),
		MemUsedMB:        int32(mapInt64(stats, "memUsedMB")),
		AppVersion:       mapString(stats, "appVersion"),
	}), nil
}

func (a *App) handleProtoAppLicenseStatus(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	status := a.GetLicenseStatus()
	return protoipc.EncodeAppLicenseStatus(protoipc.AppLicenseStatus{
		MaxLimit:  int32(status.MaxLimit),
		UsedCount: int32(status.UsedCount),
		UsedKeys:  append([]string(nil), status.UsedKeys...),
	}), nil
}

func (a *App) handleProtoAppCDKeyRedeem(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	input, err := protoipc.DecodeAppCDKeyRedeemRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "AppCDKeyRedeemRequest 解码失败",
			Details: err.Error(),
		}
	}
	if err := a.RedeemCDKey(input.CDKey); err != nil {
		return nil, protoBrowserOperationError("兑换 CDKey 失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoAppGithubStarRedeem(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if err := a.RedeemGithubStar(); err != nil {
		return nil, protoBrowserOperationError("领取 GitHub Star 额度失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoAppConfigReload(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if err := a.ReloadConfig(); err != nil {
		return nil, protoBrowserOperationError("重新加载配置失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoAppCDKeysGenerate(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	input, err := protoipc.DecodeAppCDKeysGenerateRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "AppCDKeysGenerateRequest 解码失败",
			Details: err.Error(),
		}
	}
	keys, err := a.GenerateCDKeys(int(input.Count))
	if err != nil {
		return nil, protoBrowserOperationError("生成 CDKey 失败", err)
	}
	return protoipc.EncodeAppCDKeysGenerateResponse(protoipc.AppCDKeysGenerateResponse{Keys: keys}), nil
}

func (a *App) handleProtoAppRemoteProfileFetch(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	input, err := protoipc.DecodeAppRemoteAuthorProfileRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "AppRemoteAuthorProfileRequest 解码失败",
			Details: err.Error(),
		}
	}
	profile, err := a.FetchRemoteAuthorProfile(input.URL, int(input.TimeoutMs))
	if err != nil {
		return nil, protoBrowserOperationError("拉取远程作者配置失败", err)
	}
	payload, err := json.Marshal(profile)
	if err != nil {
		return nil, protoBrowserOperationError("序列化远程作者配置失败", err)
	}
	return protoipc.EncodeAppRemoteAuthorProfileResponse(protoipc.AppRemoteAuthorProfileResponse{JSON: string(payload)}), nil
}

func (a *App) handleProtoAppLogList(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	logs := a.GetAppLogs()
	entries := make([]protoipc.AppLogEntry, 0, len(logs))
	for _, entry := range logs {
		entries = append(entries, protoipc.AppLogEntry{
			Time:       entry.Time,
			Level:      entry.Level,
			Component:  entry.Component,
			Message:    entry.Message,
			FieldsJSON: appLogFieldsJSON(entry.Fields),
		})
	}
	return protoipc.EncodeAppLogListResponse(protoipc.AppLogListResponse{Entries: entries}), nil
}

func (a *App) handleProtoAppLogClear(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	a.ClearAppLogs()
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoAppForceQuit(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	go func() {
		time.Sleep(75 * time.Millisecond)
		a.ForceQuit()
	}()
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoAppQuitOnly(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	go func() {
		time.Sleep(75 * time.Millisecond)
		a.QuitAppOnly()
	}()
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoAppWindowStateSave(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	input, err := protoipc.DecodeAppWindowStateSaveRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "AppWindowStateSaveRequest 解码失败",
			Details: err.Error(),
		}
	}
	if err := a.SaveWindowState(int(input.Width), int(input.Height)); err != nil {
		return nil, protoBrowserOperationError("保存窗口尺寸失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoAppEnvironmentGet(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	return protoipc.EncodeAppEnvironmentInfo(protoipc.AppEnvironmentInfo{
		BuildType: "desktop",
		Platform:  goruntime.GOOS,
		Arch:      goruntime.GOARCH,
	}), nil
}

func (a *App) handleProtoAppWindowSizeGet(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	width, height := a.appRuntime().GetWindowSize(a.ctx)
	return protoipc.EncodeAppWindowSize(protoipc.AppWindowSize{
		Width:  int32(width),
		Height: int32(height),
	}), nil
}

func (a *App) handleProtoAppWindowStateGet(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	runtime := a.appRuntime()
	return protoipc.EncodeAppWindowState(protoipc.AppWindowState{
		Normal:    runtime.IsWindowNormal(a.ctx),
		Maximised: runtime.IsWindowMaximised(a.ctx),
		Minimised: runtime.IsWindowMinimised(a.ctx),
	}), nil
}

func (a *App) handleProtoAppWindowHide(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	a.appRuntime().HideWindow(a.ctx)
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoAppWindowMinimise(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	a.appRuntime().MinimiseWindow(a.ctx)
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBackupInitialize(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	result, err := a.BackupInitializeSystem()
	if err != nil {
		return nil, protoBrowserOperationError("初始化系统失败", err)
	}
	return protoipc.EncodeBackupActionResult(backupActionResultToProto(result)), nil
}

func (a *App) handleProtoBackupExport(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	result, err := a.BackupExportPackage()
	if err != nil {
		return nil, protoBrowserOperationError("导出配置失败", err)
	}
	return protoipc.EncodeBackupActionResult(backupActionResultToProto(result)), nil
}

func (a *App) handleProtoBackupImport(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	input, err := protoipc.DecodeBackupImportRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BackupImportRequest 解码失败",
			Details: err.Error(),
		}
	}
	result, err := a.BackupImportPackage(input.ResetFirst)
	if err != nil {
		return nil, protoBrowserOperationError("加载配置失败", err)
	}
	return protoipc.EncodeBackupActionResult(backupActionResultToProto(result)), nil
}

func backupActionResultToProto(result map[string]interface{}) protoipc.BackupActionResult {
	return protoipc.BackupActionResult{
		Cancelled:        mapBool(result, "cancelled"),
		Message:          mapString(result, "message"),
		ZipPath:          mapString(result, "zipPath"),
		ResetFirst:       mapBool(result, "resetFirst"),
		Imported:         int32(mapInt64(result, "imported")),
		Skipped:          int32(mapInt64(result, "skipped")),
		Conflicts:        int32(mapInt64(result, "conflicts")),
		Partial:          mapBool(result, "partial"),
		ComponentTotal:   int32(mapInt64(result, "componentTotal")),
		ComponentSuccess: int32(mapInt64(result, "componentSuccess")),
		ComponentFailed:  int32(mapInt64(result, "componentFailed")),
		FailedComponents: backupFailedComponentsToProto(result["failedComponents"]),
		IncludedEntries:  int32(mapInt64(result, "includedEntries")),
		SkippedEntries:   int32(mapInt64(result, "skippedEntries")),
		FileCount:        int32(mapInt64(result, "fileCount")),
	}
}

func backupFailedComponentsToProto(value interface{}) []protoipc.BackupFailedComponent {
	items, ok := value.([]backupImportIssue)
	if ok {
		out := make([]protoipc.BackupFailedComponent, 0, len(items))
		for _, item := range items {
			out = append(out, protoipc.BackupFailedComponent{
				ComponentID:   item.ComponentID,
				ComponentName: item.ComponentName,
				Error:         item.Error,
			})
		}
		return out
	}

	stringMapItems, ok := value.([]map[string]string)
	if ok {
		out := make([]protoipc.BackupFailedComponent, 0, len(stringMapItems))
		for _, item := range stringMapItems {
			out = append(out, protoipc.BackupFailedComponent{
				ComponentID:   strings.TrimSpace(item["componentId"]),
				ComponentName: strings.TrimSpace(item["componentName"]),
				Error:         strings.TrimSpace(item["error"]),
			})
		}
		return out
	}

	interfaceMapItems, ok := value.([]map[string]interface{})
	if ok {
		out := make([]protoipc.BackupFailedComponent, 0, len(interfaceMapItems))
		for _, item := range interfaceMapItems {
			out = append(out, protoipc.BackupFailedComponent{
				ComponentID:   mapString(item, "componentId"),
				ComponentName: mapString(item, "componentName"),
				Error:         mapString(item, "error"),
			})
		}
		return out
	}

	rawItems, ok := value.([]interface{})
	if !ok {
		return nil
	}
	out := make([]protoipc.BackupFailedComponent, 0, len(rawItems))
	for _, raw := range rawItems {
		itemMap, ok := raw.(map[string]interface{})
		if !ok {
			out = append(out, protoipc.BackupFailedComponent{Error: strings.TrimSpace(fmt.Sprint(raw))})
			continue
		}
		out = append(out, protoipc.BackupFailedComponent{
			ComponentID:   mapString(itemMap, "componentId"),
			ComponentName: mapString(itemMap, "componentName"),
			Error:         mapString(itemMap, "error"),
		})
	}
	return out
}

func (a *App) emitProtoRuntimeEvent(eventName string, optionalData ...any) {
	if !isProtoRuntimeEvent(eventName) {
		return
	}
	a.emitProtoEvent(eventName, protoipc.EncodeAppRuntimeEventPayload(appRuntimeEventPayloadToProto(optionalData...)))
}

func (a *App) EmitFileDropEvent(paths []string, x int, y int) {
	if a == nil {
		return
	}
	a.emitProtoEvent("app:file-drop", protoipc.EncodeAppFileDropPayload(protoipc.AppFileDropPayload{
		X:     int32(x),
		Y:     int32(y),
		Paths: append([]string(nil), paths...),
	}))
}

func isProtoRuntimeEvent(eventName string) bool {
	switch eventName {
	case "app:request-close",
		"browser:instance:started",
		"browser:instance:updated",
		"browser:instance:stopped",
		"browser:instance:crashed",
		"browser:profiles:updated",
		"browser:groups:updated",
		"browser:defaults:updated",
		"browser:settings:updated",
		"browser:cores:updated",
		"browser:proxies:updated",
		"browser:extensions:updated",
		"browser:cookies:updated",
		"browser:snapshots:updated",
		"window-sync:master-closed",
		"proxy:bridge:failed",
		"proxy:bridge:died":
		return true
	default:
		return false
	}
}

func appRuntimeEventPayloadToProto(optionalData ...any) protoipc.AppRuntimeEventPayload {
	if len(optionalData) == 0 || optionalData[0] == nil {
		return protoipc.AppRuntimeEventPayload{}
	}

	switch value := optionalData[0].(type) {
	case string:
		return protoipc.AppRuntimeEventPayload{ProfileID: strings.TrimSpace(value)}
	case map[string]interface{}:
		return protoipc.AppRuntimeEventPayload{
			ProfileID:      mapString(value, "profileId"),
			ProfileName:    mapString(value, "profileName"),
			Error:          mapString(value, "error"),
			Key:            mapString(value, "key"),
			Engine:         mapString(value, "engine"),
			DebugPort:      int32(mapInt64(value, "debugPort")),
			PID:            int32(mapInt64(value, "pid")),
			Reused:         mapBool(value, "reused"),
			Running:        mapBool(value, "running"),
			DebugReady:     mapBool(value, "debugReady"),
			RuntimeWarning: mapString(value, "runtimeWarning"),
		}
	case map[string]string:
		return protoipc.AppRuntimeEventPayload{
			ProfileID:   strings.TrimSpace(value["profileId"]),
			ProfileName: strings.TrimSpace(value["profileName"]),
			Error:       strings.TrimSpace(value["error"]),
			Key:         strings.TrimSpace(value["key"]),
			Engine:      strings.TrimSpace(value["engine"]),
		}
	default:
		return protoipc.AppRuntimeEventPayload{ProfileID: strings.TrimSpace(fmt.Sprint(value))}
	}
}

func appLogFieldsJSON(fields map[string]interface{}) string {
	if len(fields) == 0 {
		return ""
	}
	payload, err := json.Marshal(fields)
	if err == nil {
		return string(payload)
	}
	fallback, fallbackErr := json.Marshal(map[string]string{"error": fmt.Sprint(err)})
	if fallbackErr != nil {
		return ""
	}
	return string(fallback)
}

func (a *App) emitBackupProgressEvent(eventName string, event backupProgressEvent) {
	if a == nil {
		return
	}
	a.emitProtoEvent(eventName, protoipc.EncodeBackupProgress(protoipc.BackupProgress{
		Phase:         event.Phase,
		Progress:      int32(event.Progress),
		Message:       event.Message,
		ComponentID:   event.ComponentID,
		ComponentName: event.ComponentName,
		EntryIndex:    int32(event.EntryIndex),
		EntryTotal:    int32(event.EntryTotal),
		Timestamp:     event.Timestamp,
	}))
}
