import { METHOD_DEV_PING, PingResponse, decodePingResponse, encodePingRequest } from './envelope'
import { ProtoIpcClient } from './transport'
export { clearAppLogs, exportSystemConfig, fetchRemoteAuthorProfile, forceQuitApp, generateCDKeys, getAppConfig, getDashboardStats, getDataVersions, getLicenseStatus, getPerformanceSnapshot, getRuntimeEnvironment, getWindowSize, getWindowState, hideWindow, importSystemConfig, initializeSystemData, listAppLogs, minimiseWindow, onAppFileDrop, onAppRuntimeEvent, onBackupExportProgress, onBackupImportProgress, openAppReleasePage, openPath, quitAppOnly, redeemCDKey, redeemGithubStar, reloadAppConfig, saveWindowState } from './app'
export { batchRemoveBrowserProfileTags, batchSetBrowserProfileTags, copyBrowserProfile, createBrowserGroup, createBrowserProfile, deleteBrowserGroup, deleteBrowserProfile, getBrowserProfileCode, getLaunchServerInfo, listBrowserGroups, listBrowserProfiles, listBrowserTabs, listBrowserTags, moveBrowserProfilesToGroup, openBrowserURL, pinCenterBrowserInstance, regenerateBrowserProfileCode, renameBrowserTag, restartBrowserInstance, setBrowserProfileCode, setBrowserProfileKeywords, startBrowserInstance, startBrowserInstanceByCode, stopBrowserInstance, switchBrowserProfileProxyNow, updateBrowserGroup, updateBrowserProfile } from './browser'
export { chooseBrowserProfileBackupImportPackage, exportBrowserProfileBackup, importBrowserProfileBackup, onBrowserProfileBackupProgress } from './browserProfileBackup'
export { checkBrowserProxyBatchIPHealth, checkBrowserProxyIPHealth, checkBrowserProxyPreviewBatchIPHealth, fetchClashImportFromURL, listBrowserProxies, listBrowserProxyGroups, onBrowserProxyIPHealthResult, onBrowserProxyPreviewIPHealthResult, onBrowserProxyPreviewSpeedResult, onBrowserProxySpeedResult, saveBrowserProxies, testBrowserProxyBatchSpeed, testBrowserProxyPreviewBatchSpeed, testBrowserProxySpeed, testProxyConnectivity, testProxyRealConnectivity, validateProxyConfig } from './proxy'
export { cancelBrowserCoreDownload, deleteBrowserCore, downloadBrowserCore, getBrowserCoreExtendedInfo, listBrowserCores, onBrowserCoreDownloadProgress, openBrowserCorePath, renameBrowserCorePath, saveBrowserCore, scanBrowserCores, setDefaultBrowserCore, validateBrowserCorePath } from './core'
export { checkAppUpdate, downloadAndExtractPortableUpdate, downloadAppUpdate, installDownloadedAppUpdate, onAppUpdateDownloadProgress, onAppUpdatePending, onAppUpdatePendingInstallFailed, onAppUpdatePendingNotification } from './update'
export { getBrowserSettings, saveBrowserSettings } from './browserSettings'
export { createCloudSyncProfileTransferShare, deleteCloudSyncBackup, disableCloudSyncEncryption, downloadCloudSyncBackup, getCloudSyncStatus, listCloudSyncBackups, loginBindCloudSync, logoutCloudSync, onCloudSyncBackupProgress, prepareCloudSyncProfileBackupRestore, prepareCloudSyncProfileTransferShareRestore, refreshCloudSyncStatus, resolveCloudSyncProfileTransferShare, restoreCloudSyncBackup, setupCloudSyncEncryption, startCloudSyncOAuth, unlockCloudSyncEncryption, uploadCloudSyncFullBackup, uploadCloudSyncProfileBackup } from './cloudSync'
export { applyWindowSyncLayout, getWindowSyncLayoutSettings, getWindowSyncSettings, getWindowSyncState, listWindowSyncCandidates, onWindowSyncStateChanged, pauseWindowSync, resizeWindowSyncToolbar, resumeWindowSync, saveWindowSyncLayoutSettings, saveWindowSyncSettings, showAllWindowSyncWindows, startWindowSync, stopWindowSync, windowSyncBatchInputDifferent, windowSyncBatchInputSame, windowSyncCloseBlankTabs, windowSyncCloseCurrentTab, windowSyncCloseOtherTabs, windowSyncOpenUrls } from './windowSync'

export const protoIpcClient = new ProtoIpcClient()

export async function pingBackend(message = 'frontend'): Promise<PingResponse> {
  const responsePayload = await protoIpcClient.request(
    METHOD_DEV_PING,
    encodePingRequest({
      message,
      sentAtUnixMs: Date.now(),
    }),
  )
  return decodePingResponse(responsePayload)
}
