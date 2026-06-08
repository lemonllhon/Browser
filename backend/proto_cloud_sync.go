package backend

import (
	"ant-chrome/backend/internal/transport/protoipc"
	"context"
	"encoding/json"
	"strings"
)

func registerProtoCloudSyncHandlers(app *App, dispatcher *protoipc.Dispatcher) {
	if app == nil || dispatcher == nil {
		return
	}
	dispatcher.Register(protoipc.MethodCloudSyncStatusGet, app.handleProtoCloudSyncStatusGet)
	dispatcher.Register(protoipc.MethodCloudSyncLoginBind, app.handleProtoCloudSyncLoginBind)
	dispatcher.Register(protoipc.MethodCloudSyncRefreshStatus, app.handleProtoCloudSyncRefreshStatus)
	dispatcher.Register(protoipc.MethodCloudSyncLogout, app.handleProtoCloudSyncLogout)
	dispatcher.Register(protoipc.MethodCloudSyncBackupList, app.handleProtoCloudSyncBackupList)
	dispatcher.Register(protoipc.MethodCloudSyncBackupUpload, app.handleProtoCloudSyncBackupUpload)
	dispatcher.Register(protoipc.MethodCloudSyncBackupDownload, app.handleProtoCloudSyncBackupDownload)
	dispatcher.Register(protoipc.MethodCloudSyncBackupRestore, app.handleProtoCloudSyncBackupRestore)
	dispatcher.Register(protoipc.MethodCloudSyncBackupDelete, app.handleProtoCloudSyncBackupDelete)
	dispatcher.Register(protoipc.MethodCloudSyncProfileBackupUpload, app.handleProtoCloudSyncProfileBackupUpload)
	dispatcher.Register(protoipc.MethodCloudSyncProfileBackupPrepareRestore, app.handleProtoCloudSyncProfileBackupPrepareRestore)
}

func (a *App) handleProtoCloudSyncStatusGet(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	status, err := a.CloudSyncGetStatus()
	if err != nil {
		return nil, protoBrowserOperationError("获取云端同步状态失败", err)
	}
	return encodeCloudSyncStatus(status)
}

func (a *App) handleProtoCloudSyncLoginBind(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	var input CloudSyncLoginBindInput
	if rpcErr := decodeCloudSyncInput(request.Payload, &input, "CloudSyncLoginBindRequest"); rpcErr != nil {
		return nil, rpcErr
	}
	status, err := a.CloudSyncLoginBind(input)
	if err != nil {
		return nil, protoBrowserOperationError("授权登录同步服务失败", err)
	}
	return encodeCloudSyncStatus(status)
}

func (a *App) handleProtoCloudSyncRefreshStatus(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	status, err := a.CloudSyncRefreshStatus()
	if err != nil {
		return nil, protoBrowserOperationError("刷新云端同步状态失败", err)
	}
	return encodeCloudSyncStatus(status)
}

func (a *App) handleProtoCloudSyncLogout(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	status, err := a.CloudSyncLogout()
	if err != nil {
		return nil, protoBrowserOperationError("退出云端同步授权失败", err)
	}
	return encodeCloudSyncStatus(status)
}

func (a *App) handleProtoCloudSyncBackupList(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	var input CloudSyncBackupListInput
	if rpcErr := decodeCloudSyncInput(request.Payload, &input, "CloudSyncBackupListRequest"); rpcErr != nil {
		return nil, rpcErr
	}
	result, err := a.CloudSyncListBackups(input)
	if err != nil {
		return nil, protoBrowserOperationError("获取云端备份列表失败", err)
	}
	return encodeCloudSyncJSONResult(result)
}

func (a *App) handleProtoCloudSyncBackupUpload(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	var input CloudSyncBackupUploadInput
	if rpcErr := decodeCloudSyncInput(request.Payload, &input, "CloudSyncBackupUploadRequest"); rpcErr != nil {
		return nil, rpcErr
	}
	result, err := a.CloudSyncUploadFullBackup(input)
	if err != nil {
		return nil, protoBrowserOperationError("上传云端备份失败", err)
	}
	return encodeCloudSyncJSONResult(result)
}

func (a *App) handleProtoCloudSyncBackupDownload(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	var input CloudSyncBackupDownloadInput
	if rpcErr := decodeCloudSyncInput(request.Payload, &input, "CloudSyncBackupDownloadRequest"); rpcErr != nil {
		return nil, rpcErr
	}
	result, err := a.CloudSyncDownloadBackup(input)
	if err != nil {
		return nil, protoBrowserOperationError("下载云端备份失败", err)
	}
	return encodeCloudSyncJSONResult(result)
}

func (a *App) handleProtoCloudSyncBackupRestore(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	var input CloudSyncBackupRestoreInput
	if rpcErr := decodeCloudSyncInput(request.Payload, &input, "CloudSyncBackupRestoreRequest"); rpcErr != nil {
		return nil, rpcErr
	}
	result, err := a.CloudSyncRestoreBackup(input)
	if err != nil {
		return nil, protoBrowserOperationError("恢复云端备份失败", err)
	}
	return encodeCloudSyncJSONResult(result)
}

func (a *App) handleProtoCloudSyncBackupDelete(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	var input CloudSyncBackupDeleteInput
	if rpcErr := decodeCloudSyncInput(request.Payload, &input, "CloudSyncBackupDeleteRequest"); rpcErr != nil {
		return nil, rpcErr
	}
	if err := a.CloudSyncDeleteBackup(input); err != nil {
		return nil, protoBrowserOperationError("删除云端备份失败", err)
	}
	return encodeCloudSyncJSONResult(map[string]bool{"ok": true})
}

func (a *App) handleProtoCloudSyncProfileBackupUpload(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	var input ProfileBackupExportRequest
	if rpcErr := decodeCloudSyncInput(request.Payload, &input, "CloudSyncProfileBackupUploadRequest"); rpcErr != nil {
		return nil, rpcErr
	}
	result, err := a.CloudSyncUploadProfileBackup(input)
	if err != nil {
		return nil, protoBrowserOperationError("上传实例云端备份失败", err)
	}
	return encodeCloudSyncJSONResult(result)
}

func (a *App) handleProtoCloudSyncProfileBackupPrepareRestore(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	var input CloudSyncProfileBackupPrepareRestoreInput
	if rpcErr := decodeCloudSyncInput(request.Payload, &input, "CloudSyncProfileBackupPrepareRestoreRequest"); rpcErr != nil {
		return nil, rpcErr
	}
	result, err := a.CloudSyncPrepareProfileBackupRestore(input)
	if err != nil {
		return nil, protoBrowserOperationError("准备实例云端恢复失败", err)
	}
	return encodeCloudSyncJSONResult(result)
}

func encodeCloudSyncStatus(status CloudSyncStatus) ([]byte, *protoipc.RPCError) {
	return encodeCloudSyncJSONResult(status)
}

func encodeCloudSyncJSONResult(value interface{}) ([]byte, *protoipc.RPCError) {
	payload, err := json.Marshal(value)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInternal,
			Message: "云端同步状态序列化失败",
			Details: err.Error(),
		}
	}
	return protoipc.EncodeCloudSyncJSONMessage(protoipc.CloudSyncJSONMessage{JSON: string(payload)}), nil
}

func decodeCloudSyncInput(payload []byte, out interface{}, name string) *protoipc.RPCError {
	inputJSON, err := protoipc.DecodeCloudSyncJSONMessage(payload)
	if err != nil {
		return &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: name + " 解码失败",
			Details: err.Error(),
		}
	}
	if strings.TrimSpace(inputJSON.JSON) == "" {
		inputJSON.JSON = "{}"
	}
	if err := json.Unmarshal([]byte(inputJSON.JSON), out); err != nil {
		return &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: name + " JSON 无效",
			Details: err.Error(),
		}
	}
	return nil
}
