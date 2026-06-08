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
  onCloudSyncBackupProgress,
  type ProtoCloudSyncBackupItem,
  type ProtoCloudSyncBackupListInput,
  type ProtoCloudSyncBackupListResult,
  type ProtoCloudSyncBackupProgress,
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
export type SyncBackupProgress = ProtoCloudSyncBackupProgress

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

export function formatSyncUserDisplayName(session: SyncAuthSession | null, fallback = 'Admin'): string {
  const username = session?.user?.username?.trim() || ''
  const nickname = session?.user?.nickname?.trim() || ''
  if (username && nickname && nickname !== username) {
    return `${username}-${nickname}`
  }
  return username || nickname || fallback
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

export async function listSyncBackups(input: ProtoCloudSyncBackupListInput = {}): Promise<SyncBackupListResult> {
  return listCloudSyncBackups({ page: 1, pageSize: 20, status: 'ready', ...input })
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

export function onSyncBackupProgress(callback: (progress: SyncBackupProgress) => void): () => void {
  return onCloudSyncBackupProgress(callback)
}

function notify(session: SyncAuthSession | null) {
  cachedSession = session
  window.dispatchEvent(new CustomEvent(SYNC_AUTH_CHANGED_EVENT, { detail: session }))
}
