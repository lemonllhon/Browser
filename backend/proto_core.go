package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/transport/protoipc"
	"context"
)

func registerProtoCoreHandlers(app *App, dispatcher *protoipc.Dispatcher) {
	if app == nil || dispatcher == nil {
		return
	}
	dispatcher.Register(protoipc.MethodBrowserCoreList, app.handleProtoBrowserCoreList)
	dispatcher.Register(protoipc.MethodBrowserCoreSave, app.handleProtoBrowserCoreSave)
	dispatcher.Register(protoipc.MethodBrowserCoreDelete, app.handleProtoBrowserCoreDelete)
	dispatcher.Register(protoipc.MethodBrowserCoreSetDefault, app.handleProtoBrowserCoreSetDefault)
	dispatcher.Register(protoipc.MethodBrowserCoreValidate, app.handleProtoBrowserCoreValidate)
	dispatcher.Register(protoipc.MethodBrowserCoreRenamePath, app.handleProtoBrowserCoreRenamePath)
	dispatcher.Register(protoipc.MethodBrowserCoreExtendedInfo, app.handleProtoBrowserCoreExtendedInfo)
	dispatcher.Register(protoipc.MethodBrowserCoreScan, app.handleProtoBrowserCoreScan)
	dispatcher.Register(protoipc.MethodBrowserCoreDownload, app.handleProtoBrowserCoreDownload)
	dispatcher.Register(protoipc.MethodBrowserCoreCancelDownload, app.handleProtoBrowserCoreCancelDownload)
	dispatcher.Register(protoipc.MethodBrowserCoreOpenPath, app.handleProtoBrowserCoreOpenPath)
}

func (a *App) handleProtoBrowserCoreList(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	return protoipc.EncodeBrowserCoreListResponse(protoipc.BrowserCoreListResponse{
		Cores: browserCoresToProto(a.BrowserCoreList()),
	}), nil
}

func (a *App) handleProtoBrowserCoreSave(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserCoreSaveRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserCoreSaveRequest 解码失败",
			Details: err.Error(),
		}
	}
	if err := a.BrowserCoreSave(browserCoreInputFromProto(input.Core)); err != nil {
		return nil, protoBrowserOperationError("保存浏览器内核失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBrowserCoreDelete(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserCoreIDRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserCoreIDRequest 解码失败",
			Details: err.Error(),
		}
	}
	if err := a.BrowserCoreDelete(input.CoreID); err != nil {
		return nil, protoBrowserOperationError("删除浏览器内核失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBrowserCoreSetDefault(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserCoreIDRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserCoreIDRequest 解码失败",
			Details: err.Error(),
		}
	}
	if err := a.BrowserCoreSetDefault(input.CoreID); err != nil {
		return nil, protoBrowserOperationError("设置默认浏览器内核失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBrowserCoreValidate(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserCorePathRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserCorePathRequest 解码失败",
			Details: err.Error(),
		}
	}
	result := a.BrowserCoreValidate(input.CorePath)
	return protoipc.EncodeBrowserCoreValidateResponse(protoipc.BrowserCoreValidateResponse{
		Valid:   result.Valid,
		Message: result.Message,
	}), nil
}

func (a *App) handleProtoBrowserCoreRenamePath(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserCoreRenamePathRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserCoreRenamePathRequest 解码失败",
			Details: err.Error(),
		}
	}
	if err := a.BrowserCoreRenamePath(input.CorePath, input.NewFolderName); err != nil {
		return nil, protoBrowserOperationError("重命名浏览器内核路径失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBrowserCoreExtendedInfo(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	return protoipc.EncodeBrowserCoreExtendedInfoResponse(protoipc.BrowserCoreExtendedInfoResponse{
		Items: browserCoreExtendedInfosToProto(a.BrowserCoreExtendedInfo()),
	}), nil
}

func (a *App) handleProtoBrowserCoreScan(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	return protoipc.EncodeBrowserCoreListResponse(protoipc.BrowserCoreListResponse{
		Cores: browserCoresToProto(a.BrowserCoreScan()),
	}), nil
}

func (a *App) handleProtoBrowserCoreDownload(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserCoreDownloadRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserCoreDownloadRequest 解码失败",
			Details: err.Error(),
		}
	}
	if err := a.BrowserCoreDownload(input.CoreName, input.URL, input.ProxyConfig); err != nil {
		return nil, protoBrowserOperationError("下载浏览器内核失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBrowserCoreCancelDownload(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	if err := a.BrowserCoreCancelDownload(); err != nil {
		return nil, protoBrowserOperationError("中断浏览器内核下载失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBrowserCoreOpenPath(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserCorePathRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserCorePathRequest 解码失败",
			Details: err.Error(),
		}
	}
	if err := a.OpenCorePath(input.CorePath); err != nil {
		return nil, protoBrowserOperationError("打开浏览器内核路径失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func browserCoresToProto(cores []BrowserCore) []protoipc.BrowserCore {
	out := make([]protoipc.BrowserCore, 0, len(cores))
	for _, item := range cores {
		out = append(out, browserCoreToProto(item))
	}
	return out
}

func browserCoreToProto(item BrowserCore) protoipc.BrowserCore {
	return protoipc.BrowserCore{
		CoreID:    item.CoreId,
		CoreName:  item.CoreName,
		CorePath:  item.CorePath,
		IsDefault: item.IsDefault,
	}
}

func browserCoreInputFromProto(item protoipc.BrowserCore) BrowserCoreInput {
	return BrowserCoreInput{
		CoreId:    item.CoreID,
		CoreName:  item.CoreName,
		CorePath:  item.CorePath,
		IsDefault: item.IsDefault,
	}
}

func browserCoreExtendedInfosToProto(items []BrowserCoreExtendedInfo) []protoipc.BrowserCoreExtendedInfo {
	out := make([]protoipc.BrowserCoreExtendedInfo, 0, len(items))
	for _, item := range items {
		out = append(out, protoipc.BrowserCoreExtendedInfo{
			CoreID:        item.CoreId,
			ChromeVersion: item.ChromeVersion,
			InstanceCount: int32(item.InstanceCount),
		})
	}
	return out
}

func (a *App) emitCoreDownloadProgressEvent(eventName string, optionalData ...any) {
	if a == nil || eventName != "download:progress" || len(optionalData) == 0 {
		return
	}
	progress, ok := optionalData[0].(browser.DownloadProgress)
	if !ok {
		return
	}
	a.emitProtoEvent(eventName, protoipc.EncodeBrowserCoreDownloadProgress(protoipc.BrowserCoreDownloadProgress{
		Phase:    progress.Phase,
		Progress: int32(progress.Progress),
		Message:  progress.Message,
		CorePath: progress.CorePath,
	}))
	if progress.Phase == "done" {
		a.emitBrowserCoresUpdated()
	}
}
