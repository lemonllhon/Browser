import { useEffect, useState, useCallback, useRef } from 'react'
import { Download, Edit2, FolderOpen, RefreshCw, Settings, XCircle } from 'lucide-react'
import { Badge, Button, Card, ConfirmModal, FormItem, Input, Modal, Table, Textarea, toast } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'
import type { BrowserCore, BrowserCoreInput, BrowserCoreValidateResult, BrowserSettings, BrowserCoreExtended, BrowserProxy } from '../types'
import { saveBrowserCore, deleteBrowserCore, setDefaultBrowserCore, validateBrowserCorePath, openCorePath, saveBrowserSettings, fetchCoreExtendedInfo, scanBrowserCores, BrowserCoreDownload, onBrowserCoreDownloadProgress, cancelBrowserCoreDownload, renameBrowserCorePath } from '../api'
import { onRuntimeEvent, openExternalURL } from '../../../shared/backend/runtime'
import { resolveActionErrorMessage } from '../utils/actionErrors'
import { useVisibleRefresh } from '../hooks/useVisibleRefresh'
import { useSingleFlightCallback } from '../hooks/useSingleFlightCallback'
import { getBrowserSharedDataSnapshot, refreshBrowserSharedData, useBrowserSharedData } from '../stores/browserSharedDataStore'

interface CoreDisplayInfo {
  coreId: string
  coreName: string
  corePath: string
  isDefault: boolean
  pathValid: boolean
  pathMessage: string
  chromeVersion: string
  instanceCount: number
}

type CoreDownloadSource = 'github' | 'custom'

type CoreDownloadProgressInfo = {
  phase: string
  progress: number
  message: string
  corePath?: string
}

interface GithubCoreAsset {
  id: number
  releaseName: string
  tagName: string
  assetName: string
  url: string
  size: number
  updatedAt: string
}

type GithubReleasePayload = {
  name?: unknown
  tag_name?: unknown
  assets?: unknown
  published_at?: unknown
}

type GithubAssetPayload = {
  id?: unknown
  name?: unknown
  browser_download_url?: unknown
  size?: unknown
  updated_at?: unknown
}

const FINGERPRINT_CHROMIUM_RELEASES_API = 'https://api.github.com/repos/adryfish/fingerprint-chromium/releases'
const FINGERPRINT_CHROMIUM_RELEASES_PAGE = 'https://github.com/adryfish/fingerprint-chromium/releases'
const CORE_DOWNLOAD_TERMINAL_PHASES = new Set(['done', 'error', 'cancelled'])

type BrowserSettingsField = keyof BrowserSettings

function settingsToForm(settings: BrowserSettings) {
  return {
    userDataRoot: settings.userDataRoot,
    defaultProxy: settings.defaultProxy,
    defaultFingerprintArgs: (settings.defaultFingerprintArgs || []).join('\n'),
    defaultLaunchArgs: (settings.defaultLaunchArgs || []).join('\n'),
    startReadyTimeoutMs: settings.startReadyTimeoutMs,
    startStableWindowMs: settings.startStableWindowMs,
  }
}

const isCoreDownloadActive = (progress: CoreDownloadProgressInfo | null) => {
  return !!progress && !CORE_DOWNLOAD_TERMINAL_PHASES.has(progress.phase)
}

const getCorePathFolderName = (corePath: string) => {
  const parts = String(corePath || '').replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}

const buildRenamedCorePath = (corePath: string, newFolderName: string) => {
  const parts = String(corePath || '').replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length === 0) return newFolderName
  parts[parts.length - 1] = newFolderName
  return parts.join('/')
}

const formatAssetSize = (bytes: number) => {
  if (!bytes || bytes <= 0) return '-'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const deriveCoreNameFromAsset = (asset: GithubCoreAsset) => {
  const base = asset.assetName
    .replace(/\.(zip|7z|tar\.gz|tgz)$/i, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || asset.tagName || 'chrome-core'
}

export function CoreManagementPage() {
  const [cores, setCores] = useState<BrowserCore[]>([])
  const [displayList, setDisplayList] = useState<CoreDisplayInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)

  // 全局设置状态
  const [settings, setSettings] = useState<BrowserSettings>({
    userDataRoot: '',
    defaultFingerprintArgs: [],
    defaultLaunchArgs: [],
    defaultProxy: '',
    startReadyTimeoutMs: 3000,
    startStableWindowMs: 1200,
  })
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    userDataRoot: '',
    defaultProxy: '',
    defaultFingerprintArgs: '',
    defaultLaunchArgs: '',
    startReadyTimeoutMs: 3000,
    startStableWindowMs: 1200,
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const dirtySettingsFieldsRef = useRef<Set<BrowserSettingsField>>(new Set())

  // 编辑弹窗状态
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingCore, setEditingCore] = useState<BrowserCore | null>(null)
  const [editForm, setEditForm] = useState({ coreName: '', corePath: '' })
  const [saving, setSaving] = useState(false)
  const [pathValidating, setPathValidating] = useState(false)
  const [pathValidResult, setPathValidResult] = useState<BrowserCoreValidateResult | null>(null)

  // 删除确认状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingCore, setDeletingCore] = useState<CoreDisplayInfo | null>(null)

  // 内核下载
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [downloadForm, setDownloadForm] = useState({ name: '', url: '', proxyMode: 'system', proxyId: '', source: 'github' as CoreDownloadSource, selectedAssetUrl: '' })
  const [downloadProgress, setDownloadProgress] = useState<CoreDownloadProgressInfo | null>(null)
  const [downloadStarting, setDownloadStarting] = useState(false)
  const [downloadCancelling, setDownloadCancelling] = useState(false)
  const [downloadRenaming, setDownloadRenaming] = useState(false)
  const [downloadRenameValue, setDownloadRenameValue] = useState('')
  const [proxies, setProxies] = useState<BrowserProxy[]>([])
  const [githubAssets, setGithubAssets] = useState<GithubCoreAsset[]>([])
  const [githubLoading, setGithubLoading] = useState(false)
  const [githubError, setGithubError] = useState('')
  const lastDownloadPhaseRef = useRef('')
  const refreshCoreData = useSingleFlightCallback(() => loadData())
  const refreshDownloadProxies = useSingleFlightCallback(() => loadDownloadProxies())
  const sharedData = useBrowserSharedData(['cores', 'settings', 'proxies'])

  useEffect(() => {
    void refreshCoreData()
    void refreshDownloadProxies()

    // 监听下载进度
    const onDownloadProgress = (data: CoreDownloadProgressInfo) => {
      const phase = String(data.phase || 'downloading')
      const next: CoreDownloadProgressInfo = {
        phase,
        progress: Number.isFinite(data.progress) ? Math.max(0, Math.min(100, Math.round(data.progress))) : 0,
        message: String(data.message || ''),
        corePath: String(data.corePath || ''),
      }
      setDownloadProgress(next)
      if (CORE_DOWNLOAD_TERMINAL_PHASES.has(phase)) {
        setDownloadStarting(false)
        setDownloadCancelling(false)
      }
      if (phase !== lastDownloadPhaseRef.current) {
        lastDownloadPhaseRef.current = phase
        if (phase === 'done') {
          setDownloadRenameValue(getCorePathFolderName(next.corePath || ''))
          toast.success(next.message || '内核下载完成')
          void refreshCoreData()
        } else if (phase === 'error') {
          toast.error(next.message || '内核下载失败')
        } else if (phase === 'cancelled') {
          toast.warning(next.message || '下载已中断')
        }
      }
    }
    const offDownloadProgress = onBrowserCoreDownloadProgress(onDownloadProgress)
    const offSettingsUpdated = onRuntimeEvent('browser:settings:updated', () => { void refreshCoreData() })
    const offCoresUpdated = onRuntimeEvent('browser:cores:updated', () => { void refreshCoreData() })
    const offProxiesUpdated = onRuntimeEvent('browser:proxies:updated', () => { void refreshDownloadProxies() })

    return () => {
      offDownloadProgress?.()
      offSettingsUpdated?.()
      offCoresUpdated?.()
      offProxiesUpdated?.()
    }
  }, [refreshCoreData, refreshDownloadProxies])

  const applySettingsSnapshot = useCallback((settingsData: BrowserSettings, preserveDirty = false) => {
    setSettings(settingsData)
    if (!settingsModalOpen) return
    const latestForm = settingsToForm(settingsData)
    const dirtyFields = dirtySettingsFieldsRef.current
    setSettingsForm(prev => {
      if (!preserveDirty || dirtyFields.size === 0) return latestForm
      const next = { ...latestForm }
      dirtyFields.forEach(field => {
        switch (field) {
          case 'userDataRoot':
            next.userDataRoot = prev.userDataRoot
            break
          case 'defaultProxy':
            next.defaultProxy = prev.defaultProxy
            break
          case 'defaultFingerprintArgs':
            next.defaultFingerprintArgs = prev.defaultFingerprintArgs
            break
          case 'defaultLaunchArgs':
            next.defaultLaunchArgs = prev.defaultLaunchArgs
            break
          case 'startReadyTimeoutMs':
            next.startReadyTimeoutMs = prev.startReadyTimeoutMs
            break
          case 'startStableWindowMs':
            next.startStableWindowMs = prev.startStableWindowMs
            break
        }
      })
      return next
    })
  }, [settingsModalOpen])

  const loadData = async () => {
    setLoading(true)
    try {
      // 并行加载设置、内核列表和扩展信息
      await refreshBrowserSharedData(['settings', 'cores'], { silent: true })
      const [extendedInfo] = await Promise.all([fetchCoreExtendedInfo()])
      const snapshot = getBrowserSharedDataSnapshot()
      const settingsData = snapshot.browserSettings
      const coreList = snapshot.cores

      applySettingsSnapshot(settingsData, true)
      setCores(coreList)

      // 创建扩展信息映射
      const extendedMap = new Map<string, BrowserCoreExtended>()
      extendedInfo.forEach(info => extendedMap.set(info.coreId, info))

      // 验证所有路径并合并扩展信息
      const displayInfoList: CoreDisplayInfo[] = await Promise.all(
        coreList.map(async (core) => {
          const result = await validateBrowserCorePath(core.corePath)
          const extended = extendedMap.get(core.coreId)
          return {
            coreId: core.coreId,
            coreName: core.coreName,
            corePath: core.corePath,
            isDefault: core.isDefault,
            pathValid: result.valid,
            pathMessage: result.message,
            chromeVersion: extended?.chromeVersion || '',
            instanceCount: extended?.instanceCount || 0,
          }
        })
      )
      setDisplayList(displayInfoList)
    } finally {
      setLoading(false)
    }
  }

  const loadDownloadProxies = async () => {
    await refreshBrowserSharedData(['proxies'], { silent: true })
    const proxyList = getBrowserSharedDataSnapshot().proxies
    setProxies(proxyList)
    setDownloadForm(prev => {
      if (prev.proxyMode !== 'custom') return prev
      if (proxyList.some(proxy => proxy.proxyId === prev.proxyId)) return prev
      if (proxyList.length > 0) {
        return { ...prev, proxyId: proxyList[0].proxyId }
      }
      return { ...prev, proxyMode: 'system', proxyId: '' }
    })
  }

  useVisibleRefresh(() => {
    if (!settingsModalOpen) return
    return refreshBrowserSharedData(['settings'], { silent: true })
      .then(() => applySettingsSnapshot(getBrowserSharedDataSnapshot().browserSettings, true))
  }, 2000, settingsModalOpen && !savingSettings)

  useEffect(() => {
    if (sharedData.loaded.settings && !savingSettings) {
      applySettingsSnapshot(sharedData.browserSettings, true)
    }
  }, [applySettingsSnapshot, savingSettings, sharedData.browserSettings, sharedData.loaded.settings])

  useEffect(() => {
    if (sharedData.loaded.proxies) {
      setProxies(sharedData.proxies)
    }
  }, [sharedData.loaded.proxies, sharedData.proxies])

  // 防抖验证路径
  const validatePath = useCallback(async (path: string) => {
    if (!path.trim()) {
      setPathValidResult(null)
      return
    }
    setPathValidating(true)
    try {
      const result = await validateBrowserCorePath(path)
      setPathValidResult(result)
    } finally {
      setPathValidating(false)
    }
  }, [])

  // 路径输入变化时触发验证（防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (editModalOpen && editForm.corePath) {
        validatePath(editForm.corePath)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [editForm.corePath, editModalOpen, validatePath])

  const loadGithubCoreAssets = useCallback(async () => {
    setGithubLoading(true)
    setGithubError('')
    try {
      const response = await fetch(FINGERPRINT_CHROMIUM_RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json' },
      })
      if (!response.ok) {
        throw new Error(`GitHub Releases 获取失败：HTTP ${response.status}`)
      }
      const releases = await response.json()
      const releaseItems = Array.isArray(releases) ? releases as GithubReleasePayload[] : []
      const assets: GithubCoreAsset[] = []
      releaseItems.forEach(release => {
        const releaseName = String(release.name || release.tag_name || '未命名版本')
        const tagName = String(release.tag_name || '')
        const assetItems = Array.isArray(release.assets) ? release.assets as GithubAssetPayload[] : []
        assetItems.forEach(asset => {
          const assetName = String(asset.name || '')
          const url = String(asset.browser_download_url || '')
          if (!assetName || !url || /\.(zip|7z|tar\.gz|tgz)$/i.test(assetName) === false) return
          assets.push({
            id: Number(asset.id || assets.length + 1),
            releaseName,
            tagName,
            assetName,
            url,
            size: Number(asset.size || 0),
            updatedAt: String(asset.updated_at || release.published_at || ''),
          })
        })
      })
      setGithubAssets(assets)
      if (assets.length === 0) {
        setGithubError('未找到可下载的压缩包资产')
      }
    } catch (error: unknown) {
      setGithubError(resolveActionErrorMessage(error, '获取 GitHub 版本失败'))
      setGithubAssets([])
    } finally {
      setGithubLoading(false)
    }
  }, [])

  useEffect(() => {
    if (downloadModalOpen && downloadForm.source === 'github' && githubAssets.length === 0 && !githubLoading && !githubError) {
      void loadGithubCoreAssets()
    }
  }, [downloadModalOpen, downloadForm.source, githubAssets.length, githubLoading, githubError, loadGithubCoreAssets])

  const handleSelectGithubAsset = (assetUrl: string) => {
    const asset = githubAssets.find(item => item.url === assetUrl)
    setDownloadForm(prev => ({
      ...prev,
      selectedAssetUrl: assetUrl,
      url: asset?.url || '',
      name: asset ? deriveCoreNameFromAsset(asset) : prev.name,
    }))
  }

  // 表格列定义
  const columns: TableColumn<CoreDisplayInfo>[] = [
    { key: 'coreName', title: '内核名称', width: '150px' },
    { key: 'corePath', title: '内核路径', width: '180px' },
    {
      key: 'chromeVersion',
      title: 'Chrome 版本',
      width: '130px',
      render: (val) => String(val ?? '-') || '-',
    },
    {
      key: 'instanceCount',
      title: '使用实例',
      width: '90px',
      render: (val) => <Badge variant="default">{String(val ?? 0)}</Badge>,
    },
    {
      key: 'isDefault',
      title: '默认',
      width: '70px',
      render: (val) => val ? <Badge variant="info">默认</Badge> : null,
    },
    {
      key: 'pathValid',
      title: '状态',
      width: '80px',
      render: (val) => (
        <Badge variant={val ? 'success' : 'error'}>
          {val ? '有效' : '无效'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: '220px',
      render: (_, record) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleOpenPath(record.corePath) }} title="打开目录">
            <FolderOpen className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleEdit(record) }}>
            编辑
          </Button>
          {!record.isDefault && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleSetDefault(record.coreId) }}>
              设为默认
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); handleDeleteClick(record) }}>
            删除
          </Button>
        </div>
      ),
    },
  ]

  // 打开内核路径
  const handleOpenPath = async (corePath: string) => {
    try {
      await openCorePath(corePath)
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '打开目录失败'))
    }
  }

  // 扫描 chrome 目录，自动注册新内核
  const handleScan = async () => {
    setScanning(true)
    try {
      await scanBrowserCores()
      await loadData()
      toast.success('扫描完成')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '扫描失败'))
    } finally {
      setScanning(false)
    }
  }

  // 新增内核
  const handleAdd = () => {
    setEditingCore(null)
    setEditForm({ coreName: '', corePath: '' })
    setPathValidResult(null)
    setEditModalOpen(true)
  }

  // 编辑内核
  const handleEdit = (record: CoreDisplayInfo) => {
    const core = cores.find(c => c.coreId === record.coreId)
    if (core) {
      setEditingCore(core)
      setEditForm({ coreName: core.coreName, corePath: core.corePath })
      setPathValidResult({ valid: record.pathValid, message: record.pathMessage })
      setEditModalOpen(true)
    }
  }

  // 保存内核
  const handleSaveCore = async () => {
    if (!editForm.coreName.trim()) {
      toast.error('请输入内核名称')
      return
    }
    if (!editForm.corePath.trim()) {
      toast.error('请输入内核路径')
      return
    }
    setSaving(true)
    try {
      const input: BrowserCoreInput = {
        coreId: editingCore?.coreId || `core-${Date.now()}`,
        coreName: editForm.coreName.trim(),
        corePath: editForm.corePath.trim(),
        isDefault: editingCore?.isDefault || false,
      }
      await saveBrowserCore(input)
      await loadData()
      setEditModalOpen(false)
      toast.success(editingCore ? '内核已更新' : '内核已添加')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  // 删除点击
  const handleDeleteClick = (record: CoreDisplayInfo) => {
    if (record.isDefault) {
      toast.warning('默认内核不能删除')
      return
    }
    setDeletingCore(record)
    setDeleteConfirmOpen(true)
  }

  // 确认删除
  const handleDeleteConfirm = async () => {
    if (!deletingCore) return
    try {
      await deleteBrowserCore(deletingCore.coreId)
      await loadData()
      toast.success('内核已删除')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '删除失败'))
    }
    setDeletingCore(null)
  }

  // 设为默认
  const handleSetDefault = async (coreId: string) => {
    try {
      await setDefaultBrowserCore(coreId)
      await loadData()
      toast.success('已设为默认内核')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '设置失败'))
    }
  }

  // 开始下载
  const handleStartDownloadCore = async () => {
    if (isCoreDownloadActive(downloadProgress) || downloadStarting) {
      return
    }
    if (!downloadForm.name.trim() || !downloadForm.url.trim()) {
      toast.error('请输入名称和下载地址')
      return
    }
    const coreName = downloadForm.name.trim()
    const downloadUrl = downloadForm.url.trim()
    if (cores.some(c => c.coreName.toLowerCase() === coreName.toLowerCase())) {
      toast.error('该内核名称已存在')
      return
    }
    lastDownloadPhaseRef.current = 'starting'
    setDownloadStarting(true)
    setDownloadRenameValue(coreName)
    setDownloadProgress({ phase: 'starting', progress: 0, message: '准备下载...', corePath: `chrome/${coreName}` })
    try {
      // 在这儿我们需要从 proxies 中寻找匹配到的代理设定，如果有则传过去的 url
      let targetProxy = ''
      if (downloadForm.proxyMode === 'system') {
        targetProxy = '__system__'
      } else if (downloadForm.proxyMode === 'direct') {
        targetProxy = '__direct__'
      } else {
        const proxyProfile = proxies.find(p => p.proxyId === downloadForm.proxyId)
        targetProxy = downloadForm.proxyId
        if (proxyProfile && proxyProfile.proxyConfig) {
          targetProxy = proxyProfile.proxyConfig
        }
      }

      await BrowserCoreDownload(coreName, downloadUrl, targetProxy)
    } catch (error: unknown) {
      const message = resolveActionErrorMessage(error, '内部启动下载失败')
      lastDownloadPhaseRef.current = 'error'
      toast.error(message)
      setDownloadProgress({ phase: 'error', progress: 0, message, corePath: `chrome/${coreName}` })
    } finally {
      setDownloadStarting(false)
    }
  }

  const handleCancelDownloadCore = async () => {
    if (!isCoreDownloadActive(downloadProgress) || downloadCancelling) {
      return
    }
    setDownloadCancelling(true)
    setDownloadProgress(prev => prev ? { ...prev, message: '正在中断下载...' } : prev)
    try {
      await cancelBrowserCoreDownload()
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '中断下载失败'))
      setDownloadCancelling(false)
    }
  }

  const handleRenameDownloadedCorePath = async () => {
    const currentPath = String(downloadProgress?.corePath || '').trim()
    const newFolderName = downloadRenameValue.trim()
    if (!currentPath) {
      toast.error('缺少下载后的内核路径')
      return
    }
    if (!newFolderName) {
      toast.error('请输入新的路径文件夹名')
      return
    }
    if (newFolderName.includes('/') || newFolderName.includes('\\')) {
      toast.error('文件夹名不能包含路径分隔符')
      return
    }
    if (newFolderName === getCorePathFolderName(currentPath)) {
      toast.warning('新的文件夹名与当前路径相同')
      return
    }

    setDownloadRenaming(true)
    try {
      await renameBrowserCorePath(currentPath, newFolderName)
      const nextPath = buildRenamedCorePath(currentPath, newFolderName)
      setDownloadProgress(prev => prev ? {
        ...prev,
        corePath: nextPath,
        message: `内核路径已重命名: ${nextPath}`,
      } : prev)
      setDownloadRenameValue(newFolderName)
      await loadData()
      toast.success('内核路径已重命名')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '重命名内核路径失败'))
    } finally {
      setDownloadRenaming(false)
    }
  }

  const handleCloseDownloadModal = () => {
    if (isCoreDownloadActive(downloadProgress) || downloadStarting) {
      toast.warning('正在下载中，可点击“中断下载”停止任务')
      return
    }
    setDownloadModalOpen(false)
    setDownloadProgress(null)
    setDownloadCancelling(false)
    setDownloadRenaming(false)
    setDownloadRenameValue('')
    lastDownloadPhaseRef.current = ''
  }

  // 打开设置编辑弹窗
  const handleEditSettings = async () => {
    dirtySettingsFieldsRef.current.clear()
    await refreshBrowserSharedData(['settings'], { silent: true })
    const latestSettings = getBrowserSharedDataSnapshot().browserSettings
    setSettings(latestSettings)
    setSettingsForm(settingsToForm(latestSettings))
    setSettingsModalOpen(true)
  }

  const updateSettingsFormField = (field: BrowserSettingsField, value: string | number) => {
    dirtySettingsFieldsRef.current.add(field)
    setSettingsForm(prev => ({ ...prev, [field]: value }))
  }

  // 保存设置
  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const newSettings: BrowserSettings = {
        userDataRoot: settingsForm.userDataRoot.trim(),
        defaultProxy: settingsForm.defaultProxy.trim(),
        defaultFingerprintArgs: settingsForm.defaultFingerprintArgs.split('\n').map(s => s.trim()).filter(Boolean),
        defaultLaunchArgs: settingsForm.defaultLaunchArgs.split('\n').map(s => s.trim()).filter(Boolean),
        startReadyTimeoutMs: Math.max(1000, Number(settingsForm.startReadyTimeoutMs) || 3000),
        startStableWindowMs: Math.max(0, Number(settingsForm.startStableWindowMs) || 1200),
      }
      await saveBrowserSettings(newSettings)
      await refreshBrowserSharedData(['settings'], { silent: true })
      const savedSettings = getBrowserSharedDataSnapshot().browserSettings
      dirtySettingsFieldsRef.current.clear()
      setSettings(savedSettings)
      setSettingsModalOpen(false)
      toast.success('设置已保存')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '保存失败'))
    } finally {
      setSavingSettings(false)
    }
  }

  const downloadActive = isCoreDownloadActive(downloadProgress)
  const downloadFormLocked = downloadStarting || downloadActive || downloadCancelling
  const downloadDone = downloadProgress?.phase === 'done'
  const progressBarClass = downloadProgress?.phase === 'error'
    ? 'bg-[var(--color-error)]'
    : downloadProgress?.phase === 'cancelled'
      ? 'bg-[var(--color-text-muted)]'
      : downloadProgress?.phase === 'done'
        ? 'bg-green-500'
        : 'bg-[var(--color-accent)]'

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">内核管理</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">管理 Chrome 内核版本和全局设置</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setDownloadModalOpen(true)}>下载内核</Button>
          <Button size="sm" variant="secondary" onClick={handleScan} loading={scanning}>扫描内核</Button>
          <Button size="sm" onClick={handleAdd}>新增内核</Button>
        </div>
      </div>

      {/* 全局设置卡片 */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-[var(--color-text-muted)]" />
            <h3 className="text-base font-medium text-[var(--color-text-primary)]">全局设置</h3>
          </div>
          <Button size="sm" variant="ghost" onClick={handleEditSettings}>
            <Edit2 className="w-4 h-4 mr-1" />
            编辑
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">用户数据根目录</p>
            <p className="text-sm text-[var(--color-text-primary)]">{settings.userDataRoot || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">默认代理配置</p>
            <p className="text-sm text-[var(--color-text-primary)]">{settings.defaultProxy || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">默认指纹参数</p>
            {settings.defaultFingerprintArgs.length > 0 ? (
              <pre className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)] p-2 rounded max-h-20 overflow-auto">
                {settings.defaultFingerprintArgs.join('\n')}
              </pre>
            ) : (
              <p className="text-sm text-[var(--color-text-primary)]">-</p>
            )}
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">默认启动参数</p>
            {settings.defaultLaunchArgs.length > 0 ? (
              <pre className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-subtle)] p-2 rounded max-h-20 overflow-auto">
                {settings.defaultLaunchArgs.join('\n')}
              </pre>
            ) : (
              <p className="text-sm text-[var(--color-text-primary)]">-</p>
            )}
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">启动就绪超时</p>
            <p className="text-sm text-[var(--color-text-primary)]">{settings.startReadyTimeoutMs} ms</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">启动稳定窗口</p>
            <p className="text-sm text-[var(--color-text-primary)]">{settings.startStableWindowMs} ms</p>
          </div>
        </div>
      </Card>

      {/* 内核列表卡片 */}
      <Card title="内核列表" subtitle="已配置的 Chrome 内核">
        <Table
          columns={columns}
          data={displayList}
          rowKey="coreId"
          loading={loading}
          emptyText="暂无内核，请添加内核"
        />
      </Card>

      {/* 全局设置编辑弹窗 */}
      <Modal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        title="编辑全局设置"
        width="550px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSettingsModalOpen(false)}>取消</Button>
            <Button onClick={handleSaveSettings} loading={savingSettings}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormItem label="用户数据根目录">
            <Input
              value={settingsForm.userDataRoot}
              onChange={e => updateSettingsFormField('userDataRoot', e.target.value)}
              placeholder="例如：data"
            />
          </FormItem>
          <FormItem label="默认代理配置">
            <Input
              value={settingsForm.defaultProxy}
              onChange={e => updateSettingsFormField('defaultProxy', e.target.value)}
              placeholder="例如：http://127.0.0.1:7890"
            />
          </FormItem>
          <FormItem label="默认指纹参数">
            <Textarea
              value={settingsForm.defaultFingerprintArgs}
              onChange={e => updateSettingsFormField('defaultFingerprintArgs', e.target.value)}
              rows={4}
              placeholder="每行一个参数，如 --fingerprint-brand=Chrome"
            />
          </FormItem>
          <FormItem label="默认启动参数">
            <Textarea
              value={settingsForm.defaultLaunchArgs}
              onChange={e => updateSettingsFormField('defaultLaunchArgs', e.target.value)}
              rows={4}
              placeholder="每行一个参数，如 --disable-sync"
            />
          </FormItem>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormItem label="启动就绪超时（毫秒）" hint="默认 3000，慢机器可调到 5000-10000">
              <Input
                type="number"
                min={1000}
                step={500}
                value={settingsForm.startReadyTimeoutMs}
                onChange={e => updateSettingsFormField('startReadyTimeoutMs', Math.max(1000, Number(e.target.value) || 3000))}
                placeholder="3000"
              />
            </FormItem>
            <FormItem label="启动稳定窗口（毫秒）" hint="建议 1200-3000">
              <Input
                type="number"
                min={0}
                step={100}
                value={settingsForm.startStableWindowMs}
                onChange={e => updateSettingsFormField('startStableWindowMs', Math.max(0, Number(e.target.value) || 1200))}
                placeholder="1200"
              />
            </FormItem>
          </div>
        </div>
      </Modal>

      {/* 新增/编辑内核弹窗 */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={editingCore ? '编辑内核' : '新增内核'}
        width="500px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditModalOpen(false)}>取消</Button>
            <Button onClick={handleSaveCore} loading={saving}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormItem label="内核名称" required>
            <Input
              value={editForm.coreName}
              onChange={e => setEditForm(prev => ({ ...prev, coreName: e.target.value }))}
              placeholder="例如：Chrome 142"
            />
          </FormItem>
          <FormItem label="内核路径" required>
            <Input
              value={editForm.corePath}
              onChange={e => setEditForm(prev => ({ ...prev, corePath: e.target.value }))}
              placeholder="相对路径（如 chrome）或绝对路径"
            />
            {pathValidating && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">验证中...</p>
            )}
            {!pathValidating && pathValidResult && (
              <p className={`text-xs mt-1 ${pathValidResult.valid ? 'text-green-600' : 'text-red-500'}`}>
                {pathValidResult.message}
              </p>
            )}
          </FormItem>
        </div>
      </Modal>

      {/* 删除确认弹窗 */}
      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="确认删除"
        content={`确定要删除内核"${deletingCore?.coreName}"吗？此操作不可恢复。`}
        confirmText="删除"
        danger
      />

      {/* 内核下载弹窗 */}
      <Modal open={downloadModalOpen} onClose={handleCloseDownloadModal} title="下载内核" width="720px"
        footer={
          <>
            {downloadActive ? (
              <Button variant="danger" onClick={handleCancelDownloadCore} loading={downloadCancelling}>
                {!downloadCancelling && <XCircle className="w-4 h-4" />}
                中断下载
              </Button>
            ) : (
              <Button variant="secondary" onClick={handleCloseDownloadModal}>关闭</Button>
            )}
            <Button onClick={handleStartDownloadCore} loading={downloadStarting} disabled={downloadFormLocked || downloadRenaming}>开始下载</Button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={downloadForm.source === 'github' ? undefined : 'secondary'}
              onClick={() => setDownloadForm(prev => ({ ...prev, source: 'github' }))}
              disabled={downloadFormLocked}
            >
              <Download className="w-4 h-4" />
              GitHub 版本
            </Button>
            <Button
              variant={downloadForm.source === 'custom' ? undefined : 'secondary'}
              onClick={() => setDownloadForm(prev => ({ ...prev, source: 'custom' }))}
              disabled={downloadFormLocked}
            >
              自定义地址
            </Button>
          </div>

          {downloadForm.source === 'github' && (
            <Card padding="sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">fingerprint-chromium Releases</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">从 GitHub Releases 读取可下载压缩包，选择后会自动回填名称和地址</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={loadGithubCoreAssets} loading={githubLoading} disabled={downloadFormLocked}>
                    {!githubLoading && <RefreshCw className="w-4 h-4" />}
                    刷新
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openExternalURL(FINGERPRINT_CHROMIUM_RELEASES_PAGE)}>打开页面</Button>
                </div>
              </div>

              {githubError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {githubError}
                </div>
              ) : githubLoading ? (
                <div className="rounded-md border border-[var(--color-border-default)] px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">正在获取版本...</div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-auto pr-1">
                  {githubAssets.map(asset => (
                    <label
                      key={`${asset.id}-${asset.url}`}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        downloadForm.selectedAssetUrl === asset.url
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
                          : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="github-core-asset"
                        className="mt-1 accent-[var(--color-accent)]"
                        checked={downloadForm.selectedAssetUrl === asset.url}
                        onChange={() => handleSelectGithubAsset(asset.url)}
                        disabled={downloadFormLocked}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{asset.assetName}</span>
                          <span className="text-xs text-[var(--color-text-muted)] shrink-0">{formatAssetSize(asset.size)}</span>
                        </div>
                        <div className="mt-1 text-xs text-[var(--color-text-muted)] truncate">
                          {asset.releaseName}{asset.tagName ? ` / ${asset.tagName}` : ''}
                        </div>
                      </div>
                    </label>
                  ))}
                  {githubAssets.length === 0 && (
                    <div className="rounded-md border border-[var(--color-border-default)] px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">暂无可选版本</div>
                  )}
                </div>
              )}
            </Card>
          )}

          <FormItem label="内核名称" required>
            <Input
              value={downloadForm.name}
              onChange={e => setDownloadForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如: chrome-139"
              disabled={downloadFormLocked}
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">该名称将同时作为数据存放的子文件夹名。</p>
          </FormItem>
          <FormItem label={downloadForm.source === 'github' ? '下载地址（已从版本选择回填，也可手动微调）' : '下载地址（ZIP）'} required>
            <Input
              value={downloadForm.url}
              onChange={e => setDownloadForm(prev => ({ ...prev, url: e.target.value }))}
              placeholder="https://github.com/.../release.zip"
              disabled={downloadFormLocked}
            />
            {downloadForm.source === 'custom' && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">可填写你自己构建、内部镜像或其他来源的 ZIP 内核压缩包下载地址。</p>
            )}
          </FormItem>

          <FormItem label="下载代理设置">
            <select
              value={downloadForm.proxyMode}
              onChange={e => {
                const mode = e.target.value
                setDownloadForm(prev => ({
                  ...prev,
                  proxyMode: mode,
                  proxyId: mode === 'custom' && proxies.length > 0 ? proxies[0].proxyId : ''
                }))
              }}
              className="w-full h-9 px-3 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
              disabled={downloadFormLocked}
            >
              <option value="system">跟随系统全局代理</option>
              <option value="direct">直连模式 (不使用代理)</option>
              {proxies.length > 0 && <option value="custom">指定应用代理配置...</option>}
            </select>
          </FormItem>

          {downloadForm.proxyMode === 'custom' && (
            <FormItem label="选择代理池节点" required>
              <select
                value={downloadForm.proxyId}
                onChange={e => setDownloadForm(prev => ({ ...prev, proxyId: e.target.value }))}
                className="w-full h-9 px-3 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
                disabled={downloadFormLocked}
              >
                {proxies.map(p => (
                  <option key={p.proxyId} value={p.proxyId}>
                    {p.proxyName} ({p.proxyConfig})
                  </option>
                ))}
              </select>
            </FormItem>
          )}

          {downloadProgress && (
            <div className="mt-4 p-4 border border-[var(--color-border-default)] rounded-lg bg-[var(--color-bg-secondary)]">
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium text-[var(--color-text-primary)]">{downloadProgress.message}</span>
                <span className="text-[var(--color-text-muted)]">{downloadProgress.progress}%</span>
              </div>
              <div className="w-full bg-[var(--color-bg-surface)] rounded-full h-2 overflow-hidden border border-[var(--color-border-muted)]">
                <div
                  className={`${progressBarClass} h-2 rounded-full transition-all duration-300`}
                  style={{ width: `${Math.max(0, Math.min(100, downloadProgress.progress))}%` }}
                ></div>
              </div>
              {downloadProgress.corePath && (
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]">
                  <span className="min-w-0 truncate">保存路径：{downloadProgress.corePath}</span>
                  {downloadDone && (
                    <Button size="sm" variant="ghost" onClick={() => handleOpenPath(downloadProgress.corePath || '')}>
                      <FolderOpen className="w-4 h-4" />
                      打开
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {downloadDone && downloadProgress?.corePath && (
            <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4">
              <FormItem label="重命名下载路径">
                <div className="flex gap-2">
                  <Input
                    value={downloadRenameValue}
                    onChange={e => setDownloadRenameValue(e.target.value)}
                    placeholder="新的内核文件夹名"
                    disabled={downloadRenaming}
                  />
                  <Button onClick={handleRenameDownloadedCorePath} loading={downloadRenaming}>重命名</Button>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  重命名会移动下载后的内核目录，并同步更新内核列表中的路径。
                </p>
              </FormItem>
            </div>
          )}
        </div>
      </Modal>

    </div>
  )
}
