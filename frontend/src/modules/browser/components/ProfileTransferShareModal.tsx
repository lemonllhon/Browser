import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clipboard, Cloud, Search, Share2, Upload } from 'lucide-react'
import { Button, Modal, Progress, toast } from '../../../shared/components'
import {
  createProfileTransferShare,
  importProfileBackup,
  onCloudProfileTransferProgress,
  onProfileBackupProgress,
  prepareProfileTransferShareRestore,
  resolveProfileTransferShare,
  type BrowserProfileBackupActionResult,
  type BrowserProfileBackupProgress,
  type CloudSyncProfileTransferShareCreateResult,
  type CloudSyncProfileTransferShareResolveResult,
} from '../api'
import type { BrowserProfile } from '../types'
import { resolveActionErrorMessage } from '../utils/actionErrors'

interface Props {
  open: boolean
  onClose: () => void
  profiles: BrowserProfile[]
  selectedProfileIds: string[]
  onRestored: () => void
}

type ProgressLog = {
  id: string
  text: string
  phase: string
  time: string
}

export function ProfileTransferShareModal({
  open,
  onClose,
  profiles,
  selectedProfileIds,
  onRestored,
}: Props) {
  const [tab, setTab] = useState<'share' | 'receive'>('share')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [includeCookies, setIncludeCookies] = useState(true)
  const [includePlainCookies, setIncludePlainCookies] = useState(false)
  const [restoreCookies, setRestoreCookies] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<BrowserProfileBackupProgress | null>(null)
  const [logs, setLogs] = useState<ProgressLog[]>([])
  const [createdShare, setCreatedShare] = useState<CloudSyncProfileTransferShareCreateResult | null>(null)
  const [shareText, setShareText] = useState('')
  const [resolvedShare, setResolvedShare] = useState<CloudSyncProfileTransferShareResolveResult | null>(null)
  const [preview, setPreview] = useState<BrowserProfileBackupActionResult | null>(null)
  const [restoreProfileIds, setRestoreProfileIds] = useState<Set<string>>(new Set())
  const [restoreCompleted, setRestoreCompleted] = useState(false)

  const stoppedProfiles = useMemo(() => profiles.filter(profile => !profile.running), [profiles])
  const runningCount = profiles.length - stoppedProfiles.length
  const selectedStoppedProfiles = useMemo(
    () => stoppedProfiles.filter(profile => selectedIds.has(profile.profileId)),
    [selectedIds, stoppedProfiles],
  )
  const restoreProfiles = preview?.profiles || []
  const canRestore = !!preview && !restoreCompleted && (restoreProfiles.length === 0 || restoreProfileIds.size > 0)

  useEffect(() => {
    if (!open) return
    const stoppedSet = new Set(stoppedProfiles.map(profile => profile.profileId))
    const initialSelected = selectedProfileIds.filter(profileId => stoppedSet.has(profileId))
    setTab('share')
    setSelectedIds(new Set(initialSelected))
    setIncludeCookies(true)
    setIncludePlainCookies(false)
    setRestoreCookies(true)
    setBusy(false)
    setProgress(null)
    setLogs([])
    setCreatedShare(null)
    setShareText('')
    setResolvedShare(null)
    setPreview(null)
    setRestoreProfileIds(new Set())
    setRestoreCompleted(false)
  }, [open, selectedProfileIds, stoppedProfiles])

  useEffect(() => {
    if (!open) return
    const applyProgress = (item: BrowserProfileBackupProgress) => {
      setProgress(item)
      setLogs(prev => [
        ...prev.slice(-39),
        {
          id: `${Date.now()}-${prev.length}`,
          text: item.message || item.phase,
          phase: item.phase,
          time: item.timestamp || new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        },
      ])
    }
    const offCloud = onCloudProfileTransferProgress(applyProgress)
    const offProfile = onProfileBackupProgress(applyProgress)
    return () => {
      offCloud()
      offProfile()
    }
  }, [open])

  const toggleProfile = (profileId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
    setCreatedShare(null)
  }

  const toggleRestoreProfile = (profileId: string) => {
    setRestoreProfileIds(prev => {
      const next = new Set(prev)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
  }

  const handleCreateShare = async () => {
    if (selectedIds.size === 0) {
      toast.warning('请选择已停止实例')
      return
    }
    setBusy(true)
    setProgress({ phase: 'starting', progress: 0, message: '准备创建实例流转分享...' })
    setLogs([])
    setCreatedShare(null)
    try {
      const result = await createProfileTransferShare({
        profileIds: Array.from(selectedIds),
        includeCookies,
        includePlainCookiesWhenRunning: includePlainCookies,
        expiresInHours: 24,
      })
      setCreatedShare(result)
      toast.success(`流转分享已生成：${result.profileBackup?.profileCount || selectedIds.size} 个实例`)
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '创建实例流转分享失败'))
    } finally {
      setBusy(false)
    }
  }

  const handleResolveShare = async () => {
    if (!shareText.trim()) {
      toast.warning('请粘贴分享链接或授权码')
      return
    }
    setBusy(true)
    setProgress({ phase: 'starting', progress: 0, message: '正在解析流转分享...' })
    setLogs([])
    setResolvedShare(null)
    setPreview(null)
    setRestoreCompleted(false)
    try {
      const result = await resolveProfileTransferShare(shareText)
      setResolvedShare(result)
      setProgress({ phase: 'done', progress: 100, message: '流转分享解析通过' })
      toast.success('流转分享解析通过')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '流转分享解析失败'))
      setProgress({ phase: 'error', progress: 100, message: '流转分享解析失败' })
    } finally {
      setBusy(false)
    }
  }

  const handleDownloadShare = async () => {
    if (!shareText.trim()) {
      toast.warning('请粘贴分享链接或授权码')
      return
    }
    setBusy(true)
    setProgress({ phase: 'starting', progress: 0, message: '准备接收实例流转分享...' })
    setLogs([])
    setPreview(null)
    setRestoreCompleted(false)
    try {
      const result = await prepareProfileTransferShareRestore(shareText)
      setPreview(result)
      setRestoreProfileIds(new Set((result.profiles || []).map(item => item.profileId).filter(Boolean)))
      toast.success('流转分享已下载并校验通过')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '接收实例流转分享失败'))
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async () => {
    const zipPath = preview?.zipPath || preview?.summary?.zipPath || ''
    if (!zipPath) {
      toast.warning('请先下载并校验分享包')
      return
    }
    setBusy(true)
    setProgress(null)
    setLogs([])
    try {
      const result = await importProfileBackup({
        zipPath,
        restoreCookies,
        profileIds: restoreProfiles.length > 0 ? Array.from(restoreProfileIds) : undefined,
      })
      setRestoreCompleted(true)
      toast.success(`实例恢复完成：成功 ${result.imported}${result.failed ? `，失败 ${result.failed}` : ''}`)
      onRestored()
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '实例恢复失败'))
    } finally {
      setBusy(false)
    }
  }

  const footerAction = tab === 'share'
    ? (
      <Button onClick={handleCreateShare} loading={busy} disabled={selectedIds.size === 0 || !!createdShare}>
        <Share2 className="w-4 h-4" />
        {createdShare ? '已生成' : '生成分享'}
      </Button>
    )
    : preview
      ? (
        <Button onClick={handleRestore} loading={busy} disabled={!canRestore}>
          <Upload className="w-4 h-4" />
          {restoreCompleted ? '已恢复' : '开始恢复'}
        </Button>
      )
      : resolvedShare
        ? (
          <Button onClick={handleDownloadShare} loading={busy}>
            <Cloud className="w-4 h-4" />
            下载并校验
          </Button>
        )
        : (
          <Button onClick={handleResolveShare} loading={busy}>
            <Search className="w-4 h-4" />
            解析分享
          </Button>
        )

  const progressStatus = progress?.phase === 'error'
    ? 'error'
    : progress?.phase === 'done'
      ? 'success'
      : 'normal'

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      title="接收流转分享"
      width="820px"
      closable={!busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>关闭</Button>
          {footerAction}
        </>
      )}
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-1 shadow-inner">
          <SegmentButton active={tab === 'share'} label="分享实例" onClick={() => setTab('share')} />
          <SegmentButton active={tab === 'receive'} label="接收恢复" onClick={() => setTab('receive')} />
        </div>

        <div className="rounded-md border border-sky-300/50 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
          流转分享会上传未加密的实例备份包，并由 24 小时一次性授权码保护。请只发给可信接收方。
        </div>

        {tab === 'share' ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
            <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">已停止实例</div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    已选 {selectedIds.size} / 可分享 {stoppedProfiles.length}{runningCount > 0 ? `，${runningCount} 个运行中需先停止` : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => {
                    setSelectedIds(new Set(stoppedProfiles.map(item => item.profileId)))
                    setCreatedShare(null)
                  }}>
                    全选
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => {
                    setSelectedIds(new Set())
                    setCreatedShare(null)
                  }}>
                    清空
                  </Button>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
                {stoppedProfiles.length === 0 ? (
                  <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">没有已停止实例</div>
                ) : stoppedProfiles.map(profile => (
                  <label
                    key={profile.profileId}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-[var(--color-accent)]"
                      checked={selectedIds.has(profile.profileId)}
                      onChange={() => toggleProfile(profile.profileId)}
                    />
                    <span className="min-w-0 flex-1 truncate">{profile.profileName || profile.profileId}</span>
                    <span className="text-xs text-[var(--color-text-muted)] shrink-0">{profile.profileId}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3 space-y-2">
                <div className="text-sm font-medium text-[var(--color-text-primary)]">分享范围</div>
                <CheckboxRow checked={includeCookies} onChange={setIncludeCookies} label="包含非无痕持久 Cookie" />
                <CheckboxRow checked={includePlainCookies} onChange={setIncludePlainCookies} label="运行中实例额外导出明文 Cookie 快照" />
              </div>

              <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3 space-y-2">
                <div className="text-sm font-medium text-[var(--color-text-primary)]">本次分享</div>
                <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
                  {selectedStoppedProfiles.length === 0 ? (
                    <div>尚未选择实例</div>
                  ) : selectedStoppedProfiles.slice(0, 6).map(profile => (
                    <div key={profile.profileId} className="truncate">{profile.profileName || profile.profileId}</div>
                  ))}
                  {selectedStoppedProfiles.length > 6 && <div>还有 {selectedStoppedProfiles.length - 6} 个实例</div>}
                </div>
              </div>

              {createdShare && (
                <div className="rounded-md border border-emerald-300/60 bg-emerald-50 p-3 space-y-3 text-emerald-900">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    分享已生成，{formatDate(createdShare.expiresAt)} 前有效
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1">短授权码</div>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 rounded border border-emerald-200 bg-white px-2 py-1 text-sm font-semibold text-emerald-950">{createdShare.code}</code>
                      <Button type="button" size="sm" variant="secondary" onClick={() => copyText(createdShare.code, '授权码')}>
                        <Clipboard className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1">分享链接</div>
                    <textarea
                      readOnly
                      value={createdShare.shareUrl || createdShare.directUrl}
                      className="h-16 w-full resize-none rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs text-emerald-950 outline-none"
                    />
                    <div className="mt-2 flex justify-end">
                      <Button type="button" size="sm" variant="secondary" onClick={() => copyText(createdShare.shareUrl || createdShare.directUrl, '分享链接')}>
                        <Clipboard className="w-4 h-4" />
                        复制
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-[var(--color-text-primary)] mb-2">分享链接或授权码</div>
              <textarea
                value={shareText}
                onChange={event => {
                  setShareText(event.target.value)
                  setResolvedShare(null)
                  setPreview(null)
                  setRestoreCompleted(false)
                }}
                placeholder="粘贴 trace-browser://profile-transfer?... 分享链接、/v1/sync/shares/... 地址或短授权码"
                className="h-24 w-full resize-none rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
              />
            </div>

            {resolvedShare && (
              <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <InfoItem label="备份名称" value={resolvedShare.backup.name || resolvedShare.backup.id} />
                  <InfoItem label="同步服务" value={resolvedShare.serverURL} />
                  <InfoItem label="文件大小" value={formatFileSize(resolvedShare.backup.sizeBytes)} />
                  <InfoItem label="过期时间" value={formatDate(resolvedShare.share.expiresAt)} />
                </div>
              </div>
            )}

            {preview && (
              <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text-primary)]">待恢复实例</div>
                    <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      已选 {restoreProfileIds.size} / {restoreProfiles.length || preview.profileCount}，Cookie 实例 {preview.cookieProfileCount}
                    </div>
                  </div>
                  <CheckboxRow checked={restoreCookies} onChange={setRestoreCookies} label="恢复 Cookie 数据" />
                </div>
                {restoreProfiles.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {restoreProfiles.map(profile => (
                      <label
                        key={profile.profileId}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-[var(--color-accent)]"
                          checked={restoreProfileIds.has(profile.profileId)}
                          onChange={() => toggleRestoreProfile(profile.profileId)}
                        />
                        <span className="min-w-0 flex-1 truncate">{profile.profileName || profile.profileId}</span>
                        <span className="text-xs text-[var(--color-text-muted)] shrink-0">{profile.hasCookies ? '含 Cookie' : '无 Cookie'}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {progress && (
          <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="min-w-0 text-sm text-[var(--color-text-primary)] truncate">{progress.message || progress.phase}</div>
              <div className="text-xs text-[var(--color-text-muted)] shrink-0">{progress.timestamp}</div>
            </div>
            <Progress percent={progress.progress || 0} status={progressStatus} />
            {logs.length > 0 && (
              <div className="mt-3 max-h-24 overflow-y-auto space-y-1 text-xs text-[var(--color-text-muted)]">
                {logs.slice(-6).map(log => (
                  <div key={log.id} className="flex gap-2">
                    <span className="shrink-0 tabular-nums">{log.time}</span>
                    <span className="min-w-0 truncate">{log.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function SegmentButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`h-8 px-4 rounded-md text-sm font-medium transition-all duration-200 ${active ? 'bg-[var(--color-accent)] text-[var(--color-text-inverse)] shadow-md ring-1 ring-[var(--color-accent)]/40' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]'}`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function CheckboxRow({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] cursor-pointer">
      <input
        type="checkbox"
        className="w-4 h-4 accent-[var(--color-accent)]"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 truncate text-[var(--color-text-primary)]" title={value}>{value || '-'}</div>
    </div>
  )
}

async function copyText(value: string, label: string) {
  const text = String(value || '')
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label}已复制`)
  } catch {
    toast.error('复制失败')
  }
}

function formatDate(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Number(bytes)
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
