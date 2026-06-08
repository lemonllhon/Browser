import type { BrowserProfile, BrowserProfileInput, BrowserTab, BrowserSettings, BrowserCore, BrowserCoreInput, BrowserCoreValidateResult, BrowserProxy, BrowserCoreExtended, BrowserExtension, BrowserExtensionAssignInput, BrowserExtensionAutoBindInput, BrowserExtensionBinding, BrowserExtensionImportInput, BrowserExtensionImportResult, BrowserExtensionSyncDataInput, BrowserExtensionUnassignInput, CookieInfo, CookieImportResult, SnapshotInfo, BrowserBookmark, BrowserStartURL, BrowserGroup, BrowserGroupInput, BrowserGroupWithCount, ProxyIPHealthResult, DefaultContentRule, WindowSyncActionResult, WindowSyncBatchInputDifferentItem, WindowSyncBatchInputResult, WindowSyncCandidate, WindowSyncLayoutSettings, WindowSyncSettings, WindowSyncStartInput, WindowSyncState } from './types'
import {
  applyWindowSyncLayout as applyWindowSyncLayoutProto,
  batchRemoveBrowserProfileTags as batchRemoveBrowserProfileTagsProto,
  batchSetBrowserProfileTags as batchSetBrowserProfileTagsProto,
  checkBrowserProxyBatchIPHealth as checkBrowserProxyBatchIPHealthProto,
  checkBrowserProxyIPHealth as checkBrowserProxyIPHealthProto,
  checkBrowserProxyPreviewBatchIPHealth as checkBrowserProxyPreviewBatchIPHealthProto,
  clearBrowserCookies as clearBrowserCookiesProto,
  assignBrowserExtensionProfiles as assignBrowserExtensionProfilesProto,
  chooseBrowserProfileBackupImportPackage as chooseBrowserProfileBackupImportPackageProto,
  chooseBrowserExtensionArchive as chooseBrowserExtensionArchiveProto,
  chooseBrowserExtensionDirectory as chooseBrowserExtensionDirectoryProto,
  copyBrowserProfile as copyBrowserProfileProto,
  createBrowserGroup as createBrowserGroupProto,
  createBrowserProfile as createBrowserProfileProto,
  createBrowserSnapshot as createBrowserSnapshotProto,
  cancelBrowserCoreDownload as cancelBrowserCoreDownloadProto,
  deleteBrowserCore as deleteBrowserCoreProto,
  deleteBrowserExtension as deleteBrowserExtensionProto,
  deleteBrowserGroup as deleteBrowserGroupProto,
  deleteBrowserProfile as deleteBrowserProfileProto,
  deleteBrowserSnapshot as deleteBrowserSnapshotProto,
  downloadBrowserCore as downloadBrowserCoreProto,
  exportBrowserProfileBackup as exportBrowserProfileBackupProto,
  fetchClashImportFromURL as fetchClashImportFromURLProto,
  getBrowserCoreExtendedInfo as getBrowserCoreExtendedInfoProto,
  getBrowserSettings as getBrowserSettingsProto,
  getBrowserProfileCode as getBrowserProfileCodeProto,
  getLaunchServerInfo as getLaunchServerInfoProto,
  getWindowSyncLayoutSettings as getWindowSyncLayoutSettingsProto,
  getWindowSyncSettings as getWindowSyncSettingsProto,
  getWindowSyncState as getWindowSyncStateProto,
  exportBrowserCookies as exportBrowserCookiesProto,
  getBrowserExtension as getBrowserExtensionProto,
  importBrowserExtensionArchive as importBrowserExtensionArchiveProto,
  importBrowserExtensionDirectory as importBrowserExtensionDirectoryProto,
  importBrowserProfileBackup as importBrowserProfileBackupProto,
  importBrowserCookies as importBrowserCookiesProto,
  listCloudSyncBackups as listCloudSyncBackupsProto,
  listBrowserBookmarks as listBrowserBookmarksProto,
  listBrowserCores as listBrowserCoresProto,
  listBrowserCookies as listBrowserCookiesProto,
  listBrowserExtensionBindingsForProfile as listBrowserExtensionBindingsForProfileProto,
  listBrowserExtensionProfileBindings as listBrowserExtensionProfileBindingsProto,
  listBrowserExtensions as listBrowserExtensionsProto,
  listBrowserDefaultContentRules as listBrowserDefaultContentRulesProto,
  listBrowserDefaultStartURLs as listBrowserDefaultStartURLsProto,
  listBrowserGroups as listBrowserGroupsProto,
  listBrowserProxies as listBrowserProxiesProto,
  listBrowserProxyGroups as listBrowserProxyGroupsProto,
  listBrowserProfiles as listBrowserProfilesProto,
  listBrowserSnapshots as listBrowserSnapshotsProto,
  listBrowserTabs as listBrowserTabsProto,
  listBrowserTags as listBrowserTagsProto,
  listWindowSyncCandidates as listWindowSyncCandidatesProto,
  moveBrowserProfilesToGroup as moveBrowserProfilesToGroupProto,
  onWindowSyncStateChanged as onWindowSyncStateChangedProto,
  onBrowserProxyIPHealthResult as onBrowserProxyIPHealthResultProto,
  onBrowserProxyPreviewIPHealthResult as onBrowserProxyPreviewIPHealthResultProto,
  onBrowserProxyPreviewSpeedResult as onBrowserProxyPreviewSpeedResultProto,
  onBrowserProxySpeedResult as onBrowserProxySpeedResultProto,
  onBrowserCoreDownloadProgress as onBrowserCoreDownloadProgressProto,
  onBrowserProfileBackupProgress as onBrowserProfileBackupProgressProto,
  onCloudSyncBackupProgress as onCloudSyncBackupProgressProto,
  openBrowserProfileUserDataDir as openBrowserProfileUserDataDirProto,
  openBrowserCorePath as openBrowserCorePathProto,
  openBrowserUserDataDir as openBrowserUserDataDirProto,
  openBrowserURL as openBrowserURLProto,
  pauseWindowSync as pauseWindowSyncProto,
  pinCenterBrowserInstance as pinCenterBrowserInstanceProto,
  prepareCloudSyncProfileBackupRestore as prepareCloudSyncProfileBackupRestoreProto,
  regenerateBrowserProfileCode as regenerateBrowserProfileCodeProto,
  renameBrowserCorePath as renameBrowserCorePathProto,
  renameBrowserTag as renameBrowserTagProto,
  resetBrowserBookmarks as resetBrowserBookmarksProto,
  resetBrowserDefaultStartURLs as resetBrowserDefaultStartURLsProto,
  resumeWindowSync as resumeWindowSyncProto,
  resizeWindowSyncToolbar as resizeWindowSyncToolbarProto,
  restartBrowserInstance as restartBrowserInstanceProto,
  restoreBrowserSnapshot as restoreBrowserSnapshotProto,
  saveBrowserBookmarks as saveBrowserBookmarksProto,
  saveBrowserCore as saveBrowserCoreProto,
  saveBrowserDefaultContentRules as saveBrowserDefaultContentRulesProto,
  saveBrowserDefaultStartURLs as saveBrowserDefaultStartURLsProto,
  saveBrowserSettings as saveBrowserSettingsProto,
  saveBrowserProxies as saveBrowserProxiesProto,
  saveWindowSyncLayoutSettings as saveWindowSyncLayoutSettingsProto,
  saveWindowSyncSettings as saveWindowSyncSettingsProto,
  scanBrowserCores as scanBrowserCoresProto,
  setBrowserProfileCode as setBrowserProfileCodeProto,
  setBrowserProfileKeywords as setBrowserProfileKeywordsProto,
  setBrowserExtensionAutoBind as setBrowserExtensionAutoBindProto,
  setDefaultBrowserCore as setDefaultBrowserCoreProto,
  showAllWindowSyncWindows as showAllWindowSyncWindowsProto,
  startBrowserInstance as startBrowserInstanceProto,
  startBrowserInstanceByCode as startBrowserInstanceByCodeProto,
  startWindowSync as startWindowSyncProto,
  stopBrowserInstance as stopBrowserInstanceProto,
  stopWindowSync as stopWindowSyncProto,
  syncBrowserExtensionProfileData as syncBrowserExtensionProfileDataProto,
  switchBrowserProfileProxyNow as switchBrowserProfileProxyNowProto,
  testBrowserProxyBatchSpeed as testBrowserProxyBatchSpeedProto,
  testBrowserProxyPreviewBatchSpeed as testBrowserProxyPreviewBatchSpeedProto,
  testBrowserProxySpeed as testBrowserProxySpeedProto,
  testProxyConnectivity as testProxyConnectivityProto,
  testProxyRealConnectivity as testProxyRealConnectivityProto,
  updateBrowserGroup as updateBrowserGroupProto,
  updateBrowserProfile as updateBrowserProfileProto,
  uploadCloudSyncProfileBackup as uploadCloudSyncProfileBackupProto,
  unassignBrowserExtensionProfiles as unassignBrowserExtensionProfilesProto,
  validateBrowserCorePath as validateBrowserCorePathProto,
  validateProxyConfig as validateProxyConfigProto,
  windowSyncBatchInputDifferent as windowSyncBatchInputDifferentProto,
  windowSyncBatchInputSame as windowSyncBatchInputSameProto,
  windowSyncCloseBlankTabs as windowSyncCloseBlankTabsProto,
  windowSyncCloseCurrentTab as windowSyncCloseCurrentTabProto,
  windowSyncCloseOtherTabs as windowSyncCloseOtherTabsProto,
  windowSyncOpenUrls as windowSyncOpenUrlsProto,
} from '../../shared/backend/client'
import type { ProtoBrowserProfileBackupActionResult, ProtoBrowserProfileBackupExportInput, ProtoBrowserProfileBackupImportInput, ProtoBackupProgress, ProtoCloudSyncBackupItem, ProtoCloudSyncBackupListResult, ProtoCloudSyncProfileBackupUploadResult } from '../../shared/backend/client'

// ============================================================================
// Profile API
// ============================================================================

export async function fetchBrowserProfiles(): Promise<BrowserProfile[]> {
  return await listBrowserProfilesProto()
}

export async function fetchBrowserProfilesByTag(tag: string): Promise<BrowserProfile[]> {
  return await listBrowserProfilesProto(tag)
}

export async function fetchAllTags(): Promise<string[]> {
  return await listBrowserTagsProto()
}

export async function createBrowserProfile(input: BrowserProfileInput): Promise<BrowserProfile | null> {
  return await createBrowserProfileProto(input)
}

export async function updateBrowserProfile(profileId: string, input: BrowserProfileInput): Promise<BrowserProfile | null> {
  return await updateBrowserProfileProto(profileId, input)
}

export async function deleteBrowserProfile(profileId: string): Promise<boolean> {
  return await deleteBrowserProfileProto(profileId)
}

export async function copyBrowserProfile(profileId: string, newName: string): Promise<BrowserProfile | null> {
  return await copyBrowserProfileProto(profileId, newName)
}

export type BrowserProfileBackupActionResult = ProtoBrowserProfileBackupActionResult
export type BrowserProfileBackupExportInput = ProtoBrowserProfileBackupExportInput
export type BrowserProfileBackupImportInput = ProtoBrowserProfileBackupImportInput
export type BrowserProfileBackupProgress = ProtoBackupProgress
export type CloudSyncBackupItem = ProtoCloudSyncBackupItem
export type CloudSyncBackupListResult = ProtoCloudSyncBackupListResult
export type CloudSyncProfileBackupUploadResult = ProtoCloudSyncProfileBackupUploadResult

export async function exportProfileBackup(input: BrowserProfileBackupExportInput): Promise<BrowserProfileBackupActionResult> {
  return await exportBrowserProfileBackupProto(input)
}

export async function chooseProfileBackupImportPackage(): Promise<BrowserProfileBackupActionResult> {
  return await chooseBrowserProfileBackupImportPackageProto()
}

export async function importProfileBackup(input: BrowserProfileBackupImportInput): Promise<BrowserProfileBackupActionResult> {
  return await importBrowserProfileBackupProto(input)
}

export function onProfileBackupProgress(callback: (progress: BrowserProfileBackupProgress) => void): () => void {
  return onBrowserProfileBackupProgressProto(callback)
}

export async function listCloudProfileBackups(): Promise<CloudSyncBackupListResult> {
  return await listCloudSyncBackupsProto({ page: 1, pageSize: 20, status: 'ready', backupType: 'profile_bundle' })
}

export async function uploadCloudProfileBackup(input: BrowserProfileBackupExportInput): Promise<CloudSyncProfileBackupUploadResult> {
  return await uploadCloudSyncProfileBackupProto(input)
}

export async function prepareCloudProfileBackupRestore(backupId: string): Promise<BrowserProfileBackupActionResult> {
  return await prepareCloudSyncProfileBackupRestoreProto({ backupId })
}

export function onCloudProfileBackupProgress(callback: (progress: BrowserProfileBackupProgress) => void): () => void {
  return onCloudSyncBackupProgressProto(progress => {
    if (isCloudProfileBackupProgress(progress)) {
      callback(progress)
    }
  })
}

function isCloudProfileBackupProgress(progress: BrowserProfileBackupProgress): boolean {
  const componentId = String(progress.componentId || '').trim()
  if (componentId) return componentId === 'profile_bundle'
  const message = String(progress.message || '').trim()
  return message.includes('实例云端备份') ||
    message.includes('实例备份包') ||
    message.includes('上传实例备份')
}

// ============================================================================
// Instance API
// ============================================================================

export async function startBrowserInstance(profileId: string): Promise<BrowserProfile | null> {
  return await startBrowserInstanceProto(profileId)
}

export async function startBrowserInstanceByCode(code: string): Promise<BrowserProfile | null> {
  return await startBrowserInstanceByCodeProto(code)
}

export async function stopBrowserInstance(profileId: string): Promise<BrowserProfile | null> {
  return await stopBrowserInstanceProto(profileId)
}

export async function restartBrowserInstance(profileId: string): Promise<BrowserProfile | null> {
  return await restartBrowserInstanceProto(profileId)
}

export async function pinCenterBrowserInstance(profileId: string): Promise<boolean> {
  return await pinCenterBrowserInstanceProto(profileId)
}

export async function switchBrowserProfileProxyNow(profileId: string): Promise<BrowserProfile | null> {
  return await switchBrowserProfileProxyNowProto(profileId)
}

export async function openBrowserUrl(profileId: string, targetUrl: string): Promise<boolean> {
  return await openBrowserURLProto(profileId, targetUrl)
}

export async function fetchBrowserTabs(profileId: string): Promise<BrowserTab[]> {
  return await listBrowserTabsProto(profileId)
}

// ============================================================================
// Window Sync API
// ============================================================================

export async function listWindowSyncCandidates(): Promise<WindowSyncCandidate[]> {
  return await listWindowSyncCandidatesProto()
}

export async function startWindowSync(input: WindowSyncStartInput): Promise<WindowSyncState | null> {
  return await startWindowSyncProto(input)
}

export async function getWindowSyncState(): Promise<WindowSyncState | null> {
  return await getWindowSyncStateProto()
}

export function defaultWindowSyncSettings(): WindowSyncSettings {
  return {
    masterColor: '#2563eb',
    syncKeyboard: true,
    syncMouse: true,
  }
}

export async function getWindowSyncSettings(): Promise<WindowSyncSettings> {
  return await getWindowSyncSettingsProto()
}

export async function saveWindowSyncSettings(settings: WindowSyncSettings): Promise<WindowSyncState | null> {
  return await saveWindowSyncSettingsProto(settings)
}

export function defaultWindowSyncLayoutSettings(): WindowSyncLayoutSettings {
  return {
    mode: 'grid',
    scope: 'app-screen',
    width: 1500,
    height: 500,
    gapX: 10,
    gapY: 10,
    perRow: 2,
  }
}

export async function getWindowSyncLayoutSettings(): Promise<WindowSyncLayoutSettings> {
  return await getWindowSyncLayoutSettingsProto()
}

export async function saveWindowSyncLayoutSettings(settings: WindowSyncLayoutSettings): Promise<WindowSyncLayoutSettings> {
  return await saveWindowSyncLayoutSettingsProto(settings)
}

export async function applyWindowSyncLayout(settings: WindowSyncLayoutSettings): Promise<WindowSyncState | null> {
  return await applyWindowSyncLayoutProto(settings)
}

export async function pauseWindowSync(): Promise<WindowSyncState | null> {
  return await pauseWindowSyncProto()
}

export async function resumeWindowSync(): Promise<WindowSyncState | null> {
  return await resumeWindowSyncProto()
}

export async function showAllWindowSyncWindows(): Promise<WindowSyncState | null> {
  return await showAllWindowSyncWindowsProto()
}

export async function stopWindowSync(): Promise<WindowSyncState | null> {
  return await stopWindowSyncProto()
}

export async function windowSyncBatchInputSame(text: string): Promise<WindowSyncBatchInputResult> {
  return await windowSyncBatchInputSameProto(text)
}

export async function windowSyncBatchInputDifferent(items: WindowSyncBatchInputDifferentItem[]): Promise<WindowSyncBatchInputResult> {
  return await windowSyncBatchInputDifferentProto(items)
}

export async function windowSyncCloseOtherTabs(): Promise<WindowSyncActionResult> {
  return await windowSyncCloseOtherTabsProto()
}

export async function windowSyncCloseCurrentTab(): Promise<WindowSyncActionResult> {
  return await windowSyncCloseCurrentTabProto()
}

export async function windowSyncCloseBlankTabs(): Promise<WindowSyncActionResult> {
  return await windowSyncCloseBlankTabsProto()
}

export async function windowSyncOpenUrls(urls: string[]): Promise<WindowSyncActionResult> {
  return await windowSyncOpenUrlsProto(urls)
}

export async function resizeWindowSyncToolbar(width: number, height: number): Promise<boolean> {
  return await resizeWindowSyncToolbarProto(width, height)
}

export function onWindowSyncStateChanged(callback: (state: WindowSyncState | null) => void): () => void {
  return onWindowSyncStateChangedProto(callback)
}

// ============================================================================
// Settings API
// ============================================================================

export async function fetchBrowserSettings(): Promise<BrowserSettings> {
  return await getBrowserSettingsProto()
}

export async function saveBrowserSettings(settings: BrowserSettings): Promise<boolean> {
  return await saveBrowserSettingsProto(settings)
}

// ============================================================================
// Core API
// ============================================================================

export async function fetchBrowserCores(): Promise<BrowserCore[]> {
  return await listBrowserCoresProto()
}

export async function saveBrowserCore(input: BrowserCoreInput): Promise<boolean> {
  return await saveBrowserCoreProto(input)
}

export async function deleteBrowserCore(coreId: string): Promise<boolean> {
  return await deleteBrowserCoreProto(coreId)
}

export async function setDefaultBrowserCore(coreId: string): Promise<boolean> {
  return await setDefaultBrowserCoreProto(coreId)
}

export async function validateBrowserCorePath(corePath: string): Promise<BrowserCoreValidateResult> {
  return await validateBrowserCorePathProto(corePath)
}

export async function fetchCoreExtendedInfo(): Promise<BrowserCoreExtended[]> {
  return await getBrowserCoreExtendedInfoProto()
}

export async function scanBrowserCores(): Promise<BrowserCore[]> {
  return await scanBrowserCoresProto()
}

export async function BrowserCoreDownload(coreName: string, url: string, proxyConfig?: string): Promise<boolean> {
  return await downloadBrowserCoreProto(coreName, url, proxyConfig || '')
}

export async function cancelBrowserCoreDownload(): Promise<boolean> {
  return await cancelBrowserCoreDownloadProto()
}

export async function renameBrowserCorePath(corePath: string, newFolderName: string): Promise<boolean> {
  return await renameBrowserCorePathProto(corePath, newFolderName)
}

export function onBrowserCoreDownloadProgress(callback: (progress: { phase: string; progress: number; message: string; corePath?: string }) => void): () => void {
  return onBrowserCoreDownloadProgressProto(callback)
}

// ============================================================================
// Extension API
// ============================================================================

export async function fetchBrowserExtensions(): Promise<BrowserExtension[]> {
  return await listBrowserExtensionsProto()
}

export async function fetchBrowserExtension(extensionId: string): Promise<BrowserExtension | null> {
  return await getBrowserExtensionProto(extensionId)
}

export async function deleteBrowserExtension(extensionId: string): Promise<boolean> {
  return await deleteBrowserExtensionProto(extensionId)
}

export async function chooseBrowserExtensionArchive(): Promise<{ cancelled: boolean; path: string }> {
  return await chooseBrowserExtensionArchiveProto()
}

export async function chooseBrowserExtensionDirectory(): Promise<{ cancelled: boolean; path: string }> {
  return await chooseBrowserExtensionDirectoryProto()
}

export async function importBrowserExtensionArchive(input: BrowserExtensionImportInput): Promise<BrowserExtensionImportResult> {
  return await importBrowserExtensionArchiveProto(input)
}

export async function importBrowserExtensionDirectory(input: BrowserExtensionImportInput): Promise<BrowserExtensionImportResult> {
  return await importBrowserExtensionDirectoryProto(input)
}

export async function fetchBrowserExtensionProfileBindings(extensionId: string): Promise<BrowserExtensionBinding[]> {
  return await listBrowserExtensionProfileBindingsProto(extensionId)
}

export async function fetchBrowserExtensionBindingsForProfile(profileId: string): Promise<BrowserExtensionBinding[]> {
  return await listBrowserExtensionBindingsForProfileProto(profileId)
}

export async function assignBrowserExtensionProfiles(input: BrowserExtensionAssignInput): Promise<BrowserExtensionBinding[]> {
  return await assignBrowserExtensionProfilesProto(input)
}

export async function setBrowserExtensionAutoBind(input: BrowserExtensionAutoBindInput): Promise<BrowserExtension | null> {
  return await setBrowserExtensionAutoBindProto(input)
}

export async function unassignBrowserExtensionProfiles(input: BrowserExtensionUnassignInput): Promise<BrowserExtensionBinding[]> {
  return await unassignBrowserExtensionProfilesProto(input)
}

export async function syncBrowserExtensionData(input: BrowserExtensionSyncDataInput): Promise<BrowserExtensionBinding[]> {
  return await syncBrowserExtensionProfileDataProto(input)
}

// ============================================================================
// Proxy API
// ============================================================================

export async function fetchBrowserProxies(): Promise<BrowserProxy[]> {
  return await listBrowserProxiesProto()
}

export async function fetchBrowserProxyGroups(): Promise<string[]> {
  return await listBrowserProxyGroupsProto()
}

export async function fetchBrowserProxiesByGroup(groupName: string): Promise<BrowserProxy[]> {
  return await listBrowserProxiesProto(groupName)
}

export interface ClashImportURLResult {
  url: string
  content: string
  proxyCount: number
  dnsServers?: string
  suggestedGroup?: string
}

export async function fetchClashImportFromURL(targetURL: string): Promise<ClashImportURLResult> {
  return await fetchClashImportFromURLProto(targetURL)
}

export async function saveBrowserProxies(proxies: BrowserProxy[]): Promise<boolean> {
  return await saveBrowserProxiesProto(proxies)
}

export async function validateProxyConfig(proxyConfig: string, proxyId: string): Promise<{ supported: boolean; errorMsg: string }> {
  return await validateProxyConfigProto(proxyConfig, proxyId)
}

export async function testProxyConnectivity(proxyId: string, proxyConfig: string): Promise<{ proxyId: string; ok: boolean; latencyMs: number; error: string }> {
  return await testProxyConnectivityProto(proxyId, proxyConfig)
}

export async function testProxyRealConnectivity(proxyId: string): Promise<{ proxyId: string; ok: boolean; latencyMs: number; error: string }> {
  return await testProxyRealConnectivityProto(proxyId)
}

export async function browserProxyTestSpeed(proxyId: string): Promise<{ proxyId: string; ok: boolean; latencyMs: number; error: string }> {
  return await testBrowserProxySpeedProto(proxyId)
}

export async function browserProxyBatchTestSpeed(proxyIds: string[], concurrency: number = 20): Promise<{ proxyId: string; ok: boolean; latencyMs: number; error: string }[]> {
  return await testBrowserProxyBatchSpeedProto(proxyIds, concurrency)
}

export async function browserProxyPreviewBatchTestSpeed(items: { proxyId: string; proxyConfig: string }[], concurrency: number = 20): Promise<{ proxyId: string; ok: boolean; latencyMs: number; error: string }[]> {
  return await testBrowserProxyPreviewBatchSpeedProto(items, concurrency)
}

export async function browserProxyCheckIPHealth(proxyId: string): Promise<ProxyIPHealthResult> {
  return await checkBrowserProxyIPHealthProto(proxyId)
}

export async function browserProxyBatchCheckIPHealth(proxyIds: string[], concurrency: number = 10): Promise<ProxyIPHealthResult[]> {
  return await checkBrowserProxyBatchIPHealthProto(proxyIds, concurrency)
}

export async function browserProxyPreviewBatchCheckIPHealth(items: { proxyId: string; proxyConfig: string }[], concurrency: number = 10): Promise<ProxyIPHealthResult[]> {
  return await checkBrowserProxyPreviewBatchIPHealthProto(items, concurrency)
}

export function onBrowserProxySpeedResult(callback: (result: { proxyId: string; ok: boolean; latencyMs: number; error: string }) => void): () => void {
  return onBrowserProxySpeedResultProto(callback)
}

export function onBrowserProxyIPHealthResult(callback: (result: ProxyIPHealthResult) => void): () => void {
  return onBrowserProxyIPHealthResultProto(callback)
}

export function onBrowserProxyPreviewSpeedResult(callback: (result: { proxyId: string; ok: boolean; latencyMs: number; error: string }) => void): () => void {
  return onBrowserProxyPreviewSpeedResultProto(callback)
}

export function onBrowserProxyPreviewIPHealthResult(callback: (result: ProxyIPHealthResult) => void): () => void {
  return onBrowserProxyPreviewIPHealthResultProto(callback)
}

export async function openUserDataDir(userDataDir: string): Promise<boolean> {
  return await openBrowserUserDataDirProto(userDataDir)
}

export async function openProfileUserDataDir(profileId: string): Promise<boolean> {
  return await openBrowserProfileUserDataDirProto(profileId)
}

export async function openCorePath(corePath: string): Promise<boolean> {
  return await openBrowserCorePathProto(corePath)
}

// ============================================================================
// Cookie API
// ============================================================================

export async function fetchBrowserCookies(profileId: string): Promise<CookieInfo[]> {
  return await listBrowserCookiesProto(profileId)
}

export async function clearBrowserCookies(profileId: string): Promise<boolean> {
  return await clearBrowserCookiesProto(profileId)
}

export async function exportBrowserCookies(profileId: string): Promise<string> {
  return await exportBrowserCookiesProto(profileId)
}

export async function importBrowserCookies(profileId: string, content: string): Promise<CookieImportResult> {
  return await importBrowserCookiesProto(profileId, content)
}

// ============================================================================
// Snapshot API
// ============================================================================

export async function listSnapshots(profileId: string): Promise<SnapshotInfo[]> {
  return await listBrowserSnapshotsProto(profileId)
}

export async function createSnapshot(profileId: string, name: string): Promise<SnapshotInfo | null> {
  return await createBrowserSnapshotProto(profileId, name)
}

export async function restoreSnapshot(profileId: string, snapshotId: string): Promise<boolean> {
  return await restoreBrowserSnapshotProto(profileId, snapshotId)
}

export async function deleteSnapshot(profileId: string, snapshotId: string): Promise<boolean> {
  return await deleteBrowserSnapshotProto(profileId, snapshotId)
}

// ============================================================================
// Bookmark API
// ============================================================================

export async function fetchBookmarks(): Promise<BrowserBookmark[]> {
  return await listBrowserBookmarksProto()
}

export async function saveBookmarks(items: BrowserBookmark[]): Promise<boolean> {
  return await saveBrowserBookmarksProto(items)
}

export async function resetBookmarks(): Promise<boolean> {
  return await resetBrowserBookmarksProto()
}

// ============================================================================
// Keywords API
// ============================================================================

export async function setProfileKeywords(profileId: string, keywords: string[]): Promise<BrowserProfile | null> {
  return await setBrowserProfileKeywordsProto(profileId, keywords)
}

// ============================================================================
// LaunchCode API
// ============================================================================

export interface LaunchServerInfo {
  host: string
  port: number
  preferredPort: number
  baseUrl: string
  cdpUrl: string
  activeDebugPort: number
  ready: boolean
  apiAuth: {
    requested: boolean
    configured: boolean
    enabled: boolean
    header: string
  }
}

function asLaunchServerRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function launchStringField(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key]
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  return String(value)
}

function launchNumberField(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  return typeof value === 'number' || typeof value === 'string' ? Number(value) || 0 : 0
}

function launchBooleanField(record: Record<string, unknown>, key: string): boolean {
  return Boolean(record[key])
}

function normalizeLaunchServerInfo(payload: unknown): LaunchServerInfo {
  const record = asLaunchServerRecord(payload)
  const host = launchStringField(record, 'host', '127.0.0.1')
  const port = launchNumberField(record, 'port')
  const preferredPort = launchNumberField(record, 'preferredPort')
  const fallbackPort = preferredPort > 0 ? preferredPort : 19876
  const effectivePort = port > 0 ? port : fallbackPort
  const baseUrl = launchStringField(record, 'baseUrl', effectivePort > 0 ? `http://${host}:${effectivePort}` : '')
  const cdpUrl = launchStringField(record, 'cdpUrl', baseUrl)
  const activeDebugPort = launchNumberField(record, 'activeDebugPort')
  const apiAuthPayload = asLaunchServerRecord(record.apiAuth)
  const apiAuth = {
    requested: launchBooleanField(apiAuthPayload, 'requested'),
    configured: launchBooleanField(apiAuthPayload, 'configured'),
    enabled: launchBooleanField(apiAuthPayload, 'enabled'),
    header: launchStringField(apiAuthPayload, 'header', 'X-Ant-Api-Key'),
  }

  return {
    host,
    port: effectivePort,
    preferredPort,
    baseUrl,
    cdpUrl,
    activeDebugPort,
    ready: launchBooleanField(record, 'ready') && port > 0,
    apiAuth,
  }
}

export async function fetchLaunchServerInfo(): Promise<LaunchServerInfo> {
  return normalizeLaunchServerInfo(await getLaunchServerInfoProto())
}

export async function getBrowserProfileCode(profileId: string): Promise<string> {
  return await getBrowserProfileCodeProto(profileId)
}

export async function regenerateBrowserProfileCode(profileId: string): Promise<string> {
  return await regenerateBrowserProfileCodeProto(profileId)
}

export async function setBrowserProfileCode(profileId: string, code: string): Promise<string> {
  return await setBrowserProfileCodeProto(profileId, code)
}


export async function batchSetProfileTags(profileIds: string[], tags: string[], replace: boolean): Promise<boolean> {
  return await batchSetBrowserProfileTagsProto(profileIds, tags, replace)
}

export async function batchRemoveProfileTags(profileIds: string[], tags: string[]): Promise<boolean> {
  return await batchRemoveBrowserProfileTagsProto(profileIds, tags)
}

export async function renameBrowserTag(oldName: string, newName: string): Promise<boolean> {
  return await renameBrowserTagProto(oldName, newName)
}

// ============================================================================
// Group API
// ============================================================================

export async function fetchGroups(): Promise<BrowserGroupWithCount[]> {
  return await listBrowserGroupsProto()
}

export async function fetchDefaultContentRules(): Promise<DefaultContentRule[]> {
  return await listBrowserDefaultContentRulesProto()
}

export async function saveDefaultContentRules(items: DefaultContentRule[]): Promise<boolean> {
  return await saveBrowserDefaultContentRulesProto(items)
}

export async function fetchDefaultStartURLs(): Promise<BrowserStartURL[]> {
  return await listBrowserDefaultStartURLsProto()
}

export async function saveDefaultStartURLs(items: BrowserStartURL[]): Promise<boolean> {
  return await saveBrowserDefaultStartURLsProto(items)
}

export async function resetDefaultStartURLs(): Promise<boolean> {
  return await resetBrowserDefaultStartURLsProto()
}

export async function createGroup(input: BrowserGroupInput): Promise<BrowserGroup | null> {
  return await createBrowserGroupProto(input)
}

export async function updateGroup(groupId: string, input: BrowserGroupInput): Promise<BrowserGroup | null> {
  return await updateBrowserGroupProto(groupId, input)
}

export async function deleteGroup(groupId: string): Promise<boolean> {
  return await deleteBrowserGroupProto(groupId)
}

export async function moveInstancesToGroup(profileIds: string[], groupId: string): Promise<boolean> {
  return await moveBrowserProfilesToGroupProto(profileIds, groupId)
}
