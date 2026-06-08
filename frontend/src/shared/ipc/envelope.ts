import {
  WireType,
  concatBytes,
  decodeString,
  decodeVarintField,
  encodeBytesField,
  encodeInt32Field,
  encodeInt64Field,
  encodeStringField,
  readFields,
} from './protobuf'

export const PROTO_SCHEMA_VERSION = 1
export const METHOD_DEV_PING = 'trace.dev.Ping'
export const METHOD_BROWSER_PROFILE_LIST = 'trace.browser.ProfileList'
export const METHOD_BROWSER_PROFILE_CREATE = 'trace.browser.ProfileCreate'
export const METHOD_BROWSER_PROFILE_UPDATE = 'trace.browser.ProfileUpdate'
export const METHOD_BROWSER_PROFILE_DELETE = 'trace.browser.ProfileDelete'
export const METHOD_BROWSER_PROFILE_COPY = 'trace.browser.ProfileCopy'
export const METHOD_BROWSER_PROFILE_BACKUP_EXPORT = 'trace.browser.ProfileBackupExport'
export const METHOD_BROWSER_PROFILE_BACKUP_CHOOSE_IMPORT = 'trace.browser.ProfileBackupChooseImport'
export const METHOD_BROWSER_PROFILE_BACKUP_IMPORT = 'trace.browser.ProfileBackupImport'
export const METHOD_BROWSER_INSTANCE_START = 'trace.browser.InstanceStart'
export const METHOD_BROWSER_INSTANCE_STOP = 'trace.browser.InstanceStop'
export const METHOD_BROWSER_INSTANCE_RESTART = 'trace.browser.InstanceRestart'
export const METHOD_BROWSER_INSTANCE_START_BY_CODE = 'trace.browser.InstanceStartByCode'
export const METHOD_BROWSER_TAG_LIST = 'trace.browser.TagList'
export const METHOD_BROWSER_PROFILE_SET_KEYWORDS = 'trace.browser.ProfileSetKeywords'
export const METHOD_BROWSER_PROFILE_BATCH_SET_TAGS = 'trace.browser.ProfileBatchSetTags'
export const METHOD_BROWSER_PROFILE_BATCH_REMOVE_TAGS = 'trace.browser.ProfileBatchRemoveTags'
export const METHOD_BROWSER_TAG_RENAME = 'trace.browser.TagRename'
export const METHOD_BROWSER_GROUP_LIST = 'trace.browser.GroupList'
export const METHOD_BROWSER_GROUP_CREATE = 'trace.browser.GroupCreate'
export const METHOD_BROWSER_GROUP_UPDATE = 'trace.browser.GroupUpdate'
export const METHOD_BROWSER_GROUP_DELETE = 'trace.browser.GroupDelete'
export const METHOD_BROWSER_GROUP_MOVE_PROFILES = 'trace.browser.GroupMoveProfiles'
export const METHOD_BROWSER_INSTANCE_PIN_CENTER = 'trace.browser.InstancePinCenter'
export const METHOD_BROWSER_PROFILE_SWITCH_PROXY_NOW = 'trace.browser.ProfileSwitchProxyNow'
export const METHOD_BROWSER_INSTANCE_OPEN_URL = 'trace.browser.InstanceOpenURL'
export const METHOD_BROWSER_INSTANCE_TAB_LIST = 'trace.browser.InstanceTabList'
export const METHOD_BROWSER_PROFILE_CODE_GET = 'trace.browser.ProfileCodeGet'
export const METHOD_BROWSER_PROFILE_CODE_REGENERATE = 'trace.browser.ProfileCodeRegenerate'
export const METHOD_BROWSER_PROFILE_CODE_SET = 'trace.browser.ProfileCodeSet'
export const METHOD_BROWSER_LAUNCH_SERVER_INFO = 'trace.browser.LaunchServerInfo'
export const METHOD_BROWSER_SETTINGS_GET = 'trace.browser.SettingsGet'
export const METHOD_BROWSER_SETTINGS_SAVE = 'trace.browser.SettingsSave'
export const METHOD_BROWSER_BOOKMARK_LIST = 'trace.browser.BookmarkList'
export const METHOD_BROWSER_BOOKMARK_SAVE = 'trace.browser.BookmarkSave'
export const METHOD_BROWSER_BOOKMARK_RESET = 'trace.browser.BookmarkReset'
export const METHOD_BROWSER_DEFAULT_START_URL_LIST = 'trace.browser.DefaultStartURLList'
export const METHOD_BROWSER_DEFAULT_START_URL_SAVE = 'trace.browser.DefaultStartURLSave'
export const METHOD_BROWSER_DEFAULT_START_URL_RESET = 'trace.browser.DefaultStartURLReset'
export const METHOD_BROWSER_DEFAULT_CONTENT_RULE_LIST = 'trace.browser.DefaultContentRuleList'
export const METHOD_BROWSER_DEFAULT_CONTENT_RULE_SAVE = 'trace.browser.DefaultContentRuleSave'
export const METHOD_BROWSER_SNAPSHOT_LIST = 'trace.browser.SnapshotList'
export const METHOD_BROWSER_SNAPSHOT_CREATE = 'trace.browser.SnapshotCreate'
export const METHOD_BROWSER_SNAPSHOT_RESTORE = 'trace.browser.SnapshotRestore'
export const METHOD_BROWSER_SNAPSHOT_DELETE = 'trace.browser.SnapshotDelete'
export const METHOD_BROWSER_COOKIE_LIST = 'trace.browser.CookieList'
export const METHOD_BROWSER_COOKIE_CLEAR = 'trace.browser.CookieClear'
export const METHOD_BROWSER_COOKIE_EXPORT = 'trace.browser.CookieExport'
export const METHOD_BROWSER_COOKIE_IMPORT = 'trace.browser.CookieImport'
export const METHOD_BROWSER_USER_DATA_DIR_OPEN = 'trace.browser.UserDataDirOpen'
export const METHOD_BROWSER_PROFILE_USER_DATA_DIR_OPEN = 'trace.browser.ProfileUserDataDirOpen'
export const METHOD_BROWSER_EXTENSION_LIST = 'trace.browser.ExtensionList'
export const METHOD_BROWSER_EXTENSION_GET = 'trace.browser.ExtensionGet'
export const METHOD_BROWSER_EXTENSION_DELETE = 'trace.browser.ExtensionDelete'
export const METHOD_BROWSER_EXTENSION_CHOOSE_ARCHIVE = 'trace.browser.ExtensionChooseArchive'
export const METHOD_BROWSER_EXTENSION_CHOOSE_DIRECTORY = 'trace.browser.ExtensionChooseDirectory'
export const METHOD_BROWSER_EXTENSION_IMPORT_ARCHIVE = 'trace.browser.ExtensionImportArchive'
export const METHOD_BROWSER_EXTENSION_IMPORT_DIRECTORY = 'trace.browser.ExtensionImportDirectory'
export const METHOD_BROWSER_EXTENSION_LIST_PROFILE_BINDINGS = 'trace.browser.ExtensionListProfileBindings'
export const METHOD_BROWSER_EXTENSION_LIST_FOR_PROFILE = 'trace.browser.ExtensionListForProfile'
export const METHOD_BROWSER_EXTENSION_ASSIGN_PROFILES = 'trace.browser.ExtensionAssignProfiles'
export const METHOD_BROWSER_EXTENSION_SET_AUTO_BIND = 'trace.browser.ExtensionSetAutoBind'
export const METHOD_BROWSER_EXTENSION_UNASSIGN_PROFILES = 'trace.browser.ExtensionUnassignProfiles'
export const METHOD_BROWSER_EXTENSION_SYNC_DATA = 'trace.browser.ExtensionSyncData'
export const METHOD_WINDOW_SYNC_CANDIDATE_LIST = 'trace.windowSync.CandidateList'
export const METHOD_WINDOW_SYNC_START = 'trace.windowSync.Start'
export const METHOD_WINDOW_SYNC_STATE_GET = 'trace.windowSync.StateGet'
export const METHOD_WINDOW_SYNC_STOP = 'trace.windowSync.Stop'
export const METHOD_WINDOW_SYNC_PAUSE = 'trace.windowSync.Pause'
export const METHOD_WINDOW_SYNC_RESUME = 'trace.windowSync.Resume'
export const METHOD_WINDOW_SYNC_SHOW_ALL = 'trace.windowSync.ShowAll'
export const METHOD_WINDOW_SYNC_SETTINGS_GET = 'trace.windowSync.SettingsGet'
export const METHOD_WINDOW_SYNC_SETTINGS_SAVE = 'trace.windowSync.SettingsSave'
export const METHOD_WINDOW_SYNC_LAYOUT_SETTINGS_GET = 'trace.windowSync.LayoutSettingsGet'
export const METHOD_WINDOW_SYNC_LAYOUT_SETTINGS_SAVE = 'trace.windowSync.LayoutSettingsSave'
export const METHOD_WINDOW_SYNC_LAYOUT_APPLY = 'trace.windowSync.LayoutApply'
export const METHOD_WINDOW_SYNC_BATCH_INPUT_SAME = 'trace.windowSync.BatchInputSame'
export const METHOD_WINDOW_SYNC_BATCH_INPUT_DIFFERENT = 'trace.windowSync.BatchInputDifferent'
export const METHOD_WINDOW_SYNC_CLOSE_OTHER_TABS = 'trace.windowSync.CloseOtherTabs'
export const METHOD_WINDOW_SYNC_CLOSE_CURRENT_TAB = 'trace.windowSync.CloseCurrentTab'
export const METHOD_WINDOW_SYNC_CLOSE_BLANK_TABS = 'trace.windowSync.CloseBlankTabs'
export const METHOD_WINDOW_SYNC_OPEN_URLS = 'trace.windowSync.OpenUrls'
export const METHOD_WINDOW_SYNC_TOOLBAR_RESIZE = 'trace.windowSync.ToolbarResize'
export const METHOD_BROWSER_PROXY_LIST = 'trace.browser.ProxyList'
export const METHOD_BROWSER_PROXY_GROUP_LIST = 'trace.browser.ProxyGroupList'
export const METHOD_BROWSER_PROXY_SAVE = 'trace.browser.ProxySave'
export const METHOD_BROWSER_PROXY_FETCH_CLASH_BY_URL = 'trace.browser.ProxyFetchClashByURL'
export const METHOD_BROWSER_PROXY_VALIDATE_CONFIG = 'trace.browser.ProxyValidateConfig'
export const METHOD_BROWSER_PROXY_TEST_CONNECTIVITY = 'trace.browser.ProxyTestConnectivity'
export const METHOD_BROWSER_PROXY_TEST_REAL_CONNECTIVITY = 'trace.browser.ProxyTestRealConnectivity'
export const METHOD_BROWSER_PROXY_TEST_SPEED = 'trace.browser.ProxyTestSpeed'
export const METHOD_BROWSER_PROXY_BATCH_TEST_SPEED = 'trace.browser.ProxyBatchTestSpeed'
export const METHOD_BROWSER_PROXY_PREVIEW_BATCH_TEST_SPEED = 'trace.browser.ProxyPreviewBatchTestSpeed'
export const METHOD_BROWSER_PROXY_CHECK_IP_HEALTH = 'trace.browser.ProxyCheckIPHealth'
export const METHOD_BROWSER_PROXY_BATCH_CHECK_IP_HEALTH = 'trace.browser.ProxyBatchCheckIPHealth'
export const METHOD_BROWSER_PROXY_PREVIEW_BATCH_CHECK_IP_HEALTH = 'trace.browser.ProxyPreviewBatchCheckIPHealth'
export const METHOD_BROWSER_CORE_LIST = 'trace.browser.CoreList'
export const METHOD_BROWSER_CORE_SAVE = 'trace.browser.CoreSave'
export const METHOD_BROWSER_CORE_DELETE = 'trace.browser.CoreDelete'
export const METHOD_BROWSER_CORE_SET_DEFAULT = 'trace.browser.CoreSetDefault'
export const METHOD_BROWSER_CORE_VALIDATE = 'trace.browser.CoreValidate'
export const METHOD_BROWSER_CORE_RENAME_PATH = 'trace.browser.CoreRenamePath'
export const METHOD_BROWSER_CORE_EXTENDED_INFO = 'trace.browser.CoreExtendedInfo'
export const METHOD_BROWSER_CORE_SCAN = 'trace.browser.CoreScan'
export const METHOD_BROWSER_CORE_DOWNLOAD = 'trace.browser.CoreDownload'
export const METHOD_BROWSER_CORE_CANCEL_DOWNLOAD = 'trace.browser.CoreCancelDownload'
export const METHOD_BROWSER_CORE_OPEN_PATH = 'trace.browser.CoreOpenPath'
export const METHOD_APP_CONFIG_GET = 'trace.app.ConfigGet'
export const METHOD_APP_PATH_OPEN = 'trace.app.PathOpen'
export const METHOD_APP_RELEASE_PAGE_OPEN = 'trace.app.ReleasePageOpen'
export const METHOD_APP_DASHBOARD_STATS_GET = 'trace.app.DashboardStatsGet'
export const METHOD_APP_PERFORMANCE_SNAPSHOT_GET = 'trace.app.PerformanceSnapshotGet'
export const METHOD_APP_DATA_VERSIONS_GET = 'trace.app.DataVersionsGet'
export const METHOD_APP_LICENSE_STATUS_GET = 'trace.app.LicenseStatusGet'
export const METHOD_APP_CDKEY_REDEEM = 'trace.app.CDKeyRedeem'
export const METHOD_APP_GITHUB_STAR_REDEEM = 'trace.app.GithubStarRedeem'
export const METHOD_APP_CONFIG_RELOAD = 'trace.app.ConfigReload'
export const METHOD_APP_CDKEYS_GENERATE = 'trace.app.CDKeysGenerate'
export const METHOD_APP_REMOTE_AUTHOR_PROFILE_FETCH = 'trace.app.RemoteAuthorProfileFetch'
export const METHOD_APP_LOG_LIST = 'trace.app.LogList'
export const METHOD_APP_LOG_CLEAR = 'trace.app.LogClear'
export const METHOD_APP_FORCE_QUIT = 'trace.app.ForceQuit'
export const METHOD_APP_QUIT_ONLY = 'trace.app.QuitOnly'
export const METHOD_APP_WINDOW_STATE_SAVE = 'trace.app.WindowStateSave'
export const METHOD_APP_ENVIRONMENT_GET = 'trace.app.EnvironmentGet'
export const METHOD_APP_WINDOW_SIZE_GET = 'trace.app.WindowSizeGet'
export const METHOD_APP_WINDOW_STATE_GET = 'trace.app.WindowStateGet'
export const METHOD_APP_WINDOW_HIDE = 'trace.app.WindowHide'
export const METHOD_APP_WINDOW_MINIMISE = 'trace.app.WindowMinimise'
export const METHOD_BACKUP_INITIALIZE = 'trace.backup.Initialize'
export const METHOD_BACKUP_EXPORT = 'trace.backup.Export'
export const METHOD_BACKUP_IMPORT = 'trace.backup.Import'
export const METHOD_APP_UPDATE_CHECK = 'trace.app.UpdateCheck'
export const METHOD_APP_UPDATE_DOWNLOAD = 'trace.app.UpdateDownload'
export const METHOD_APP_UPDATE_INSTALL_DOWNLOADED = 'trace.app.UpdateInstallDownloaded'
export const METHOD_APP_UPDATE_DOWNLOAD_PORTABLE = 'trace.app.UpdateDownloadPortable'

export type RpcEnvelope = {
  requestId: string
  method: string
  payload: Uint8Array
  schemaVersion: number
  timestampMs: number
}

export type RpcError = {
  code: string
  message: string
  details: string
}

export type RpcResponse = {
  requestId: string
  payload: Uint8Array
  error: RpcError | null
}

export type RpcEvent = {
  eventId: string
  eventName: string
  payload: Uint8Array
  timestampMs: number
}

export type PingRequest = {
  message: string
  sentAtUnixMs: number
}

export type PingResponse = {
  message: string
  serverTimeUnixMs: number
  payloadSize: number
}

export function encodeRpcEnvelope(message: RpcEnvelope): Uint8Array {
  return concatBytes([
    encodeStringField(1, message.requestId),
    encodeStringField(2, message.method),
    encodeBytesField(3, message.payload),
    encodeInt32Field(4, message.schemaVersion),
    encodeInt64Field(5, message.timestampMs),
  ])
}

export function decodeRpcResponse(bytes: Uint8Array): RpcResponse {
  const response: RpcResponse = {
    requestId: '',
    payload: new Uint8Array(),
    error: null,
  }

  for (const field of readFields(bytes)) {
    if (field.fieldNumber === 1 && field.wireType === WireType.LengthDelimited) {
      response.requestId = decodeString(field.value)
    } else if (field.fieldNumber === 2 && field.wireType === WireType.LengthDelimited) {
      response.payload = field.value
    } else if (field.fieldNumber === 3 && field.wireType === WireType.LengthDelimited) {
      response.error = decodeRpcError(field.value)
    }
  }

  return response
}

export function decodeRpcEvent(bytes: Uint8Array): RpcEvent {
  const event: RpcEvent = {
    eventId: '',
    eventName: '',
    payload: new Uint8Array(),
    timestampMs: 0,
  }

  for (const field of readFields(bytes)) {
    if (field.fieldNumber === 1 && field.wireType === WireType.LengthDelimited) {
      event.eventId = decodeString(field.value)
    } else if (field.fieldNumber === 2 && field.wireType === WireType.LengthDelimited) {
      event.eventName = decodeString(field.value)
    } else if (field.fieldNumber === 3 && field.wireType === WireType.LengthDelimited) {
      event.payload = field.value
    } else if (field.fieldNumber === 4 && field.wireType === WireType.Varint) {
      event.timestampMs = Number(decodeVarintField(field.value))
    }
  }

  return event
}

export function encodePingRequest(message: PingRequest): Uint8Array {
  return concatBytes([
    encodeStringField(1, message.message),
    encodeInt64Field(2, message.sentAtUnixMs),
  ])
}

export function decodePingResponse(bytes: Uint8Array): PingResponse {
  const response: PingResponse = {
    message: '',
    serverTimeUnixMs: 0,
    payloadSize: 0,
  }

  for (const field of readFields(bytes)) {
    if (field.fieldNumber === 1 && field.wireType === WireType.LengthDelimited) {
      response.message = decodeString(field.value)
    } else if (field.fieldNumber === 2 && field.wireType === WireType.Varint) {
      response.serverTimeUnixMs = Number(decodeVarintField(field.value))
    } else if (field.fieldNumber === 3 && field.wireType === WireType.Varint) {
      response.payloadSize = Number(decodeVarintField(field.value))
    }
  }

  return response
}

function decodeRpcError(bytes: Uint8Array): RpcError {
  const error: RpcError = {
    code: '',
    message: '',
    details: '',
  }

  for (const field of readFields(bytes)) {
    if (field.fieldNumber === 1 && field.wireType === WireType.LengthDelimited) {
      error.code = decodeString(field.value)
    } else if (field.fieldNumber === 2 && field.wireType === WireType.LengthDelimited) {
      error.message = decodeString(field.value)
    } else if (field.fieldNumber === 3 && field.wireType === WireType.LengthDelimited) {
      error.details = decodeString(field.value)
    }
  }

  return error
}
