import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edit2, Star, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Table, toast } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'
import type { BrowserCore, BrowserCoreInput, BrowserProfile, BrowserProxy, BrowserSettings, BrowserGroupWithCount, WindowSyncCandidate, WindowSyncLayoutSettings, WindowSyncSettings, WindowSyncState } from '../types'
import { EMPTY_FILTERS } from '../components/InstanceFilterBar'
import type { InstanceFilters } from '../components/InstanceFilterBar'
import { KeywordsModal } from '../components/KeywordsModal'
import { BrowserListHeaderPanel } from '../components/browser-list/BrowserListHeaderPanel'
import { BrowserListSettingsModal } from '../components/browser-list/BrowserListSettingsModal'
import { BrowserCoreEditModal } from '../components/browser-list/BrowserCoreEditModal'
import { BrowserWindowSyncLayoutModal, BrowserWindowSyncModal, BrowserWindowSyncSettingsModal } from '../components/browser-list/BrowserWindowSyncModals'
import { BrowserListFeedbackModals } from '../components/browser-list/BrowserListFeedbackModals'
import { CopyProfileNameButton, KeywordInlineRow, LaunchCodeCell } from '../components/browser-list/BrowserListCells'
import { BrowserBatchToolbar } from '../components/browser-list/BrowserBatchToolbar'
import { BrowserProfileActions } from '../components/browser-list/BrowserProfileActions'
import { useBrowserProfileOrderDnD } from '../hooks/useBrowserProfileOrderDnD'
import { useBrowserListRuntimeSync } from '../hooks/useBrowserListRuntimeSync'
import { InstanceBackupRestoreModal } from '../components/InstanceBackupRestoreModal'
import { BatchRandomFingerprintModal } from '../components/BatchRandomFingerprintModal'
import { resolveActionErrorMessage, resolveActionFeedback } from '../utils/actionErrors'
import { PROFILE_COLUMN_OPTIONS, normalizeProfileColumnKeys, readStoredProfileColumnKeys, writeStoredProfileColumnKeys } from '../config/browserListTable'
import {
  applyWindowSyncLayout,
  clearBrowserCookies,
  copyBrowserProfile,
  deleteBrowserCore,
  deleteBrowserProfile,
  defaultWindowSyncSettings,
  defaultWindowSyncLayoutSettings,
  exportBrowserCookies,
  fetchBrowserCores,
  fetchBrowserProfiles,
  fetchBrowserProxies,
  fetchBrowserSettings,
  fetchGroups,
  listWindowSyncCandidates,
  pinCenterBrowserInstance,
  restartBrowserInstance,
  saveBrowserCore,
  saveBrowserSettings,
  saveWindowSyncSettings,
  saveWindowSyncLayoutSettings,
  setDefaultBrowserCore,
  startWindowSync,
  startBrowserInstance,
  stopBrowserInstance,
  stopWindowSync,
  switchBrowserProfileProxyNow,
  validateBrowserCorePath,
  validateProxyConfig,
} from '../api'

const naturalCompareText = (a: string, b: string): number => {
  const re = /(\d+)|(\D+)/g
  const partsA = a.match(re) || []
  const partsB = b.match(re) || []
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    if (i >= partsA.length) return -1
    if (i >= partsB.length) return 1
    const pa = partsA[i], pb = partsB[i]
    const na = Number(pa), nb = Number(pb)
    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb
    } else {
      const cmp = pa.localeCompare(pb, 'zh-CN')
      if (cmp !== 0) return cmp
    }
  }
  return 0
}

const resolveProfileStatus = (running: boolean, debugReady: boolean, starting: boolean, stopping: boolean) => {
  if (starting) {
    return { variant: 'info' as const, label: '启动中' }
  }
  if (stopping) {
    return { variant: 'default' as const, label: '停止中' }
  }
  if (running && !debugReady) {
    return { variant: 'info' as const, label: '运行中（待就绪）' }
  }
  if (running) {
    return { variant: 'success' as const, label: '运行中' }
  }
  return { variant: 'warning' as const, label: '已停止' }
}

const formatInstanceMarkerLabel = (profile: BrowserProfile) => {
  const index = Number(profile.instanceMarkerIndex || 0)
  if (index > 0) {
    return `#${String(index).padStart(2, '0')}`
  }
  const match = String(profile.instanceMarker || '').match(/#(\d{1,3})/)
  return match ? `#${match[1].padStart(2, '0')}` : '-'
}

const formatTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN')
}

const sanitizeFilenamePart = (value: string) => {
  const safe = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return (safe || 'profile').slice(0, 80)
}

const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const getCookieActionTitle = (profile: BrowserProfile, action: 'export' | 'clear') => {
  if (action === 'export') {
    if (!profile.running) return '实例启动后才能导出 Cookie'
    if (!profile.debugReady) return '调试接口就绪后才能导出 Cookie'
    return '导出 Cookie 文本'
  }
  if (!profile.running) return '清空用户数据目录'
  if (!profile.debugReady) return '调试接口就绪后才能清空 Cookie'
  return '清空全部 Cookie'
}

const normalizeWindowSyncColor = (value?: string) => {
  const raw = (value || '').trim()
  if (!raw) return '#2563eb'
  const color = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase()
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color.toLowerCase()
  }
  return null
}

export function BrowserListPage() {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [proxies, setProxies] = useState<BrowserProxy[]>([])
  const [groups, setGroups] = useState<BrowserGroupWithCount[]>([])

  // 视图模式
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    return (localStorage.getItem('browser:viewMode') as 'card' | 'table') || 'table'
  })
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => normalizeProfileColumnKeys(readStoredProfileColumnKeys()))

  // 勾选状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)

  // 筛选状态（从 localStorage 恢复）
  const [filters, setFilters] = useState<InstanceFilters>(() => {
    try {
      const saved = localStorage.getItem('browser:filters')
      if (saved) {
        const parsed = JSON.parse(saved)
        return { ...EMPTY_FILTERS, ...parsed, tags: new Set(parsed.tags || []) }
      }
    } catch { /* ignore */ }
    return EMPTY_FILTERS
  })
  const [headerCollapsed, setHeaderCollapsed] = useState(() => {
    return localStorage.getItem('browser:headerCollapsed') === 'true'
  })

  // 持久化筛选状态
  useEffect(() => {
    const serializable = { ...filters, tags: Array.from(filters.tags) }
    localStorage.setItem('browser:filters', JSON.stringify(serializable))
  }, [filters])

  useEffect(() => {
    localStorage.setItem('browser:viewMode', viewMode)
  }, [viewMode])

  useEffect(() => {
    writeStoredProfileColumnKeys(visibleColumnKeys)
  }, [visibleColumnKeys])

  useEffect(() => {
    localStorage.setItem('browser:headerCollapsed', String(headerCollapsed))
  }, [headerCollapsed])

  // 代理不支持弹窗
  const [proxyErrorModal, setProxyErrorModal] = useState(false)
  const [proxyErrorMsg, setProxyErrorMsg] = useState('')
  const [opError, setOpError] = useState('')
  const [pendingStartId, setPendingStartId] = useState<string | null>(null)
  const [startingIds, setStartingIds] = useState<Set<string>>(new Set())
  const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set())
  const [switchingProxyIds, setSwitchingProxyIds] = useState<Set<string>>(new Set())
  const [pinningIds, setPinningIds] = useState<Set<string>>(new Set())
  const [exportingCookieIds, setExportingCookieIds] = useState<Set<string>>(new Set())
  const [clearingCookieIds, setClearingCookieIds] = useState<Set<string>>(new Set())
  const [cookieClearTarget, setCookieClearTarget] = useState<BrowserProfile | null>(null)
  const [backupModalOpen, setBackupModalOpen] = useState(false)
  const [batchRandomModalOpen, setBatchRandomModalOpen] = useState(false)
  const profilesRef = useRef<BrowserProfile[]>([])
  const silentRefreshInFlightRef = useRef(false)

  // 窗口同步
  const [windowSyncModalOpen, setWindowSyncModalOpen] = useState(false)
  const [windowSyncCandidates, setWindowSyncCandidates] = useState<WindowSyncCandidate[]>([])
  const [windowSyncSelectedIds, setWindowSyncSelectedIds] = useState<Set<string>>(new Set())
  const [windowSyncMasterId, setWindowSyncMasterId] = useState('')
  const [windowSyncState, setWindowSyncState] = useState<WindowSyncState | null>(null)
  const [windowSyncLoading, setWindowSyncLoading] = useState(false)
  const [windowSyncLayoutModalOpen, setWindowSyncLayoutModalOpen] = useState(false)
  const [windowSyncLayout, setWindowSyncLayout] = useState<WindowSyncLayoutSettings>(() => defaultWindowSyncLayoutSettings())
  const [windowSyncSettingsModalOpen, setWindowSyncSettingsModalOpen] = useState(false)
  const [windowSyncSettings, setWindowSyncSettings] = useState<WindowSyncSettings>(() => defaultWindowSyncSettings())

  // 关键字弹窗
  const [kwModal, setKwModal] = useState<{ open: boolean; profile: BrowserProfile | null }>({ open: false, profile: null })

  const openKwModal = (profile: BrowserProfile) => setKwModal({ open: true, profile })
  const closeKwModal = () => setKwModal({ open: false, profile: null })

  // 复制弹窗
  const [copyModal, setCopyModal] = useState<{ open: boolean; profile: BrowserProfile | null }>({ open: false, profile: null })
  const [copyName, setCopyName] = useState('')
  const [copying, setCopying] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BrowserProfile | null>(null)
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false)

  const openCopyModal = (profile: BrowserProfile) => {
    setCopyName(profile.profileName + ' (副本)')
    setCopyModal({ open: true, profile })
  }
  const closeCopyModal = () => {
    setCopyModal({ open: false, profile: null })
    setCopyName('')
  }

  // 基础配置弹窗
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [settings, setSettings] = useState<BrowserSettings>({
    userDataRoot: 'data',
    defaultFingerprintArgs: [],
    defaultLaunchArgs: [],
    defaultProxy: '',
    startReadyTimeoutMs: 3000,
    startStableWindowMs: 1200,
  })
  const [fingerprintText, setFingerprintText] = useState('')
  const [launchText, setLaunchText] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)

  // 内核管理
  const [cores, setCores] = useState<BrowserCore[]>([])
  const [coreModalOpen, setCoreModalOpen] = useState(false)
  const [coreForm, setCoreForm] = useState<BrowserCoreInput>({ coreId: '', coreName: '', corePath: '', isDefault: false })
  const [coreValidation, setCoreValidation] = useState<{ valid: boolean; message: string } | null>(null)
  const [savingCore, setSavingCore] = useState(false)

  // 扩容管理
  const [expandModalOpen, setExpandModalOpen] = useState(false)

  const updatePendingIds = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    profileId: string,
    active: boolean
  ) => {
    setter(prev => {
      const next = new Set(prev)
      if (active) {
        next.add(profileId)
      } else {
        next.delete(profileId)
      }
      return next
    })
  }

  const replaceProfilesState = (items: BrowserProfile[]) => {
    profilesRef.current = items
    setProfiles(items)
  }

  const updateProfilesState = (updater: (items: BrowserProfile[]) => BrowserProfile[]) => {
    const next = updater(profilesRef.current)
    profilesRef.current = next
    setProfiles(next)
  }

  const mergeProfileState = (profile: BrowserProfile | null | undefined) => {
    if (!profile) return
    updateProfilesState(prev => prev.map(item => (
      item.profileId === profile.profileId ? { ...item, ...profile } : item
    )))
  }

  const syncProfiles = (items: BrowserProfile[], syncRuntimeState: boolean) => {
    if (syncRuntimeState) {
      const previousById = new Map(profilesRef.current.map(item => [item.profileId, item]))
      const newlyRunning = items.find(item => item.running && !previousById.get(item.profileId)?.running)
      if (newlyRunning) {
        updatePendingIds(setStartingIds, newlyRunning.profileId, false)
        updatePendingIds(setStoppingIds, newlyRunning.profileId, false)
      }
      items.forEach(item => {
        if (!item.running && previousById.get(item.profileId)?.running) {
          updatePendingIds(setStartingIds, item.profileId, false)
          updatePendingIds(setStoppingIds, item.profileId, false)
        }
      })
    }
    replaceProfilesState(items)
    reconcileProfileOrder(items)
  }

  const loadProfiles = async ({ silent = false, syncRuntimeState = false }: { silent?: boolean; syncRuntimeState?: boolean } = {}) => {
    if (silent && silentRefreshInFlightRef.current) {
      return profilesRef.current
    }
    if (!silent) {
      setLoading(true)
    } else {
      silentRefreshInFlightRef.current = true
    }
    try {
      const items = await fetchBrowserProfiles()
      syncProfiles(items, syncRuntimeState)
      return items
    } finally {
      if (silent) {
        silentRefreshInFlightRef.current = false
      } else {
        setLoading(false)
      }
    }
  }

  const loadGroups = async () => {
    setGroups(await fetchGroups())
  }

  const loadSettings = async () => {
    const data = await fetchBrowserSettings()
    setSettings(data)
    setFingerprintText((data.defaultFingerprintArgs || []).join('\n'))
    setLaunchText((data.defaultLaunchArgs || []).join('\n'))
  }

  const loadCores = async () => {
    setCores(await fetchBrowserCores())
  }

  useEffect(() => {
    void loadProfiles()
    loadGroups()
    fetchBrowserProxies().then(setProxies)
    fetchBrowserCores().then(setCores)
  }, [])

  useBrowserListRuntimeSync({
    loadProfiles,
    loadGroups,
    setStartingIds,
    setStoppingIds,
    setWindowSyncState,
    setWindowSyncSettings,
    setWindowSyncLayout,
  })

  const runningCount = useMemo(() => profiles.filter(p => p.running).length, [profiles])
  const allTags = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach(p => p.tags?.forEach(t => set.add(t)))
    return Array.from(set).sort()
  }, [profiles])

  const defaultCore = useMemo(() => {
    return cores.find(core => core.isDefault) || cores[0] || null
  }, [cores])

  const resolveProfileCore = (profile: BrowserProfile) => {
    const coreId = (profile.coreId || '').trim()
    if (coreId && !/^default$/i.test(coreId)) {
      return cores.find(core => core.coreId === coreId) || null
    }
    return defaultCore
  }

  const getProfileCoreLabel = (profile: BrowserProfile) => {
    const resolvedCore = resolveProfileCore(profile)
    if (resolvedCore) {
      return resolvedCore.coreName
    }

    const coreId = (profile.coreId || '').trim()
    if (!coreId || /^default$/i.test(coreId)) {
      return '使用默认内核'
    }
    return coreId
  }

  const isProfileStarting = (profileId: string) => startingIds.has(profileId)
  const isProfileStopping = (profileId: string) => stoppingIds.has(profileId)
  const isProfileSwitchingProxy = (profileId: string) => switchingProxyIds.has(profileId)
  const isProfilePinning = (profileId: string) => pinningIds.has(profileId)
  const isProfileExportingCookies = (profileId: string) => exportingCookieIds.has(profileId)
  const isProfileClearingCookies = (profileId: string) => clearingCookieIds.has(profileId)
  const isProfileBusy = (profileId: string) => isProfileStarting(profileId) || isProfileStopping(profileId) || isProfileSwitchingProxy(profileId) || isProfilePinning(profileId)
  const isWindowSyncMaster = (profileId: string) => !!windowSyncState?.active && windowSyncState.masterProfileId === profileId

  const getProfileStatus = (profile: BrowserProfile) => (
    resolveProfileStatus(profile.running, profile.debugReady, isProfileStarting(profile.profileId), isProfileStopping(profile.profileId))
  )

  const {
    profileOrder,
    reconcileProfileOrder,
    handleProfileDragOver,
    handleProfileDragLeave,
    handleProfileDrop,
    getProfileDragClassName,
    renderProfileDragHandle,
  } = useBrowserProfileOrderDnD({ profiles })

  const filteredProfiles = useMemo(() => {
    const profileOrderIndex = new Map(profileOrder.map((profileId, index) => [profileId, index]))
    return profiles.filter(p => {
      // 分组筛选
      if (filters.groupId === '__ungrouped__' && p.groupId) return false
      if (filters.groupId && filters.groupId !== '__ungrouped__' && p.groupId !== filters.groupId) return false

      if (filters.keyword && !p.profileName.toLowerCase().includes(filters.keyword.toLowerCase())) return false
      if (filters.status === 'running' && !p.running) return false
      if (filters.status === 'stopped' && p.running) return false
      if (filters.proxyId === '__none__' && (p.proxyId || p.proxyConfig)) return false
      if (filters.proxyId && filters.proxyId !== '__none__' && p.proxyId !== filters.proxyId) return false
      if (filters.coreId) {
        const effectiveCore = resolveProfileCore(p)
        if (!effectiveCore || effectiveCore.coreId !== filters.coreId) return false
      }
      if (filters.tags.size > 0 && !p.tags?.some(t => filters.tags.has(t))) return false
      if (filters.kwSearch) {
        const q = filters.kwSearch.toLowerCase()
        const hit = p.keywords?.some(v => v.toLowerCase().includes(q))
        if (!hit) return false
      }
      return true
    }).sort((a, b) => {
      const orderA = profileOrderIndex.get(a.profileId)
      const orderB = profileOrderIndex.get(b.profileId)
      if (orderA !== undefined || orderB !== undefined) {
        if (orderA === undefined) return 1
        if (orderB === undefined) return -1
        if (orderA !== orderB) return orderA - orderB
      }
      return naturalCompareText(a.profileName, b.profileName)
    })
  }, [profiles, filters, defaultCore, cores, profileOrder])

  const selectedProfileIds = useMemo(() => Array.from(selectedIds), [selectedIds])
  const filteredProfileIds = useMemo(() => filteredProfiles.map(item => item.profileId), [filteredProfiles])

  const handleStart = async (profileId: string) => {
    const profile = profiles.find(p => p.profileId === profileId)
    updatePendingIds(setStartingIds, profileId, true)
    try {
      if (profile) {
        const result = await validateProxyConfig(profile.proxyConfig || '', profile.proxyId || '')
        if (!result.supported) {
          setProxyErrorMsg(result.errorMsg)
          setPendingStartId(profileId)
          setProxyErrorModal(true)
          return
        }
      }

      const startedProfile = await startBrowserInstance(profileId)
      mergeProfileState(startedProfile)
      if (startedProfile?.running && !startedProfile.debugReady && startedProfile.runtimeWarning) {
        toast.warning(startedProfile.runtimeWarning)
      } else {
        toast.success(`实例已启动${startedProfile?.profileName ? `：${startedProfile.profileName}` : ''}`)
      }
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      const feedback = resolveActionFeedback(error, '实例启动失败')
      if (feedback.tone === 'warning') {
        toast.warning(feedback.message)
      } else {
        toast.error(feedback.message)
      }
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } finally {
      updatePendingIds(setStartingIds, profileId, false)
    }
  }

  const handleStop = async (profileId: string) => {
    updatePendingIds(setStoppingIds, profileId, true)
    try {
      const stoppedProfile = await stopBrowserInstance(profileId)
      mergeProfileState(stoppedProfile)
      toast.success('实例已停止')
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      toast.error(resolveActionErrorMessage(error, '实例停止失败'))
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } finally {
      updatePendingIds(setStoppingIds, profileId, false)
    }
  }

  const handleRestart = async (profileId: string) => {
    updatePendingIds(setStoppingIds, profileId, true)
    try {
      const restartedProfile = await restartBrowserInstance(profileId)
      mergeProfileState(restartedProfile)
      toast.success(`实例已重启${restartedProfile?.profileName ? `：${restartedProfile.profileName}` : ''}`)
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      const feedback = resolveActionFeedback(error, '实例重启失败')
      if (feedback.tone === 'warning') {
        toast.warning(feedback.message)
      } else {
        setOpError(feedback.message)
      }
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } finally {
      updatePendingIds(setStoppingIds, profileId, false)
    }
  }

  const getProxyDisplayName = (profile: BrowserProfile) => {
    if (profile.autoProxySwitchEnabled) {
      const proxy = proxies.find(p => p.proxyId === profile.autoProxySwitchLastProxyId)
      const mode = profile.autoProxySwitchMode === 'manual' ? '手动' : '定时'
      const group = profile.autoProxySwitchGroupName || '全部'
      return `切换(${mode}/${group})：${proxy?.proxyName || profile.autoProxySwitchLastProxyId || '待启动随机'}`
    }
    const proxy = proxies.find(p => p.proxyId === profile.proxyId)
    return proxy ? proxy.proxyName : profile.proxyId || profile.proxyConfig || '-'
  }

  const handleSwitchProxyNow = async (profileId: string) => {
    updatePendingIds(setSwitchingProxyIds, profileId, true)
    try {
      const updatedProfile = await switchBrowserProfileProxyNow(profileId)
      mergeProfileState(updatedProfile)
      const proxy = proxies.find(p => p.proxyId === updatedProfile?.autoProxySwitchLastProxyId)
      toast.success(`出口已切换${proxy?.proxyName ? `：${proxy.proxyName}` : ''}`)
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      toast.error(error?.message || '手动切换出口失败')
    } finally {
      updatePendingIds(setSwitchingProxyIds, profileId, false)
    }
  }

  const handlePinCenter = async (profileId: string) => {
    updatePendingIds(setPinningIds, profileId, true)
    try {
      await pinCenterBrowserInstance(profileId)
      toast.success('实例窗口已置顶居中')
    } catch (error: any) {
      toast.error(error?.message || '置顶居中失败')
    } finally {
      updatePendingIds(setPinningIds, profileId, false)
    }
  }

  const handleExportCookies = async (profile: BrowserProfile) => {
    if (!profile.running || !profile.debugReady) {
      toast.warning(getCookieActionTitle(profile, 'export'))
      return
    }
    updatePendingIds(setExportingCookieIds, profile.profileId, true)
    try {
      const content = await exportBrowserCookies(profile.profileId)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `cookies_${sanitizeFilenamePart(profile.profileName || profile.profileId)}_${stamp}.txt`
      downloadTextFile(filename, content)
      toast.success(`Cookie 已导出：${profile.profileName || profile.profileId}`)
    } catch (error: any) {
      toast.error(error?.message || '导出 Cookie 失败')
    } finally {
      updatePendingIds(setExportingCookieIds, profile.profileId, false)
    }
  }

  const handleConfirmClearCookies = async () => {
    const target = cookieClearTarget
    if (!target) return
    if (target.running && !target.debugReady) {
      toast.warning(getCookieActionTitle(target, 'clear'))
      return
    }
    updatePendingIds(setClearingCookieIds, target.profileId, true)
    try {
      await clearBrowserCookies(target.profileId)
      toast.success(target.running ? `Cookie 已清空：${target.profileName || target.profileId}` : `用户数据已清空，指纹已重置：${target.profileName || target.profileId}`)
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      toast.error(error?.message || (target.running ? '清空 Cookie 失败' : '清空用户数据失败'))
    } finally {
      updatePendingIds(setClearingCookieIds, target.profileId, false)
      setCookieClearTarget(null)
    }
  }

  const loadWindowSyncCandidates = async () => {
    setWindowSyncLoading(true)
    try {
      const items = await listWindowSyncCandidates()
      setWindowSyncCandidates(items)
      const selectableIds = new Set(items.filter(item => item.canSync || item.canAutoStart).map(item => item.profileId))
      setWindowSyncSelectedIds(prev => {
        const next = new Set(Array.from(prev).filter(id => selectableIds.has(id)))
        if (next.size === 0) {
          const selectedSelectable = Array.from(selectedIds).filter(id => selectableIds.has(id))
          selectedSelectable.forEach(id => next.add(id))
        }
        return next
      })
      setWindowSyncMasterId(prev => {
        if (prev && selectableIds.has(prev)) return prev
        const activeMaster = items.find(item => item.master && item.canSync)?.profileId
        if (activeMaster) return activeMaster
        const selectedSelectable = Array.from(selectedIds).find(id => selectableIds.has(id))
        if (selectedSelectable) return selectedSelectable
        return items.find(item => item.canSync || item.canAutoStart)?.profileId || ''
      })
    } finally {
      setWindowSyncLoading(false)
    }
  }

  const handleOpenWindowSyncModal = async () => {
    setWindowSyncModalOpen(true)
    await loadWindowSyncCandidates()
  }

  const toggleWindowSyncCandidate = (profileId: string) => {
    const candidate = windowSyncCandidates.find(item => item.profileId === profileId)
    if (!candidate || (!candidate.canSync && !candidate.canAutoStart)) return
    setWindowSyncSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(profileId)) {
        next.delete(profileId)
        if (windowSyncMasterId === profileId) {
          setWindowSyncMasterId(Array.from(next)[0] || '')
        }
      } else {
        next.add(profileId)
        if (!windowSyncMasterId) {
          setWindowSyncMasterId(profileId)
        }
      }
      return next
    })
  }

  const selectableWindowSyncCandidates = () => windowSyncCandidates.filter(candidate => candidate.canSync || !!candidate.canAutoStart)

  const selectAllWindowSyncCandidates = () => {
    if (windowSyncState?.active) return
    const selectable = selectableWindowSyncCandidates()
    const nextIds = new Set(selectable.map(candidate => candidate.profileId))
    setWindowSyncSelectedIds(nextIds)
    setWindowSyncMasterId(prev => (prev && nextIds.has(prev) ? prev : selectable[0]?.profileId || ''))
  }

  const clearWindowSyncCandidates = () => {
    if (windowSyncState?.active) return
    setWindowSyncSelectedIds(new Set())
    setWindowSyncMasterId('')
  }

  const handleStartWindowSync = async () => {
    const profileIds = Array.from(windowSyncSelectedIds)
    if (profileIds.length < 2) {
      toast.error('至少选择 2 个窗口')
      return
    }
    if (!windowSyncMasterId || !windowSyncSelectedIds.has(windowSyncMasterId)) {
      toast.error('请选择一个已选窗口作为主控窗口')
      return
    }
    setWindowSyncLoading(true)
    try {
      const state = await startWindowSync({ profileIds, masterProfileId: windowSyncMasterId })
      setWindowSyncState(state?.active ? state : null)
      if (state?.layout) {
        setWindowSyncLayout(state.layout)
      }
      if (state?.active) {
        setWindowSyncSettings({
          masterColor: state.masterColor || '#2563eb',
          syncKeyboard: state.syncKeyboard !== false,
          syncMouse: state.syncMouse !== false,
        })
      }
      setWindowSyncModalOpen(false)
      toast.success('窗口同步已创建，未运行实例已自动启动并加入同步')
    } catch (error: any) {
      toast.error(error?.message || '开始窗口同步失败')
    } finally {
      setWindowSyncLoading(false)
    }
  }

  const handleStopWindowSync = async () => {
    setWindowSyncLoading(true)
    try {
      await stopWindowSync()
      setWindowSyncState(null)
      toast.success('窗口同步已停止')
    } catch (error: any) {
      toast.error(error?.message || '停止窗口同步失败')
    } finally {
      setWindowSyncLoading(false)
    }
  }

  const updateWindowSyncLayout = (patch: Partial<WindowSyncLayoutSettings>) => {
    setWindowSyncLayout(prev => ({ ...prev, ...patch }))
  }

  const updateWindowSyncSettings = (patch: Partial<WindowSyncSettings>) => {
    setWindowSyncSettings(prev => ({ ...prev, ...patch }))
  }

  const handleApplyWindowSyncLayout = async (settings?: WindowSyncLayoutSettings) => {
    const nextSettings = settings || windowSyncLayout
    setWindowSyncLoading(true)
    try {
      await saveWindowSyncLayoutSettings(nextSettings)
      const state = await applyWindowSyncLayout(nextSettings)
      if (state?.active) {
        setWindowSyncState(state)
        if (state.layout) {
          setWindowSyncLayout(state.layout)
        }
      } else {
        setWindowSyncLayout(nextSettings)
      }
      toast.success('窗口布局已应用')
    } catch (error: any) {
      toast.error(error?.message || '应用窗口布局失败')
    } finally {
      setWindowSyncLoading(false)
    }
  }

  const handleSaveWindowSyncSettings = async () => {
    const masterColor = normalizeWindowSyncColor(windowSyncSettings.masterColor)
    if (!masterColor) {
      toast.error('主控窗口颜色格式应为 #RGB 或 #RRGGBB')
      return
    }
    setWindowSyncLoading(true)
    try {
      const state = await saveWindowSyncSettings({ ...windowSyncSettings, masterColor })
      if (state?.active) {
        setWindowSyncState(state)
        setWindowSyncSettings({
          masterColor: state.masterColor || '#2563eb',
          syncKeyboard: state.syncKeyboard !== false,
          syncMouse: state.syncMouse !== false,
        })
      }
      setWindowSyncSettingsModalOpen(false)
      toast.success('同步基础设置已保存')
    } catch (error: any) {
      toast.error(error?.message || '保存同步基础设置失败')
    } finally {
      setWindowSyncLoading(false)
    }
  }

  const handleDelete = async (profileId: string) => {
    const profile = profiles.find(item => item.profileId === profileId)
    if (!profile) {
      toast.error('实例不存在或已被删除')
      return
    }
    setDeleteTarget(profile)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    await deleteBrowserProfile(deleteTarget.profileId)
    toast.success('实例和用户数据目录已删除')
    setDeleteTarget(null)
    await loadProfiles()
  }

  // 批量操作
  const toggleSelect = (profileId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(profileId) ? next.delete(profileId) : next.add(profileId)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredProfiles.map(p => p.profileId)))
  }

  const handleDeselectAll = () => {
    setSelectedIds(new Set())
  }

  const handleBatchStart = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchLoading(true)
    let success = 0, pending = 0, failed = 0
    const pendingMessages: string[] = []
    const failureMessages: string[] = []
    for (const id of ids) {
      const profile = profiles.find(p => p.profileId === id)
      if (!profile || profile.running) continue
      updatePendingIds(setStartingIds, id, true)
      try {
        const startedProfile = await startBrowserInstance(id)
        mergeProfileState(startedProfile)
        success++
      } catch (error: any) {
        const feedback = resolveActionFeedback(error, '实例启动失败')
        if (feedback.pendingAttach) {
          pending++
          pendingMessages.push(`${profile.profileName}：${feedback.message}`)
        } else {
          failed++
          failureMessages.push(`${profile.profileName}：${feedback.message}`)
        }
      } finally {
        updatePendingIds(setStartingIds, id, false)
      }
    }
    setBatchLoading(false)
    const summary = [`成功 ${success}`]
    if (pending > 0) summary.push(`待接管 ${pending}`)
    if (failed > 0) summary.push(`失败 ${failed}`)
    toast.success(`批量启动完成：${summary.join('，')}`)
    if (pendingMessages.length > 0) {
      const preview = pendingMessages.slice(0, 3)
      const more = pendingMessages.length > preview.length ? `\n另有 ${pendingMessages.length - preview.length} 个实例已打开窗口，仍在后台接管。` : ''
      toast.warning(`以下实例已打开窗口，仍在后台接管：\n${preview.join('\n')}${more}`)
    }
    if (failureMessages.length > 0) {
      const preview = failureMessages.slice(0, 3)
      const more = failureMessages.length > preview.length ? `\n另有 ${failureMessages.length - preview.length} 个实例启动失败，请逐个检查。` : ''
      toast.error(`以下实例启动失败：\n${preview.join('\n')}${more}`)
    }
    loadProfiles()
  }

  const handleBatchStop = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchLoading(true)
    let success = 0, failed = 0
    for (const id of ids) {
      const profile = profiles.find(p => p.profileId === id)
      if (!profile || !profile.running) continue
      updatePendingIds(setStoppingIds, id, true)
      try {
        const stoppedProfile = await stopBrowserInstance(id)
        mergeProfileState(stoppedProfile)
        success++
      } catch {
        failed++
      } finally {
        updatePendingIds(setStoppingIds, id, false)
      }
    }
    setBatchLoading(false)
    toast.success(`批量停止完成：成功 ${success}${failed > 0 ? `，失败 ${failed}` : ''}`)
    loadProfiles()
  }

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchDeleteConfirmOpen(true)
  }

  const handleConfirmBatchDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchDeleteConfirmOpen(false)
    setBatchLoading(true)
    try {
      for (const id of ids) {
        await deleteBrowserProfile(id)
      }
      setSelectedIds(new Set())
      toast.success(`已删除 ${ids.length} 个实例`)
      await loadProfiles()
    } finally {
      setBatchLoading(false)
    }
  }

  const handleCopy = async (profileId: string) => {
    if (!copyModal.profile) return
    setCopying(true)
    try {
      await copyBrowserProfile(profileId, copyName)
      toast.success('实例已复制')
      closeCopyModal()
      loadProfiles()
    } catch (error: any) {
      closeCopyModal()
      setOpError(typeof error === 'string' ? error : error?.message || '复制失败')
    } finally {
      setCopying(false)
    }
  }

  const handleOpenSettings = async () => {
    await Promise.all([loadSettings(), loadCores()])
    setSettingsModalOpen(true)
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await saveBrowserSettings({
        ...settings,
        defaultFingerprintArgs: fingerprintText.split('\n').map(s => s.trim()).filter(Boolean),
        defaultLaunchArgs: launchText.split('\n').map(s => s.trim()).filter(Boolean),
      })
      toast.success('配置已保存')
      setSettingsModalOpen(false)
    } catch (error: any) {
      toast.error(error?.message || '保存失败')
    } finally {
      setSavingSettings(false)
    }
  }

  // 内核管理
  const handleOpenCoreModal = (core?: BrowserCore) => {
    setCoreForm(core ? { ...core } : { coreId: '', coreName: '', corePath: '', isDefault: false })
    setCoreValidation(null)
    setCoreModalOpen(true)
  }

  const handleValidateCorePath = async () => {
    if (!coreForm.corePath.trim()) {
      setCoreValidation({ valid: false, message: '请输入路径' })
      return
    }
    const result = await validateBrowserCorePath(coreForm.corePath)
    setCoreValidation(result)
  }

  const handleSaveCore = async () => {
    if (!coreForm.coreName.trim()) {
      toast.error('请输入内核名称')
      return
    }
    if (!coreForm.corePath.trim()) {
      toast.error('请输入内核路径')
      return
    }
    setSavingCore(true)
    try {
      await saveBrowserCore(coreForm)
      toast.success('内核已保存')
      setCoreModalOpen(false)
      loadCores()
    } catch (error: any) {
      toast.error(error?.message || '保存失败')
    } finally {
      setSavingCore(false)
    }
  }

  const handleDeleteCore = async (coreId: string) => {
    if (cores.length <= 1) {
      toast.error('至少保留一个内核')
      return
    }
    await deleteBrowserCore(coreId)
    toast.success('内核已删除')
    loadCores()
  }

  const handleSetDefaultCore = async (coreId: string) => {
    await setDefaultBrowserCore(coreId)
    toast.success('已设为默认')
    loadCores()
  }

  const toggleVisibleColumn = (key: string) => {
    const option = PROFILE_COLUMN_OPTIONS.find(item => item.key === key)
    if (option?.locked) return
    setVisibleColumnKeys(prev => {
      const next = prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
      return normalizeProfileColumnKeys(next)
    })
  }

  const allColumns: TableColumn<BrowserProfile>[] = [
    {
      key: 'selection',
      title: (
        <div className="flex items-center justify-center gap-1">
          <span className="h-7 w-7 shrink-0" aria-hidden="true" />
          <input
            type="checkbox"
            className="w-4 h-4 rounded cursor-pointer accent-[var(--color-accent)]"
            checked={selectedIds.size > 0 && selectedIds.size === filteredProfiles.length}
            ref={(input) => { if (input) input.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredProfiles.length }}
            onChange={(e) => {
              if (e.target.checked) handleSelectAll()
              else handleDeselectAll()
            }}
          />
        </div>
      ),
      width: 76,
      align: 'center',
      render: (_, record) => (
        <div className="flex items-center justify-center gap-1">
          {renderProfileDragHandle(record)}
          <input
            type="checkbox"
            className="w-4 h-4 rounded cursor-pointer accent-[var(--color-accent)]"
            checked={selectedIds.has(record.profileId)}
            onChange={() => toggleSelect(record.profileId)}
          />
        </div>
      ),
    },
    {
      key: 'instanceMarkerIndex',
      title: '标识',
      width: 76,
      align: 'center',
      render: (_, record) => {
        const label = formatInstanceMarkerLabel(record)
        return (
          <span
            className="inline-flex h-6 min-w-[3.25rem] items-center justify-center rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2 font-mono text-xs font-semibold text-[var(--color-text-primary)]"
            title={record.instanceMarker || `Trace ${label}`}
          >
            {label}
          </span>
        )
      },
    },
    {
      key: 'profileName',
      title: '实例名称',
      render: (value, record) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link className="text-[var(--color-accent)] text-sm font-medium hover:underline truncate" to={`/browser/detail/${record.profileId}`}>
              {value}
            </Link>
            <CopyProfileNameButton name={record.profileName} />
            {isWindowSyncMaster(record.profileId) && (
              <Badge variant="info" size="sm" dot dotClassName="w-2 h-2" className="border border-[var(--color-accent)]/25">
                主控
              </Badge>
            )}
          </div>
          {record.tags && record.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {record.tags.map(tag => <Badge variant="default" key={tag}>{tag}</Badge>)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'running',
      title: '状态',
      width: 100,
      render: (_, record) => {
        const status = getProfileStatus(record)
        return <Badge variant={status.variant} dot>{status.label}</Badge>
      },
    },
    {
      key: 'coreId',
      title: '核心',
      render: (_, record) => {
        return <span className="text-xs">{getProfileCoreLabel(record)}</span>
      },
    },
    {
      key: 'proxyId',
      title: '代理',
      render: (_, record) => {
        return <span className="text-xs">{getProxyDisplayName(record)}</span>
      },
    },
    {
      key: 'launchCode',
      title: '快捷打开码',
      render: (value, record) => <LaunchCodeCell profileId={record.profileId} code={value || ''} onRefresh={loadProfiles} />,
    },
    {
      key: 'keywords',
      title: '关键字',
      width: 200,
      render: (value) => <KeywordInlineRow keywords={value || []} />,
    },
    {
      key: 'updatedAt',
      title: '上次更新',
      render: formatTime,
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (_, record) => {
        const isStarting = isProfileStarting(record.profileId)
        const isStopping = isProfileStopping(record.profileId)
        const isSwitchingProxy = isProfileSwitchingProxy(record.profileId)
        const isPinning = isProfilePinning(record.profileId)
        const isExportingCookies = isProfileExportingCookies(record.profileId)
        const isClearingCookies = isProfileClearingCookies(record.profileId)
        const isBusy = isProfileBusy(record.profileId)
        const isSyncMaster = isWindowSyncMaster(record.profileId)
        const disabledBySync = isSyncMaster
        const canExportCookies = record.running && record.debugReady
        const canClearCookies = !record.running || record.debugReady

        return (
          <BrowserProfileActions
            record={record}
            mode="table"
            disabledBySync={disabledBySync}
            isStarting={isStarting}
            isStopping={isStopping}
            isSwitchingProxy={isSwitchingProxy}
            isPinning={isPinning}
            isExportingCookies={isExportingCookies}
            isClearingCookies={isClearingCookies}
            isBusy={isBusy}
            canExportCookies={canExportCookies}
            canClearCookies={canClearCookies}
            exportCookieTitle={getCookieActionTitle(record, 'export')}
            clearCookieTitle={getCookieActionTitle(record, 'clear')}
            onStart={handleStart}
            onStop={handleStop}
            onSwitchProxyNow={handleSwitchProxyNow}
            onPinCenter={handlePinCenter}
            onRestart={handleRestart}
            onOpenKeywords={openKwModal}
            onExportCookies={handleExportCookies}
            onClearCookies={setCookieClearTarget}
            onCopy={openCopyModal}
            onDelete={handleDelete}
          />
        )
      },
    },
  ]

  const columns = allColumns
    .filter(column => visibleColumnKeys.includes(column.key))
    .map(column => ({ ...column, headerAlign: 'center' as const }))


  const coreColumns: TableColumn<BrowserCore>[] = [
    { key: 'coreName', title: '名称' },
    { key: 'corePath', title: '路径' },
    {
      key: 'isDefault',
      title: '默认',
      render: (value) => value ? <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> : null,
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (_, record) => (
        <div className="flex justify-end gap-1">
          {!record.isDefault && (
            <Button size="sm" variant="ghost" onClick={() => handleSetDefaultCore(record.coreId)} title="设为默认"><Star className="w-4 h-4" /></Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => handleOpenCoreModal(record)} title="编辑"><Edit2 className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => handleDeleteCore(record.coreId)} title="删除"><Trash2 className="w-4 h-4" /></Button>
        </div>
      ),
    },
  ]

  return (
    <div className="overflow-auto p-5 space-y-5 animate-fade-in h-full">
      <BrowserListHeaderPanel
        profilesCount={profiles.length}
        filteredCount={filteredProfiles.length}
        runningCount={runningCount}
        headerCollapsed={headerCollapsed}
        viewMode={viewMode}
        visibleColumnKeys={visibleColumnKeys}
        filters={filters}
        proxies={proxies}
        cores={cores}
        allTags={allTags}
        groups={groups}
        onToggleHeaderCollapsed={() => setHeaderCollapsed(prev => !prev)}
        onRefresh={() => { void loadProfiles() }}
        onOpenBatchRandom={() => setBatchRandomModalOpen(true)}
        onOpenBackup={() => setBackupModalOpen(true)}
        onOpenWindowSync={handleOpenWindowSyncModal}
        onOpenSettings={handleOpenSettings}
        onOpenExpand={() => setExpandModalOpen(true)}
        onViewModeChange={setViewMode}
        onToggleColumn={toggleVisibleColumn}
        onFiltersChange={setFilters}
      />

      {/* 批量操作工具栏 */}
      <BrowserBatchToolbar
        selectedCount={selectedIds.size}
        totalCount={filteredProfiles.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onBatchStart={handleBatchStart}
        onBatchStop={handleBatchStop}
        onBatchDelete={handleBatchDelete}
        batchLoading={batchLoading}
      />

      <Card padding="none">
        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
          {/* Replace table with Flex column of Cards */}
          {loading ? (
            <div className="py-16 flex items-center justify-center text-sm text-[var(--color-text-muted)]">加载中...</div>
          ) : filteredProfiles.length === 0 ? (
            <div className="py-16 flex items-center justify-center text-sm text-[var(--color-text-muted)]">暂无数据</div>
          ) : viewMode === 'table' ? (
            <Table
              columns={columns}
              data={filteredProfiles}
              rowKey="profileId"
              getRowProps={(record) => ({
                onDragOver: (event) => handleProfileDragOver(event, record.profileId, 'table'),
                onDragLeave: (event) => handleProfileDragLeave(event, record.profileId),
                onDrop: (event) => handleProfileDrop(event, record.profileId, 'table', filteredProfiles),
                className: getProfileDragClassName(record.profileId),
              })}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[500px] p-4 items-start content-start">
              {filteredProfiles.map((record) => {
                const isSelected = selectedIds.has(record.profileId)
                const core = resolveProfileCore(record)
                const status = getProfileStatus(record)
                const isStarting = isProfileStarting(record.profileId)
                const isStopping = isProfileStopping(record.profileId)
                const isSwitchingProxy = isProfileSwitchingProxy(record.profileId)
                const isPinning = isProfilePinning(record.profileId)
                const isExportingCookies = isProfileExportingCookies(record.profileId)
                const isClearingCookies = isProfileClearingCookies(record.profileId)
                const isBusy = isProfileBusy(record.profileId)
                const isSyncMaster = isWindowSyncMaster(record.profileId)
                const disabledBySync = isSyncMaster
                const canExportCookies = record.running && record.debugReady
                const canClearCookies = !record.running || record.debugReady

                return (
                  <div
                    key={record.profileId}
                    onDragOver={(event) => handleProfileDragOver(event, record.profileId, 'card')}
                    onDragLeave={(event) => handleProfileDragLeave(event, record.profileId)}
                    onDrop={(event) => handleProfileDrop(event, record.profileId, 'card', filteredProfiles)}
                    className={`flex flex-col border rounded-xl bg-[var(--color-bg-surface)] p-3 shadow-[0_1px_4px_rgba(0,0,0,0.08)] transition-all duration-200 h-[320px] overflow-hidden
                        ${isSelected ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20' : 'border-[var(--color-border-default)] hover:border-[var(--color-accent)]'}
                        ${getProfileDragClassName(record.profileId)}
                      `}
                  >
                    {/* Header Row: Title, Status, Checkbox, Actions */}
                    <div className="flex flex-col gap-3 pb-3 border-b border-[var(--color-border-muted)]/50 shrink-0">

                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {renderProfileDragHandle(record)}
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded cursor-pointer accent-[var(--color-accent)] mt-0.5 shrink-0"
                            checked={isSelected}
                            onChange={() => toggleSelect(record.profileId)}
                          />
                          <span
                            className="inline-flex h-6 min-w-[3.25rem] items-center justify-center rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2 font-mono text-xs font-semibold text-[var(--color-text-primary)]"
                            title={record.instanceMarker || `Trace ${formatInstanceMarkerLabel(record)}`}
                          >
                            {formatInstanceMarkerLabel(record)}
                          </span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Link className="text-[var(--color-accent)] font-medium text-sm hover:text-[var(--color-accent)] transition-colors truncate max-w-[200px]" to={`/browser/detail/${record.profileId}`}>
                              {record.profileName}
                            </Link>
                            <CopyProfileNameButton name={record.profileName} />
                            {isSyncMaster && (
                              <Badge variant="info" size="sm" dot dotClassName="w-2 h-2" className="border border-[var(--color-accent)]/25">
                                主控
                              </Badge>
                            )}
                          </div>
                          {record.tags && record.tags.length > 0 && (
                            <div className="flex gap-1 ml-1">
                              {record.tags.map(tag => <Badge variant="default" key={tag}>{tag}</Badge>)}
                            </div>
                          )}
                        </div>

                        <Badge variant={status.variant} dot dotClassName="w-2 h-2 shrink-0">
                          {status.label}
                        </Badge>
                      </div>

                      <BrowserProfileActions
                        record={record}
                        mode="card"
                        disabledBySync={disabledBySync}
                        isStarting={isStarting}
                        isStopping={isStopping}
                        isSwitchingProxy={isSwitchingProxy}
                        isPinning={isPinning}
                        isExportingCookies={isExportingCookies}
                        isClearingCookies={isClearingCookies}
                        isBusy={isBusy}
                        canExportCookies={canExportCookies}
                        canClearCookies={canClearCookies}
                        exportCookieTitle={getCookieActionTitle(record, 'export')}
                        clearCookieTitle={getCookieActionTitle(record, 'clear')}
                        onStart={handleStart}
                        onStop={handleStop}
                        onSwitchProxyNow={handleSwitchProxyNow}
                        onPinCenter={handlePinCenter}
                        onRestart={handleRestart}
                        onOpenKeywords={openKwModal}
                        onExportCookies={handleExportCookies}
                        onClearCookies={setCookieClearTarget}
                        onCopy={openCopyModal}
                        onDelete={handleDelete}
                      />
                    </div>

                    {/* Body Grid: Key-Value Pairs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-2 shrink-0">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-[var(--color-text-muted)] font-medium">内核版本</span>
                        <span className="text-xs text-[var(--color-text-primary)]">{core?.coreName || getProfileCoreLabel(record)}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-[var(--color-text-muted)] font-medium">代理配置</span>
                        <span className="text-xs text-[var(--color-text-primary)]">{getProxyDisplayName(record)}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-[var(--color-text-muted)] font-medium">快捷配置码</span>
                        <div className="mt-0.5"><LaunchCodeCell profileId={record.profileId} code={record.launchCode || ''} onRefresh={loadProfiles} /></div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-[var(--color-text-muted)] font-medium">上次更新时间</span>
                        <span className="text-xs text-[var(--color-text-primary)]">{formatTime(record.updatedAt)}</span>
                      </div>
                    </div>

                    {/* Footer: Keywords */}
                    <div className="border-t border-[var(--color-border-muted)]/50 pt-2 flex items-start gap-2 flex-1 min-h-0">
                      <span className="text-xs font-medium text-[var(--color-text-primary)] shrink-0 pt-0.5">系统关键字</span>
                      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                        <KeywordInlineRow keywords={record.keywords || []} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      <InstanceBackupRestoreModal
        open={backupModalOpen}
        onClose={() => setBackupModalOpen(false)}
        profiles={profiles}
        totalCount={profiles.length}
        selectedProfileIds={selectedProfileIds}
        filteredProfileIds={filteredProfileIds}
        onRestored={() => {
          void loadProfiles({ silent: true, syncRuntimeState: true })
          void loadGroups()
        }}
      />

      <BatchRandomFingerprintModal
        open={batchRandomModalOpen}
        onClose={() => setBatchRandomModalOpen(false)}
        profiles={profiles}
        cores={cores}
        proxies={proxies}
        groups={groups}
        allTags={allTags}
        onGenerated={() => {
          void loadProfiles({ silent: true, syncRuntimeState: true })
          void loadGroups()
        }}
      />

      <BrowserListSettingsModal
        open={settingsModalOpen}
        settings={settings}
        fingerprintText={fingerprintText}
        launchText={launchText}
        saving={savingSettings}
        cores={cores}
        coreColumns={coreColumns}
        onClose={() => setSettingsModalOpen(false)}
        onSave={handleSaveSettings}
        onSettingsChange={setSettings}
        onFingerprintTextChange={setFingerprintText}
        onLaunchTextChange={setLaunchText}
        onOpenCoreModal={() => handleOpenCoreModal()}
      />

      <BrowserWindowSyncModal
        open={windowSyncModalOpen}
        state={windowSyncState}
        candidates={windowSyncCandidates}
        selectedIds={windowSyncSelectedIds}
        masterId={windowSyncMasterId}
        loading={windowSyncLoading}
        onClose={() => setWindowSyncModalOpen(false)}
        onStop={handleStopWindowSync}
        onStart={handleStartWindowSync}
        onSelectAll={selectAllWindowSyncCandidates}
        onClear={clearWindowSyncCandidates}
        onRefresh={loadWindowSyncCandidates}
        onToggleCandidate={toggleWindowSyncCandidate}
        onMasterChange={setWindowSyncMasterId}
      />

      <BrowserWindowSyncLayoutModal
        open={windowSyncLayoutModalOpen}
        layout={windowSyncLayout}
        loading={windowSyncLoading}
        onClose={() => setWindowSyncLayoutModalOpen(false)}
        onApply={handleApplyWindowSyncLayout}
        onLayoutChange={setWindowSyncLayout}
        onLayoutPatch={updateWindowSyncLayout}
      />

      <BrowserWindowSyncSettingsModal
        open={windowSyncSettingsModalOpen}
        settings={windowSyncSettings}
        loading={windowSyncLoading}
        onClose={() => setWindowSyncSettingsModalOpen(false)}
        onSave={handleSaveWindowSyncSettings}
        onSettingsChange={updateWindowSyncSettings}
      />

      <BrowserCoreEditModal
        open={coreModalOpen}
        form={coreForm}
        validation={coreValidation}
        saving={savingCore}
        onClose={() => setCoreModalOpen(false)}
        onSave={handleSaveCore}
        onValidatePath={handleValidateCorePath}
        onFormChange={setCoreForm}
        onValidationReset={() => setCoreValidation(null)}
      />

      <BrowserListFeedbackModals
        proxyErrorOpen={proxyErrorModal}
        proxyErrorMessage={proxyErrorMsg}
        pendingStartId={pendingStartId}
        onCloseProxyError={() => { setProxyErrorModal(false); setPendingStartId(null) }}
        expandOpen={expandModalOpen}
        profileCount={profiles.length}
        onCloseExpand={() => setExpandModalOpen(false)}
        copyModal={copyModal}
        copyName={copyName}
        copying={copying}
        onCloseCopy={closeCopyModal}
        onCopyNameChange={setCopyName}
        onConfirmCopy={profileId => handleCopy(profileId)}
        operationError={opError}
        onCloseOperationError={() => setOpError('')}
        cookieClearTarget={cookieClearTarget}
        onCloseCookieClear={() => setCookieClearTarget(null)}
        onConfirmCookieClear={handleConfirmClearCookies}
        deleteTarget={deleteTarget}
        onCloseDelete={() => setDeleteTarget(null)}
        onConfirmDelete={handleConfirmDelete}
        batchDeleteOpen={batchDeleteConfirmOpen}
        selectedCount={selectedIds.size}
        onCloseBatchDelete={() => setBatchDeleteConfirmOpen(false)}
        onConfirmBatchDelete={handleConfirmBatchDelete}
      />

      {/* 关键字弹窗 */}
      {kwModal.profile && (
        <KeywordsModal
          open={kwModal.open}
          profileId={kwModal.profile.profileId}
          profileName={kwModal.profile.profileName}
          initialKeywords={kwModal.profile.keywords || []}
          onClose={closeKwModal}
          onSaved={(keywords) => {
            updateProfilesState(prev => prev.map(p =>
              p.profileId === kwModal.profile!.profileId ? { ...p, keywords } : p
            ))
          }}
        />
      )}

    </div>
  )
}
