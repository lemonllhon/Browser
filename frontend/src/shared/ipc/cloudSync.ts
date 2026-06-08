import {
  METHOD_CLOUD_SYNC_BACKUP_DELETE,
  METHOD_CLOUD_SYNC_BACKUP_DOWNLOAD,
  METHOD_CLOUD_SYNC_BACKUP_LIST,
  METHOD_CLOUD_SYNC_BACKUP_RESTORE,
  METHOD_CLOUD_SYNC_BACKUP_UPLOAD,
  METHOD_CLOUD_SYNC_ENCRYPTION_DISABLE,
  METHOD_CLOUD_SYNC_ENCRYPTION_SETUP,
  METHOD_CLOUD_SYNC_ENCRYPTION_UNLOCK,
  METHOD_CLOUD_SYNC_LOGIN_BIND,
  METHOD_CLOUD_SYNC_LOGOUT,
  METHOD_CLOUD_SYNC_OAUTH_START,
  METHOD_CLOUD_SYNC_PROFILE_BACKUP_PREPARE_RESTORE,
  METHOD_CLOUD_SYNC_PROFILE_BACKUP_UPLOAD,
  METHOD_CLOUD_SYNC_PROFILE_TRANSFER_SHARE_CREATE,
  METHOD_CLOUD_SYNC_PROFILE_TRANSFER_SHARE_PREPARE,
  METHOD_CLOUD_SYNC_PROFILE_TRANSFER_SHARE_RESOLVE,
  METHOD_CLOUD_SYNC_REFRESH_STATUS,
  METHOD_CLOUD_SYNC_STATUS_GET,
} from './envelope'
import {
  WireType,
  concatBytes,
  decodeString,
  encodeStringField,
  readFields,
} from './protobuf'
import { ProtoIpcClient } from './transport'
import { decodeBackupProgress, type ProtoBackupProgress } from './app'
import type { ProtoBrowserProfileBackupActionResult, ProtoBrowserProfileBackupExportInput } from './browserProfileBackup'

const cloudSyncProtoClient = new ProtoIpcClient()

export type ProtoCloudSyncUser = {
  id: string
  username: string
  nickname: string
  role: string
}

export type ProtoCloudSyncDevice = {
  id: string
  userId: string
  workspaceId: string
  deviceName: string
  deviceFingerprint?: string
  deviceFingerprintDigest?: string
  os: string
  appVersion: string
  clientVersion: string
  bindingId: string
  status: string
  online: boolean
  lastSeenAt: string
  revokedAt: string
  createdAt: string
  updatedAt: string
}

export type ProtoCloudSyncStatus = {
  configured: boolean
  authorized: boolean
  authState: string
  serverURL: string
  serverInstanceId: string
  expiresAt: string
  connectedAt: string
  lastHeartbeatAt: string
  serverTime: string
  online: boolean
  user: ProtoCloudSyncUser
  device: ProtoCloudSyncDevice
  encryption: ProtoCloudSyncEncryptionStatus
  error?: string
}

export type ProtoCloudSyncEncryptionStatus = {
  configured: boolean
  enabled: boolean
  unlocked: boolean
  algorithm: string
  kdf: string
  updatedAt: string
}

export type ProtoCloudSyncLoginBindInput = {
  serverURL: string
  username: string
  password: string
  deviceName: string
}

export type ProtoCloudSyncOAuthStartInput = {
  serverURL: string
  deviceName: string
}

export type ProtoCloudSyncEncryptionPasswordInput = {
  password: string
}

export type ProtoCloudSyncBackupItem = {
  id: string
  userId: string
  workspaceId: string
  deviceId: string
  backupType: string
  packageFormat: string
  packageVersion: string
  name: string
  description: string
  appName: string
  appVersion: string
  sourceOs: string
  sizeBytes: number
  checksumSha256: string
  encrypted: boolean
  encryptionAlg: string
  status: string
  createdAt: string
  updatedAt: string
  deletedAt: string
}

export type ProtoCloudSyncBackupListInput = {
  page?: number
  pageSize?: number
  backupType?: string
  status?: string
}

export type ProtoCloudSyncBackupListResult = {
  list: ProtoCloudSyncBackupItem[]
  total: number
}

export type ProtoCloudSyncBackupUploadInput = {
  name?: string
  description?: string
}

export type ProtoCloudSyncBackupUploadResult = {
  backup: ProtoCloudSyncBackupItem
  localPath: string
  includedEntries: number
  skippedEntries: number
  fileCount: number
  message: string
}

export type ProtoCloudSyncBackupDownloadInput = {
  backupId: string
}

export type ProtoCloudSyncBackupDownloadResult = {
  backup: ProtoCloudSyncBackupItem
  localPath: string
  message: string
}

export type ProtoCloudSyncBackupRestoreInput = {
  backupId: string
  resetFirst?: boolean
}

export type ProtoCloudSyncBackupRestoreResult = {
  backup: ProtoCloudSyncBackupItem
  downloadedPath: string
  restorePointPath: string
  imported: number
  skipped: number
  conflicts: number
  partial: boolean
  message: string
}

export type ProtoCloudSyncBackupDeleteInput = {
  backupId: string
}

export type ProtoCloudSyncBackupProgress = ProtoBackupProgress

export type ProtoCloudSyncProfileBackupUploadResult = {
  backup: ProtoCloudSyncBackupItem
  localPath: string
  profileBackup: ProtoBrowserProfileBackupActionResult
  message: string
}

export type ProtoCloudSyncProfileBackupPrepareRestoreInput = {
  backupId: string
}

export type ProtoCloudSyncBackupShareItem = {
  id: string
  backupId: string
  userId: string
  workspaceId: string
  deviceId: string
  codeHint: string
  note: string
  status: string
  effectiveStatus: string
  expiresAt: string
  usedAt: string
  usedBy: string
  usedIp: string
  revokedAt: string
  revokedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string
  backup: ProtoCloudSyncBackupItem
}

export type ProtoCloudSyncProfileTransferShareCreateInput = {
  profileIds: string[]
  includeCookies: boolean
  includePlainCookiesWhenRunning: boolean
  expiresInHours?: number
  note?: string
}

export type ProtoCloudSyncProfileTransferShareCreateResult = {
  share: ProtoCloudSyncBackupShareItem
  backup: ProtoCloudSyncBackupItem
  code: string
  shareUrl: string
  directUrl: string
  expiresAt: string
  localPath: string
  profileBackup: ProtoBrowserProfileBackupActionResult
  message: string
}

export type ProtoCloudSyncProfileTransferShareResolveInput = {
  shareText: string
  serverURL?: string
}

export type ProtoCloudSyncProfileTransferShareResolveResult = {
  share: ProtoCloudSyncBackupShareItem
  backup: ProtoCloudSyncBackupItem
  serverURL: string
  code: string
  serverTime: string
  message: string
}

export type ProtoCloudSyncProfileTransferSharePrepareInput = {
  shareText: string
  serverURL?: string
}

export async function getCloudSyncStatus(): Promise<ProtoCloudSyncStatus> {
  const payload = await cloudSyncProtoClient.request(METHOD_CLOUD_SYNC_STATUS_GET, new Uint8Array())
  return decodeCloudSyncStatus(payload)
}

export async function loginBindCloudSync(input: ProtoCloudSyncLoginBindInput): Promise<ProtoCloudSyncStatus> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_LOGIN_BIND,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    30000,
  )
  return decodeCloudSyncStatus(payload)
}

export async function startCloudSyncOAuth(input: ProtoCloudSyncOAuthStartInput): Promise<ProtoCloudSyncStatus> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_OAUTH_START,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    300000,
  )
  return decodeCloudSyncStatus(payload)
}

export async function refreshCloudSyncStatus(): Promise<ProtoCloudSyncStatus> {
  const payload = await cloudSyncProtoClient.request(METHOD_CLOUD_SYNC_REFRESH_STATUS, new Uint8Array(), 20000)
  return decodeCloudSyncStatus(payload)
}

export async function logoutCloudSync(): Promise<ProtoCloudSyncStatus> {
  const payload = await cloudSyncProtoClient.request(METHOD_CLOUD_SYNC_LOGOUT, new Uint8Array(), 20000)
  return decodeCloudSyncStatus(payload)
}

export async function setupCloudSyncEncryption(input: ProtoCloudSyncEncryptionPasswordInput): Promise<ProtoCloudSyncEncryptionStatus> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_ENCRYPTION_SETUP,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    30000,
  )
  return decodeCloudSyncJSONMessage<ProtoCloudSyncEncryptionStatus>(payload)
}

export async function unlockCloudSyncEncryption(input: ProtoCloudSyncEncryptionPasswordInput): Promise<ProtoCloudSyncEncryptionStatus> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_ENCRYPTION_UNLOCK,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    30000,
  )
  return decodeCloudSyncJSONMessage<ProtoCloudSyncEncryptionStatus>(payload)
}

export async function disableCloudSyncEncryption(): Promise<ProtoCloudSyncEncryptionStatus> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_ENCRYPTION_DISABLE,
    new Uint8Array(),
    20000,
  )
  return decodeCloudSyncJSONMessage<ProtoCloudSyncEncryptionStatus>(payload)
}

export async function listCloudSyncBackups(input: ProtoCloudSyncBackupListInput = {}): Promise<ProtoCloudSyncBackupListResult> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_BACKUP_LIST,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    30000,
  )
  return {
    list: [],
    total: 0,
    ...decodeCloudSyncJSONMessage<Partial<ProtoCloudSyncBackupListResult>>(payload),
  } as ProtoCloudSyncBackupListResult
}

export async function uploadCloudSyncFullBackup(input: ProtoCloudSyncBackupUploadInput = {}): Promise<ProtoCloudSyncBackupUploadResult> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_BACKUP_UPLOAD,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    600000,
  )
  return decodeCloudSyncJSONMessage<ProtoCloudSyncBackupUploadResult>(payload)
}

export async function downloadCloudSyncBackup(input: ProtoCloudSyncBackupDownloadInput): Promise<ProtoCloudSyncBackupDownloadResult> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_BACKUP_DOWNLOAD,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    300000,
  )
  return decodeCloudSyncJSONMessage<ProtoCloudSyncBackupDownloadResult>(payload)
}

export async function restoreCloudSyncBackup(input: ProtoCloudSyncBackupRestoreInput): Promise<ProtoCloudSyncBackupRestoreResult> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_BACKUP_RESTORE,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    600000,
  )
  return decodeCloudSyncJSONMessage<ProtoCloudSyncBackupRestoreResult>(payload)
}

export async function deleteCloudSyncBackup(input: ProtoCloudSyncBackupDeleteInput): Promise<void> {
  await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_BACKUP_DELETE,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    30000,
  )
}

export async function uploadCloudSyncProfileBackup(input: ProtoBrowserProfileBackupExportInput): Promise<ProtoCloudSyncProfileBackupUploadResult> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_PROFILE_BACKUP_UPLOAD,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    600000,
  )
  return decodeCloudSyncJSONMessage<ProtoCloudSyncProfileBackupUploadResult>(payload)
}

export async function prepareCloudSyncProfileBackupRestore(input: ProtoCloudSyncProfileBackupPrepareRestoreInput): Promise<ProtoBrowserProfileBackupActionResult> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_PROFILE_BACKUP_PREPARE_RESTORE,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    300000,
  )
  return decodeCloudSyncJSONMessage<ProtoBrowserProfileBackupActionResult>(payload)
}

export async function createCloudSyncProfileTransferShare(input: ProtoCloudSyncProfileTransferShareCreateInput): Promise<ProtoCloudSyncProfileTransferShareCreateResult> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_PROFILE_TRANSFER_SHARE_CREATE,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    600000,
  )
  return decodeCloudSyncJSONMessage<ProtoCloudSyncProfileTransferShareCreateResult>(payload)
}

export async function resolveCloudSyncProfileTransferShare(input: ProtoCloudSyncProfileTransferShareResolveInput): Promise<ProtoCloudSyncProfileTransferShareResolveResult> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_PROFILE_TRANSFER_SHARE_RESOLVE,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    45000,
  )
  return decodeCloudSyncJSONMessage<ProtoCloudSyncProfileTransferShareResolveResult>(payload)
}

export async function prepareCloudSyncProfileTransferShareRestore(input: ProtoCloudSyncProfileTransferSharePrepareInput): Promise<ProtoBrowserProfileBackupActionResult> {
  const payload = await cloudSyncProtoClient.request(
    METHOD_CLOUD_SYNC_PROFILE_TRANSFER_SHARE_PREPARE,
    encodeCloudSyncJSONMessage(JSON.stringify(input)),
    300000,
  )
  return decodeCloudSyncJSONMessage<ProtoBrowserProfileBackupActionResult>(payload)
}

export function onCloudSyncBackupProgress(callback: (progress: ProtoCloudSyncBackupProgress) => void): () => void {
  return cloudSyncProtoClient.onEvent('cloud-sync:backup:progress', event => callback(decodeBackupProgress(event.payload)))
}

function encodeCloudSyncJSONMessage(json: string): Uint8Array {
  return concatBytes([encodeStringField(1, json)])
}

function decodeCloudSyncStatus(payload: Uint8Array): ProtoCloudSyncStatus {
  const parsed = decodeCloudSyncJSONMessage<Partial<ProtoCloudSyncStatus>>(payload)
  if (!parsed || Object.keys(parsed).length === 0) {
    return emptyCloudSyncStatus()
  }
  return {
    ...emptyCloudSyncStatus(),
    ...parsed,
    user: {
      ...emptyCloudSyncStatus().user,
      ...(parsed.user || {}),
    },
    device: {
      ...emptyCloudSyncStatus().device,
      ...(parsed.device || {}),
    },
    encryption: {
      ...emptyCloudSyncStatus().encryption,
      ...(parsed.encryption || {}),
    },
  }
}

function decodeCloudSyncJSONMessage<T>(payload: Uint8Array): T {
  let json = ''
  for (const field of readFields(payload)) {
    if (field.fieldNumber === 1 && field.wireType === WireType.LengthDelimited) {
      json = decodeString(field.value)
    }
  }
  if (!json) {
    return {} as T
  }
  return JSON.parse(json) as T
}

function emptyCloudSyncStatus(): ProtoCloudSyncStatus {
  return {
    configured: false,
    authorized: false,
    authState: 'disconnected',
    serverURL: '',
    serverInstanceId: '',
    expiresAt: '',
    connectedAt: '',
    lastHeartbeatAt: '',
    serverTime: '',
    online: false,
    user: {
      id: '',
      username: '',
      nickname: '',
      role: '',
    },
    device: {
      id: '',
      userId: '',
      workspaceId: '',
      deviceName: '',
      deviceFingerprint: '',
      deviceFingerprintDigest: '',
      os: '',
      appVersion: '',
      clientVersion: '',
      bindingId: '',
      status: '',
      online: false,
      lastSeenAt: '',
      revokedAt: '',
      createdAt: '',
      updatedAt: '',
    },
    encryption: {
      configured: false,
      enabled: false,
      unlocked: false,
      algorithm: 'AES-256-GCM+PBKDF2-SHA256',
      kdf: 'PBKDF2-SHA256',
      updatedAt: '',
    },
  }
}
