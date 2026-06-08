import {
  Github,
  Mail,
  Globe,
  BookOpen,
  MessageSquare,
  Calendar,
  MapPin,
  Coffee,
  Terminal,
  ExternalLink,
  Link2,
  LogIn,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  Wifi,
  WifiOff,
  UploadCloud,
  Download,
  RotateCcw,
  Trash2,
  Archive,
  KeyRound,
} from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, Input, Modal, Progress, toast } from '../../shared/components'
import { createDefaultProfilePageData, loadProfilePageData } from './api'
import {
  SYNC_AUTH_CHANGED_EVENT,
  fetchSyncAuthSession,
  formatSyncUserDisplayName,
  heartbeatSyncServer,
  isSyncSessionOnline,
  listSyncBackups,
  loadSyncAuthSession,
  loginAndBindSyncServer,
  logoutSyncServer,
  startOAuthSyncServer,
  uploadFullSyncBackup,
  downloadSyncBackup,
  restoreSyncBackup,
  deleteSyncBackup,
  onSyncBackupProgress,
  setupSyncEncryption,
  unlockSyncEncryption,
  type SyncBackupItem,
  type SyncBackupProgress,
  type SyncAuthSession,
} from './syncAuth'
import type { IconKey, ProfilePageData } from './types'

const ICON_MAP = {
  'book-open': BookOpen,
  globe: Globe,
  'message-square': MessageSquare,
  github: Github,
  mail: Mail,
  'external-link': ExternalLink,
}

const CHANNEL_ICON_CLASS: Partial<Record<IconKey, string>> = {
  'book-open': 'text-[#1e80ff]',
  globe: 'text-[#0f766e]',
  'message-square': 'text-[#16a34a]',
  github: 'text-[var(--color-text-primary)]',
  mail: 'text-[var(--color-accent)]',
}

const SYNC_ENCRYPTION_MIN_PASSWORD_LENGTH = 8

export function ProfilePage() {
  const navigate = useNavigate()
  const [clickCount, setClickCount] = useState(0)
  const [pageData, setPageData] = useState<ProfilePageData>(() => createDefaultProfilePageData())
  const [syncSession, setSyncSession] = useState<SyncAuthSession | null>(() => loadSyncAuthSession())
  const [syncOAuthOpen, setSyncOAuthOpen] = useState(false)
  const [syncOAuthLoading, setSyncOAuthLoading] = useState(false)
  const [syncLoginOpen, setSyncLoginOpen] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncRefreshLoading, setSyncRefreshLoading] = useState(false)
  const [syncBackups, setSyncBackups] = useState<SyncBackupItem[]>([])
  const [syncBackupLoading, setSyncBackupLoading] = useState(false)
  const [syncBackupAction, setSyncBackupAction] = useState('')
  const [syncBackupProgress, setSyncBackupProgress] = useState<SyncBackupProgress | null>(null)
  const [syncEncryptionOpen, setSyncEncryptionOpen] = useState(false)
  const [syncEncryptionMode, setSyncEncryptionMode] = useState<'setup' | 'unlock'>('setup')
  const [syncEncryptionLoading, setSyncEncryptionLoading] = useState(false)
  const [syncEncryptionForm, setSyncEncryptionForm] = useState({
    password: '',
    confirm: '',
  })
  const [syncForm, setSyncForm] = useState({
    serverURL: syncSession?.serverURL || 'http://127.0.0.1:8000',
    username: syncSession?.user.username || 'admin',
    password: '',
    deviceName: syncSession?.device.deviceName || 'Trace Browser Windows',
  })

  useEffect(() => {
    let active = true

    const syncProfile = async () => {
      const data = await loadProfilePageData()
      if (!active) return
      setPageData(data)
    }
    const syncCloudStatus = async () => {
      try {
        const status = await fetchSyncAuthSession()
        if (!active) return
        setSyncSession(status)
      } catch {
        if (!active) return
        setSyncSession(null)
      }
    }

    void syncProfile()
    void syncCloudStatus()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const reload = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as SyncAuthSession | null : loadSyncAuthSession()
      setSyncSession(detail)
    }
    window.addEventListener(SYNC_AUTH_CHANGED_EVENT, reload)
    return () => {
      window.removeEventListener(SYNC_AUTH_CHANGED_EVENT, reload)
    }
  }, [])

  useEffect(() => {
    if (!syncSession?.authorized) return
    let cancelled = false
    const refresh = async () => {
      try {
        const next = await heartbeatSyncServer(syncSession)
        if (!cancelled) {
          setSyncSession(next)
        }
      } catch {
        if (!cancelled) {
          setSyncSession(prev => prev ? { ...prev, online: false } : prev)
        }
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 30000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [syncSession?.serverURL, syncSession?.authorized])

  useEffect(() => {
    if (!syncSession?.authorized) {
      setSyncBackups([])
      return
    }
    void handleSyncBackupRefresh(false)
  }, [syncSession?.authorized, syncSession?.serverURL])

  useEffect(() => {
    return onSyncBackupProgress(progress => {
      if (!progress || typeof progress !== 'object') return
      if (progress.phase === 'cancelled') {
        setSyncBackupProgress(null)
        return
      }
      setSyncBackupProgress(normalizeSyncBackupProgress(progress))
    })
  }, [])

  const handleAuthorClick = () => {
    const newCount = clickCount + 1
    setClickCount(newCount)
    if (newCount >= 5) {
      navigate('/admin/keygen')
      setClickCount(0)
    }
  }

  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleSyncLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSyncLoading(true)
    try {
      const session = await loginAndBindSyncServer(syncForm)
      setSyncSession(session)
      setSyncLoginOpen(false)
      setSyncForm(prev => ({ ...prev, password: '' }))
      toast.success('授权登录成功，当前设备已在线')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '授权登录失败')
    } finally {
      setSyncLoading(false)
    }
  }

  const handleSyncOAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSyncOAuthLoading(true)
    try {
      const session = await startOAuthSyncServer({
        serverURL: syncForm.serverURL,
        deviceName: syncForm.deviceName,
      })
      setSyncSession(session)
      setSyncOAuthOpen(false)
      toast.success('OAuth 授权成功，当前设备已在线')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'OAuth 授权失败')
    } finally {
      setSyncOAuthLoading(false)
    }
  }

  const handleSyncRefresh = async () => {
    if (!syncSession) return
    setSyncRefreshLoading(true)
    try {
      const session = await heartbeatSyncServer(syncSession)
      setSyncSession(session)
      toast.success('在线状态已刷新')
    } catch (error) {
      setSyncSession(prev => prev ? { ...prev, online: false } : prev)
      toast.error(error instanceof Error ? error.message : '刷新在线状态失败')
    } finally {
      setSyncRefreshLoading(false)
    }
  }

  const handleSyncLogout = async () => {
    await logoutSyncServer(syncSession)
    setSyncSession(null)
    setSyncBackups([])
    toast.success('已退出授权登录')
  }

  const handleSyncBackupRefresh = async (notify = true) => {
    if (!syncSession?.authorized) return
    setSyncBackupLoading(true)
    try {
      const result = await listSyncBackups({ backupType: 'full_config' })
      setSyncBackups(result.list || [])
      if (notify) toast.success('云端备份列表已刷新')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '获取云端备份列表失败')
    } finally {
      setSyncBackupLoading(false)
    }
  }

  const handleSyncBackupUpload = async () => {
    if (!syncSession?.authorized) return
    if (!isSyncEncryptionReady(syncSession)) {
      openSyncEncryption(syncSession.encryption?.configured ? 'unlock' : 'setup')
      toast.error(syncSession.encryption?.configured ? '请先解锁同步加密密码' : '请先设置同步加密密码')
      return
    }
    setSyncBackupAction('upload')
    setSyncBackupProgress({ phase: 'starting', progress: 0, message: '准备上传全量云端备份...' })
    try {
      const result = await uploadFullSyncBackup()
      toast.success(result.message || '云端备份上传完成')
      await handleSyncBackupRefresh(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传云端备份失败')
    } finally {
      setSyncBackupAction('')
    }
  }

  const handleSyncBackupDownload = async (backup: SyncBackupItem) => {
    if (backup.encrypted && !syncSession?.encryption?.unlocked) {
      openSyncEncryption('unlock')
      toast.error('请先解锁同步加密密码')
      return
    }
    setSyncBackupAction(`download:${backup.id}`)
    setSyncBackupProgress({ phase: 'starting', progress: 0, message: '准备下载云端备份...' })
    try {
      const result = await downloadSyncBackup(backup.id)
      toast.success(`已下载到 ${result.localPath}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '下载云端备份失败')
    } finally {
      setSyncBackupAction('')
    }
  }

  const handleSyncBackupRestore = async (backup: SyncBackupItem) => {
    if (backup.encrypted && !syncSession?.encryption?.unlocked) {
      openSyncEncryption('unlock')
      toast.error('请先解锁同步加密密码')
      return
    }
    if (!window.confirm(`确定从云端备份「${backup.name || backup.id}」恢复吗？恢复前会自动创建本地恢复点。`)) {
      return
    }
    setSyncBackupAction(`restore:${backup.id}`)
    setSyncBackupProgress({ phase: 'starting', progress: 0, message: '准备从云端恢复全量备份...' })
    try {
      const result = await restoreSyncBackup(backup.id, false)
      toast.success(result.message || '云端备份恢复完成')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '恢复云端备份失败')
    } finally {
      setSyncBackupAction('')
    }
  }

  const handleSyncBackupDelete = async (backup: SyncBackupItem) => {
    if (!window.confirm(`确定删除云端备份「${backup.name || backup.id}」吗？`)) {
      return
    }
    setSyncBackupAction(`delete:${backup.id}`)
    try {
      await deleteSyncBackup(backup.id)
      toast.success('云端备份已删除')
      await handleSyncBackupRefresh(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除云端备份失败')
    } finally {
      setSyncBackupAction('')
    }
  }

  const openSyncEncryption = (mode: 'setup' | 'unlock') => {
    setSyncEncryptionMode(mode)
    setSyncEncryptionForm({ password: '', confirm: '' })
    setSyncEncryptionOpen(true)
  }

  const handleSyncEncryptionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const password = syncEncryptionForm.password.trim()
    const confirmPassword = syncEncryptionForm.confirm.trim()
    if (!password) {
      toast.error('请填写同步加密密码')
      return
    }
    if (password.length < SYNC_ENCRYPTION_MIN_PASSWORD_LENGTH) {
      toast.error(`同步加密密码至少需要 ${SYNC_ENCRYPTION_MIN_PASSWORD_LENGTH} 个字符`)
      return
    }
    if (syncEncryptionMode === 'setup' && !confirmPassword) {
      toast.error('请再次输入同步加密密码')
      return
    }
    if (syncEncryptionMode === 'setup' && password !== confirmPassword) {
      toast.error('两次输入的同步加密密码不一致')
      return
    }
    setSyncEncryptionLoading(true)
    try {
      const encryption = syncEncryptionMode === 'setup'
        ? await setupSyncEncryption({ password })
        : await unlockSyncEncryption({ password })
      setSyncSession(prev => prev ? { ...prev, encryption } : prev)
      setSyncEncryptionOpen(false)
      toast.success(syncEncryptionMode === 'setup' ? '同步加密已启用' : '同步加密已解锁')
    } catch (error) {
      toast.error(formatSyncEncryptionError(error, '同步加密操作失败'))
    } finally {
      setSyncEncryptionLoading(false)
    }
  }

  const authorInfo = pageData.author
  const projectInfo = pageData.project
  const syncOnline = isSyncSessionOnline(syncSession)
  const syncUserDisplayName = formatSyncUserDisplayName(syncSession, '未登录')
  const syncEncryption = syncSession?.encryption
  const syncEncryptionReady = isSyncEncryptionReady(syncSession)
  const syncEncryptionText = syncEncryptionReady
    ? '已启用并解锁'
    : syncEncryption?.configured
      ? '已启用，待解锁'
      : '未设置'
  const syncBackupProgressStatus = syncBackupProgress?.phase === 'error'
    ? 'error'
    : syncBackupProgress?.phase === 'done'
      ? 'success'
      : 'normal'
  const metaItems = [
    {
      label: authorInfo.location,
      icon: MapPin,
    },
    {
      label: `加入于 ${authorInfo.joinDate}`,
      icon: Calendar,
    },
  ].filter((item) => item.label.trim())

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <Card padding="lg" className="rounded-[26px]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[20px] bg-[#1f2d46] text-[34px] font-bold tracking-[0.08em] text-white shadow-sm">
              {authorInfo.initial}
            </div>

            <div className="min-w-0 space-y-4">
              <div className="space-y-1">
                <h1
                  className="cursor-pointer select-none text-[34px] font-bold leading-none tracking-tight text-[var(--color-text-primary)] sm:text-[38px]"
                  onClick={handleAuthorClick}
                  title={clickCount > 0 ? `再点 ${5 - clickCount} 次进入开发者模式` : ''}
                >
                  {authorInfo.name}
                </h1>
                <p className="text-base text-[var(--color-text-muted)]">{authorInfo.title}</p>
              </div>

              <p className="max-w-3xl text-[15px] leading-8 text-[var(--color-text-secondary)]">
                {authorInfo.bio}
              </p>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-[var(--color-text-muted)]">
                {metaItems.map(({ label, icon: Icon }) => (
                  <span key={label} className="inline-flex items-center gap-1.5">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                ))}
                {authorInfo.website ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                    onClick={() => openExternal(authorInfo.website)}
                  >
                    <Globe className="h-4 w-4" />
                    {stripProtocol(authorInfo.website)}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 lg:justify-end">
            {authorInfo.github ? (
              <Button
                variant="ghost"
                className="h-11 rounded-2xl border border-transparent px-4 text-[var(--color-text-primary)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-bg-muted)]"
                onClick={() => openExternal(authorInfo.github)}
              >
                <Github className="h-4 w-4" />
                GitHub
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card padding="lg" className="rounded-[24px]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-bg-muted)]">
                <ShieldCheck className="h-5 w-5 text-[var(--color-accent)]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">云端同步授权</h2>
                <p className="text-sm text-[var(--color-text-muted)]">账号密码登录同步服务，并登记当前桌面设备。</p>
              </div>
              <Badge variant={syncOnline ? 'success' : syncSession ? 'warning' : 'default'} dot>
                {syncOnline ? '在线' : syncSession ? '离线' : '未连接'}
              </Badge>
            </div>

            <div className="grid gap-3 text-sm text-[var(--color-text-secondary)] md:grid-cols-3">
              <div className="min-w-0 rounded-xl bg-[var(--color-bg-muted)] px-4 py-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <Server className="h-3.5 w-3.5" />
                  同步服务
                </div>
                <p className="truncate font-medium" title={syncSession?.serverURL || '未配置'}>
                  {syncSession?.serverURL || '未配置'}
                </p>
              </div>
              <div className="min-w-0 rounded-xl bg-[var(--color-bg-muted)] px-4 py-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <Link2 className="h-3.5 w-3.5" />
                  授权账号
                </div>
                <p className="truncate font-medium" title={syncUserDisplayName}>
                  {syncUserDisplayName}
                </p>
              </div>
              <div className="min-w-0 rounded-xl bg-[var(--color-bg-muted)] px-4 py-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  {syncOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  当前设备
                </div>
                <p className="truncate font-medium" title={syncSession?.device.deviceFingerprint || '未绑定'}>
                  {syncSession?.device.deviceName || '未绑定'}
                </p>
              </div>
              <div className="min-w-0 rounded-xl bg-[var(--color-bg-muted)] px-4 py-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <Link2 className="h-3.5 w-3.5" />
                  设备 ID
                </div>
                <p className="truncate font-medium" title={syncSession?.device.id || '未绑定'}>
                  {syncSession?.device.id || '未绑定'}
                </p>
              </div>
              <div className="min-w-0 rounded-xl bg-[var(--color-bg-muted)] px-4 py-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <Link2 className="h-3.5 w-3.5" />
                  绑定 ID
                </div>
                <p className="truncate font-medium" title={syncSession?.device.bindingId || '未绑定'}>
                  {syncSession?.device.bindingId || '未绑定'}
                </p>
              </div>
              <div className="min-w-0 rounded-xl bg-[var(--color-bg-muted)] px-4 py-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <RefreshCw className="h-3.5 w-3.5" />
                  最后心跳
                </div>
                <p className="truncate font-medium" title={syncSession?.lastHeartbeatAt || '暂无'}>
                  {syncSession?.lastHeartbeatAt || '暂无'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button
              variant={syncSession ? 'secondary' : 'primary'}
              onClick={() => {
                setSyncForm(prev => ({
                  ...prev,
                  serverURL: syncSession?.serverURL || prev.serverURL,
                  deviceName: syncSession?.device.deviceName || prev.deviceName,
                }))
                setSyncOAuthOpen(true)
              }}
            >
              <LogIn className="h-4 w-4" />
              {syncSession ? '重新授权' : '浏览器授权'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSyncForm(prev => ({
                  ...prev,
                  serverURL: syncSession?.serverURL || prev.serverURL,
                  username: syncSession?.user.username || prev.username,
                  deviceName: syncSession?.device.deviceName || prev.deviceName,
                  password: '',
                }))
                setSyncLoginOpen(true)
              }}
            >
              <ShieldCheck className="h-4 w-4" />
              调试登录
            </Button>
            <Button
              variant="secondary"
              onClick={handleSyncRefresh}
              loading={syncRefreshLoading}
              disabled={!syncSession}
            >
              <RefreshCw className="h-4 w-4" />
              刷新状态
            </Button>
            <Button
              variant="ghost"
              onClick={handleSyncLogout}
              disabled={!syncSession}
            >
              <LogOut className="h-4 w-4" />
              退出授权
            </Button>
          </div>
        </div>
      </Card>

      <Card padding="lg" className="rounded-[24px]">
        <div className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-bg-muted)]">
                  <Archive className="h-5 w-5 text-[var(--color-accent)]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">云端备份</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">手动上传全量配置 ZIP，并从云端下载或恢复。</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--color-bg-muted)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
                <KeyRound className="h-3.5 w-3.5" />
                <span>正式版客户端加密</span>
                <Badge variant={syncEncryptionReady ? 'success' : syncEncryption?.configured ? 'warning' : 'default'}>
                  {syncEncryptionText}
                </Badge>
                {syncEncryption?.algorithm ? <span>{syncEncryption.algorithm}</span> : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button
                variant="secondary"
                onClick={() => openSyncEncryption(syncEncryption?.configured ? 'unlock' : 'setup')}
                disabled={!syncSession?.authorized || syncEncryptionReady || Boolean(syncBackupAction)}
              >
                <KeyRound className="h-4 w-4" />
                {syncEncryptionReady ? '已解锁' : syncEncryption?.configured ? '解锁加密' : '设置加密'}
              </Button>
              <Button
                variant="primary"
                onClick={handleSyncBackupUpload}
                loading={syncBackupAction === 'upload'}
                disabled={!syncSession?.authorized || !syncEncryptionReady || Boolean(syncBackupAction)}
              >
                <UploadCloud className="h-4 w-4" />
                上传全量备份
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleSyncBackupRefresh(true)}
                loading={syncBackupLoading}
                disabled={!syncSession?.authorized || Boolean(syncBackupAction)}
              >
                <RefreshCw className="h-4 w-4" />
                刷新列表
              </Button>
            </div>
          </div>

          {syncBackupProgress && (
            <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-muted)] px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-[var(--color-text-secondary)]">{syncBackupProgress.message || '正在处理云端备份...'}</span>
                <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{syncBackupProgress.progress}%</span>
              </div>
              <Progress percent={syncBackupProgress.progress} size="sm" status={syncBackupProgressStatus} />
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)]">
            {syncBackups.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                {syncSession?.authorized ? '暂无云端备份' : '授权登录后可查看云端备份'}
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border-muted)]">
                {syncBackups.map((backup) => (
                  <div key={backup.id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-[var(--color-text-primary)]" title={backup.name || backup.id}>
                          {backup.name || backup.id}
                        </span>
                        <Badge variant={backup.encrypted ? 'success' : 'warning'}>
                          {backup.encrypted ? '已加密' : '未加密'}
                        </Badge>
                        <Badge>{backupTypeText(backup.backupType)}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
                        <span>{formatBytes(backup.sizeBytes)}</span>
                        <span>{formatBackupTime(backup.createdAt)}</span>
                        <span className="max-w-[260px] truncate" title={backup.id}>ID {backup.id}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSyncBackupDownload(backup)}
                        loading={syncBackupAction === `download:${backup.id}`}
                        disabled={Boolean(syncBackupAction) || (backup.encrypted && !syncEncryptionReady)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        下载
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSyncBackupRestore(backup)}
                        loading={syncBackupAction === `restore:${backup.id}`}
                        disabled={Boolean(syncBackupAction) || (backup.encrypted && !syncEncryptionReady)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        恢复
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSyncBackupDelete(backup)}
                        loading={syncBackupAction === `delete:${backup.id}`}
                        disabled={Boolean(syncBackupAction)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {authorInfo.channels.map((channel) => {
          const Icon = getIcon(channel.icon)
          const iconClassName = CHANNEL_ICON_CLASS[channel.icon || 'globe'] || 'text-[var(--color-text-primary)]'
          const content = (
            <Card
              className="h-full rounded-[22px] border-[var(--color-border-default)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-md)]"
              padding="lg"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-bg-muted)]">
                    <Icon className={`h-5 w-5 ${iconClassName}`} />
                  </div>
                  <div className="space-y-1 text-left">
                    <p className="text-[28px] font-bold leading-none text-[var(--color-text-primary)]">
                      {channel.name}
                    </p>
                    <p className="text-sm text-[var(--color-text-muted)]">{channel.description}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">{channel.detail}</p>
                  </div>
                </div>
                {channel.href ? <ExternalLink className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" /> : null}
              </div>
            </Card>
          )

          if (!channel.href) {
            return <div key={channel.name}>{content}</div>
          }

          return (
            <a
              key={channel.name}
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block h-full"
            >
              {content}
            </a>
          )
        })}
      </div>

      <Card
        title="技术栈"
        actions={<Terminal className="h-4 w-4 text-[var(--color-text-muted)]" />}
        className="rounded-[24px]"
        padding="lg"
      >
        <div className="flex flex-wrap gap-x-8 gap-y-4 text-[15px] font-semibold text-[var(--color-text-primary)]">
          {authorInfo.skills.map((skill) => (
            <span key={skill}>{skill}</span>
          ))}
        </div>
      </Card>

      <Card
        title="关于本项目"
        actions={<Coffee className="h-4 w-4 text-[var(--color-text-muted)]" />}
        className="rounded-[24px]"
        padding="lg"
      >
        <div className="space-y-4 text-[15px] leading-8 text-[var(--color-text-secondary)]">
          <p>
            <Badge className="mr-1 rounded-xl px-3 py-1">{projectInfo.introBadge}</Badge>
            {projectInfo.introText}
          </p>
          <div className="flex flex-wrap gap-2">
            {projectInfo.techStack.map((item) => (
              <Badge key={item} className="rounded-xl px-3 py-1">
                {item}
              </Badge>
            ))}
          </div>
          <p>{projectInfo.description}</p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {projectInfo.actions.map((action) => {
              const Icon = getIcon(action.icon)
              return (
                <Button
                  key={action.label}
                  variant="ghost"
                  className="h-10 rounded-xl border border-[var(--color-border-default)] px-3 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]"
                  onClick={() => openExternal(action.href)}
                >
                  <Icon className="h-4 w-4" />
                  {action.label}
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )
            })}
          </div>
        </div>
      </Card>

      <Modal
        open={syncOAuthOpen}
        onClose={() => !syncOAuthLoading && setSyncOAuthOpen(false)}
        title="OAuth 授权同步服务"
        width="520px"
      >
        <form className="space-y-4" onSubmit={handleSyncOAuth}>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[var(--color-text-secondary)]">服务地址</label>
            <Input
              value={syncForm.serverURL}
              onChange={(event) => setSyncForm(prev => ({ ...prev, serverURL: event.target.value }))}
              placeholder="http://127.0.0.1:8000"
              autoComplete="url"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[var(--color-text-secondary)]">设备名称</label>
            <Input
              value={syncForm.deviceName}
              onChange={(event) => setSyncForm(prev => ({ ...prev, deviceName: event.target.value }))}
              placeholder="Trace Browser Windows"
              autoComplete="off"
              required
            />
          </div>
          <div className="rounded-xl bg-[var(--color-bg-muted)] px-4 py-3 text-xs leading-6 text-[var(--color-text-muted)]">
            将打开 sync-server 授权页，授权完成后自动绑定当前设备。
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setSyncOAuthOpen(false)} disabled={syncOAuthLoading}>
              取消
            </Button>
            <Button type="submit" loading={syncOAuthLoading}>
              <ExternalLink className="h-4 w-4" />
              打开授权页
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={syncLoginOpen}
        onClose={() => !syncLoading && setSyncLoginOpen(false)}
        title="账号密码调试登录同步服务"
        width="520px"
      >
        <form className="space-y-4" onSubmit={handleSyncLogin}>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[var(--color-text-secondary)]">服务地址</label>
            <Input
              value={syncForm.serverURL}
              onChange={(event) => setSyncForm(prev => ({ ...prev, serverURL: event.target.value }))}
              placeholder="http://127.0.0.1:8000"
              autoComplete="url"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[var(--color-text-secondary)]">账号</label>
            <Input
              value={syncForm.username}
              onChange={(event) => setSyncForm(prev => ({ ...prev, username: event.target.value }))}
              placeholder="admin"
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[var(--color-text-secondary)]">密码</label>
            <Input
              type="password"
              value={syncForm.password}
              onChange={(event) => setSyncForm(prev => ({ ...prev, password: event.target.value }))}
              placeholder="请输入同步服务账号密码"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[var(--color-text-secondary)]">设备名称</label>
            <Input
              value={syncForm.deviceName}
              onChange={(event) => setSyncForm(prev => ({ ...prev, deviceName: event.target.value }))}
              placeholder="Trace Browser Windows"
              autoComplete="off"
              required
            />
          </div>
          <div className="rounded-xl bg-[var(--color-bg-muted)] px-4 py-3 text-xs leading-6 text-[var(--color-text-muted)]">
            登录成功后，本机将以固定设备指纹注册到同步服务。同步服务后台的「设备」页会显示这台设备的在线状态。
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setSyncLoginOpen(false)} disabled={syncLoading}>
              取消
            </Button>
            <Button type="submit" loading={syncLoading}>
              <ShieldCheck className="h-4 w-4" />
              登录并绑定
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={syncEncryptionOpen}
        onClose={() => !syncEncryptionLoading && setSyncEncryptionOpen(false)}
        title={syncEncryptionMode === 'setup' ? '设置同步加密密码' : '解锁同步加密'}
        width="520px"
      >
        <form className="space-y-4" onSubmit={handleSyncEncryptionSubmit} noValidate>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[var(--color-text-secondary)]">同步加密密码</label>
            <Input
              type="password"
              value={syncEncryptionForm.password}
              onChange={(event) => setSyncEncryptionForm(prev => ({ ...prev, password: event.target.value }))}
              placeholder="至少 8 个字符"
              autoComplete="new-password"
              minLength={SYNC_ENCRYPTION_MIN_PASSWORD_LENGTH}
              required
            />
            <p className="text-xs text-[var(--color-text-muted)]">
              密码至少需要 {SYNC_ENCRYPTION_MIN_PASSWORD_LENGTH} 个字符，用于加密云端备份。
            </p>
          </div>
          {syncEncryptionMode === 'setup' && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-[var(--color-text-secondary)]">确认密码</label>
              <Input
                type="password"
                value={syncEncryptionForm.confirm}
                onChange={(event) => setSyncEncryptionForm(prev => ({ ...prev, confirm: event.target.value }))}
                placeholder="再次输入同步加密密码"
                autoComplete="new-password"
                required
              />
            </div>
          )}
          <div className="rounded-xl bg-[var(--color-bg-muted)] px-4 py-3 text-xs leading-6 text-[var(--color-text-muted)]">
            新设备恢复加密备份时需要输入同一个同步加密密码。
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setSyncEncryptionOpen(false)} disabled={syncEncryptionLoading}>
              取消
            </Button>
            <Button type="submit" loading={syncEncryptionLoading}>
              <KeyRound className="h-4 w-4" />
              {syncEncryptionMode === 'setup' ? '启用加密' : '解锁'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function getIcon(icon?: IconKey) {
  return ICON_MAP[icon || 'globe'] || Globe
}

function stripProtocol(value: string): string {
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function backupTypeText(value: string): string {
  if (value === 'profile_bundle') return '实例备份'
  return '全量配置'
}

function normalizeSyncBackupProgress(progress: SyncBackupProgress): SyncBackupProgress {
  const nextProgress = Number.isFinite(progress.progress)
    ? Math.max(0, Math.min(100, Math.round(progress.progress)))
    : 0
  return {
    ...progress,
    phase: typeof progress.phase === 'string' && progress.phase.trim() ? progress.phase : 'running',
    progress: nextProgress,
    message: typeof progress.message === 'string' && progress.message.trim() ? progress.message.trim() : '正在处理云端备份...',
  }
}

function isSyncEncryptionReady(session: SyncAuthSession | null): boolean {
  return Boolean(session?.encryption?.enabled && session.encryption.configured && session.encryption.unlocked)
}

function formatSyncEncryptionError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  const details = typeof error === 'object' && error && 'details' in error
    ? String((error as { details?: unknown }).details || '').trim()
    : ''
  if (message.includes('未知的 Protobuf RPC 方法') && details.includes('trace.cloudSync.Encryption')) {
    return '当前运行的后端还没有加载同步加密接口，请重启 Trace-Browser 后再试'
  }
  if (details) {
    return details
  }
  return message || fallback
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(1)} ${units[index]}`
}

function formatBackupTime(value: string): string {
  if (!value) return '时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
