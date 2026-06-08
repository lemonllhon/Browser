package backend

import (
	"ant-chrome/backend/internal/transport/protoipc"
	"context"
	"strings"
	"time"
)

func registerProtoHandlers(app *App, dispatcher *protoipc.Dispatcher) {
	if app == nil || dispatcher == nil {
		return
	}
	dispatcher.Register(protoipc.MethodBrowserProfileList, app.handleProtoBrowserProfileList)
	dispatcher.Register(protoipc.MethodBrowserProfileCreate, app.handleProtoBrowserProfileCreate)
	dispatcher.Register(protoipc.MethodBrowserProfileUpdate, app.handleProtoBrowserProfileUpdate)
	dispatcher.Register(protoipc.MethodBrowserProfileDelete, app.handleProtoBrowserProfileDelete)
	dispatcher.Register(protoipc.MethodBrowserProfileCopy, app.handleProtoBrowserProfileCopy)
	dispatcher.Register(protoipc.MethodBrowserProfileBackupExport, app.handleProtoBrowserProfileBackupExport)
	dispatcher.Register(protoipc.MethodBrowserProfileBackupChooseImport, app.handleProtoBrowserProfileBackupChooseImport)
	dispatcher.Register(protoipc.MethodBrowserProfileBackupImport, app.handleProtoBrowserProfileBackupImport)
	dispatcher.Register(protoipc.MethodBrowserInstanceStart, app.handleProtoBrowserInstanceStart)
	dispatcher.Register(protoipc.MethodBrowserInstanceStop, app.handleProtoBrowserInstanceStop)
	dispatcher.Register(protoipc.MethodBrowserInstanceRestart, app.handleProtoBrowserInstanceRestart)
	dispatcher.Register(protoipc.MethodBrowserInstanceStartByCode, app.handleProtoBrowserInstanceStartByCode)
	dispatcher.Register(protoipc.MethodBrowserTagList, app.handleProtoBrowserTagList)
	dispatcher.Register(protoipc.MethodBrowserProfileSetKeywords, app.handleProtoBrowserProfileSetKeywords)
	dispatcher.Register(protoipc.MethodBrowserProfileBatchSetTags, app.handleProtoBrowserProfileBatchSetTags)
	dispatcher.Register(protoipc.MethodBrowserProfileBatchRemoveTags, app.handleProtoBrowserProfileBatchRemoveTags)
	dispatcher.Register(protoipc.MethodBrowserTagRename, app.handleProtoBrowserTagRename)
	dispatcher.Register(protoipc.MethodBrowserGroupList, app.handleProtoBrowserGroupList)
	dispatcher.Register(protoipc.MethodBrowserGroupCreate, app.handleProtoBrowserGroupCreate)
	dispatcher.Register(protoipc.MethodBrowserGroupUpdate, app.handleProtoBrowserGroupUpdate)
	dispatcher.Register(protoipc.MethodBrowserGroupDelete, app.handleProtoBrowserGroupDelete)
	dispatcher.Register(protoipc.MethodBrowserGroupMoveProfiles, app.handleProtoBrowserGroupMoveProfiles)
	dispatcher.Register(protoipc.MethodBrowserInstancePinCenter, app.handleProtoBrowserInstancePinCenter)
	dispatcher.Register(protoipc.MethodBrowserProfileSwitchProxyNow, app.handleProtoBrowserProfileSwitchProxyNow)
	dispatcher.Register(protoipc.MethodBrowserInstanceOpenURL, app.handleProtoBrowserInstanceOpenURL)
	dispatcher.Register(protoipc.MethodBrowserInstanceTabList, app.handleProtoBrowserInstanceTabList)
	dispatcher.Register(protoipc.MethodBrowserProfileCodeGet, app.handleProtoBrowserProfileCodeGet)
	dispatcher.Register(protoipc.MethodBrowserProfileCodeRegenerate, app.handleProtoBrowserProfileCodeRegenerate)
	dispatcher.Register(protoipc.MethodBrowserProfileCodeSet, app.handleProtoBrowserProfileCodeSet)
	dispatcher.Register(protoipc.MethodBrowserLaunchServerInfo, app.handleProtoBrowserLaunchServerInfo)
	dispatcher.Register(protoipc.MethodBrowserSettingsGet, app.handleProtoBrowserSettingsGet)
	dispatcher.Register(protoipc.MethodBrowserSettingsSave, app.handleProtoBrowserSettingsSave)
	dispatcher.Register(protoipc.MethodBrowserBookmarkList, app.handleProtoBrowserBookmarkList)
	dispatcher.Register(protoipc.MethodBrowserBookmarkSave, app.handleProtoBrowserBookmarkSave)
	dispatcher.Register(protoipc.MethodBrowserBookmarkReset, app.handleProtoBrowserBookmarkReset)
	dispatcher.Register(protoipc.MethodBrowserDefaultStartURLList, app.handleProtoBrowserDefaultStartURLList)
	dispatcher.Register(protoipc.MethodBrowserDefaultStartURLSave, app.handleProtoBrowserDefaultStartURLSave)
	dispatcher.Register(protoipc.MethodBrowserDefaultStartURLReset, app.handleProtoBrowserDefaultStartURLReset)
	dispatcher.Register(protoipc.MethodBrowserDefaultContentRuleList, app.handleProtoBrowserDefaultContentRuleList)
	dispatcher.Register(protoipc.MethodBrowserDefaultContentRuleSave, app.handleProtoBrowserDefaultContentRuleSave)
	dispatcher.Register(protoipc.MethodBrowserSnapshotList, app.handleProtoBrowserSnapshotList)
	dispatcher.Register(protoipc.MethodBrowserSnapshotCreate, app.handleProtoBrowserSnapshotCreate)
	dispatcher.Register(protoipc.MethodBrowserSnapshotRestore, app.handleProtoBrowserSnapshotRestore)
	dispatcher.Register(protoipc.MethodBrowserSnapshotDelete, app.handleProtoBrowserSnapshotDelete)
	dispatcher.Register(protoipc.MethodBrowserCookieList, app.handleProtoBrowserCookieList)
	dispatcher.Register(protoipc.MethodBrowserCookieClear, app.handleProtoBrowserCookieClear)
	dispatcher.Register(protoipc.MethodBrowserCookieExport, app.handleProtoBrowserCookieExport)
	dispatcher.Register(protoipc.MethodBrowserCookieImport, app.handleProtoBrowserCookieImport)
	dispatcher.Register(protoipc.MethodBrowserUserDataDirOpen, app.handleProtoBrowserUserDataDirOpen)
	dispatcher.Register(protoipc.MethodBrowserProfileUserDataDirOpen, app.handleProtoBrowserProfileUserDataDirOpen)
	dispatcher.Register(protoipc.MethodBrowserExtensionList, app.handleProtoBrowserExtensionList)
	dispatcher.Register(protoipc.MethodBrowserExtensionGet, app.handleProtoBrowserExtensionGet)
	dispatcher.Register(protoipc.MethodBrowserExtensionDelete, app.handleProtoBrowserExtensionDelete)
	dispatcher.Register(protoipc.MethodBrowserExtensionChooseArchive, app.handleProtoBrowserExtensionChooseArchive)
	dispatcher.Register(protoipc.MethodBrowserExtensionChooseDirectory, app.handleProtoBrowserExtensionChooseDirectory)
	dispatcher.Register(protoipc.MethodBrowserExtensionImportArchive, app.handleProtoBrowserExtensionImportArchive)
	dispatcher.Register(protoipc.MethodBrowserExtensionImportDirectory, app.handleProtoBrowserExtensionImportDirectory)
	dispatcher.Register(protoipc.MethodBrowserExtensionListProfileBindings, app.handleProtoBrowserExtensionListProfileBindings)
	dispatcher.Register(protoipc.MethodBrowserExtensionListForProfile, app.handleProtoBrowserExtensionListForProfile)
	dispatcher.Register(protoipc.MethodBrowserExtensionAssignProfiles, app.handleProtoBrowserExtensionAssignProfiles)
	dispatcher.Register(protoipc.MethodBrowserExtensionSetAutoBind, app.handleProtoBrowserExtensionSetAutoBind)
	dispatcher.Register(protoipc.MethodBrowserExtensionUnassignProfiles, app.handleProtoBrowserExtensionUnassignProfiles)
	dispatcher.Register(protoipc.MethodBrowserExtensionSyncData, app.handleProtoBrowserExtensionSyncData)
	registerProtoWindowSyncHandlers(app, dispatcher)
	registerProtoAppHandlers(app, dispatcher)
	registerProtoProxyHandlers(app, dispatcher)
	registerProtoCoreHandlers(app, dispatcher)
	registerProtoCloudSyncHandlers(app, dispatcher)
}

func (a *App) handleProtoBrowserProfileList(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}

	input, err := protoipc.DecodeBrowserProfileListRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserProfileListRequest 解码失败",
			Details: err.Error(),
		}
	}

	var profiles []BrowserProfile
	if tag := strings.TrimSpace(input.Tag); tag != "" {
		profiles = a.BrowserProfileListByTag(tag)
	} else {
		profiles = a.BrowserProfileList()
	}

	return protoipc.EncodeBrowserProfileListResponse(protoipc.BrowserProfileListResponse{
		Profiles: a.browserProfilesToProto(profiles),
	}), nil
}

func (a *App) handleProtoBrowserProfileCreate(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserProfileCreateRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserProfileCreateRequest 解码失败",
			Details: err.Error(),
		}
	}

	profile, err := a.BrowserProfileCreate(browserProfileInputFromProto(input.Profile))
	if err != nil {
		return nil, protoBrowserOperationError("创建浏览器实例失败", err)
	}
	return a.encodeProtoBrowserProfileResponse(profile)
}

func (a *App) handleProtoBrowserProfileUpdate(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserProfileUpdateRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserProfileUpdateRequest 解码失败",
			Details: err.Error(),
		}
	}

	profile, err := a.BrowserProfileUpdate(strings.TrimSpace(input.ProfileID), browserProfileInputFromProto(input.Profile))
	if err != nil {
		return nil, protoBrowserOperationError("更新浏览器实例失败", err)
	}
	return a.encodeProtoBrowserProfileResponse(profile)
}

func (a *App) handleProtoBrowserProfileDelete(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserProfileDeleteRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserProfileDeleteRequest 解码失败",
			Details: err.Error(),
		}
	}

	if err := a.BrowserProfileDelete(strings.TrimSpace(input.ProfileID)); err != nil {
		return nil, protoBrowserOperationError("删除浏览器实例失败", err)
	}
	return protoipc.EncodeBrowserProfileDeleteResponse(protoipc.BrowserProfileDeleteResponse{Deleted: true}), nil
}

func (a *App) handleProtoBrowserProfileCopy(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserProfileCopyRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserProfileCopyRequest 解码失败",
			Details: err.Error(),
		}
	}

	profile, err := a.BrowserProfileCopy(strings.TrimSpace(input.ProfileID), strings.TrimSpace(input.NewName))
	if err != nil {
		return nil, protoBrowserOperationError("复制浏览器实例失败", err)
	}
	return a.encodeProtoBrowserProfileResponse(profile)
}

func (a *App) handleProtoBrowserInstanceStart(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserInstanceProfileRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserInstanceProfileRequest 解码失败",
			Details: err.Error(),
		}
	}

	profile, err := a.BrowserInstanceStart(strings.TrimSpace(input.ProfileID))
	if err != nil {
		return nil, protoBrowserOperationError("启动浏览器实例失败", err)
	}
	return a.encodeProtoBrowserProfileResponse(profile)
}

func (a *App) handleProtoBrowserInstanceStop(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserInstanceProfileRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserInstanceProfileRequest 解码失败",
			Details: err.Error(),
		}
	}

	profile, err := a.BrowserInstanceStop(strings.TrimSpace(input.ProfileID))
	if err != nil {
		return nil, protoBrowserOperationError("停止浏览器实例失败", err)
	}
	return a.encodeProtoBrowserProfileResponse(profile)
}

func (a *App) handleProtoBrowserInstanceRestart(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserInstanceProfileRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserInstanceProfileRequest 解码失败",
			Details: err.Error(),
		}
	}

	profile, err := a.BrowserInstanceRestart(strings.TrimSpace(input.ProfileID))
	if err != nil {
		return nil, protoBrowserOperationError("重启浏览器实例失败", err)
	}
	return a.encodeProtoBrowserProfileResponse(profile)
}

func (a *App) handleProtoBrowserInstanceStartByCode(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserInstanceStartByCodeRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserInstanceStartByCodeRequest 解码失败",
			Details: err.Error(),
		}
	}

	profile, err := a.BrowserInstanceStartByCode(strings.TrimSpace(input.Code))
	if err != nil {
		return nil, protoBrowserOperationError("通过 LaunchCode 启动浏览器实例失败", err)
	}
	return a.encodeProtoBrowserProfileResponse(profile)
}

func (a *App) handleProtoBrowserTagList(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	return protoipc.EncodeBrowserTagListResponse(protoipc.BrowserTagListResponse{
		Tags: a.BrowserGetAllTags(),
	}), nil
}

func (a *App) handleProtoBrowserProfileSetKeywords(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserProfileSetKeywordsRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserProfileSetKeywordsRequest 解码失败",
			Details: err.Error(),
		}
	}

	profile, err := a.BrowserProfileSetKeywords(strings.TrimSpace(input.ProfileID), input.Keywords)
	if err != nil {
		return nil, protoBrowserOperationError("设置浏览器实例关键字失败", err)
	}
	return a.encodeProtoBrowserProfileResponse(profile)
}

func (a *App) handleProtoBrowserProfileBatchSetTags(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserProfileBatchSetTagsRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserProfileBatchSetTagsRequest 解码失败",
			Details: err.Error(),
		}
	}

	if err := a.BrowserProfileBatchSetTags(input.ProfileIDs, input.Tags, input.Replace); err != nil {
		return nil, protoBrowserOperationError("批量设置浏览器实例标签失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBrowserProfileBatchRemoveTags(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserProfileBatchRemoveTagsRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserProfileBatchRemoveTagsRequest 解码失败",
			Details: err.Error(),
		}
	}

	if err := a.BrowserProfileBatchRemoveTags(input.ProfileIDs, input.Tags); err != nil {
		return nil, protoBrowserOperationError("批量移除浏览器实例标签失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBrowserTagRename(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserTagRenameRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserTagRenameRequest 解码失败",
			Details: err.Error(),
		}
	}

	if err := a.BrowserRenameTag(strings.TrimSpace(input.OldName), strings.TrimSpace(input.NewName)); err != nil {
		return nil, protoBrowserOperationError("重命名浏览器标签失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBrowserGroupList(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	return protoipc.EncodeBrowserGroupListResponse(protoipc.BrowserGroupListResponse{
		Groups: browserGroupsWithCountToProto(a.ListGroups()),
	}), nil
}

func (a *App) handleProtoBrowserGroupCreate(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserGroupCreateRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserGroupCreateRequest 解码失败",
			Details: err.Error(),
		}
	}

	group, err := a.CreateGroup(browserGroupInputFromProto(input.Group))
	if err != nil {
		return nil, protoBrowserOperationError("创建浏览器分组失败", err)
	}
	return encodeProtoBrowserGroupResponse(group)
}

func (a *App) handleProtoBrowserGroupUpdate(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserGroupUpdateRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserGroupUpdateRequest 解码失败",
			Details: err.Error(),
		}
	}

	group, err := a.UpdateGroup(strings.TrimSpace(input.GroupID), browserGroupInputFromProto(input.Group))
	if err != nil {
		return nil, protoBrowserOperationError("更新浏览器分组失败", err)
	}
	return encodeProtoBrowserGroupResponse(group)
}

func (a *App) handleProtoBrowserGroupDelete(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserGroupDeleteRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserGroupDeleteRequest 解码失败",
			Details: err.Error(),
		}
	}

	if err := a.DeleteGroup(strings.TrimSpace(input.GroupID)); err != nil {
		return nil, protoBrowserOperationError("删除浏览器分组失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBrowserGroupMoveProfiles(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserGroupMoveProfilesRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserGroupMoveProfilesRequest 解码失败",
			Details: err.Error(),
		}
	}

	if err := a.MoveInstancesToGroup(input.ProfileIDs, strings.TrimSpace(input.GroupID)); err != nil {
		return nil, protoBrowserOperationError("移动浏览器实例到分组失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBrowserInstancePinCenter(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserInstanceProfileRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserInstanceProfileRequest 解码失败",
			Details: err.Error(),
		}
	}

	if err := a.BrowserInstancePinCenter(strings.TrimSpace(input.ProfileID)); err != nil {
		return nil, protoBrowserOperationError("浏览器实例置顶居中失败", err)
	}
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: true}), nil
}

func (a *App) handleProtoBrowserProfileSwitchProxyNow(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserInstanceProfileRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserInstanceProfileRequest 解码失败",
			Details: err.Error(),
		}
	}

	profile, err := a.BrowserProfileSwitchProxyNow(strings.TrimSpace(input.ProfileID))
	if err != nil {
		return nil, protoBrowserOperationError("浏览器实例即时切换代理失败", err)
	}
	return a.encodeProtoBrowserProfileResponse(profile)
}

func (a *App) handleProtoBrowserInstanceOpenURL(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserInstanceOpenURLRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserInstanceOpenURLRequest 解码失败",
			Details: err.Error(),
		}
	}

	ok := a.BrowserInstanceOpenUrl(strings.TrimSpace(input.ProfileID), strings.TrimSpace(input.TargetURL))
	return protoipc.EncodeBrowserActionResponse(protoipc.BrowserActionResponse{OK: ok}), nil
}

func (a *App) handleProtoBrowserInstanceTabList(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserInstanceProfileRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserInstanceProfileRequest 解码失败",
			Details: err.Error(),
		}
	}

	return protoipc.EncodeBrowserTabListResponse(protoipc.BrowserTabListResponse{
		Tabs: browserTabsToProto(a.BrowserInstanceGetTabs(strings.TrimSpace(input.ProfileID))),
	}), nil
}

func (a *App) handleProtoBrowserProfileCodeGet(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserProfileCodeRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserProfileCodeRequest 解码失败",
			Details: err.Error(),
		}
	}

	code, err := a.BrowserProfileGetCode(strings.TrimSpace(input.ProfileID))
	if err != nil {
		return nil, protoBrowserOperationError("获取浏览器实例 LaunchCode 失败", err)
	}
	return protoipc.EncodeBrowserProfileCodeResponse(protoipc.BrowserProfileCodeResponse{Code: code}), nil
}

func (a *App) handleProtoBrowserProfileCodeRegenerate(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserProfileCodeRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserProfileCodeRequest 解码失败",
			Details: err.Error(),
		}
	}

	code, err := a.BrowserProfileRegenerateCode(strings.TrimSpace(input.ProfileID))
	if err != nil {
		return nil, protoBrowserOperationError("重新生成浏览器实例 LaunchCode 失败", err)
	}
	return protoipc.EncodeBrowserProfileCodeResponse(protoipc.BrowserProfileCodeResponse{Code: code}), nil
}

func (a *App) handleProtoBrowserProfileCodeSet(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	input, err := protoipc.DecodeBrowserProfileSetCodeRequest(request.Payload)
	if err != nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInvalidPayload,
			Message: "BrowserProfileSetCodeRequest 解码失败",
			Details: err.Error(),
		}
	}

	code, err := a.BrowserProfileSetCode(strings.TrimSpace(input.ProfileID), strings.TrimSpace(input.Code))
	if err != nil {
		return nil, protoBrowserOperationError("设置浏览器实例 LaunchCode 失败", err)
	}
	return protoipc.EncodeBrowserProfileCodeResponse(protoipc.BrowserProfileCodeResponse{Code: code}), nil
}

func (a *App) handleProtoBrowserLaunchServerInfo(ctx context.Context, request protoipc.Envelope) ([]byte, *protoipc.RPCError) {
	if rpcErr := a.ensureProtoBrowserReady(ctx); rpcErr != nil {
		return nil, rpcErr
	}
	return protoipc.EncodeBrowserLaunchServerInfoResponse(launchServerInfoToProto(a.GetLaunchServerInfo())), nil
}

func (a *App) ensureProtoBrowserReady(ctx context.Context) *protoipc.RPCError {
	if err := ctx.Err(); err != nil {
		return &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInternal,
			Message: "请求上下文已取消",
			Details: err.Error(),
		}
	}
	if a != nil {
		if err := a.waitLocalDataReady(ctx, 8*time.Second); err != nil {
			return &protoipc.RPCError{
				Code:    protoipc.ErrorCodeInternal,
				Message: "本地数据仍在初始化，请稍后重试",
				Details: err.Error(),
			}
		}
	}
	if a == nil || a.browserMgr == nil {
		return &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInternal,
			Message: "浏览器实例服务尚未初始化",
		}
	}
	return nil
}

func protoBrowserOperationError(message string, err error) *protoipc.RPCError {
	return &protoipc.RPCError{
		Code:    protoipc.ErrorCodeBadRequest,
		Message: message,
		Details: err.Error(),
	}
}

func (a *App) encodeProtoBrowserProfileResponse(profile *BrowserProfile) ([]byte, *protoipc.RPCError) {
	if profile == nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInternal,
			Message: "浏览器实例操作未返回数据",
		}
	}
	return protoipc.EncodeBrowserProfileResponse(protoipc.BrowserProfileResponse{
		Profile: a.browserProfileToProto(*profile),
	}), nil
}

func browserProfileInputFromProto(input protoipc.BrowserProfileInput) BrowserProfileInput {
	return BrowserProfileInput{
		ProfileName:                  input.ProfileName,
		UserDataDir:                  input.UserDataDir,
		CoreId:                       input.CoreID,
		FingerprintArgs:              append([]string{}, input.FingerprintArgs...),
		ProxyId:                      input.ProxyID,
		ProxyConfig:                  input.ProxyConfig,
		AutoProxySwitchEnabled:       input.AutoProxySwitchEnabled,
		AutoProxySwitchGroupName:     input.AutoProxySwitchGroupName,
		AutoProxySwitchMode:          input.AutoProxySwitchMode,
		AutoProxySwitchIntervalM:     int(input.AutoProxySwitchIntervalM),
		AutoProxySwitchRotateByGroup: input.AutoProxySwitchRotateByGroup,
		LaunchArgs:                   append([]string{}, input.LaunchArgs...),
		Tags:                         append([]string{}, input.Tags...),
		Keywords:                     append([]string{}, input.Keywords...),
		GroupId:                      input.GroupID,
	}
}

func browserGroupInputFromProto(input protoipc.BrowserGroupInput) BrowserGroupInput {
	return BrowserGroupInput{
		GroupName: input.GroupName,
		ParentId:  input.ParentID,
		SortOrder: int(input.SortOrder),
	}
}

func encodeProtoBrowserGroupResponse(group *BrowserGroup) ([]byte, *protoipc.RPCError) {
	if group == nil {
		return nil, &protoipc.RPCError{
			Code:    protoipc.ErrorCodeInternal,
			Message: "浏览器分组操作未返回数据",
		}
	}
	return protoipc.EncodeBrowserGroupResponse(protoipc.BrowserGroupResponse{
		Group: browserGroupToProto(*group, 0),
	}), nil
}

func (a *App) browserProfilesToProto(profiles []BrowserProfile) []protoipc.BrowserProfile {
	out := make([]protoipc.BrowserProfile, 0, len(profiles))
	identities := a.browserInstanceIdentityMap()
	for _, profile := range profiles {
		out = append(out, browserProfileToProto(profile, identities[profile.ProfileId]))
	}
	return out
}

func browserGroupsWithCountToProto(groups []BrowserGroupWithCount) []protoipc.BrowserGroup {
	out := make([]protoipc.BrowserGroup, 0, len(groups))
	for _, group := range groups {
		out = append(out, browserGroupToProto(group.Group, group.InstanceCount))
	}
	return out
}

func browserGroupToProto(group BrowserGroup, instanceCount int) protoipc.BrowserGroup {
	return protoipc.BrowserGroup{
		GroupID:       group.GroupId,
		GroupName:     group.GroupName,
		ParentID:      group.ParentId,
		SortOrder:     int32(group.SortOrder),
		CreatedAt:     group.CreatedAt,
		UpdatedAt:     group.UpdatedAt,
		InstanceCount: int32(instanceCount),
	}
}

func browserTabsToProto(tabs []BrowserTab) []protoipc.BrowserTab {
	out := make([]protoipc.BrowserTab, 0, len(tabs))
	for _, tab := range tabs {
		out = append(out, protoipc.BrowserTab{
			TabID:  tab.TabId,
			Title:  tab.Title,
			URL:    tab.Url,
			Active: tab.Active,
		})
	}
	return out
}

func launchServerInfoToProto(info map[string]interface{}) protoipc.BrowserLaunchServerInfoResponse {
	apiAuth := mapStringInterface(info["apiAuth"])
	return protoipc.BrowserLaunchServerInfoResponse{
		Host:            stringFromInterface(info["host"]),
		Port:            int32FromInterface(info["port"]),
		PreferredPort:   int32FromInterface(info["preferredPort"]),
		BaseURL:         stringFromInterface(info["baseUrl"]),
		CDPURL:          stringFromInterface(info["cdpUrl"]),
		ActiveDebugPort: int32FromInterface(info["activeDebugPort"]),
		Ready:           boolFromInterface(info["ready"]),
		APIAuth: protoipc.BrowserLaunchServerAPIAuth{
			Requested:  boolFromInterface(apiAuth["requested"]),
			Configured: boolFromInterface(apiAuth["configured"]),
			Enabled:    boolFromInterface(apiAuth["enabled"]),
			Header:     stringFromInterface(apiAuth["header"]),
		},
	}
}

func mapStringInterface(value interface{}) map[string]interface{} {
	if typed, ok := value.(map[string]interface{}); ok {
		return typed
	}
	return map[string]interface{}{}
}

func stringFromInterface(value interface{}) string {
	if typed, ok := value.(string); ok {
		return typed
	}
	return ""
}

func boolFromInterface(value interface{}) bool {
	if typed, ok := value.(bool); ok {
		return typed
	}
	return false
}

func int32FromInterface(value interface{}) int32 {
	switch typed := value.(type) {
	case int:
		return int32(typed)
	case int32:
		return typed
	case int64:
		return int32(typed)
	case float64:
		return int32(typed)
	default:
		return 0
	}
}

func (a *App) browserProfileToProto(profile BrowserProfile) protoipc.BrowserProfile {
	identity, _ := a.browserInstanceIdentityForProfileID(profile.ProfileId)
	return browserProfileToProto(profile, identity)
}

func browserProfileToProto(profile BrowserProfile, identity browserInstanceIdentity) protoipc.BrowserProfile {
	result := protoipc.BrowserProfile{
		ProfileID:                    profile.ProfileId,
		ProfileName:                  profile.ProfileName,
		UserDataDir:                  profile.UserDataDir,
		CoreID:                       profile.CoreId,
		FingerprintArgs:              append([]string{}, profile.FingerprintArgs...),
		ProxyID:                      profile.ProxyId,
		ProxyConfig:                  profile.ProxyConfig,
		ProxyBindSourceID:            profile.ProxyBindSourceID,
		ProxyBindSourceURL:           profile.ProxyBindSourceURL,
		ProxyBindName:                profile.ProxyBindName,
		ProxyBindUpdatedAt:           profile.ProxyBindUpdatedAt,
		AutoProxySwitchEnabled:       profile.AutoProxySwitchEnabled,
		AutoProxySwitchGroupName:     profile.AutoProxySwitchGroupName,
		AutoProxySwitchMode:          profile.AutoProxySwitchMode,
		AutoProxySwitchIntervalM:     int32(profile.AutoProxySwitchIntervalM),
		AutoProxySwitchRotateByGroup: profile.AutoProxySwitchRotateByGroup,
		AutoProxySwitchLastProxyID:   profile.AutoProxySwitchLastProxyId,
		LaunchArgs:                   append([]string{}, profile.LaunchArgs...),
		Tags:                         append([]string{}, profile.Tags...),
		Keywords:                     append([]string{}, profile.Keywords...),
		GroupID:                      profile.GroupId,
		LaunchCode:                   profile.LaunchCode,
		Running:                      profile.Running,
		DebugPort:                    int32(profile.DebugPort),
		DebugReady:                   profile.DebugReady,
		PID:                          int32(profile.Pid),
		RuntimeWarning:               profile.RuntimeWarning,
		LastError:                    profile.LastError,
		CreatedAt:                    profile.CreatedAt,
		UpdatedAt:                    profile.UpdatedAt,
		LastStartAt:                  profile.LastStartAt,
		LastStopAt:                   profile.LastStopAt,
	}
	if identity.Index > 0 {
		result.InstanceMarkerIndex = int32(identity.Index)
		result.InstanceMarker = identity.Marker
	}
	return result
}
