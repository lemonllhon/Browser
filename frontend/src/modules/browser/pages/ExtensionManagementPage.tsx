import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Archive, Eye, EyeOff, FileCode2, FolderOpen, Link2, RefreshCw, Settings2, Trash2, UploadCloud } from 'lucide-react'
import { Badge, Button, Card, ConfirmModal, FormItem, Input, Modal, Select, Switch, Table, toast } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'
import type { BrowserExtension, BrowserExtensionBinding, BrowserExtensionImportResult, BrowserProfile } from '../types'
import { assignBrowserExtensionProfiles, chooseBrowserExtensionArchive, chooseBrowserExtensionDirectory, deleteBrowserExtension, fetchBrowserExtension, fetchBrowserExtensionProfileBindings, fetchBrowserExtensions, fetchBrowserProfiles, importBrowserExtensionArchive, importBrowserExtensionDirectory, setBrowserExtensionAutoBind, syncBrowserExtensionData, unassignBrowserExtensionProfiles } from '../api'
import { clearRuntimeFileDrop, onRuntimeEvent, onRuntimeFileDrop } from '../../../shared/backend/runtime'
import { useVisibleRefresh } from '../hooks/useVisibleRefresh'

const sourceTypeText: Record<string, string> = {
  zip: '压缩包',
  crx: 'CRX',
  url: '地址导入',
  directory: '目录',
}

const bindingModeText: Record<string, string> = {
  shared: '共享',
  exclusive: '独享',
}

type AutoDataSyncPayload = {
  extensionId?: string
  sourceProfileId?: string
  targetProfileIds?: string[]
  targetCount?: number
}

function formatTime(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function sourceLabel(value: string) {
  return sourceTypeText[value] || value || '-'
}

function bindingModeLabel(value: string) {
  return bindingModeText[value] || value || '-'
}

function importTypeFromPath(path: string): 'archive' | 'directory' {
  return /\.(zip|crx)$/i.test(path.trim()) ? 'archive' : 'directory'
}

function errorMessage(error: unknown, fallback: string) {
  if (!error) return fallback
  if (typeof error === 'string') return error || fallback
  if (typeof error === 'object') {
    const record = error as { message?: unknown; error?: unknown }
    if (typeof record.message === 'string' && record.message.trim()) return record.message
    if (typeof record.error === 'string' && record.error.trim()) return record.error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return fallback
  }
}

function profileDisplayLabel(profile: BrowserProfile) {
  return (profile.profileName || profile.profileId || '').trim()
}

function compareProfilesByDisplayLabel(a: BrowserProfile, b: BrowserProfile) {
  const left = profileDisplayLabel(a)
  const right = profileDisplayLabel(b)
  const result = left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' })
  if (result !== 0) return result
  return a.profileId.localeCompare(b.profileId, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

export function ExtensionManagementPage() {
  const [extensions, setExtensions] = useState<BrowserExtension[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedExtension, setSelectedExtension] = useState<BrowserExtension | null>(null)
  const [bindingModalOpen, setBindingModalOpen] = useState(false)
  const [autoBindModalOpen, setAutoBindModalOpen] = useState(false)
  const [autoBindEnabled, setAutoBindEnabled] = useState(false)
  const [autoBindMode, setAutoBindMode] = useState<'shared' | 'exclusive'>('shared')
  const [autoBindSaving, setAutoBindSaving] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingExtension, setDeletingExtension] = useState<BrowserExtension | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importType, setImportType] = useState<'archive' | 'directory'>('archive')
  const [importPath, setImportPath] = useState('')
  const [importing, setImporting] = useState(false)
  const [duplicateResult, setDuplicateResult] = useState<BrowserExtensionImportResult | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [bindings, setBindings] = useState<BrowserExtensionBinding[]>([])
  const [bindingsLoading, setBindingsLoading] = useState(false)
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set())
  const [bindingMode, setBindingMode] = useState<'shared' | 'exclusive'>('shared')
  const [bindingEnabled, setBindingEnabled] = useState(true)
  const [bindingSaving, setBindingSaving] = useState(false)
  const [syncSourceProfileId, setSyncSourceProfileId] = useState('')
  const [syncTargetProfileIds, setSyncTargetProfileIds] = useState<Set<string>>(new Set())
  const [syncingData, setSyncingData] = useState(false)

  const selectedProfilesNeedRestart = useMemo(() => (
    profiles.some(profile => selectedProfileIds.has(profile.profileId) && profile.running)
  ), [profiles, selectedProfileIds])

  const sortedProfiles = useMemo(() => (
    [...profiles].sort(compareProfilesByDisplayLabel)
  ), [profiles])

  const loadData = async (silent = false) => {
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const list = await fetchBrowserExtensions()
      setExtensions(list)
    } catch (error: unknown) {
      toast.error(errorMessage(error, '加载扩展列表失败'), 6000)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadData()
    void loadProfiles()
  }, [])

  useEffect(() => {
    onRuntimeFileDrop((_, __, paths) => {
      setDragActive(false)
      void handleDroppedPaths(paths || [])
    }, false)
    return () => {
      clearRuntimeFileDrop()
    }
  }, [])

  useEffect(() => {
    return onRuntimeEvent<AutoDataSyncPayload>('browser:extension:auto-data-synced', payload => {
      const targetCount = payload?.targetCount ?? payload?.targetProfileIds?.length ?? 0
      if (targetCount > 0) {
        toast.success(`自动数据同步完成：${targetCount} 个副实例已更新`)
      }
      void loadData(true)
      if (bindingModalOpen && selectedExtension?.extensionId && payload?.extensionId === selectedExtension.extensionId) {
        void loadBindings(selectedExtension.extensionId)
      }
    })
  }, [bindingModalOpen, selectedExtension?.extensionId])

  const handleOpenDetail = async (record: BrowserExtension) => {
    setSelectedExtension(record)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const detail = await fetchBrowserExtension(record.extensionId)
      if (detail) {
        setSelectedExtension(detail)
      }
    } catch (error: unknown) {
      toast.error(errorMessage(error, '加载扩展详情失败'), 6000)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleOpenBinding = async (record: BrowserExtension) => {
    setSelectedExtension(record)
    setBindingModalOpen(true)
    setSelectedProfileIds(new Set())
    setSyncSourceProfileId('')
    setSyncTargetProfileIds(new Set())
    setBindingMode('shared')
    setBindingEnabled(true)
    setBindings([])
    try {
      const detail = await fetchBrowserExtension(record.extensionId)
      if (detail) {
        setSelectedExtension(detail)
      }
    } catch (error: unknown) {
      toast.error(errorMessage(error, '加载扩展详情失败'), 6000)
    }
    await Promise.all([
      loadProfiles(),
      loadBindings(record.extensionId),
    ])
  }

  const handleOpenAutoBind = (record: BrowserExtension) => {
    setSelectedExtension(record)
    setAutoBindEnabled(Boolean(record.autoBindEnabled))
    setAutoBindMode(record.autoBindMode === 'exclusive' ? 'exclusive' : 'shared')
    setAutoBindModalOpen(true)
  }

  const loadProfiles = async () => {
    try {
      const list = await fetchBrowserProfiles()
      setProfiles(list)
      return list
    } catch (error: unknown) {
      toast.error(errorMessage(error, '加载实例列表失败'), 6000)
      return []
    }
  }

  const loadBindings = async (extensionId: string) => {
    const id = extensionId.trim()
    if (!id) return
    setBindingsLoading(true)
    try {
      const list = await fetchBrowserExtensionProfileBindings(id)
      setBindings(list)
    } catch (error: unknown) {
      toast.error(errorMessage(error, '加载扩展绑定失败'), 6000)
    } finally {
      setBindingsLoading(false)
    }
  }

  const canVisibleRefresh = !detailOpen && !bindingModalOpen && !autoBindModalOpen && !deleteConfirmOpen && !importModalOpen && !importing && !bindingSaving && !autoBindSaving && !syncingData
  useVisibleRefresh(() => {
    void loadData(true)
    void loadProfiles()
  }, 2000, canVisibleRefresh)

  useEffect(() => {
    const refreshSelectedExtension = async () => {
      const extensionId = selectedExtension?.extensionId
      if (!extensionId) return
      const detail = await fetchBrowserExtension(extensionId)
      if (detail) {
        setSelectedExtension(detail)
      } else {
        setDetailOpen(false)
        setBindingModalOpen(false)
        setAutoBindModalOpen(false)
        setSelectedExtension(null)
        setBindings([])
      }
    }

    const offExtensionsUpdated = onRuntimeEvent('browser:extensions:updated', () => {
      void loadData(true)
      void refreshSelectedExtension()
      if (bindingModalOpen && selectedExtension?.extensionId) {
        void loadBindings(selectedExtension.extensionId)
      }
    })
    const offProfilesUpdated = onRuntimeEvent('browser:profiles:updated', () => {
      void loadProfiles().then(list => {
        const validIds = new Set(list.map(profile => profile.profileId))
        setSelectedProfileIds(prev => {
          const next = new Set<string>()
          prev.forEach(profileId => {
            if (validIds.has(profileId)) {
              next.add(profileId)
            }
          })
          return next
        })
        setSyncTargetProfileIds(prev => {
          const next = new Set<string>()
          prev.forEach(profileId => {
            if (validIds.has(profileId)) {
              next.add(profileId)
            }
          })
          return next
        })
      })
    })

    return () => {
      offExtensionsUpdated?.()
      offProfilesUpdated?.()
    }
  }, [bindingModalOpen, selectedExtension?.extensionId])

  const handleDeleteClick = (record: BrowserExtension) => {
    setDeletingExtension(record)
    setDeleteConfirmOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingExtension) return
    try {
      await deleteBrowserExtension(deletingExtension.extensionId)
      await loadData(true)
      if (selectedExtension?.extensionId === deletingExtension.extensionId) {
        setDetailOpen(false)
        setSelectedExtension(null)
      }
      toast.success('扩展插件已删除')
    } catch (error: unknown) {
      toast.error(errorMessage(error, '删除扩展插件失败'), 6000)
    } finally {
      setDeletingExtension(null)
    }
  }

  const openImportModal = (type: 'archive' | 'directory') => {
    setImportType(type)
    setImportPath('')
    setDuplicateResult(null)
    setImportModalOpen(true)
  }

  const handleChooseImportPath = async () => {
    try {
      const result = importType === 'archive'
        ? await chooseBrowserExtensionArchive()
        : await chooseBrowserExtensionDirectory()
      if (!result?.cancelled && result?.path) {
        setImportPath(result.path)
      }
    } catch (error: unknown) {
      toast.error(errorMessage(error, '选择路径失败'), 6000)
    }
  }

  const runImport = async (mode: 'ask' | 'overwrite' | 'new' | 'cancel' = 'ask') => {
    const path = importPath.trim()
    if (!path) {
      toast.warning(importType === 'archive' ? '请选择扩展压缩包' : '请选择扩展目录')
      return
    }
    setImporting(true)
    try {
      const result = importType === 'archive'
        ? await importBrowserExtensionArchive({ path, mode })
        : await importBrowserExtensionDirectory({ path, mode })
      if (result.duplicate) {
        setDuplicateResult(result)
        return
      }
      if (result.cancelled) {
        toast.info(result.message || '已取消导入')
        setImportModalOpen(false)
        return
      }
      toast.success(result.message || '扩展插件导入成功')
      setImportModalOpen(false)
      setDuplicateResult(null)
      await loadData(true)
      if (result.extension) {
        setSelectedExtension(result.extension)
        setDetailOpen(true)
      }
    } catch (error: unknown) {
      toast.error(errorMessage(error, '导入扩展插件失败'), 6000)
    } finally {
      setImporting(false)
    }
  }

  const importPathDirectly = async (path: string): Promise<{ imported: boolean; duplicate: boolean; extension?: BrowserExtension | null }> => {
    const trimmed = path.trim()
    if (!trimmed) return { imported: false, duplicate: false }
    const type = importTypeFromPath(trimmed)
    const result = type === 'archive'
      ? await importBrowserExtensionArchive({ path: trimmed, mode: 'ask' })
      : await importBrowserExtensionDirectory({ path: trimmed, mode: 'ask' })
    if (result.duplicate) {
      setImportType(type)
      setImportPath(trimmed)
      setDuplicateResult(result)
      setImportModalOpen(true)
      return { imported: false, duplicate: true }
    }
    return {
      imported: !result.cancelled,
      duplicate: false,
      extension: result.extension,
    }
  }

  const handleDroppedPaths = async (paths: string[]) => {
    const validPaths = paths.map(item => String(item || '').trim()).filter(Boolean)
    if (validPaths.length === 0) return
    setImporting(true)
    let success = 0
    let stoppedForDuplicate = false
    let lastExtension: BrowserExtension | null = null
    try {
      for (const path of validPaths) {
        const result = await importPathDirectly(path)
        if (result.duplicate) {
          stoppedForDuplicate = true
          break
        }
        if (result.imported) {
          success += 1
          if (result.extension) {
            lastExtension = result.extension
          }
        }
      }
      if (success > 0) {
        await loadData(true)
        toast.success(success === 1 ? '扩展插件导入成功' : `已导入 ${success} 个扩展插件`)
        if (lastExtension) {
          setSelectedExtension(lastExtension)
          setDetailOpen(true)
        }
      }
      if (stoppedForDuplicate) {
        toast.info('发现重复扩展，请在弹窗中选择处理方式')
      }
    } catch (error: unknown) {
      toast.error(errorMessage(error, '拖拽导入扩展失败'), 6000)
    } finally {
      setImporting(false)
    }
  }

  const bindingMap = useMemo(() => {
    const map = new Map<string, BrowserExtensionBinding>()
    bindings.forEach(item => map.set(item.profileId, item))
    return map
  }, [bindings])

  const boundProfileIds = useMemo(() => new Set(bindings.map(item => item.profileId)), [bindings])

  const syncSourceCandidates = useMemo(() => (
    sortedProfiles.filter(profile => {
      const binding = bindingMap.get(profile.profileId)
      return Boolean(binding?.enabled) && !profile.running
    })
  ), [sortedProfiles, bindingMap])

  const syncTargetCandidates = useMemo(() => (
    sortedProfiles.filter(profile => {
      const binding = bindingMap.get(profile.profileId)
      return Boolean(binding?.enabled) && binding?.mode === 'shared' && !profile.running && profile.profileId !== syncSourceProfileId
    })
  ), [sortedProfiles, bindingMap, syncSourceProfileId])

  const syncSourceOptions = useMemo(() => (
    syncSourceCandidates.length > 0
      ? syncSourceCandidates.map(profile => ({ value: profile.profileId, label: profile.profileName || profile.profileId }))
      : [{ value: '', label: '暂无可选主实例' }]
  ), [syncSourceCandidates])

  const syncTargetCandidateIds = useMemo(() => new Set(syncTargetCandidates.map(profile => profile.profileId)), [syncTargetCandidates])

  const syncSelectedTargetCount = useMemo(() => (
    Array.from(syncTargetProfileIds).filter(profileId => syncTargetCandidateIds.has(profileId)).length
  ), [syncTargetProfileIds, syncTargetCandidateIds])

  useEffect(() => {
    if (!bindingModalOpen) return
    setSyncSourceProfileId(prev => (
      prev && syncSourceCandidates.some(profile => profile.profileId === prev)
        ? prev
        : (syncSourceCandidates[0]?.profileId || '')
    ))
  }, [bindingModalOpen, syncSourceCandidates])

  useEffect(() => {
    setSyncTargetProfileIds(prev => {
      const next = new Set<string>()
      prev.forEach(profileId => {
        if (syncTargetCandidateIds.has(profileId)) {
          next.add(profileId)
        }
      })
      return next
    })
  }, [syncTargetCandidateIds])

  const toggleProfileSelection = (profileId: string) => {
    if (boundProfileIds.has(profileId)) return
    setSelectedProfileIds(prev => {
      const next = new Set(prev)
      if (next.has(profileId)) {
        next.delete(profileId)
      } else {
        next.add(profileId)
      }
      return next
    })
  }

  const handleSelectUnboundProfiles = () => {
    setSelectedProfileIds(new Set(sortedProfiles.filter(profile => !boundProfileIds.has(profile.profileId)).map(profile => profile.profileId)))
  }

  const handleClearProfileSelection = () => {
    setSelectedProfileIds(new Set())
  }

  const toggleSyncTargetProfile = (profileId: string) => {
    if (!syncTargetCandidateIds.has(profileId)) return
    setSyncTargetProfileIds(prev => {
      const next = new Set(prev)
      if (next.has(profileId)) {
        next.delete(profileId)
      } else {
        next.add(profileId)
      }
      return next
    })
  }

  const handleSelectAllSyncTargets = () => {
    setSyncTargetProfileIds(new Set(syncTargetCandidates.map(profile => profile.profileId)))
  }

  const handleClearSyncTargets = () => {
    setSyncTargetProfileIds(new Set())
  }

  const refreshSelectedExtension = async () => {
    if (!selectedExtension) return
    const detail = await fetchBrowserExtension(selectedExtension.extensionId)
    if (detail) {
      setSelectedExtension(detail)
    }
    await loadData(true)
  }

  const handleSaveAutoBind = async () => {
    if (!selectedExtension) return
    setAutoBindSaving(true)
    try {
      const detail = await setBrowserExtensionAutoBind({
        extensionId: selectedExtension.extensionId,
        enabled: autoBindEnabled,
        mode: autoBindMode,
      })
      if (detail) {
        setSelectedExtension(detail)
      }
      await loadData(true)
      if (bindingModalOpen) {
        await loadBindings(selectedExtension.extensionId)
      }
      setAutoBindModalOpen(false)
      const runningCount = profiles.filter(profile => profile.running).length
      toast.success(autoBindEnabled && runningCount > 0 ? `自动绑定已开启，${runningCount} 个运行中实例需重启后生效` : (autoBindEnabled ? '自动绑定已开启' : '自动绑定已关闭'))
    } catch (error: unknown) {
      toast.error(errorMessage(error, '保存自动绑定失败'), 6000)
    } finally {
      setAutoBindSaving(false)
    }
  }

  const handleAssignSelectedProfiles = async () => {
    if (!selectedExtension) return
    const profileIds = Array.from(selectedProfileIds).filter(profileId => !boundProfileIds.has(profileId))
    if (profileIds.length === 0) {
      toast.warning('请选择要绑定的实例')
      return
    }
    setBindingSaving(true)
    try {
      const list = await assignBrowserExtensionProfiles({
        extensionId: selectedExtension.extensionId,
        profileIds,
        mode: bindingMode,
        enabled: bindingEnabled,
      })
      setBindings(list)
      setSelectedProfileIds(new Set())
      await refreshSelectedExtension()
      const runningCount = profiles.filter(profile => profileIds.includes(profile.profileId) && profile.running).length
      toast.success(runningCount > 0 ? `扩展绑定已保存，${runningCount} 个运行中实例需重启后生效` : '扩展绑定已保存')
    } catch (error: unknown) {
      toast.error(errorMessage(error, '保存扩展绑定失败'), 6000)
    } finally {
      setBindingSaving(false)
    }
  }

  const handleUnassignProfiles = async (profileIds: string[]) => {
    if (!selectedExtension || profileIds.length === 0) return
    setBindingSaving(true)
    try {
      const list = await unassignBrowserExtensionProfiles({
        extensionId: selectedExtension.extensionId,
        profileIds,
      })
      setBindings(list)
      setSelectedProfileIds(prev => {
        const next = new Set(prev)
        profileIds.forEach(id => next.delete(id))
        return next
      })
      await refreshSelectedExtension()
      const runningCount = profiles.filter(profile => profileIds.includes(profile.profileId) && profile.running).length
      toast.success(runningCount > 0 ? `扩展绑定已移除，${runningCount} 个运行中实例需重启后生效` : '扩展绑定已移除')
    } catch (error: unknown) {
      toast.error(errorMessage(error, '移除扩展绑定失败'), 6000)
    } finally {
      setBindingSaving(false)
    }
  }

  const handleUpdateBinding = async (binding: BrowserExtensionBinding, changes: Partial<Pick<BrowserExtensionBinding, 'mode' | 'enabled'>>) => {
    if (!selectedExtension) return
    const nextMode = changes.mode || binding.mode || 'shared'
    const nextEnabled = changes.enabled ?? binding.enabled
    setBindingSaving(true)
    try {
      const list = await assignBrowserExtensionProfiles({
        extensionId: selectedExtension.extensionId,
        profileIds: [binding.profileId],
        mode: nextMode,
        enabled: nextEnabled,
      })
      setBindings(list)
      await refreshSelectedExtension()
      const profile = profiles.find(item => item.profileId === binding.profileId)
      const message = '扩展绑定已更新'
      toast.success(profile?.running ? `${message}，运行中实例需重启后生效` : message)
    } catch (error: unknown) {
      toast.error(errorMessage(error, '更新扩展绑定失败'), 6000)
    } finally {
      setBindingSaving(false)
    }
  }

  const handleSyncExtensionData = async () => {
    if (!selectedExtension) return
    const targetProfileIds = Array.from(syncTargetProfileIds).filter(profileId => syncTargetCandidateIds.has(profileId))
    if (!syncSourceProfileId) {
      toast.warning('请选择主实例')
      return
    }
    if (targetProfileIds.length === 0) {
      toast.warning('请选择副实例')
      return
    }
    setSyncingData(true)
    try {
      const list = await syncBrowserExtensionData({
        extensionId: selectedExtension.extensionId,
        sourceProfileId: syncSourceProfileId,
        targetProfileIds,
      })
      setBindings(list)
      await refreshSelectedExtension()
      toast.success(`数据同步完成：${targetProfileIds.length} 个副实例已更新`)
    } catch (error: unknown) {
      toast.error(errorMessage(error, '数据同步失败'), 6000)
    } finally {
      setSyncingData(false)
    }
  }

  const columns: TableColumn<BrowserExtension>[] = useMemo(() => [
    {
      key: 'name',
      title: '扩展名称',
      width: '32%',
      headerAlign: 'center',
      render: (_, record) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
            <span className="font-medium text-[var(--color-text-primary)] truncate" title={record.name || record.extensionId}>{record.name || record.extensionId}</span>
            {record.autoBindEnabled && (
              <Badge size="sm" variant="success">自动{bindingModeLabel(record.autoBindMode)}</Badge>
            )}
          </div>
          {record.description && (
            <p className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-1">{record.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'version',
      title: '版本',
      width: '9%',
      align: 'center',
      render: (value) => String(value ?? '-') || '-',
    },
    {
      key: 'manifestVersion',
      title: 'Manifest',
      width: '10%',
      align: 'center',
      render: (value) => value ? `MV${String(value)}` : '-',
    },
    {
      key: 'sourceType',
      title: '来源',
      width: '10%',
      align: 'center',
      render: (value) => <Badge variant="default">{sourceLabel(typeof value === 'string' ? value : '')}</Badge>,
    },
    {
      key: 'boundCount',
      title: '绑定实例',
      width: '10%',
      align: 'center',
      render: (value) => {
        const count = typeof value === 'number' ? value : 0
        return <Badge variant={count > 0 ? 'info' : 'default'}>{count}</Badge>
      },
    },
    {
      key: 'updatedAt',
      title: '更新时间',
      width: '15%',
      align: 'center',
      render: (value) => formatTime(typeof value === 'string' ? value : ''),
    },
    {
      key: 'actions',
      title: '操作',
      width: '14%',
      align: 'center',
      render: (_, record) => (
        <div className="flex items-center justify-center gap-1.5" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant="secondary" onClick={() => handleOpenBinding(record)} title="绑定实例">
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={record.autoBindEnabled ? 'primary' : 'secondary'}
            onClick={() => handleOpenAutoBind(record)}
            title={record.autoBindEnabled ? `自动绑定：${bindingModeLabel(record.autoBindMode)}` : '自动绑定'}
          >
            <Settings2 className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => handleDeleteClick(record)}
            title={record.boundCount > 0 ? '强制删除扩展，会先校验绑定实例是否全部未运行' : '删除扩展'}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ], [selectedExtension?.extensionId])

  return (
    <div
      className="relative space-y-5 animate-fade-in"
      data-file-drop-target="extension-import"
      style={{ '--wails-drop-target': 'drop' } as CSSProperties}
      onDragEnter={() => setDragActive(true)}
      onDragOver={(event) => {
        event.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setDragActive(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragActive(false)
        const files = Array.from(event.dataTransfer.files || [])
        if (files.length > 0) {
          toast.info('正在解析拖入文件路径...')
        }
      }}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent)]/10 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] px-5 py-4 shadow-lg">
            <UploadCloud className="w-6 h-6 text-[var(--color-accent)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">松开后自动导入扩展</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">支持 ZIP、CRX 和已解压的扩展目录，目录会自动识别层级</p>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">扩展插件管理</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">管理已登记的浏览器扩展插件，支持拖拽 ZIP、CRX 或扩展目录导入</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => openImportModal('directory')}>
            <FolderOpen className="w-4 h-4" />
            导入目录
          </Button>
          <Button size="sm" onClick={() => openImportModal('archive')}>
            <Archive className="w-4 h-4" />
            导入压缩包
          </Button>
          <Button size="sm" variant="secondary" onClick={() => loadData(true)} loading={refreshing}>
            {!refreshing && <RefreshCw className="w-4 h-4" />}
            刷新
          </Button>
        </div>
      </div>

      <Card title="扩展列表" subtitle="支持绑定实例、自动绑定和安全删除扩展">
        <Table
          columns={columns}
          data={extensions}
          rowKey="extensionId"
          loading={loading}
          emptyText="暂无扩展插件，可以从本地压缩包或解压目录导入。"
          onRowClick={handleOpenDetail}
          tableLayout="fixed"
          tableMinWidth="1060px"
        />
      </Card>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="扩展详情"
        width="860px"
        footer={<Button variant="secondary" onClick={() => setDetailOpen(false)}>关闭</Button>}
      >
        {detailLoading ? (
          <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">正在加载详情...</div>
        ) : selectedExtension ? (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{selectedExtension.name || selectedExtension.extensionId}</h3>
              {selectedExtension.description && (
                <p className="text-sm text-[var(--color-text-muted)] mt-1">{selectedExtension.description}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DetailItem label="扩展 ID" value={selectedExtension.extensionId} />
              <DetailItem label="版本" value={selectedExtension.version || '-'} />
              <DetailItem label="Manifest 版本" value={selectedExtension.manifestVersion ? `MV${selectedExtension.manifestVersion}` : '-'} />
              <DetailItem label="来源" value={sourceLabel(selectedExtension.sourceType)} />
              <DetailItem label="绑定实例数量" value={String(selectedExtension.boundCount || 0)} />
              <DetailItem label="自动绑定" value={selectedExtension.autoBindEnabled ? `开启 / ${bindingModeLabel(selectedExtension.autoBindMode)}` : '关闭'} />
              <DetailItem label="更新时间" value={formatTime(selectedExtension.updatedAt)} />
              <DetailItem label="安装目录" value={selectedExtension.installDir || '-'} wide />
              <DetailItem label="来源地址" value={selectedExtension.sourceUrl || '-'} wide />
              <DetailItem label="原始包路径" value={selectedExtension.packagePath || '-'} wide />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">Manifest 快照</p>
              <pre className="max-h-72 overflow-auto rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-muted)] p-3 text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
                {selectedExtension.manifestJson || '-'}
              </pre>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">未选择扩展</div>
        )}
      </Modal>

      <Modal
        open={bindingModalOpen}
        onClose={() => {
          if (!bindingSaving && !syncingData) setBindingModalOpen(false)
        }}
        title="绑定实例"
        width="980px"
        footer={<Button variant="secondary" onClick={() => setBindingModalOpen(false)} disabled={bindingSaving || syncingData}>关闭</Button>}
      >
        {selectedExtension ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-[var(--color-text-primary)]">{selectedExtension.name || selectedExtension.extensionId}</h3>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">已绑定 {bindings.length} 个实例，当前扩展 ID：{selectedExtension.extensionId}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => selectedExtension && loadBindings(selectedExtension.extensionId)} loading={bindingsLoading}>
                {!bindingsLoading && <RefreshCw className="w-4 h-4" />}
                刷新
              </Button>
            </div>

            <div className="rounded-lg border border-[var(--color-border-default)] overflow-hidden">
              <div className="grid grid-cols-[34px_minmax(220px,1fr)_86px_96px_270px] items-center gap-2 bg-[var(--color-bg-muted)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]">
                <span />
                <span>实例</span>
                <span>运行</span>
                <span>绑定</span>
                <span className="text-right">操作</span>
              </div>
              <div className="max-h-80 overflow-auto divide-y divide-[var(--color-border-default)]">
                {sortedProfiles.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">暂无浏览器实例</div>
                ) : sortedProfiles.map(profile => {
                  const binding = bindingMap.get(profile.profileId)
                  const checked = selectedProfileIds.has(profile.profileId)
                  return (
                    <div key={profile.profileId} className="grid grid-cols-[34px_minmax(220px,1fr)_86px_96px_270px] items-center gap-2 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProfileSelection(profile.profileId)}
                        disabled={bindingSaving || Boolean(binding)}
                        className="h-4 w-4"
                        title={binding ? '已绑定实例不能重复选择' : '选择后批量绑定'}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-[var(--color-text-primary)]">{profile.profileName || profile.profileId}</p>
                        <p className="truncate text-xs text-[var(--color-text-muted)]">{profile.profileId}</p>
                      </div>
                      <Badge variant={profile.running ? 'success' : 'default'}>{profile.running ? '运行中' : '未运行'}</Badge>
                      <Badge variant={binding?.enabled ? 'success' : binding ? 'default' : 'default'}>{binding ? (binding.enabled ? '启用' : '停用') : '未绑定'}</Badge>
                      <div className="flex items-center justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
                        {binding ? (
                          <>
                            <Select
                              value={binding.mode === 'exclusive' ? 'exclusive' : 'shared'}
                              onChange={(event) => handleUpdateBinding(binding, { mode: event.target.value })}
                              disabled={bindingSaving}
                              className="w-24"
                              options={[
                                { value: 'shared', label: '共享' },
                                { value: 'exclusive', label: '独享' },
                              ]}
                            />
                            <Select
                              value={binding.enabled ? 'enabled' : 'disabled'}
                              onChange={(event) => handleUpdateBinding(binding, { enabled: event.target.value === 'enabled' })}
                              disabled={bindingSaving}
                              className="w-20"
                              options={[
                                { value: 'enabled', label: '启用' },
                                { value: 'disabled', label: '停用' },
                              ]}
                            />
                            <Button size="sm" variant="danger" onClick={() => handleUnassignProfiles([profile.profileId])} disabled={bindingSaving} title="解绑当前实例">
                              <EyeOff className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-[var(--color-text-muted)]">勾选后批量绑定</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">数据同步</h4>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">主实例和副实例都需要处于未运行状态</p>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(260px,1fr)_auto_auto_auto] gap-2 items-end">
                  <FormItem label="主实例">
                    <Select
                      value={syncSourceProfileId}
                      onChange={(event) => {
                        const nextSourceId = event.target.value
                        setSyncSourceProfileId(nextSourceId)
                        setSyncTargetProfileIds(prev => {
                          const next = new Set(prev)
                          next.delete(nextSourceId)
                          return next
                        })
                      }}
                      disabled={syncingData || syncSourceCandidates.length === 0}
                      options={syncSourceOptions}
                    />
                  </FormItem>

                  <Button className="md:self-end" onClick={handleSyncExtensionData} loading={syncingData} disabled={!syncSourceProfileId || syncSelectedTargetCount === 0}>
                    {!syncingData && <RefreshCw className="w-4 h-4" />}
                    执行数据同步
                  </Button>
                  <Button size="sm" variant="secondary" className="md:self-end" onClick={handleSelectAllSyncTargets} disabled={syncingData || syncTargetCandidates.length === 0}>选择副实例</Button>
                  <Button size="sm" variant="ghost" className="md:self-end" onClick={handleClearSyncTargets} disabled={syncingData || syncTargetProfileIds.size === 0}>清空</Button>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--color-text-secondary)]">副实例</p>
                    <span className="text-xs text-[var(--color-text-muted)]">已选 {syncSelectedTargetCount} / {syncTargetCandidates.length}</span>
                  </div>
                  <div className="min-h-[96px] max-h-48 overflow-auto rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-2">
                    {syncTargetCandidates.length === 0 ? (
                      <div className="flex min-h-[76px] items-center justify-center text-xs text-[var(--color-text-muted)]">暂无可选副实例</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-1.5">
                        {syncTargetCandidates.map(profile => {
                          const checked = syncTargetProfileIds.has(profile.profileId)
                          const label = profile.profileName || profile.profileId
                          return (
                            <label
                              key={profile.profileId}
                              title={`${label} (${profile.profileId})`}
                              className={`grid h-11 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md border px-2 text-xs transition-colors ${
                                checked
                                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text-primary)]'
                                  : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={syncingData}
                                onChange={() => toggleSyncTargetProfile(profile.profileId)}
                                className="h-4 w-4"
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{label}</span>
                                <span className="block truncate text-[10px] text-[var(--color-text-muted)]">{profile.profileId}</span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_120px_auto] gap-2 items-end">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={handleSelectUnboundProfiles} disabled={bindingSaving || profiles.length === 0}>选择未绑定</Button>
                <Button size="sm" variant="ghost" onClick={handleClearProfileSelection} disabled={bindingSaving || selectedProfileIds.size === 0}>清空选择</Button>
                <span className="text-xs text-[var(--color-text-muted)]">已选 {selectedProfileIds.size} 个实例</span>
                {selectedProfilesNeedRestart && (
                  <span className="text-xs text-[var(--color-warning)]">运行中实例需重启后生效</span>
                )}
              </div>
              <FormItem label="绑定模式">
                <Select
                  value={bindingMode}
                  onChange={(event) => setBindingMode(event.target.value as 'shared' | 'exclusive')}
                  disabled={bindingSaving}
                  options={[
                    { value: 'shared', label: '共享' },
                    { value: 'exclusive', label: '独享' },
                  ]}
                />
              </FormItem>
              <FormItem label="状态">
                <Select
                  value={bindingEnabled ? 'enabled' : 'disabled'}
                  onChange={(event) => setBindingEnabled(event.target.value === 'enabled')}
                  disabled={bindingSaving}
                  options={[
                    { value: 'enabled', label: '启用' },
                    { value: 'disabled', label: '停用' },
                  ]}
                />
              </FormItem>
              <Button onClick={handleAssignSelectedProfiles} loading={bindingSaving} disabled={selectedProfileIds.size === 0}>
                {!bindingSaving && <Link2 className="w-4 h-4" />}
                保存绑定
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">未选择扩展</div>
        )}
      </Modal>

      <Modal
        open={autoBindModalOpen}
        onClose={() => {
          if (!autoBindSaving) setAutoBindModalOpen(false)
        }}
        title="自动绑定"
        width="520px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAutoBindModalOpen(false)} disabled={autoBindSaving}>取消</Button>
            <Button onClick={handleSaveAutoBind} loading={autoBindSaving}>保存</Button>
          </>
        }
      >
        {selectedExtension ? (
          <div className="space-y-4">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-[var(--color-text-primary)]">{selectedExtension.name || selectedExtension.extensionId}</h3>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{selectedExtension.extensionId}</p>
            </div>
            <FormItem label="自动绑定">
              <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2">
                <Switch checked={autoBindEnabled} onChange={setAutoBindEnabled} disabled={autoBindSaving} />
                <span className="text-sm text-[var(--color-text-secondary)]">{autoBindEnabled ? '开启' : '关闭'}</span>
              </div>
            </FormItem>
            <FormItem label="自动绑定模式">
              <Select
                value={autoBindMode}
                onChange={(event) => setAutoBindMode(event.target.value as 'shared' | 'exclusive')}
                disabled={autoBindSaving || !autoBindEnabled}
                options={[
                  { value: 'shared', label: '共享' },
                  { value: 'exclusive', label: '独享' },
                ]}
              />
            </FormItem>
            <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-muted)] p-3 text-xs text-[var(--color-text-secondary)]">
              开启后，新建、复制和启动实例时会自动绑定该扩展；保存时也会立即绑定当前已有实例。
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">未选择扩展</div>
        )}
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => {
          if (!importing) setImportModalOpen(false)
        }}
        title={importType === 'archive' ? '导入扩展压缩包' : '导入扩展目录'}
        width="620px"
        footer={
          duplicateResult ? (
            <>
              <Button variant="secondary" onClick={() => runImport('cancel')} disabled={importing}>取消导入</Button>
              <Button variant="secondary" onClick={() => runImport('new')} loading={importing}>作为新扩展导入</Button>
              <Button onClick={() => runImport('overwrite')} loading={importing}>覆盖已有扩展</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setImportModalOpen(false)} disabled={importing}>取消</Button>
              <Button onClick={() => runImport('ask')} loading={importing}>导入</Button>
            </>
          )
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={importType === 'archive' ? 'primary' : 'secondary'}
              onClick={() => {
                setImportType('archive')
                setDuplicateResult(null)
              }}
              disabled={importing}
            >
              <Archive className="w-4 h-4" />
              压缩包
            </Button>
            <Button
              variant={importType === 'directory' ? 'primary' : 'secondary'}
              onClick={() => {
                setImportType('directory')
                setDuplicateResult(null)
              }}
              disabled={importing}
            >
              <FolderOpen className="w-4 h-4" />
              目录
            </Button>
          </div>

          <FormItem label={importType === 'archive' ? '扩展压缩包路径' : '扩展目录路径'} required>
            <div className="flex gap-2">
              <Input
                value={importPath}
                onChange={(event) => {
                  setImportPath(event.target.value)
                  setDuplicateResult(null)
                }}
                placeholder={importType === 'archive' ? '选择或输入 .zip / .crx 文件路径' : '选择或输入包含 manifest.json 的目录'}
                disabled={importing}
              />
              <Button variant="secondary" onClick={handleChooseImportPath} disabled={importing}>
                选择
              </Button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {importType === 'archive'
                ? '支持 ZIP 和可解包的 CRX，本地导入成功后会复制到扩展库。'
                : '目录内需要包含 manifest.json，导入时会复制一份到扩展库。'}
            </p>
          </FormItem>

          {duplicateResult?.existing && (
            <div className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-3">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">发现同名同版本扩展</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                已有扩展：{duplicateResult.existing.name || duplicateResult.existing.extensionId} / {duplicateResult.existing.version || '-'}
              </p>
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                可以覆盖已有扩展目录，也可以作为一个新的扩展副本导入。
              </p>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="确认删除扩展"
        content={`确定要删除扩展插件"${deletingExtension?.name || deletingExtension?.extensionId || ''}"吗？此操作会移除绑定关系并删除插件库目录；如果存在运行中的绑定实例，系统会拒绝删除。`}
        confirmText="删除"
        danger
      />
    </div>
  )
}

function DetailItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'md:col-span-2' : undefined}>
      <p className="text-xs text-[var(--color-text-muted)] mb-1">{label}</p>
      <p className="text-sm text-[var(--color-text-primary)] break-words">{value}</p>
    </div>
  )
}
