import {
  METHOD_APP_CDKEYS_GENERATE,
  METHOD_APP_CDKEY_REDEEM,
  METHOD_APP_CONFIG_GET,
  METHOD_APP_CONFIG_RELOAD,
  METHOD_APP_DASHBOARD_STATS_GET,
  METHOD_APP_DATA_VERSIONS_GET,
  METHOD_APP_ENVIRONMENT_GET,
  METHOD_APP_FORCE_QUIT,
  METHOD_APP_GITHUB_STAR_REDEEM,
  METHOD_APP_LICENSE_STATUS_GET,
  METHOD_APP_LOG_CLEAR,
  METHOD_APP_LOG_LIST,
  METHOD_APP_PATH_OPEN,
  METHOD_APP_PERFORMANCE_SNAPSHOT_GET,
  METHOD_APP_PROFILE_TRANSFER_LINK_CONSUME,
  METHOD_APP_QUIT_ONLY,
  METHOD_APP_REMOTE_AUTHOR_PROFILE_FETCH,
  METHOD_APP_RELEASE_PAGE_OPEN,
  METHOD_APP_WINDOW_HIDE,
  METHOD_APP_WINDOW_MINIMISE,
  METHOD_APP_WINDOW_SIZE_GET,
  METHOD_APP_WINDOW_STATE_SAVE,
  METHOD_APP_WINDOW_STATE_GET,
  METHOD_BACKUP_EXPORT,
  METHOD_BACKUP_IMPORT,
  METHOD_BACKUP_INITIALIZE,
} from './envelope'
import {
  WireType,
  concatBytes,
  decodeString,
  decodeVarintField,
  encodeBoolField,
  encodeStringField,
  encodeInt32Field,
  readFields,
} from './protobuf'
import { ProtoIpcClient } from './transport'
import { decodeBrowserActionResponse } from './browser'
import { decodeProtoJSONObject, isProtoJSONObject, type ProtoJSONObject } from './json'

const appProtoClient = new ProtoIpcClient()

export type ProtoAppConfigInfo = {
  name: string
  version: string
  projectGithubUrl: string
}

export type ProtoAppDashboardStats = {
  totalInstances: number
  runningInstances: number
  proxyCount: number
  coreCount: number
  memUsedMB: number
  appVersion: string
}

export type ProtoAppPerformanceSnapshot = {
  timestampMs: number
  appVersion: string
  platform: string
  arch: string
  memAllocMB: number
  memSysMB: number
  memHeapInuseMB: number
  memNumGC: number
  goroutines: number
  totalInstances: number
  runningInstances: number
  browserProcesses: number
  proxyBridgeRefs: number
  xrayBridgeRefs: number
  clashBridgeRefs: number
  switchBridgeRefs: number
  authProxyBridgeRefs: number
  windowSyncActive: boolean
  windowSyncWindows: number
  windowSyncControllable: number
  windowSyncEventsTotal: number
  windowSyncDispatchTotal: number
}

export type ProtoAppDataVersions = {
  timestampMs: number
  profilesVersion: number
  groupsVersion: number
  proxiesVersion: number
  coresVersion: number
  extensionsVersion: number
  defaultsVersion: number
  settingsVersion: number
  cookiesVersion: number
  snapshotsVersion: number
  logsVersion: number
}

export type ProtoAppLicenseStatus = {
  maxLimit: number
  usedCount: number
  usedKeys: string[]
}

export type ProtoAppLogEntry = {
  time: string
  level: string
  component: string
  message: string
  fields?: ProtoJSONObject
}

export type ProtoAppRuntimeEventPayload = {
  profileId?: string
  profileName?: string
  error?: string
  key?: string
  engine?: string
  debugPort?: number
  pid?: number
  reused?: boolean
  running?: boolean
  debugReady?: boolean
  runtimeWarning?: string
  domain?: string
  reason?: string
  version?: number
  profilesVersion?: number
  groupsVersion?: number
  proxiesVersion?: number
  coresVersion?: number
  extensionsVersion?: number
  defaultsVersion?: number
  settingsVersion?: number
  cookiesVersion?: number
  snapshotsVersion?: number
  logsVersion?: number
  changedIds?: string[]
  url?: string
  action?: string
  serverUrl?: string
  code?: string
  source?: string
}

export type ProtoAppWindowSize = {
  width: number
  height: number
}

export type ProtoAppWindowState = {
  normal: boolean
  maximised: boolean
  minimised: boolean
}

export type ProtoAppEnvironmentInfo = {
  buildType: string
  platform: string
  arch: string
}

export type ProtoAppFileDropPayload = {
  x: number
  y: number
  paths: string[]
}

export type ProtoBackupFailedComponent = {
  componentId?: string
  componentName?: string
  error?: string
}

export type ProtoBackupActionResult = {
  cancelled?: boolean
  message?: string
  zipPath?: string
  resetFirst?: boolean
  imported?: number
  skipped?: number
  conflicts?: number
  partial?: boolean
  componentTotal?: number
  componentSuccess?: number
  componentFailed?: number
  failedComponents?: ProtoBackupFailedComponent[]
  includedEntries?: number
  skippedEntries?: number
  fileCount?: number
}

export type ProtoBackupProgress = {
  phase: string
  progress: number
  message: string
  componentId?: string
  componentName?: string
  entryIndex?: number
  entryTotal?: number
  timestamp?: string
}

export async function getAppConfig(): Promise<ProtoAppConfigInfo> {
  const payload = await appProtoClient.request(METHOD_APP_CONFIG_GET, new Uint8Array())
  return decodeAppConfigInfo(payload)
}

export async function openPath(path: string): Promise<boolean> {
  const payload = await appProtoClient.request(METHOD_APP_PATH_OPEN, encodeAppPathRequest({ path }))
  return decodeBrowserActionResponse(payload).ok
}

export async function openAppReleasePage(url = ''): Promise<boolean> {
  const payload = await appProtoClient.request(METHOD_APP_RELEASE_PAGE_OPEN, encodeAppReleasePageRequest({ url }))
  return decodeBrowserActionResponse(payload).ok
}

export async function getDashboardStats(): Promise<ProtoAppDashboardStats> {
  const payload = await appProtoClient.request(METHOD_APP_DASHBOARD_STATS_GET, new Uint8Array())
  return decodeAppDashboardStats(payload)
}

export async function getPerformanceSnapshot(): Promise<ProtoAppPerformanceSnapshot> {
  const payload = await appProtoClient.request(METHOD_APP_PERFORMANCE_SNAPSHOT_GET, new Uint8Array())
  return decodeAppPerformanceSnapshot(payload)
}

export async function getDataVersions(): Promise<ProtoAppDataVersions> {
  const payload = await appProtoClient.request(METHOD_APP_DATA_VERSIONS_GET, new Uint8Array())
  return decodeAppDataVersions(payload)
}

export async function getLicenseStatus(): Promise<ProtoAppLicenseStatus> {
  const payload = await appProtoClient.request(METHOD_APP_LICENSE_STATUS_GET, new Uint8Array())
  return decodeAppLicenseStatus(payload)
}

export async function redeemCDKey(cdkey: string): Promise<boolean> {
  const payload = await appProtoClient.request(METHOD_APP_CDKEY_REDEEM, encodeAppCDKeyRedeemRequest({ cdkey }))
  return decodeBrowserActionResponse(payload).ok
}

export async function redeemGithubStar(): Promise<boolean> {
  const payload = await appProtoClient.request(METHOD_APP_GITHUB_STAR_REDEEM, new Uint8Array())
  return decodeBrowserActionResponse(payload).ok
}

export async function reloadAppConfig(): Promise<boolean> {
  const payload = await appProtoClient.request(METHOD_APP_CONFIG_RELOAD, new Uint8Array())
  return decodeBrowserActionResponse(payload).ok
}

export async function generateCDKeys(count: number): Promise<string[]> {
  const payload = await appProtoClient.request(METHOD_APP_CDKEYS_GENERATE, encodeAppCDKeysGenerateRequest({ count }))
  return decodeAppCDKeysGenerateResponse(payload)
}

export async function fetchRemoteAuthorProfile(url: string, timeoutMs: number): Promise<ProtoJSONObject> {
  const requestTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(15000, timeoutMs + 3000) : 15000
  const payload = await appProtoClient.request(
    METHOD_APP_REMOTE_AUTHOR_PROFILE_FETCH,
    encodeAppRemoteAuthorProfileRequest({ url, timeoutMs }),
    requestTimeoutMs,
  )
  return decodeAppRemoteAuthorProfileResponse(payload)
}

export async function listAppLogs(): Promise<ProtoAppLogEntry[]> {
  const payload = await appProtoClient.request(METHOD_APP_LOG_LIST, new Uint8Array())
  return decodeAppLogListResponse(payload)
}

export async function clearAppLogs(): Promise<boolean> {
  const payload = await appProtoClient.request(METHOD_APP_LOG_CLEAR, new Uint8Array())
  return decodeBrowserActionResponse(payload).ok
}

export async function forceQuitApp(): Promise<boolean> {
  const payload = await appProtoClient.request(METHOD_APP_FORCE_QUIT, new Uint8Array())
  return decodeBrowserActionResponse(payload).ok
}

export async function quitAppOnly(): Promise<boolean> {
  const payload = await appProtoClient.request(METHOD_APP_QUIT_ONLY, new Uint8Array())
  return decodeBrowserActionResponse(payload).ok
}

export async function saveWindowState(width: number, height: number): Promise<boolean> {
  const payload = await appProtoClient.request(METHOD_APP_WINDOW_STATE_SAVE, encodeAppWindowStateSaveRequest({ width, height }))
  return decodeBrowserActionResponse(payload).ok
}

export async function getRuntimeEnvironment(): Promise<ProtoAppEnvironmentInfo> {
  const payload = await appProtoClient.request(METHOD_APP_ENVIRONMENT_GET, new Uint8Array())
  return decodeAppEnvironmentInfo(payload)
}

export async function getWindowSize(): Promise<ProtoAppWindowSize> {
  const payload = await appProtoClient.request(METHOD_APP_WINDOW_SIZE_GET, new Uint8Array())
  return decodeAppWindowSize(payload)
}

export async function getWindowState(): Promise<ProtoAppWindowState> {
  const payload = await appProtoClient.request(METHOD_APP_WINDOW_STATE_GET, new Uint8Array())
  return decodeAppWindowState(payload)
}

export async function hideWindow(): Promise<boolean> {
  const payload = await appProtoClient.request(METHOD_APP_WINDOW_HIDE, new Uint8Array())
  return decodeBrowserActionResponse(payload).ok
}

export async function minimiseWindow(): Promise<boolean> {
  const payload = await appProtoClient.request(METHOD_APP_WINDOW_MINIMISE, new Uint8Array())
  return decodeBrowserActionResponse(payload).ok
}

export function onAppRuntimeEvent(eventName: string, callback: (payload: ProtoAppRuntimeEventPayload) => void): () => void {
  return appProtoClient.onEvent(eventName, event => callback(decodeAppRuntimeEventPayload(event.payload)))
}

export async function consumePendingProfileTransferDeepLink(): Promise<ProtoAppRuntimeEventPayload> {
  const payload = await appProtoClient.request(METHOD_APP_PROFILE_TRANSFER_LINK_CONSUME, new Uint8Array())
  return decodeAppRuntimeEventPayload(payload)
}

export function onAppFileDrop(callback: (payload: ProtoAppFileDropPayload) => void): () => void {
  return appProtoClient.onEvent('app:file-drop', event => callback(decodeAppFileDropPayload(event.payload)))
}

export async function initializeSystemData(): Promise<ProtoBackupActionResult> {
  const payload = await appProtoClient.request(METHOD_BACKUP_INITIALIZE, new Uint8Array(), 120000)
  return decodeBackupActionResult(payload)
}

export async function exportSystemConfig(): Promise<ProtoBackupActionResult> {
  const payload = await appProtoClient.request(METHOD_BACKUP_EXPORT, new Uint8Array(), 300000)
  return decodeBackupActionResult(payload)
}

export async function importSystemConfig(resetFirst: boolean): Promise<ProtoBackupActionResult> {
  const payload = await appProtoClient.request(METHOD_BACKUP_IMPORT, encodeBackupImportRequest({ resetFirst }), 300000)
  return decodeBackupActionResult(payload)
}

export function onBackupExportProgress(callback: (progress: ProtoBackupProgress) => void): () => void {
  return appProtoClient.onEvent('backup:export:progress', event => callback(decodeBackupProgress(event.payload)))
}

export function onBackupImportProgress(callback: (progress: ProtoBackupProgress) => void): () => void {
  return appProtoClient.onEvent('backup:import:progress', event => callback(decodeBackupProgress(event.payload)))
}

export function encodeAppPathRequest(message: { path: string }): Uint8Array {
  return concatBytes([encodeStringField(1, message.path)])
}

export function encodeAppReleasePageRequest(message: { url: string }): Uint8Array {
  return concatBytes([encodeStringField(1, message.url)])
}

export function encodeAppCDKeyRedeemRequest(message: { cdkey: string }): Uint8Array {
  return concatBytes([encodeStringField(1, message.cdkey)])
}

export function encodeAppCDKeysGenerateRequest(message: { count: number }): Uint8Array {
  return concatBytes([encodeInt32Field(1, message.count)])
}

export function encodeAppRemoteAuthorProfileRequest(message: { url: string; timeoutMs: number }): Uint8Array {
  return concatBytes([
    encodeStringField(1, message.url),
    encodeInt32Field(2, message.timeoutMs),
  ])
}

export function encodeAppWindowStateSaveRequest(message: { width: number; height: number }): Uint8Array {
  return concatBytes([
    encodeInt32Field(1, message.width),
    encodeInt32Field(2, message.height),
  ])
}

export function encodeBackupImportRequest(message: { resetFirst: boolean }): Uint8Array {
  return concatBytes([encodeBoolField(1, message.resetFirst)])
}

export function decodeAppConfigInfo(payload: Uint8Array): ProtoAppConfigInfo {
  const config: ProtoAppConfigInfo = {
    name: '',
    version: '',
    projectGithubUrl: '',
  }
  for (const field of readFields(payload)) {
    if (field.wireType !== WireType.LengthDelimited) {
      continue
    }
    const text = decodeString(field.value)
    if (field.fieldNumber === 1) {
      config.name = text
    } else if (field.fieldNumber === 2) {
      config.version = text
    } else if (field.fieldNumber === 3) {
      config.projectGithubUrl = text
    }
  }
  return config
}

export function decodeAppDashboardStats(payload: Uint8Array): ProtoAppDashboardStats {
  const stats: ProtoAppDashboardStats = {
    totalInstances: 0,
    runningInstances: 0,
    proxyCount: 0,
    coreCount: 0,
    memUsedMB: 0,
    appVersion: 'dev',
  }
  for (const field of readFields(payload)) {
    if (field.wireType === WireType.LengthDelimited && field.fieldNumber === 6) {
      stats.appVersion = decodeString(field.value)
      continue
    }
    if (field.wireType !== WireType.Varint) {
      continue
    }
    const number = Number(decodeVarintField(field.value))
    switch (field.fieldNumber) {
      case 1:
        stats.totalInstances = number
        break
      case 2:
        stats.runningInstances = number
        break
      case 3:
        stats.proxyCount = number
        break
      case 4:
        stats.coreCount = number
        break
      case 5:
        stats.memUsedMB = number
        break
    }
  }
  return stats
}

export function decodeAppPerformanceSnapshot(payload: Uint8Array): ProtoAppPerformanceSnapshot {
  const snapshot: ProtoAppPerformanceSnapshot = {
    timestampMs: 0,
    appVersion: '',
    platform: '',
    arch: '',
    memAllocMB: 0,
    memSysMB: 0,
    memHeapInuseMB: 0,
    memNumGC: 0,
    goroutines: 0,
    totalInstances: 0,
    runningInstances: 0,
    browserProcesses: 0,
    proxyBridgeRefs: 0,
    xrayBridgeRefs: 0,
    clashBridgeRefs: 0,
    switchBridgeRefs: 0,
    authProxyBridgeRefs: 0,
    windowSyncActive: false,
    windowSyncWindows: 0,
    windowSyncControllable: 0,
    windowSyncEventsTotal: 0,
    windowSyncDispatchTotal: 0,
  }
  for (const field of readFields(payload)) {
    if (field.wireType === WireType.LengthDelimited) {
      const text = decodeString(field.value)
      if (field.fieldNumber === 2) {
        snapshot.appVersion = text
      } else if (field.fieldNumber === 3) {
        snapshot.platform = text
      } else if (field.fieldNumber === 4) {
        snapshot.arch = text
      }
      continue
    }
    if (field.wireType !== WireType.Varint) {
      continue
    }
    const number = Number(decodeVarintField(field.value))
    switch (field.fieldNumber) {
      case 1:
        snapshot.timestampMs = number
        break
      case 5:
        snapshot.memAllocMB = number
        break
      case 6:
        snapshot.memSysMB = number
        break
      case 7:
        snapshot.memHeapInuseMB = number
        break
      case 8:
        snapshot.memNumGC = number
        break
      case 9:
        snapshot.goroutines = number
        break
      case 10:
        snapshot.totalInstances = number
        break
      case 11:
        snapshot.runningInstances = number
        break
      case 12:
        snapshot.browserProcesses = number
        break
      case 13:
        snapshot.proxyBridgeRefs = number
        break
      case 14:
        snapshot.xrayBridgeRefs = number
        break
      case 15:
        snapshot.clashBridgeRefs = number
        break
      case 16:
        snapshot.switchBridgeRefs = number
        break
      case 17:
        snapshot.authProxyBridgeRefs = number
        break
      case 18:
        snapshot.windowSyncActive = number !== 0
        break
      case 19:
        snapshot.windowSyncWindows = number
        break
      case 20:
        snapshot.windowSyncControllable = number
        break
      case 21:
        snapshot.windowSyncEventsTotal = number
        break
      case 22:
        snapshot.windowSyncDispatchTotal = number
        break
    }
  }
  return snapshot
}

export function decodeAppDataVersions(payload: Uint8Array): ProtoAppDataVersions {
  const versions: ProtoAppDataVersions = {
    timestampMs: 0,
    profilesVersion: 0,
    groupsVersion: 0,
    proxiesVersion: 0,
    coresVersion: 0,
    extensionsVersion: 0,
    defaultsVersion: 0,
    settingsVersion: 0,
    cookiesVersion: 0,
    snapshotsVersion: 0,
    logsVersion: 0,
  }
  for (const field of readFields(payload)) {
    if (field.wireType !== WireType.Varint) {
      continue
    }
    const number = Number(decodeVarintField(field.value))
    switch (field.fieldNumber) {
      case 1:
        versions.timestampMs = number
        break
      case 2:
        versions.profilesVersion = number
        break
      case 3:
        versions.groupsVersion = number
        break
      case 4:
        versions.proxiesVersion = number
        break
      case 5:
        versions.coresVersion = number
        break
      case 6:
        versions.extensionsVersion = number
        break
      case 7:
        versions.defaultsVersion = number
        break
      case 8:
        versions.settingsVersion = number
        break
      case 9:
        versions.cookiesVersion = number
        break
      case 10:
        versions.snapshotsVersion = number
        break
      case 11:
        versions.logsVersion = number
        break
    }
  }
  return versions
}

export function decodeAppLicenseStatus(payload: Uint8Array): ProtoAppLicenseStatus {
  const status: ProtoAppLicenseStatus = {
    maxLimit: 0,
    usedCount: 0,
    usedKeys: [],
  }
  for (const field of readFields(payload)) {
    if (field.wireType === WireType.LengthDelimited && field.fieldNumber === 3) {
      status.usedKeys.push(decodeString(field.value))
      continue
    }
    if (field.wireType !== WireType.Varint) {
      continue
    }
    const number = Number(decodeVarintField(field.value))
    if (field.fieldNumber === 1) {
      status.maxLimit = number
    } else if (field.fieldNumber === 2) {
      status.usedCount = number
    }
  }
  return status
}

export function decodeAppCDKeysGenerateResponse(payload: Uint8Array): string[] {
  const keys: string[] = []
  for (const field of readFields(payload)) {
    if (field.wireType === WireType.LengthDelimited && field.fieldNumber === 1) {
      keys.push(decodeString(field.value))
    }
  }
  return keys
}

export function decodeAppRemoteAuthorProfileResponse(payload: Uint8Array): ProtoJSONObject {
  let json = ''
  for (const field of readFields(payload)) {
    if (field.wireType === WireType.LengthDelimited && field.fieldNumber === 1) {
      json = decodeString(field.value)
    }
  }
  if (!json) {
    return {}
  }
  const parsed: unknown = JSON.parse(json)
  if (!isProtoJSONObject(parsed)) {
    throw new Error('远程作者配置格式无效')
  }
  return parsed
}

export function decodeAppLogListResponse(payload: Uint8Array): ProtoAppLogEntry[] {
  const entries: ProtoAppLogEntry[] = []
  for (const field of readFields(payload)) {
    if (field.wireType === WireType.LengthDelimited && field.fieldNumber === 1) {
      entries.push(decodeAppLogEntry(field.value))
    }
  }
  return entries
}

export function decodeAppLogEntry(payload: Uint8Array): ProtoAppLogEntry {
  const entry: ProtoAppLogEntry = {
    time: '',
    level: '',
    component: '',
    message: '',
  }
  let fieldsJSON = ''
  for (const field of readFields(payload)) {
    if (field.wireType !== WireType.LengthDelimited) {
      continue
    }
    const text = decodeString(field.value)
    switch (field.fieldNumber) {
      case 1:
        entry.time = text
        break
      case 2:
        entry.level = text
        break
      case 3:
        entry.component = text
        break
      case 4:
        entry.message = text
        break
      case 5:
        fieldsJSON = text
        break
    }
  }
  if (fieldsJSON) {
    const fields = decodeProtoJSONObject(fieldsJSON, { raw: fieldsJSON })
    if (Object.keys(fields).length > 0) {
      entry.fields = fields
    }
  }
  return entry
}

export function decodeAppRuntimeEventPayload(payload: Uint8Array): ProtoAppRuntimeEventPayload {
  const result: ProtoAppRuntimeEventPayload = {}
  for (const field of readFields(payload)) {
    if (field.wireType === WireType.LengthDelimited) {
      const text = decodeString(field.value)
      switch (field.fieldNumber) {
        case 1:
          result.profileId = text
          break
        case 2:
          result.profileName = text
          break
        case 3:
          result.error = text
          break
        case 4:
          result.key = text
          break
        case 5:
          result.engine = text
          break
        case 11:
          result.runtimeWarning = text
          break
        case 12:
          result.domain = text
          break
        case 13:
          result.reason = text
          break
        case 24:
          if (!result.changedIds) {
            result.changedIds = []
          }
          result.changedIds.push(text)
          break
        case 26:
          result.url = text
          break
        case 27:
          result.action = text
          break
        case 28:
          result.serverUrl = text
          break
        case 29:
          result.code = text
          break
        case 30:
          result.source = text
          break
      }
      continue
    }
    if (field.wireType !== WireType.Varint) {
      continue
    }
    const number = Number(decodeVarintField(field.value))
    switch (field.fieldNumber) {
      case 6:
        result.debugPort = number
        break
      case 7:
        result.pid = number
        break
      case 8:
        result.reused = number !== 0
        break
      case 9:
        result.running = number !== 0
        break
      case 10:
        result.debugReady = number !== 0
        break
      case 14:
        result.version = number
        break
      case 15:
        result.profilesVersion = number
        break
      case 16:
        result.groupsVersion = number
        break
      case 17:
        result.proxiesVersion = number
        break
      case 18:
        result.coresVersion = number
        break
      case 19:
        result.extensionsVersion = number
        break
      case 20:
        result.defaultsVersion = number
        break
      case 21:
        result.settingsVersion = number
        break
      case 22:
        result.cookiesVersion = number
        break
      case 23:
        result.snapshotsVersion = number
        break
      case 25:
        result.logsVersion = number
        break
    }
  }
  return result
}

export function decodeAppWindowSize(payload: Uint8Array): ProtoAppWindowSize {
  const result: ProtoAppWindowSize = { width: 0, height: 0 }
  for (const field of readFields(payload)) {
    if (field.wireType !== WireType.Varint) {
      continue
    }
    const number = Number(decodeVarintField(field.value))
    if (field.fieldNumber === 1) {
      result.width = number
    } else if (field.fieldNumber === 2) {
      result.height = number
    }
  }
  return result
}

export function decodeAppWindowState(payload: Uint8Array): ProtoAppWindowState {
  const result: ProtoAppWindowState = { normal: false, maximised: false, minimised: false }
  for (const field of readFields(payload)) {
    if (field.wireType !== WireType.Varint) {
      continue
    }
    const value = Number(decodeVarintField(field.value)) !== 0
    if (field.fieldNumber === 1) {
      result.normal = value
    } else if (field.fieldNumber === 2) {
      result.maximised = value
    } else if (field.fieldNumber === 3) {
      result.minimised = value
    }
  }
  return result
}

export function decodeAppEnvironmentInfo(payload: Uint8Array): ProtoAppEnvironmentInfo {
  const result: ProtoAppEnvironmentInfo = { buildType: '', platform: '', arch: '' }
  for (const field of readFields(payload)) {
    if (field.wireType !== WireType.LengthDelimited) {
      continue
    }
    const text = decodeString(field.value)
    if (field.fieldNumber === 1) {
      result.buildType = text
    } else if (field.fieldNumber === 2) {
      result.platform = text
    } else if (field.fieldNumber === 3) {
      result.arch = text
    }
  }
  return result
}

export function decodeAppFileDropPayload(payload: Uint8Array): ProtoAppFileDropPayload {
  const result: ProtoAppFileDropPayload = { x: 0, y: 0, paths: [] }
  for (const field of readFields(payload)) {
    if (field.wireType === WireType.LengthDelimited && field.fieldNumber === 3) {
      result.paths.push(decodeString(field.value))
      continue
    }
    if (field.wireType !== WireType.Varint) {
      continue
    }
    const number = Number(decodeVarintField(field.value))
    if (field.fieldNumber === 1) {
      result.x = number
    } else if (field.fieldNumber === 2) {
      result.y = number
    }
  }
  return result
}

export function decodeBackupActionResult(payload: Uint8Array): ProtoBackupActionResult {
  const result: ProtoBackupActionResult = {
    failedComponents: [],
  }
  for (const field of readFields(payload)) {
    if (field.wireType === WireType.LengthDelimited) {
      switch (field.fieldNumber) {
        case 2:
          result.message = decodeString(field.value)
          break
        case 3:
          result.zipPath = decodeString(field.value)
          break
        case 12:
          result.failedComponents?.push(decodeBackupFailedComponent(field.value))
          break
      }
      continue
    }
    if (field.wireType !== WireType.Varint) {
      continue
    }
    const number = Number(decodeVarintField(field.value))
    switch (field.fieldNumber) {
      case 1:
        result.cancelled = number !== 0
        break
      case 4:
        result.resetFirst = number !== 0
        break
      case 5:
        result.imported = number
        break
      case 6:
        result.skipped = number
        break
      case 7:
        result.conflicts = number
        break
      case 8:
        result.partial = number !== 0
        break
      case 9:
        result.componentTotal = number
        break
      case 10:
        result.componentSuccess = number
        break
      case 11:
        result.componentFailed = number
        break
      case 13:
        result.includedEntries = number
        break
      case 14:
        result.skippedEntries = number
        break
      case 15:
        result.fileCount = number
        break
    }
  }
  return result
}

export function decodeBackupFailedComponent(payload: Uint8Array): ProtoBackupFailedComponent {
  const result: ProtoBackupFailedComponent = {}
  for (const field of readFields(payload)) {
    if (field.wireType !== WireType.LengthDelimited) {
      continue
    }
    const text = decodeString(field.value)
    if (field.fieldNumber === 1) {
      result.componentId = text
    } else if (field.fieldNumber === 2) {
      result.componentName = text
    } else if (field.fieldNumber === 3) {
      result.error = text
    }
  }
  return result
}

export function decodeBackupProgress(payload: Uint8Array): ProtoBackupProgress {
  const progress: ProtoBackupProgress = {
    phase: '',
    progress: 0,
    message: '',
  }
  for (const field of readFields(payload)) {
    if (field.wireType === WireType.LengthDelimited) {
      const text = decodeString(field.value)
      switch (field.fieldNumber) {
        case 1:
          progress.phase = text
          break
        case 3:
          progress.message = text
          break
        case 4:
          progress.componentId = text
          break
        case 5:
          progress.componentName = text
          break
        case 8:
          progress.timestamp = text
          break
      }
      continue
    }
    if (field.wireType !== WireType.Varint) {
      continue
    }
    const number = Number(decodeVarintField(field.value))
    if (field.fieldNumber === 2) {
      progress.progress = number
    } else if (field.fieldNumber === 6) {
      progress.entryIndex = number
    } else if (field.fieldNumber === 7) {
      progress.entryTotal = number
    }
  }
  return progress
}
