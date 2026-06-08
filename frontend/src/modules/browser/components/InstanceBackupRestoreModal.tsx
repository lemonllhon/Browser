import { useEffect, useMemo, useState } from 'react'
import { Download, FileArchive, Upload } from 'lucide-react'
import { Button, Modal, Progress, toast } from '../../../shared/components'
import {
  chooseProfileBackupImportPackage,
  exportProfileBackup,
  importProfileBackup,
  onProfileBackupProgress,
  type BrowserProfileBackupActionResult,
  type BrowserProfileBackupProgress,
} from '../api'
import type { BrowserProfile } from '../types'
import { resolveActionErrorMessage } from '../utils/actionErrors'
import type { BackupRestoreDemoTab } from '../browserOnboardingEvents'

type ExportScope = 'all' | 'selected' | 'filtered' | 'custom'

interface Props {
  open: boolean
  onClose: () => void
  profiles: BrowserProfile[]
  totalCount: number
  selectedProfileIds: string[]
  filteredProfileIds: string[]
  onRestored: () => void
  demoTab?: BackupRestoreDemoTab | null
}

type ProgressLog = {
  id: string
  text: string
  phase: string
  time: string
}

const cookieNotice = '仅备份非无痕窗口中的持久 Cookie。无痕窗口关闭后不会保留 Cookie，实例关闭时也无法读取无痕内容。'

export function InstanceBackupRestoreModal({
  open,
  onClose,
  profiles,
  totalCount,
  selectedProfileIds,
  filteredProfileIds,
  onRestored,
  demoTab,
}: Props) {
  const [tab, setTab] = useState<'export' | 'restore'>('export')
  const [scope, setScope] = useState<ExportScope>('all')
  const [includeCookies, setIncludeCookies] = useState(true)
  const [includePlainCookies, setIncludePlainCookies] = useState(false)
  const [restoreCookies, setRestoreCookies] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<BrowserProfileBackupProgress | null>(null)
  const [logs, setLogs] = useState<ProgressLog[]>([])
  const [preview, setPreview] = useState<BrowserProfileBackupActionResult | null>(null)
  const [lastResult, setLastResult] = useState<BrowserProfileBackupActionResult | null>(null)
  const [customProfileIds, setCustomProfileIds] = useState<Set<string>>(new Set())
  const [restoreProfileIds, setRestoreProfileIds] = useState<Set<string>>(new Set())
  const [exportCompleted, setExportCompleted] = useState(false)
  const [restoreCompleted, setRestoreCompleted] = useState(false)

  const selectedCount = selectedProfileIds.length
  const filteredCount = filteredProfileIds.length

  useEffect(() => {
    if (!open) return
    setScope(selectedCount > 0 ? 'selected' : 'all')
    setTab(demoTab || 'export')
    setProgress(null)
    setLogs([])
    setPreview(null)
    setLastResult(null)
    setCustomProfileIds(new Set(selectedProfileIds))
    setRestoreProfileIds(new Set())
    setExportCompleted(false)
    setRestoreCompleted(false)
  }, [demoTab, open, selectedCount, selectedProfileIds])

  useEffect(() => {
    if (!open || !demoTab) return
    setTab(demoTab)
  }, [demoTab, open])

  useEffect(() => {
    if (!open) return
    return onProfileBackupProgress(item => {
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
    })
  }, [open])

  const exportCount = useMemo(() => {
    if (scope === 'selected') return selectedCount
    if (scope === 'filtered') return filteredCount
    if (scope === 'custom') return customProfileIds.size
    return totalCount
  }, [customProfileIds.size, filteredCount, scope, selectedCount, totalCount])

  const activeExportProfileIds = () => {
    if (scope === 'selected') return selectedProfileIds
    if (scope === 'filtered') return filteredProfileIds
    if (scope === 'custom') return Array.from(customProfileIds)
    return []
  }

  const restoreProfiles = preview?.profiles || []
  const restoreSelectedCount = restoreProfiles.length > 0 ? restoreProfileIds.size : preview ? (preview.summary.profileCount || preview.profileCount) : 0
  const canRestore = !!preview && !preview.cancelled && !restoreCompleted && (restoreProfiles.length === 0 || restoreProfileIds.size > 0)

  const setScopeValue = (next: ExportScope) => {
    setScope(next)
  }

  const toggleCustomProfile = (profileId: string) => {
    setCustomProfileIds(prev => {
      const next = new Set(prev)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
  }

  const toggleRestoreProfile = (profileId: string) => {
    setRestoreProfileIds(prev => {
      const next = new Set(prev)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
  }

  const handleExport = async () => {
    if (exportCount <= 0) {
      toast.warning('没有可导出的实例')
      return
    }
    setBusy(true)
    setProgress(null)
    setLogs([])
    setLastResult(null)
    try {
      const result = await exportProfileBackup({
        scope,
        profileIds: activeExportProfileIds(),
        includeCookies,
        includePlainCookiesWhenRunning: includePlainCookies,
      })
      setLastResult(result)
      if (result.cancelled) {
        toast.info(result.message || '已取消导出')
      } else {
        setExportCompleted(true)
        toast.success(`实例备份已导出：${result.profileCount || result.exported} 个实例`)
      }
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '实例备份导出失败'))
    } finally {
      setBusy(false)
    }
  }

  const handleChoosePackage = async () => {
    setBusy(true)
    setProgress(null)
    setLogs([])
    setLastResult(null)
    try {
      const result = await chooseProfileBackupImportPackage()
      if (result.cancelled) {
        toast.info(result.message || '已取消选择')
      } else {
        setPreview(result)
        setRestoreProfileIds(new Set((result.profiles || []).map(item => item.profileId).filter(Boolean)))
        setRestoreCompleted(false)
        toast.success('实例备份包校验通过')
      }
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '实例备份包校验失败'))
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async () => {
    const zipPath = preview?.zipPath || preview?.summary?.zipPath || ''
    if (!zipPath) {
      toast.warning('请先选择实例备份包')
      return
    }
    setBusy(true)
    setProgress(null)
    setLogs([])
    setLastResult(null)
    try {
      const result = await importProfileBackup({
        zipPath,
        restoreCookies,
        profileIds: restoreProfiles.length > 0 ? Array.from(restoreProfileIds) : undefined,
      })
      setLastResult(result)
      setRestoreCompleted(true)
      toast.success(`实例恢复完成：成功 ${result.imported}${result.failed ? `，失败 ${result.failed}` : ''}`)
      onRestored()
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '实例恢复失败'))
    } finally {
      setBusy(false)
    }
  }

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
      title="实例备份与恢复"
      width="760px"
      closable={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>关闭</Button>
          {tab === 'export' ? (
            <Button onClick={handleExport} loading={busy} disabled={exportCount <= 0 || exportCompleted}>
              <Download className="w-4 h-4" />
              {exportCompleted ? '已导出' : '开始导出'}
            </Button>
          ) : (
            <Button onClick={handleRestore} loading={busy} disabled={!canRestore}>
              <Upload className="w-4 h-4" />
              {restoreCompleted ? '已恢复' : '开始恢复'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-1 shadow-inner">
          <button
            type="button"
            aria-pressed={tab === 'export'}
            className={`h-8 px-4 rounded-md text-sm font-medium transition-all duration-200 ${tab === 'export' ? 'bg-[var(--color-accent)] text-[var(--color-text-inverse)] shadow-md ring-1 ring-[var(--color-accent)]/40' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]'}`}
            onClick={() => setTab('export')}
          >
            导出
          </button>
          <button
            type="button"
            aria-pressed={tab === 'restore'}
            className={`h-8 px-4 rounded-md text-sm font-medium transition-all duration-200 ${tab === 'restore' ? 'bg-[var(--color-accent)] text-[var(--color-text-inverse)] shadow-md ring-1 ring-[var(--color-accent)]/40' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]'}`}
            onClick={() => setTab('restore')}
          >
            导入恢复
          </button>
        </div>

        <div className="rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          {cookieNotice}
        </div>

        {tab === 'export' ? (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-[var(--color-text-primary)] mb-2">导出范围</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <ScopeButton active={scope === 'all'} label="全部实例" count={totalCount} onClick={() => setScopeValue('all')} />
                <ScopeButton active={scope === 'selected'} label="列表已选" count={selectedCount} disabled={selectedCount === 0} onClick={() => setScopeValue('selected')} />
                <ScopeButton active={scope === 'filtered'} label="当前筛选" count={filteredCount} disabled={filteredCount === 0} onClick={() => setScopeValue('filtered')} />
                <ScopeButton active={scope === 'custom'} label="自定义实例" count={customProfileIds.size} disabled={profiles.length === 0} onClick={() => setScopeValue('custom')} />
              </div>
            </div>

            {scope === 'custom' && (
              <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">选择要备份的实例</div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCustomProfileIds(new Set(profiles.map(item => item.profileId)))
                      }}
                    >
                      全选
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCustomProfileIds(new Set())
                      }}
                    >
                      清空
                    </Button>
                  </div>
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                  {profiles.map(profile => (
                    <label
                      key={profile.profileId}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-[var(--color-accent)]"
                        checked={customProfileIds.has(profile.profileId)}
                        onChange={() => toggleCustomProfile(profile.profileId)}
                      />
                      <span className="min-w-0 flex-1 truncate">{profile.profileName || profile.profileId}</span>
                      <span className="text-xs text-[var(--color-text-muted)] shrink-0">{profile.running ? '运行中' : '已停止'}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[var(--color-accent)]"
                  checked={includeCookies}
                  onChange={event => {
                    setIncludeCookies(event.target.checked)
                  }}
                />
                包含非无痕持久 Cookie
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[var(--color-accent)]"
                  checked={includePlainCookies}
                  onChange={event => {
                    setIncludePlainCookies(event.target.checked)
                  }}
                  disabled={!includeCookies}
                />
                运行中实例额外导出明文 Cookie 快照
              </label>
            </div>

            <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
              将导出 {exportCount} 个实例，恢复时默认创建新实例并自动重命名。
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Button variant="secondary" onClick={handleChoosePackage} loading={busy}>
              <FileArchive className="w-4 h-4" />
              选择实例备份包
            </Button>
            {preview && !preview.cancelled && (
              <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text-primary)]">备份包摘要</div>
                    <div className="mt-1 text-xs text-[var(--color-text-muted)] break-all">{preview.zipPath}</div>
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)]">v{preview.summary.version || 1}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <SummaryItem label="实例数" value={String(preview.summary.profileCount || preview.profileCount)} />
                  <SummaryItem label="Cookie 实例" value={String(preview.summary.cookieProfileCount || preview.cookieProfileCount)} />
                  <SummaryItem label="创建时间" value={formatSummaryTime(preview.summary.createdAt || preview.createdAt)} />
                  <SummaryItem label="来源系统" value={preview.summary.sourceOs || '-'} />
                </div>
                <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[var(--color-accent)]"
                    checked={restoreCookies}
                    onChange={event => setRestoreCookies(event.target.checked)}
                  />
                  恢复非无痕持久 Cookie
                </label>
                {restoreProfiles.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-[var(--color-text-primary)]">
                        选择要恢复的实例（已选 {restoreSelectedCount} / {restoreProfiles.length}）
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => {
                          setRestoreProfileIds(new Set(restoreProfiles.map(item => item.profileId)))
                        }}>
                          全选
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => {
                          setRestoreProfileIds(new Set())
                        }}>
                          清空
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] divide-y divide-[var(--color-border-muted)]">
                      {restoreProfiles.map(profile => (
                        <label
                          key={profile.profileId}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-[var(--color-accent)]"
                            checked={restoreProfileIds.has(profile.profileId)}
                            onChange={() => toggleRestoreProfile(profile.profileId)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{profile.profileName || profile.profileId}</span>
                            <span className="block text-xs text-[var(--color-text-muted)] truncate">{profile.userDataDir || profile.profileId}</span>
                          </span>
                          <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                            {profile.hasCookies ? `Cookie ${profile.cookieFileCount}` : '无 Cookie'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-xs text-[var(--color-text-muted)]">
                  恢复模式：创建新实例；冲突处理：自动重命名。
                </div>
              </div>
            )}
          </div>
        )}

        {progress && (
          <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-secondary)]">{progress.message || '处理中'}</span>
              <span className="text-[var(--color-text-muted)]">{progress.entryIndex && progress.entryTotal ? `${progress.entryIndex}/${progress.entryTotal}` : progress.phase}</span>
            </div>
            <Progress percent={progress.progress} size="sm" status={progressStatus} />
          </div>
        )}

        {logs.length > 0 && (
          <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-[var(--color-text-secondary)]">处理日志</span>
              <span className="text-[var(--color-text-muted)]">{logs.length} 条</span>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {logs.map(item => (
                <div key={item.id} className="text-xs leading-5 font-mono">
                  <span className="text-[var(--color-text-muted)] mr-2">{item.time}</span>
                  <span className={item.phase === 'error' ? 'text-[var(--color-error)]' : item.phase === 'done' ? 'text-[var(--color-success)]' : 'text-[var(--color-text-secondary)]'}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {lastResult?.warnings?.length ? (
          <div className="rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-3">
            <div className="text-sm font-medium text-[var(--color-text-primary)] mb-2">处理提示</div>
            <div className="max-h-28 overflow-y-auto space-y-1">
              {lastResult.warnings.slice(0, 20).map((item, index) => (
                <div key={`${item.profileId || index}-${index}`} className="text-xs leading-5 text-[var(--color-text-secondary)]">
                  {item.profileName || item.profileId || '实例'}：{item.message}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

function ScopeButton({ active, label, count, disabled, onClick }: { active: boolean; label: string; count: number; disabled?: boolean; onClick: () => void }) {
  const activeClass = 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)] shadow-sm'
  const inactiveClass = 'border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-muted)]'
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={`h-16 rounded-md border px-3 text-left transition-colors ${active ? activeClass : inactiveClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className={`text-sm font-medium ${active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]'}`}>{label}</div>
      <div className={`mt-1 text-xs ${active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}>{count} 个实例</div>
    </button>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] px-2 py-2">
      <div className="text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 font-medium text-[var(--color-text-primary)] truncate">{value}</div>
    </div>
  )
}

function formatSummaryTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
}
