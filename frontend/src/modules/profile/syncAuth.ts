import {
  getCloudSyncStatus,
  listCloudSyncBackups,
  loginBindCloudSync,
  logoutCloudSync,
  refreshCloudSyncStatus,
  uploadCloudSyncFullBackup,
  downloadCloudSyncBackup,
  restoreCloudSyncBackup,
  deleteCloudSyncBackup,
  type ProtoCloudSyncBackupItem,
  type ProtoCloudSyncBackupListResult,
  type ProtoCloudSyncBackupRestoreResult,
  type ProtoCloudSyncBackupUploadResult,
  type ProtoCloudSyncBackupDownloadResult,
  type ProtoCloudSyncStatus,
} from '../../shared/backend/client'

export const SYNC_AUTH_CHANGED_EVENT = 'trace-sync-auth-changed'

export type SyncAuthSession = ProtoCloudSyncStatus
export type SyncBackupItem = ProtoCloudSyncBackupItem
export type SyncBackupListResult = ProtoCloudSyncBackupListResult
export type SyncBackupUploadResult = ProtoCloudSyncBackupUploadResult
export type SyncBackupDownloadResult = ProtoCloudSyncBackupDownloadResult
export type SyncBackupRestoreResult = ProtoCloudSyncBackupRestoreResult

let cachedSession: SyncAuthSession | null = null

interface LoginInput {
  serverURL: string
  username: string
  password: string
  deviceName: string
}

export function loadSyncAuthSession(): SyncAuthSession | null {
  return cachedSession
}

export function isSyncSessionOnline(session: SyncAuthSession | null): boolean {
  return Boolean(session?.online && session?.authorized && session.authState !== 'invalid')
}

export async function fetchSyncAuthSession(): Promise<SyncAuthSession | null> {
  const status = await getCloudSyncStatus()
  const session = status.configured || status.authorized ? status : null
  notify(session)
  return session
}

export async function loginAndBindSyncServer(input: LoginInput): Promise<SyncAuthSession> {
  const status = await loginBindCloudSync(input)
  notify(status)
  return status
}

export async function heartbeatSyncServer(_session: SyncAuthSession): Promise<SyncAuthSession> {
  const status = await refreshCloudSyncStatus()
  notify(status)
  return status
}

export async function logoutSyncServer(_session: SyncAuthSession | null) {
  const status = await logoutCloudSync()
  notify(status.configured || status.authorized ? status : null)
}

export async function listSyncBackups(): Promise<SyncBackupListResult> {
  return listCloudSyncBackups({ page: 1, pageSize: 20, status: 'ready' })
}

export async function uploadFullSyncBackup(): Promise<SyncBackupUploadResult> {
  return uploadCloudSyncFullBackup({})
}

export async function downloadSyncBackup(backupId: string): Promise<SyncBackupDownloadResult> {
  return downloadCloudSyncBackup({ backupId })
}

export async function restoreSyncBackup(backupId: string, resetFirst = false): Promise<SyncBackupRestoreResult> {
  return restoreCloudSyncBackup({ backupId, resetFirst })
}

export async function deleteSyncBackup(backupId: string): Promise<void> {
  await deleteCloudSyncBackup({ backupId })
}

function notify(session: SyncAuthSession | null) {
  cachedSession = session
  window.dispatchEvent(new CustomEvent(SYNC_AUTH_CHANGED_EVENT, { detail: session }))
}
