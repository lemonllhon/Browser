import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, ConfirmModal, toast } from '../../../shared/components'
import type { SortOrder, TableColumn } from '../../../shared/components/Table'
import type { BrowserProxy, ProxyIPHealthResult } from '../types'
import { fetchBrowserProxies, fetchBrowserProxyGroups, saveBrowserProxies, browserProxyPreviewBatchTestSpeed, browserProxyPreviewBatchCheckIPHealth, fetchClashImportFromURL } from '../api'
import { ProxyImportModal } from '../components/proxy-pool/ProxyImportModal'
import { ProxyImportPreviewModal } from '../components/proxy-pool/ProxyImportPreviewModal'
import { ProxyEditModal } from '../components/proxy-pool/ProxyEditModal'
import { ProxySourceEditModal } from '../components/proxy-pool/ProxySourceEditModal'
import { ProxyIPHealthDetailModal } from '../components/proxy-pool/ProxyIPHealthDetailModal'
import { ProxyPoolHeader } from '../components/proxy-pool/ProxyPoolHeader'
import { ProxyRowActions } from '../components/proxy-pool/ProxyRowActions'
import { ProxySourceRowActions } from '../components/proxy-pool/ProxySourceRowActions'
import { ProxyResourcePanel } from '../components/proxy-pool/ProxyResourcePanel'
import { onRuntimeEvent } from '../../../shared/backend/runtime'
import type { ProxyResourceView } from '../components/proxy-pool/ProxyResourcePanel'
import { PROXY_COLUMN_OPTIONS, getLockedProxyColumnKeys, readStoredProxyColumnKeys, writeStoredProxyColumnKeys } from '../config/proxyPoolColumns'
import { INITIAL_DIRECT_IMPORT_FORM, buildDirectImportCandidate, parseDirectProxyBatchText } from '../utils/directProxyImport'
import { parseClashImportText, proxyToYaml } from '../utils/clashProxyImport'
import type { DirectImportForm } from '../utils/directProxyImport'
import type { ClashProxy } from '../utils/clashProxyImport'
import { buildManualSourceURL, collectURLImportSources, defaultImportSourceName, isRefreshableSourceURL, normalizeSourceMeta, onStoredSourceMetasChanged, parseManualSourceURL, readStoredSourceMetas, resolveImportSourceID, sourceHostLabel, writeStoredSourceMetas } from '../utils/proxySourceMeta'
import type { URLImportSourceMeta } from '../utils/proxySourceMeta'
import { toLatencyValue } from '../utils/proxyProbeCache'
import { buildSourceRefreshFilterSnapshot, normalizePreviewSearchText, parseSourceRefreshFilter, previewHealthMatchesFilter, previewItemMatchesSourceRefreshFilter, previewLatencyMatchesFilter, sourceRefreshFilterLabel } from '../utils/proxyPreviewFilters'
import type { PreviewHealthFilter, PreviewLatencyFilter, SourceRefreshFilter } from '../utils/proxyPreviewFilters'
import { BUILTIN_PROXY_IDS, buildImportPreview, ensureBuiltinProxies, isBuiltinProxy, parseProxyInfo, toDisplayList } from '../utils/proxyDisplay'
import type { ProxyDisplayInfo } from '../utils/proxyDisplay'
import { appendSourceIgnoredProxyNames, applyIgnoredProxyNamesForSource, buildImportCandidatesFromClash, buildRefreshedSourceProxies, createExistingProxyIDPicker, nextProxyID, readSourceIgnoredProxyNames, renameSourceProxyName, resolveImportedProxyName } from '../utils/proxySourceRefresh'
import { normalizeRefreshIntervalM, onGlobalRefreshConfigChanged, parseTimestampMs, readGlobalRefreshConfig, writeGlobalRefreshConfig } from '../utils/proxyRefreshConfig'
import { acquireProxyAutoRefreshLock, createProxyAutoRefreshOwnerId, releaseProxyAutoRefreshLock } from '../utils/proxyAutoRefreshLock'
import { useProxyProbeState } from '../hooks/useProxyProbeState'
import { useProxyPreviewProbeState } from '../hooks/useProxyPreviewProbeState'
import { useVisibleRefresh } from '../hooks/useVisibleRefresh'
import { resolveActionErrorMessage } from '../utils/actionErrors'

type ProxyImportMode = 'clash' | 'direct'
async function applySourceRefreshFilterToParsedProxies(
  parsedProxies: ClashProxy[],
  meta: URLImportSourceMeta,
  filter: SourceRefreshFilter | null
): Promise<ClashProxy[]> {
  if (!filter) return parsedProxies

  const prefix = meta.sourceNamePrefix.trim()
  const groupName = meta.sourceGroupName.trim()
  const probeItems = parsedProxies.map((proxy, idx) => {
    const proxyName = resolveImportedProxyName(proxy, idx, prefix)
    const proxyConfig = proxyToYaml(proxy)
    const parsed = parseProxyInfo(proxyConfig)
    const display: ProxyDisplayInfo = {
      proxyId: `refresh-preview-${idx}`,
      proxyName,
      proxyConfig,
      groupName,
      sourceId: meta.sourceId,
      sourceUrl: meta.sourceUrl,
      sourceFilterJson: meta.sourceFilterJson,
      sourceAutoRefresh: meta.sourceAutoRefresh,
      sourceRefreshIntervalM: meta.sourceRefreshIntervalM,
      sourceLastRefreshAt: meta.sourceLastRefreshAt,
      ...parsed,
    }
    return { proxy, display }
  })

  const latencyMap: Record<string, number> = {}
  const needsLatency = !!filter.requiresLatency ||
    (!!filter.latencyFilter && filter.latencyFilter !== 'all' && filter.latencyFilter !== 'untested')
  if (needsLatency) {
    const results = await browserProxyPreviewBatchTestSpeed(
      probeItems.map(item => ({ proxyId: item.display.proxyId, proxyConfig: item.display.proxyConfig })),
      20
    )
    results.forEach(result => {
      latencyMap[result.proxyId] = toLatencyValue(result.ok, result.latencyMs, result.error)
    })
  }

  const healthMap: Record<string, ProxyIPHealthResult> = {}
  const needsIPHealth = !!filter.requiresIPHealth ||
    (!!filter.countryFilter && filter.countryFilter !== 'all') ||
    (!!filter.healthFilter && filter.healthFilter !== 'all' && filter.healthFilter !== 'untested')
  if (needsIPHealth) {
    const results = await browserProxyPreviewBatchCheckIPHealth(
      probeItems.map(item => ({ proxyId: item.display.proxyId, proxyConfig: item.display.proxyConfig })),
      10
    )
    results.forEach(result => {
      healthMap[result.proxyId] = result
    })
  }

  return probeItems
    .filter(item => previewItemMatchesSourceRefreshFilter(
      item.display,
      filter,
      latencyMap[item.display.proxyId],
      healthMap[item.display.proxyId]
    ))
    .map(item => item.proxy)
}

export function ProxyPoolPage() {
  const initialRefreshConfig = useMemo(() => readGlobalRefreshConfig(), [])
  const [proxies, setProxies] = useState<BrowserProxy[]>([])
  const [sourceArchive, setSourceArchive] = useState<URLImportSourceMeta[]>(readStoredSourceMetas)
  const [displayList, setDisplayList] = useState<ProxyDisplayInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<string[]>([])

  const [filterProtocol, setFilterProtocol] = useState<string>('all')
  const [filterKeyword, setFilterKeyword] = useState('')
  const [filterGroup, setFilterGroup] = useState<string>('all')
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(readStoredProxyColumnKeys)
  const [resourceView, setResourceView] = useState<ProxyResourceView>('proxies')
  const [sortColumn, setSortColumn] = useState<string>('') // 默认不排序
  const [sortOrder, setSortOrder] = useState<SortOrder>(undefined)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false)
  const [deleteTimeoutConfirmOpen, setDeleteTimeoutConfirmOpen] = useState(false)

  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importMode, setImportMode] = useState<ProxyImportMode>('clash')
  const [importUrl, setImportUrl] = useState('')
  const [importResolvedUrl, setImportResolvedUrl] = useState('')
  const [importText, setImportText] = useState('')
  const [importDnsServers, setImportDnsServers] = useState('')
  const [importNamePrefix, setImportNamePrefix] = useState('')
  const [importGroupName, setImportGroupName] = useState('')
  const [importSourceName, setImportSourceName] = useState('')
  const [directImportForm, setDirectImportForm] = useState<DirectImportForm>(() => ({ ...INITIAL_DIRECT_IMPORT_FORM }))
  const [directImportText, setDirectImportText] = useState('')
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewList, setPreviewList] = useState<ProxyDisplayInfo[]>([])
  const [previewSelectedIds, setPreviewSelectedIds] = useState<Set<string>>(new Set())
  const [previewKeyword, setPreviewKeyword] = useState('')
  const [previewLatencyFilter, setPreviewLatencyFilter] = useState<PreviewLatencyFilter>('all')
  const [previewHealthFilter, setPreviewHealthFilter] = useState<PreviewHealthFilter>('all')
  const [previewCountryFilter, setPreviewCountryFilter] = useState('all')
  const [removedPreviewProxyNames, setRemovedPreviewProxyNames] = useState<string[]>([])
  const [previewSourceFilterJson, setPreviewSourceFilterJson] = useState('')
  const [importing, setImporting] = useState(false)
  const [fetchingImportUrl, setFetchingImportUrl] = useState(false)
  const [refreshingAllSources, setRefreshingAllSources] = useState(false)
  const [refreshingSourceIds, setRefreshingSourceIds] = useState<Set<string>>(new Set())
  const [globalAutoRefreshEnabled, setGlobalAutoRefreshEnabled] = useState(initialRefreshConfig.enabled)
  const [globalRefreshIntervalM, setGlobalRefreshIntervalM] = useState(String(initialRefreshConfig.intervalM))
  const [sourceEditModalOpen, setSourceEditModalOpen] = useState(false)
  const [editingSource, setEditingSource] = useState<URLImportSourceMeta | null>(null)
  const [sourceEditForm, setSourceEditForm] = useState({ sourceUrl: '', groupName: '', namePrefix: '', dnsServers: '' })
  const [sourceDeleteConfirmOpen, setSourceDeleteConfirmOpen] = useState(false)
  const [deletingSource, setDeletingSource] = useState<URLImportSourceMeta | null>(null)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingProxy, setEditingProxy] = useState<BrowserProxy | null>(null)
  const [editForm, setEditForm] = useState({ proxyName: '', proxyConfig: '', dnsServers: '', groupName: '' })
  const [saving, setSaving] = useState(false)

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const sourceArchiveRef = useRef<URLImportSourceMeta[]>(sourceArchive)
  const refreshingSourceIdsRef = useRef<Set<string>>(new Set())
  const autoRefreshOwnerIdRef = useRef(createProxyAutoRefreshOwnerId())
  const loadProxiesInFlightRef = useRef<Promise<void> | null>(null)

  const {
    latencyMap,
    setLatencyMap,
    testingAll,
    ipHealthMap,
    setIPHealthMap,
    checkingIPHealthIds,
    checkingAllIPHealth,
    ipHealthDetailOpen,
    currentIPHealthDetail,
    closeIPHealthDetail,
    pruneProbeCaches,
    removeProbeResults,
    handleTestOne,
    handleTestAll: runTestAll,
    handleCheckOneIPHealth,
    handleCheckAllIPHealth: runCheckAllIPHealth,
    openIPHealthDetail,
    openIPHealthDetailResult,
  } = useProxyProbeState()
  const {
    previewLatencyMap,
    previewIPHealthMap,
    previewCheckingIPHealthIds,
    previewTestingAll,
    previewCheckingAllIPHealth,
    resetPreviewProbeState,
    removePreviewProbeResults,
    handlePreviewTestAll: runPreviewTestAll,
    handlePreviewCheckIPHealth: runPreviewCheckIPHealth,
  } = useProxyPreviewProbeState()
  const autoRefreshRunningRef = useRef(false)
  const globalRefreshInterval = useMemo(() => {
    const interval = normalizeRefreshIntervalM(Number(globalRefreshIntervalM || 0))
    return interval > 0 ? interval : 60
  }, [globalRefreshIntervalM])

  const fetchLatestProxyList = useCallback(async () => {
    const raw = await fetchBrowserProxies()
    return ensureBuiltinProxies(raw)
  }, [])

  useEffect(() => {
    loadProxies()
  }, [])

  useEffect(() => {
    const syncRefreshConfig = () => {
      const cfg = readGlobalRefreshConfig()
      setGlobalAutoRefreshEnabled(cfg.enabled)
      setGlobalRefreshIntervalM(String(cfg.intervalM))
    }
    const syncSourceArchive = () => {
      const stored = readStoredSourceMetas()
      sourceArchiveRef.current = stored
      setSourceArchive(stored)
    }
    const offRefreshConfig = onGlobalRefreshConfigChanged(syncRefreshConfig)
    const offSourceMetas = onStoredSourceMetasChanged(syncSourceArchive)
    return () => {
      offRefreshConfig()
      offSourceMetas()
    }
  }, [])


  useEffect(() => {
    writeStoredProxyColumnKeys(visibleColumnKeys)
  }, [visibleColumnKeys])

  useEffect(() => {
    writeGlobalRefreshConfig(globalAutoRefreshEnabled, globalRefreshInterval)
  }, [globalAutoRefreshEnabled, globalRefreshInterval])

  useEffect(() => {
    sourceArchiveRef.current = sourceArchive
  }, [sourceArchive])

  useEffect(() => {
    refreshingSourceIdsRef.current = refreshingSourceIds
  }, [refreshingSourceIds])

  useEffect(() => {
    if (!proxies.length) return
    pruneProbeCaches(new Set(proxies.map(p => p.proxyId)))
  }, [proxies])

  const loadProxies = async (silent = false) => {
    if (loadProxiesInFlightRef.current) {
      return loadProxiesInFlightRef.current
    }
    const task = (async () => {
      if (!silent) {
        setLoading(true)
      }
      try {
        const proxyList = await fetchLatestProxyList()
        const validProxyIds = new Set(proxyList.map(proxy => proxy.proxyId))
        const persistedLatency: Record<string, number> = {}
        const persistedIPHealth: Record<string, ProxyIPHealthResult> = {}
        proxyList.forEach(proxy => {
          if (proxy.lastTestedAt) {
            persistedLatency[proxy.proxyId] = (proxy.lastTestOk ?? false)
              ? (proxy.lastLatencyMs ?? -2)
              : -2
          }
          if (proxy.lastIPHealthJson) {
            try {
              const parsed = JSON.parse(proxy.lastIPHealthJson) as ProxyIPHealthResult
              if (parsed && typeof parsed === 'object' && parsed.proxyId) {
                persistedIPHealth[proxy.proxyId] = parsed
              }
            } catch {
              // ignore bad historical json
            }
          }
        })

        const archivedSources = collectURLImportSources(proxyList, sourceArchiveRef.current)
        sourceArchiveRef.current = archivedSources
        setSourceArchive(archivedSources)
        writeStoredSourceMetas(archivedSources)
        setProxies(proxyList)
        setDisplayList(toDisplayList(proxyList))
        setSelectedIds(prev => {
          const next = new Set<string>()
          prev.forEach(proxyId => {
            if (validProxyIds.has(proxyId)) {
              next.add(proxyId)
            }
          })
          return next
        })
        setLatencyMap(prev => {
          const next = { ...prev, ...persistedLatency }
          Object.entries(prev).forEach(([proxyId, latency]) => {
            if (latency === -1) {
              next[proxyId] = latency
            }
          })
          return next
        })
        setIPHealthMap(prev => ({ ...prev, ...persistedIPHealth }))
        const grps = await fetchBrowserProxyGroups()
        setGroups(grps)
      } finally {
        if (!silent) {
          setLoading(false)
        }
      }
    })()
    loadProxiesInFlightRef.current = task
    try {
      return await task
    } finally {
      if (loadProxiesInFlightRef.current === task) {
        loadProxiesInFlightRef.current = null
      }
    }
  }

  useEffect(() => {
    const offProxiesUpdated = onRuntimeEvent('browser:proxies:updated', () => {
      void loadProxies(true)
    })
    return () => {
      offProxiesUpdated?.()
    }
  }, [])

  const canVisibleRefreshProxies = !saving &&
    !importing &&
    !fetchingImportUrl &&
    !refreshingAllSources &&
    refreshingSourceIds.size === 0 &&
    !editModalOpen &&
    !sourceEditModalOpen &&
    !importModalOpen &&
    !previewModalOpen &&
    !deleteConfirmOpen &&
    !batchDeleteConfirmOpen &&
    !deleteTimeoutConfirmOpen &&
    !sourceDeleteConfirmOpen

  useVisibleRefresh(() => loadProxies(true), 2000, canVisibleRefreshProxies)

  const updateSourceArchive = useCallback((updater: (current: URLImportSourceMeta[]) => URLImportSourceMeta[]) => {
    const next = updater(sourceArchiveRef.current)
    sourceArchiveRef.current = next
    setSourceArchive(next)
    writeStoredSourceMetas(next)
    return next
  }, [])

  const saveProxies = useCallback(async (list: BrowserProxy[]) => {
    const nextList = ensureBuiltinProxies(list)
    await saveBrowserProxies(nextList)
    updateSourceArchive(current => collectURLImportSources(nextList, current))
    setProxies(nextList)
    setDisplayList(toDisplayList(nextList))
    // 刷新分组列表（可能有新分组加入）
    const grps = await fetchBrowserProxyGroups()
    setGroups(grps)
  }, [updateSourceArchive])

  const saveLatestProxies = useCallback(async (updater: (latest: BrowserProxy[]) => BrowserProxy[] | Promise<BrowserProxy[]>) => {
    const latest = await fetchLatestProxyList()
    const next = await updater(latest)
    await saveProxies(next)
    return next
  }, [fetchLatestProxyList, saveProxies])

  const sourceMetas = useMemo(() => collectURLImportSources(proxies, sourceArchive), [proxies, sourceArchive])
  const hasURLImportSources = sourceMetas.length > 0

  const refreshSingleSource = useCallback(async (sourceId: string, silent: boolean) => {
    const currentList = await fetchLatestProxyList()
    const metas = collectURLImportSources(currentList, sourceArchiveRef.current)
    const meta = metas.find(item => item.sourceId === sourceId)
    if (!meta) return false
    if (!isRefreshableSourceURL(meta.sourceUrl)) {
      if (!silent) toast.warning('手动添加的资源没有订阅 URL，不能刷新；可以编辑后补充 URL')
      return false
    }

    if (refreshingSourceIdsRef.current.has(sourceId)) return false
    setRefreshingSourceIds(prev => {
      const next = new Set(prev)
      next.add(sourceId)
      return next
    })

    try {
      const result = await fetchClashImportFromURL(meta.sourceUrl)
      const parsed = parseClashImportText(result.content || '')
      if (!parsed.length) {
        throw new Error('订阅内容未解析到可用代理')
      }
      const sourceFilter = parseSourceRefreshFilter(meta.sourceFilterJson)
      const sourceFilteredParsed = await applySourceRefreshFilterToParsedProxies(parsed, meta, sourceFilter)
      const ignoredNameMap = readSourceIgnoredProxyNames()
      const sourceIgnoredNames = ignoredNameMap[sourceId] || []
      const filteredParsed = applyIgnoredProxyNamesForSource(sourceFilteredParsed, meta.sourceNamePrefix, sourceIgnoredNames)
      if (filteredParsed.length === 0) {
        throw new Error('刷新后没有符合当前订阅筛选的节点，已保留原有节点')
      }

      const latest = await fetchLatestProxyList()
      const latestMeta = collectURLImportSources(latest, sourceArchiveRef.current).find(item => item.sourceId === sourceId) || meta
      const oldSourceProxies = latest.filter(item => (item.sourceId || '').trim() === sourceId)
      const refreshedAt = new Date().toISOString()
      const effectiveMeta: URLImportSourceMeta = {
        ...latestMeta,
        sourceAutoRefresh: globalAutoRefreshEnabled,
        sourceRefreshIntervalM: globalRefreshInterval,
        proxyCount: latestMeta.proxyCount,
      }
      const refreshedSourceProxies = buildRefreshedSourceProxies(filteredParsed, oldSourceProxies, effectiveMeta, refreshedAt)

      const merged = latest
        .filter(item => (item.sourceId || '').trim() !== sourceId)
        .concat(refreshedSourceProxies)

      await saveProxies(merged)
      if (!silent) {
        toast.success(`订阅刷新成功：${meta.sourceUrl}（${refreshedSourceProxies.length} 条）`)
      }
      return true
    } catch (error: unknown) {
      if (!silent) {
        toast.error(resolveActionErrorMessage(error, '订阅刷新失败'))
      }
      return false
    } finally {
      setRefreshingSourceIds(prev => {
        const next = new Set(prev)
        next.delete(sourceId)
        return next
      })
    }
  }, [fetchLatestProxyList, globalAutoRefreshEnabled, globalRefreshInterval, saveProxies])

  const handleRefreshAllSources = useCallback(async (silent = false) => {
    const latest = await fetchLatestProxyList()
    const metas = collectURLImportSources(latest, sourceArchiveRef.current)
    if (metas.length === 0) {
      if (!silent) {
        toast.info('当前没有 URL 导入订阅')
      }
      return
    }

    setRefreshingAllSources(true)
    let successCount = 0
    try {
      for (const meta of metas) {
        // 串行刷新，避免并发保存导致覆盖
        // eslint-disable-next-line no-await-in-loop
        const ok = await refreshSingleSource(meta.sourceId, true)
        if (ok) successCount += 1
      }
    } finally {
      setRefreshingAllSources(false)
    }

    if (!silent) {
      if (successCount === metas.length) {
        toast.success(`订阅刷新完成：${successCount}/${metas.length}`)
      } else {
        toast.warning(`订阅刷新完成：成功 ${successCount}/${metas.length}`)
      }
    }
  }, [fetchLatestProxyList, refreshSingleSource])

  useEffect(() => {
    const runAutoRefresh = async () => {
      if (document.visibilityState !== 'visible') {
        return
      }
      if (autoRefreshRunningRef.current || refreshingAllSources || refreshingSourceIdsRef.current.size > 0) {
        return
      }
      if (!globalAutoRefreshEnabled) {
        return
      }
      const ownerId = autoRefreshOwnerIdRef.current
      if (!(await acquireProxyAutoRefreshLock(ownerId))) {
        return
      }
      autoRefreshRunningRef.current = true
      try {
        const intervalMs = globalRefreshInterval * 60 * 1000
        const latest = await fetchLatestProxyList()
        const metas = collectURLImportSources(latest, sourceArchiveRef.current).filter(meta => {
          if (!isRefreshableSourceURL(meta.sourceUrl)) return false
          const last = parseTimestampMs(meta.sourceLastRefreshAt)
          return last <= 0 || Date.now() - last >= intervalMs
        })
        if (metas.length === 0) {
          return
        }

        for (const meta of metas) {
          // eslint-disable-next-line no-await-in-loop
          await refreshSingleSource(meta.sourceId, true)
        }
      } finally {
        autoRefreshRunningRef.current = false
        releaseProxyAutoRefreshLock(ownerId)
      }
    }

    void runAutoRefresh()
    const timer = window.setInterval(() => {
      void runAutoRefresh()
    }, 60 * 1000)
    const runWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void runAutoRefresh()
      }
    }
    document.addEventListener('visibilitychange', runWhenVisible)
    window.addEventListener('focus', runWhenVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', runWhenVisible)
      window.removeEventListener('focus', runWhenVisible)
    }
  }, [fetchLatestProxyList, globalAutoRefreshEnabled, globalRefreshInterval, refreshingAllSources, refreshSingleSource])

  const protocolOptions = useMemo(
    () => ['all', ...Array.from(new Set(displayList.map(p => p.type).filter(t => t !== '-')))],
    [displayList]
  )

  const getLatencySortTuple = (proxyId: string): [number, number] => {
    const v = latencyMap[proxyId]
    if (v === undefined) return [4, Number.MAX_SAFE_INTEGER]
    if (v === -1) return [1, Number.MAX_SAFE_INTEGER] // 测速中
    if (v === -2) return [2, Number.MAX_SAFE_INTEGER] // 超时
    if (v === -3) return [3, Number.MAX_SAFE_INTEGER] // 不支持
    return [0, v] // 正常延迟
  }

  const compareText = (a: string, b: string) => a.localeCompare(b, 'zh-CN')

  const compareByColumn = (a: ProxyDisplayInfo, b: ProxyDisplayInfo, column: string) => {
    switch (column) {
      case 'proxyName':
        return compareText(a.proxyName || '', b.proxyName || '')
      case 'groupName':
        return compareText(a.groupName || '', b.groupName || '')
      case 'type':
        return compareText(a.type || '', b.type || '')
      case 'server':
        return compareText(a.server || '', b.server || '')
      case 'port':
        return (a.port || 0) - (b.port || 0)
      case 'latency': {
        const [rankA, valA] = getLatencySortTuple(a.proxyId)
        const [rankB, valB] = getLatencySortTuple(b.proxyId)
        if (rankA !== rankB) return rankA - rankB
        if (valA !== valB) return valA - valB
        return compareText(a.proxyName || '', b.proxyName || '')
      }
      default:
        return 0
    }
  }

  const filteredList = useMemo(() => {
    const filtered = displayList.filter(p => {
      const matchProtocol = filterProtocol === 'all' || p.type === filterProtocol
      const matchKeyword = !filterKeyword || p.proxyName.toLowerCase().includes(filterKeyword.toLowerCase()) || p.server.toLowerCase().includes(filterKeyword.toLowerCase())
      const matchGroup = filterGroup === 'all' || p.groupName === filterGroup
      return matchProtocol && matchKeyword && matchGroup
    })

    if (!sortColumn || !sortOrder) return filtered

    return [...filtered].sort((a, b) => {
      const cmp = compareByColumn(a, b, sortColumn)
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [displayList, filterProtocol, filterKeyword, filterGroup, sortColumn, sortOrder, latencyMap])

  const allFilteredSelected = filteredList.length > 0 && filteredList.every(p => selectedIds.has(p.proxyId))
  const someFilteredSelected = filteredList.some(p => selectedIds.has(p.proxyId))
  const timeoutProxyIds = useMemo(() => {
    return proxies
      .filter(p => {
        if (isBuiltinProxy(p)) return false
        const cachedLatency = latencyMap[p.proxyId]
        if (cachedLatency === -2) return true
        return !!p.lastTestedAt && p.lastTestOk === false
      })
      .map(p => p.proxyId)
  }, [proxies, latencyMap])

  const previewCountryOptions = useMemo(() => {
    const countries = new Set<string>()
    Object.values(previewIPHealthMap).forEach(result => {
      const country = (result?.country || '').trim()
      if (result?.ok && country) countries.add(country)
    })
    return [
      { value: 'all', label: '全部地区' },
      ...Array.from(countries).sort((a, b) => a.localeCompare(b)).map(country => ({ value: country, label: country })),
    ]
  }, [previewIPHealthMap])

  const filteredPreviewList = useMemo(() => {
    const keyword = normalizePreviewSearchText(previewKeyword)
    return previewList.filter(item => {
      const latency = previewLatencyMap[item.proxyId]
      if (!previewLatencyMatchesFilter(latency, previewLatencyFilter)) return false

      const health = previewIPHealthMap[item.proxyId]
      const checking = previewCheckingIPHealthIds.has(item.proxyId)
      if (!previewHealthMatchesFilter(health, checking, previewHealthFilter)) return false

      if (previewCountryFilter !== 'all' && (health?.country || '') !== previewCountryFilter) return false

      if (!keyword) return true
      const searchText = [
        item.proxyName,
        item.groupName,
        item.type,
        item.server,
        item.port,
        health?.ip,
        health?.country,
        health?.region,
        health?.city,
        health?.asOrganization,
        health?.fraudScore,
        health?.isResidential ? '住宅 residential' : '机房 datacenter',
      ].map(normalizePreviewSearchText).join(' ')
      return searchText.includes(keyword)
    })
  }, [
    previewList,
    previewKeyword,
    previewLatencyFilter,
    previewHealthFilter,
    previewCountryFilter,
    previewLatencyMap,
    previewIPHealthMap,
    previewCheckingIPHealthIds,
  ])

  const previewSelectedCount = previewSelectedIds.size
  const previewAllFilteredSelected = filteredPreviewList.length > 0 && filteredPreviewList.every(p => previewSelectedIds.has(p.proxyId))
  const previewSomeFilteredSelected = filteredPreviewList.some(p => previewSelectedIds.has(p.proxyId))
  const previewHasActiveFilter = !!previewKeyword.trim() || previewLatencyFilter !== 'all' || previewHealthFilter !== 'all' || previewCountryFilter !== 'all'
  const previewTestableList = filteredPreviewList.filter(p => p.proxyConfig !== 'direct://')

  const buildCurrentPreviewSourceFilterJson = () => buildSourceRefreshFilterSnapshot(
    previewKeyword,
    previewLatencyFilter,
    previewHealthFilter,
    previewCountryFilter,
    Object.keys(previewIPHealthMap).length > 0
  )

  const resetPreviewDetectionState = () => {
    setPreviewSelectedIds(new Set())
    setPreviewKeyword('')
    setPreviewLatencyFilter('all')
    setPreviewHealthFilter('all')
    setPreviewCountryFilter('all')
    resetPreviewProbeState()
    setPreviewSourceFilterJson('')
  }

  const handleToggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        filteredList.forEach(p => next.delete(p.proxyId))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        filteredList.filter(p => !BUILTIN_PROXY_IDS.has(p.proxyId)).forEach(p => next.add(p.proxyId))
        return next
      })
    }
  }

  const handleToggleOne = (proxyId: string) => {
    if (BUILTIN_PROXY_IDS.has(proxyId)) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(proxyId) ? next.delete(proxyId) : next.add(proxyId)
      return next
    })
  }

  const handleBatchDeleteConfirm = async () => {
    const deleteIds = new Set(selectedIds)
    try {
      let removedCount = 0
      await saveLatestProxies(latest => {
        removedCount = latest.filter(p => deleteIds.has(p.proxyId)).length
        return latest.filter(p => !deleteIds.has(p.proxyId))
      })
      if (removedCount === 0) {
        toast.info('选中的代理已经被其他窗口删除')
      } else {
        toast.success(`已删除 ${removedCount} 个代理`)
      }
      setSelectedIds(new Set())
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '删除失败'))
    }
  }

  const handleDeleteTimeoutConfirm = async () => {
    const deleteIds = new Set(timeoutProxyIds)
    if (deleteIds.size === 0) {
      setDeleteTimeoutConfirmOpen(false)
      toast.info('没有可删除的测试超时节点')
      return
    }
    try {
      let removedCount = 0
      await saveLatestProxies(latest => {
        removedCount = latest.filter(p => deleteIds.has(p.proxyId)).length
        return latest.filter(p => !deleteIds.has(p.proxyId))
      })
      removeProbeResults(deleteIds)
      setSelectedIds(prev => {
        const next = new Set(prev)
        deleteIds.forEach(id => next.delete(id))
        return next
      })
      if (removedCount === 0) {
        toast.info('测试超时节点已经被其他窗口处理')
      } else {
        toast.success(`已删除 ${removedCount} 个测试超时节点`)
      }
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '删除失败'))
    } finally {
      setDeleteTimeoutConfirmOpen(false)
    }
  }

  const handleTestAll = async () => {
    await runTestAll(filteredList.filter(p => p.proxyConfig !== 'direct://'))
  }

  const handleCheckAllIPHealth = async () => {
    await runCheckAllIPHealth(filteredList.filter(p => p.proxyConfig !== 'direct://'))
  }

  const handleToggleAllPreview = () => {
    if (previewAllFilteredSelected) {
      setPreviewSelectedIds(prev => {
        const next = new Set(prev)
        filteredPreviewList.forEach(p => next.delete(p.proxyId))
        return next
      })
    } else {
      setPreviewSelectedIds(prev => {
        const next = new Set(prev)
        filteredPreviewList.forEach(p => next.add(p.proxyId))
        return next
      })
      if (previewSourceFilterJson && buildCurrentPreviewSourceFilterJson() !== previewSourceFilterJson) {
        setPreviewSourceFilterJson('')
      }
    }
  }

  const handleTogglePreviewOne = (proxyId: string) => {
    const selectedNow = previewSelectedIds.has(proxyId)
    const sourceFilter = parseSourceRefreshFilter(previewSourceFilterJson)
    const record = previewList.find(item => item.proxyId === proxyId)
    if (
      sourceFilter &&
      !selectedNow &&
      record &&
      !previewItemMatchesSourceRefreshFilter(record, sourceFilter, previewLatencyMap[proxyId], previewIPHealthMap[proxyId])
    ) {
      setPreviewSourceFilterJson('')
    }
    setPreviewSelectedIds(prev => {
      const next = new Set(prev)
      next.has(proxyId) ? next.delete(proxyId) : next.add(proxyId)
      return next
    })
  }

  const handleSelectOnlyFilteredPreview = () => {
    if (filteredPreviewList.length === 0) {
      toast.info('当前筛选没有可选择的代理')
      return
    }
    setPreviewSelectedIds(new Set(filteredPreviewList.map(item => item.proxyId)))
    setPreviewSourceFilterJson(buildCurrentPreviewSourceFilterJson())
  }

  const removePreviewItems = (removeIds: Set<string>, trackIgnored = true) => {
    if (removeIds.size === 0) return
    const removedNames = previewList
      .filter(item => removeIds.has(item.proxyId))
      .map(item => item.proxyName)
    setPreviewList(prev => prev.filter(item => !removeIds.has(item.proxyId)))
    setPreviewSelectedIds(prev => {
      const next = new Set(prev)
      removeIds.forEach(id => next.delete(id))
      return next
    })
    removePreviewProbeResults(removeIds)
    if (trackIgnored) {
      setRemovedPreviewProxyNames(prev => [...prev, ...removedNames])
    }
  }

  const handleRemoveFilteredPreview = () => {
    if (filteredPreviewList.length === 0) {
      toast.info('当前筛选没有可删除的代理')
      return
    }
    removePreviewItems(new Set(filteredPreviewList.map(item => item.proxyId)))
  }

  const handleKeepFilteredPreview = () => {
    if (filteredPreviewList.length === 0) {
      toast.info('当前筛选没有可保留的代理')
      return
    }
    const keepIds = new Set(filteredPreviewList.map(item => item.proxyId))
    const removeIds = new Set(previewList.filter(item => !keepIds.has(item.proxyId)).map(item => item.proxyId))
    removePreviewItems(removeIds, false)
    setPreviewSelectedIds(keepIds)
    setPreviewSourceFilterJson(buildCurrentPreviewSourceFilterJson())
  }

  const handlePreviewTestAll = async () => {
    await runPreviewTestAll(previewTestableList)
  }

  const handlePreviewCheckIPHealth = async () => {
    await runPreviewCheckIPHealth(previewTestableList)
  }

  const renderLatency = (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      return <span className="text-[var(--color-text-muted)] text-xs">不适用</span>
    }
    const val = latencyMap[record.proxyId]
    if (val === undefined) return <span className="text-[var(--color-text-muted)] text-xs">-</span>
    if (val === -1) return <span className="text-[var(--color-text-muted)] text-xs animate-pulse">测速中...</span>
    if (val === -2) return <span className="text-red-500 text-xs">超时</span>
    if (val === -3) return <span className="text-gray-400 text-xs">不支持</span>
    const color = val < 200 ? 'text-green-500' : val < 500 ? 'text-yellow-500' : 'text-red-500'
    return <span className={`text-xs font-medium ${color}`}>{val} ms</span>
  }

  const renderIPHealth = (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      return <span className="text-[var(--color-text-muted)] text-xs">不适用</span>
    }
    if (checkingIPHealthIds.has(record.proxyId)) {
      return <span className="text-[var(--color-text-muted)] text-xs animate-pulse">检测中...</span>
    }

    const result = ipHealthMap[record.proxyId]
    if (!result) return <span className="text-[var(--color-text-muted)] text-xs">-</span>
    if (!result.ok) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-500 truncate max-w-[120px]" title={result.error || '检测失败'}>失败</span>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openIPHealthDetail(record.proxyId) }}>原始</Button>
        </div>
      )
    }

    const location = [result.country, result.region, result.city].filter(Boolean).join(' / ')
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0">
          <div className="text-xs text-[var(--color-text-primary)] truncate">{result.ip || '-'}</div>
          <div className="text-[11px] text-[var(--color-text-muted)] truncate">
            {`fraud ${result.fraudScore} | ${result.isResidential ? '住宅' : '机房'}${location ? ` | ${location}` : ''}`}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openIPHealthDetail(record.proxyId) }}>原始</Button>
      </div>
    )
  }

  const renderPreviewLatency = (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      return <span className="text-[var(--color-text-muted)] text-xs">不适用</span>
    }
    const val = previewLatencyMap[record.proxyId]
    if (val === undefined) return <span className="text-[var(--color-text-muted)] text-xs">-</span>
    if (val === -1) return <span className="text-[var(--color-text-muted)] text-xs animate-pulse">测速中...</span>
    if (val === -2) return <span className="text-red-500 text-xs">超时</span>
    if (val === -3) return <span className="text-gray-400 text-xs">不支持</span>
    const color = val < 200 ? 'text-green-500' : val < 500 ? 'text-yellow-500' : 'text-red-500'
    return <span className={`text-xs font-medium ${color}`}>{val} ms</span>
  }

  const openPreviewIPHealthDetail = (proxyId: string) => {
    openIPHealthDetailResult(previewIPHealthMap[proxyId])
  }

  const renderPreviewIPHealth = (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      return <span className="text-[var(--color-text-muted)] text-xs">不适用</span>
    }
    if (previewCheckingIPHealthIds.has(record.proxyId)) {
      return <span className="text-[var(--color-text-muted)] text-xs animate-pulse">检测中...</span>
    }

    const result = previewIPHealthMap[record.proxyId]
    if (!result) return <span className="text-[var(--color-text-muted)] text-xs">-</span>
    if (!result.ok) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-500 truncate max-w-[120px]" title={result.error || '检测失败'}>失败</span>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openPreviewIPHealthDetail(record.proxyId) }}>原始</Button>
        </div>
      )
    }

    const location = [result.country, result.region, result.city].filter(Boolean).join(' / ')
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0">
          <div className="text-xs text-[var(--color-text-primary)] truncate">{result.ip || '-'}</div>
          <div className="text-[11px] text-[var(--color-text-muted)] truncate">
            {`fraud ${result.fraudScore} | ${result.isResidential ? '住宅' : '机房'}${location ? ` | ${location}` : ''}`}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openPreviewIPHealthDetail(record.proxyId) }}>原始</Button>
      </div>
    )
  }

  const toggleVisibleColumn = (key: string) => {
    const option = PROXY_COLUMN_OPTIONS.find(item => item.key === key)
    if (option?.locked) return
    setVisibleColumnKeys(prev => {
      const next = prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
      return Array.from(new Set([...getLockedProxyColumnKeys(), ...next]))
    })
  }

  const allColumns: TableColumn<ProxyDisplayInfo>[] = [
    {
      key: 'checkbox',
      title: '',
      width: '40px',
      render: (_, record) => (
        <input
          type="checkbox"
          checked={selectedIds.has(record.proxyId)}
          disabled={BUILTIN_PROXY_IDS.has(record.proxyId)}
          onChange={() => handleToggleOne(record.proxyId)}
          onClick={e => e.stopPropagation()}
          className="w-4 h-4 rounded border-[var(--color-border)] accent-[var(--color-primary)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        />
      ),
    },
    { key: 'proxyName', title: '代理名称', width: '180px', sortable: true },
    { key: 'groupName', title: '分组', width: '100px', sortable: true, render: (val) => val ? <span className="px-1.5 py-0.5 text-xs rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">{String(val)}</span> : '-' },
    {
      key: 'source',
      title: '来源',
      width: '180px',
      render: (_, record) => {
        if (!record.sourceUrl) return '-'
        const host = sourceHostLabel(record.sourceUrl)
        return (
          <div className="text-xs leading-5">
            <div className="text-[var(--color-text-primary)] truncate" title={record.sourceUrl}>{host}</div>
            <div className="text-[var(--color-text-muted)]">
              {globalAutoRefreshEnabled ? `自动刷新 ${globalRefreshInterval} 分钟（全局）` : '手动刷新'}
            </div>
          </div>
        )
      },
    },
    { key: 'type', title: '类型', width: '90px', sortable: true },
    { key: 'server', title: '服务器', width: '180px', sortable: true },
    { key: 'port', title: '端口', width: '80px', sortable: true, render: (val) => String(val ?? '-') || '-' },
    {
      key: 'latency',
      title: '延迟',
      width: '90px',
      sortable: true,
      render: (_, record) => renderLatency(record),
    },
    {
      key: 'ipHealth',
      title: 'IP健康',
      width: '280px',
      render: (_, record) => renderIPHealth(record),
    },
    {
      key: 'actions',
      title: '操作',
      width: '320px',
      render: (_, record) => (
        <ProxyRowActions
          record={record}
          latencyValue={latencyMap[record.proxyId]}
          checkingIPHealth={checkingIPHealthIds.has(record.proxyId)}
          refreshingSource={refreshingSourceIds.has(record.sourceId)}
          onRefreshSource={(sourceId) => void refreshSingleSource(sourceId, false)}
          onTest={handleTestOne}
          onCheckIPHealth={handleCheckOneIPHealth}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
      ),
    },
  ]

  const handleRemovePreviewProxy = (proxyId: string) => {
    removePreviewItems(new Set([proxyId]))
  }

  const previewColumns: TableColumn<ProxyDisplayInfo>[] = [
    {
      key: 'checkbox',
      title: (
        <input
          type="checkbox"
          checked={previewAllFilteredSelected}
          ref={el => { if (el) el.indeterminate = previewSomeFilteredSelected && !previewAllFilteredSelected }}
          onChange={handleToggleAllPreview}
          onClick={e => e.stopPropagation()}
          className="w-4 h-4 rounded border-[var(--color-border)] accent-[var(--color-primary)] cursor-pointer"
          title="选择当前筛选结果"
        />
      ),
      width: '44px',
      render: (_, record) => (
        <input
          type="checkbox"
          checked={previewSelectedIds.has(record.proxyId)}
          onChange={() => handleTogglePreviewOne(record.proxyId)}
          onClick={e => e.stopPropagation()}
          className="w-4 h-4 rounded border-[var(--color-border)] accent-[var(--color-primary)] cursor-pointer"
        />
      ),
    },
    {
      key: 'proxyName',
      title: '代理名称',
      width: '220px',
      render: (_, record) => (
        <div className="min-w-0">
          <div className="truncate text-[var(--color-text-primary)]" title={record.proxyName}>{record.proxyName}</div>
          {record.groupName && <div className="text-[11px] text-[var(--color-text-muted)] truncate">{record.groupName}</div>}
        </div>
      ),
    },
    { key: 'type', title: '类型', width: '80px' },
    { key: 'server', title: '服务器', width: '170px', render: (val) => <span className="truncate block max-w-[170px]" title={String(val ?? '-')}>{String(val ?? '-')}</span> },
    { key: 'port', title: '端口', width: '70px', render: (val) => String(val ?? '-') || '-' },
    {
      key: 'latency',
      title: '延迟',
      width: '90px',
      render: (_, record) => renderPreviewLatency(record),
    },
    {
      key: 'ipHealth',
      title: 'IP健康',
      width: '280px',
      render: (_, record) => renderPreviewIPHealth(record),
    },
    {
      key: 'actions',
      title: '操作',
      width: '96px',
      render: (_, record) => (
        <Button
          size="sm"
          variant="danger"
          onClick={() => handleRemovePreviewProxy(record.proxyId)}
        >
          删除
        </Button>
      ),
    },
  ]

  const handleEdit = (record: ProxyDisplayInfo) => {
    const proxy = proxies.find(p => p.proxyId === record.proxyId)
    if (proxy) {
      setEditingProxy(proxy)
      setEditForm({ proxyName: proxy.proxyName, proxyConfig: proxy.proxyConfig, dnsServers: proxy.dnsServers || '', groupName: proxy.groupName || '' })
      setEditModalOpen(true)
    }
  }

  const handleSaveProxy = async () => {
    if (!editForm.proxyName.trim()) { toast.error('请输入代理名称'); return }
    if (!editingProxy) return
    setSaving(true)
    try {
      const latest = await fetchLatestProxyList()
      if (!latest.some(p => p.proxyId === editingProxy.proxyId)) {
        setEditModalOpen(false)
        setEditingProxy(null)
        toast.error('这个代理已被其他窗口删除，请重新选择')
        return
      }
      const newProxies = latest.map(p =>
        p.proxyId === editingProxy.proxyId
          ? { ...p, proxyName: editForm.proxyName, proxyConfig: editForm.proxyConfig, dnsServers: editForm.dnsServers, groupName: editForm.groupName }
          : p
      )
      await saveProxies(newProxies)
      setEditModalOpen(false)
      toast.success('代理已更新')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClick = (proxyId: string) => {
    setDeletingId(proxyId)
    setDeleteConfirmOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingId) return
    try {
      const latest = await fetchLatestProxyList()
      if (!latest.some(p => p.proxyId === deletingId)) {
        setSelectedIds(prev => { const next = new Set(prev); next.delete(deletingId); return next })
        setDeletingId(null)
        toast.info('这个代理已经被其他窗口删除')
        return
      }
      const newProxies = latest.filter(p => p.proxyId !== deletingId)
      await saveProxies(newProxies)
      setSelectedIds(prev => { const next = new Set(prev); next.delete(deletingId); return next })
      toast.success('代理已删除')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '删除失败'))
    }
    setDeletingId(null)
  }

  const handleImportModeChange = (nextMode: ProxyImportMode) => {
    setImportMode(nextMode)
    setImportResolvedUrl('')
    if (nextMode !== 'clash') {
      setImportUrl('')
      setImportDnsServers('')
    }
  }

  const handleOpenImportCenter = (mode: ProxyImportMode = 'clash') => {
    setImportMode(mode)
    setImportModalOpen(true)
  }

  const handleEditSource = (source: URLImportSourceMeta) => {
    setEditingSource(source)
    setSourceEditForm({
      sourceUrl: source.sourceUrl,
      groupName: source.sourceGroupName,
      namePrefix: source.sourceNamePrefix,
      dnsServers: source.sourceDnsServers,
    })
    setSourceEditModalOpen(true)
  }

  const handleSaveSource = async () => {
    if (!editingSource) return
    const nextURL = sourceEditForm.sourceUrl.trim()
    if (!nextURL) {
      toast.error('订阅 URL 不能为空')
      return
    }
    if (!parseManualSourceURL(nextURL)) {
      try {
        const parsed = new URL(nextURL)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          toast.error('订阅 URL 仅支持 HTTP / HTTPS；手动资源请保留 manual-* 标识')
          return
        }
      } catch {
        toast.error('订阅 URL 格式无效')
        return
      }
    }

    const nextGroup = sourceEditForm.groupName.trim()
    const nextPrefix = sourceEditForm.namePrefix.trim()
    const nextDNS = sourceEditForm.dnsServers.trim()

    try {
      const latest = await fetchLatestProxyList()
      if (!latest.some(item => (item.sourceId || '').trim() === editingSource.sourceId)) {
        setSourceEditModalOpen(false)
        setEditingSource(null)
        toast.error('这个订阅已被其他窗口删除，请重新选择')
        return
      }
      const updated = latest.map(item => {
        if ((item.sourceId || '').trim() !== editingSource.sourceId) return item
        return {
          ...item,
          proxyName: renameSourceProxyName(item.proxyName, editingSource.sourceNamePrefix, nextPrefix),
          groupName: nextGroup || undefined,
          dnsServers: nextDNS || undefined,
          sourceUrl: nextURL,
          sourceNamePrefix: nextPrefix || undefined,
        }
      })
      await saveProxies(updated)
      updateSourceArchive(current => current.map(item => {
        if (item.sourceId !== editingSource.sourceId) return item
        return normalizeSourceMeta({
          ...item,
          sourceUrl: nextURL,
          sourceGroupName: nextGroup,
          sourceNamePrefix: nextPrefix,
          sourceDnsServers: nextDNS,
        })
      }))
      setSourceEditModalOpen(false)
      setEditingSource(null)
      toast.success('订阅已更新')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '订阅保存失败'))
    }
  }

  const handleDeleteSourceClick = (source: URLImportSourceMeta) => {
    setDeletingSource(source)
    setSourceDeleteConfirmOpen(true)
  }

  const handleDeleteSourceConfirm = async () => {
    if (!deletingSource) return
    try {
      const latest = await fetchLatestProxyList()
      if (!latest.some(item => (item.sourceId || '').trim() === deletingSource.sourceId)) {
        updateSourceArchive(current => current.filter(item => item.sourceId !== deletingSource.sourceId))
        setDeletingSource(null)
        toast.info('这个订阅已经被其他窗口删除')
        return
      }
      const updated = latest.filter(item => (item.sourceId || '').trim() !== deletingSource.sourceId)
      await saveProxies(updated)
      updateSourceArchive(current => current.filter(item => item.sourceId !== deletingSource.sourceId))
      setDeletingSource(null)
      toast.success('订阅已删除')
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '订阅删除失败'))
    }
  }

  const handleFetchImportURL = async () => {
    const targetURL = importUrl.trim()
    if (!targetURL) {
      toast.error('请输入订阅 URL')
      return
    }

    setFetchingImportUrl(true)
    try {
      const result = await fetchClashImportFromURL(targetURL)
      const content = (result?.content || '').trim()
      if (!content) {
        throw new Error('订阅内容为空')
      }

      setImportResolvedUrl((result?.url || targetURL).trim())
      setImportText(content)

      if (!importDnsServers.trim() && typeof result?.dnsServers === 'string' && result.dnsServers.trim()) {
        setImportDnsServers(result.dnsServers.trim())
      }
      if (!importGroupName.trim() && typeof result?.suggestedGroup === 'string' && result.suggestedGroup.trim()) {
        setImportGroupName(result.suggestedGroup.trim())
      }

      toast.success(`URL 获取成功，检测到 ${Math.max(0, Number(result?.proxyCount || 0))} 个代理`)
    } catch (error: unknown) {
      setImportResolvedUrl('')
      toast.error(resolveActionErrorMessage(error, 'URL 获取失败'))
    } finally {
      setFetchingImportUrl(false)
    }
  }

  const handleParseImport = () => {
    try {
      const prefix = importNamePrefix.trim()
      const candidates = importMode === 'clash'
        ? buildImportCandidatesFromClash(parseClashImportText(importText), prefix)
        : [
            ...parseDirectProxyBatchText(directImportText, directImportForm.protocol),
            ...(directImportForm.server.trim() || directImportForm.port.trim()
              ? [buildDirectImportCandidate(directImportForm)]
              : []),
          ]
      if (!candidates.length) {
        toast.error('未解析到可导入代理')
        return
      }
      const preview = buildImportPreview(candidates, importGroupName.trim())
      resetPreviewDetectionState()
      setRemovedPreviewProxyNames([])
      setPreviewList(preview)
      setPreviewSelectedIds(new Set(preview.map(item => item.proxyId)))
      setImportModalOpen(false)
      setPreviewModalOpen(true)
    } catch (error: unknown) {
      toast.error(`解析失败: ${resolveActionErrorMessage(error, '未知错误')}`)
    }
  }

  const handleConfirmImport = async () => {
    const selectedPreviewList = previewList.filter(item => previewSelectedIds.has(item.proxyId))
    if (selectedPreviewList.length === 0) {
      toast.error('请至少选择 1 个代理后再导入')
      return
    }
    setImporting(true)
    try {
      const sourceURL = importMode === 'clash' ? (importResolvedUrl.trim() || importUrl.trim()) : ''
      const isURLImport = isRefreshableSourceURL(sourceURL)
      const sourceNamePrefix = importMode === 'clash' ? importNamePrefix.trim() : ''
      const sourceGroupName = importGroupName.trim()
      const sourceDisplayName = importSourceName.trim() || defaultImportSourceName(importMode, sourceGroupName, sourceNamePrefix, selectedPreviewList.length)
      const effectiveSourceURL = isURLImport ? sourceURL : buildManualSourceURL(importMode, sourceDisplayName)
      const sourceAutoRefresh = isURLImport ? globalAutoRefreshEnabled : false
      const sourceRefreshIntervalM = sourceAutoRefresh ? globalRefreshInterval : 0
      const sourceLastRefreshAt = isURLImport ? new Date().toISOString() : ''
      let sourceFilterJson = isURLImport ? previewSourceFilterJson : ''
      if (isURLImport && !sourceFilterJson && previewHasActiveFilter) {
        const filteredIds = new Set(filteredPreviewList.map(item => item.proxyId))
        const selectedIdsMatchFilter = filteredIds.size === previewSelectedIds.size &&
          Array.from(previewSelectedIds).every(id => filteredIds.has(id))
        if (selectedIdsMatchFilter) {
          sourceFilterJson = buildCurrentPreviewSourceFilterJson()
        }
      }
      const sourceFilter = parseSourceRefreshFilter(sourceFilterJson)
      const latest = await fetchLatestProxyList()
      const sourceID = resolveImportSourceID(latest, effectiveSourceURL, sourceNamePrefix, sourceGroupName)
      const oldSourceProxies = sourceID
        ? latest.filter(item => (item.sourceId || '').trim() === sourceID)
        : []
      const pickExistingID = createExistingProxyIDPicker(oldSourceProxies)

      const newProxies: BrowserProxy[] = selectedPreviewList.map((p) => ({
        proxyId: pickExistingID(p.proxyName, p.proxyConfig) || nextProxyID(),
        proxyName: p.proxyName,
        proxyConfig: p.proxyConfig,
        dnsServers: importMode === 'clash' ? importDnsServers.trim() || undefined : undefined,
        groupName: sourceGroupName || undefined,
        sourceId: sourceID || undefined,
        sourceUrl: effectiveSourceURL || undefined,
        sourceNamePrefix: sourceNamePrefix || undefined,
        sourceFilterJson: sourceFilterJson || undefined,
        sourceAutoRefresh,
        sourceRefreshIntervalM,
        sourceLastRefreshAt: sourceLastRefreshAt || undefined,
      }))
      const allProxies = sourceID
        ? latest.filter(item => (item.sourceId || '').trim() !== sourceID).concat(newProxies)
        : [...latest, ...newProxies]
      await saveProxies(allProxies)
      const unselectedPreviewProxyNames = previewList
        .filter(item => !previewSelectedIds.has(item.proxyId))
        .filter(item => !sourceFilter || previewItemMatchesSourceRefreshFilter(
          item,
          sourceFilter,
          previewLatencyMap[item.proxyId],
          previewIPHealthMap[item.proxyId]
        ))
        .map(item => item.proxyName)
      const ignoredProxyNames = [...removedPreviewProxyNames, ...unselectedPreviewProxyNames]
      if (sourceID && ignoredProxyNames.length > 0) {
        appendSourceIgnoredProxyNames(sourceID, ignoredProxyNames)
      }
      setPreviewModalOpen(false)
      setImportUrl('')
      setImportResolvedUrl('')
      setImportText('')
      setImportDnsServers('')
      setImportNamePrefix('')
      setImportGroupName('')
      setImportSourceName('')
      setDirectImportForm({ ...INITIAL_DIRECT_IMPORT_FORM })
      setDirectImportText('')
      setPreviewList([])
      resetPreviewDetectionState()
      setRemovedPreviewProxyNames([])
      toast.success(`成功导入 ${newProxies.length} 个代理`)
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '导入失败'))
    } finally {
      setImporting(false)
    }
  }

  const selectedCount = selectedIds.size
  const canParseImport = importMode === 'clash'
    ? !!importText.trim()
    : !!directImportText.trim() || (!!directImportForm.server.trim() && !!directImportForm.port.trim())

  const sourceColumns: TableColumn<URLImportSourceMeta>[] = [
    {
      key: 'sourceUrl',
      title: '订阅',
      width: '300px',
      render: (_, record) => (
        <div className="text-xs leading-5 min-w-0 max-w-[280px] overflow-hidden">
          <div className="text-[var(--color-text-primary)] truncate" title={record.sourceUrl}>{sourceHostLabel(record.sourceUrl)}</div>
          <div className="text-[var(--color-text-muted)] truncate" title={record.sourceUrl}>
            {parseManualSourceURL(record.sourceUrl) ? '手动添加资源' : record.sourceUrl}
          </div>
        </div>
      ),
    },
    { key: 'proxyCount', title: '节点数', width: '80px', render: (val) => typeof val === 'number' ? val : 0 },
    { key: 'sourceGroupName', title: '分组', width: '120px', render: (val) => val ? <span className="px-1.5 py-0.5 text-xs rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">{String(val)}</span> : '-' },
    { key: 'sourceNamePrefix', title: '名称前缀', width: '120px', render: (val) => String(val ?? '-') || '-' },
    { key: 'sourceFilterJson', title: '刷新筛选', width: '150px', render: (_, record) => <span title={sourceRefreshFilterLabel(record.sourceFilterJson)}>{sourceRefreshFilterLabel(record.sourceFilterJson)}</span> },
    {
      key: 'sourceRefreshIntervalM',
      title: '刷新策略',
      width: '150px',
      render: () => globalAutoRefreshEnabled ? `全局 ${globalRefreshInterval} 分钟` : '手动刷新',
    },
    {
      key: 'sourceLastRefreshAt',
      title: '最近刷新',
      width: '180px',
      render: (val) => val ? new Date(String(val)).toLocaleString() : '-',
    },
    {
      key: 'actions',
      title: '操作',
      width: '320px',
      render: (_, record) => (
        <ProxySourceRowActions
          record={record}
          refreshing={refreshingSourceIds.has(record.sourceId)}
          onRefresh={(sourceId) => void refreshSingleSource(sourceId, false)}
          onViewNodes={(source) => {
            setResourceView('proxies')
            setFilterProtocol('all')
            setFilterKeyword('')
            setFilterGroup(source.sourceGroupName || 'all')
          }}
          onEdit={handleEditSource}
          onDelete={handleDeleteSourceClick}
        />
      ),
    },
  ]

  const columns = allColumns.filter(column => visibleColumnKeys.includes(column.key))

  return (
    <div className="space-y-5 animate-fade-in">
      <ProxyPoolHeader
        refreshingAllSources={refreshingAllSources}
        hasURLImportSources={hasURLImportSources}
        checkingAllIPHealth={checkingAllIPHealth}
        testingAll={testingAll}
        filteredCount={filteredList.length}
        timeoutCount={timeoutProxyIds.length}
        visibleColumnKeys={visibleColumnKeys}
        onRefreshAllSources={() => void handleRefreshAllSources(false)}
        onCheckAllIPHealth={handleCheckAllIPHealth}
        onTestAll={handleTestAll}
        onDeleteTimeout={() => setDeleteTimeoutConfirmOpen(true)}
        onToggleColumn={toggleVisibleColumn}
      />

      <Card>
        <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">自动切换说明</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            这里维护的分组可在实例「新建配置 / 编辑配置」里选择为自动切换代理池。实例启动后浏览器连接本地固定中转端口，真实出口 IP 会在中转层按分钟轮询切换。
          </p>
        </div>
      </Card>

      <ProxyResourcePanel
        resourceView={resourceView}
        sourceCount={sourceMetas.length}
        sourceColumns={sourceColumns}
        sourceMetas={sourceMetas}
        proxyColumns={columns}
        proxies={filteredList}
        loading={loading}
        filterKeyword={filterKeyword}
        filterProtocol={filterProtocol}
        filterGroup={filterGroup}
        protocolOptions={protocolOptions}
        groups={groups}
        globalAutoRefreshEnabled={globalAutoRefreshEnabled}
        globalRefreshIntervalM={globalRefreshIntervalM}
        allFilteredSelected={allFilteredSelected}
        someFilteredSelected={someFilteredSelected}
        selectedCount={selectedCount}
        sortColumn={sortColumn}
        sortOrder={sortOrder}
        onResourceViewChange={setResourceView}
        onOpenImportCenter={() => handleOpenImportCenter('clash')}
        onFilterKeywordChange={setFilterKeyword}
        onFilterProtocolChange={setFilterProtocol}
        onFilterGroupChange={setFilterGroup}
        onClearFilters={() => { setFilterProtocol('all'); setFilterKeyword(''); setFilterGroup('all') }}
        onGlobalAutoRefreshChange={setGlobalAutoRefreshEnabled}
        onGlobalRefreshIntervalChange={setGlobalRefreshIntervalM}
        onToggleAll={handleToggleAll}
        onBatchDelete={() => setBatchDeleteConfirmOpen(true)}
        onSort={({ column, order }) => {
          setSortColumn(column)
          setSortOrder(order)
        }}
      />

      <ProxyImportModal
        open={importModalOpen}
        mode={importMode}
        sourceName={importSourceName}
        importUrl={importUrl}
        resolvedUrl={importResolvedUrl}
        importText={importText}
        dnsServers={importDnsServers}
        namePrefix={importNamePrefix}
        groupName={importGroupName}
        groups={groups}
        directForm={directImportForm}
        directText={directImportText}
        fetching={fetchingImportUrl}
        canParse={canParseImport}
        onClose={() => setImportModalOpen(false)}
        onParse={handleParseImport}
        onModeChange={handleImportModeChange}
        onSourceNameChange={setImportSourceName}
        onImportUrlChange={setImportUrl}
        onResolvedUrlChange={setImportResolvedUrl}
        onFetchImportURL={handleFetchImportURL}
        onImportTextChange={setImportText}
        onDnsServersChange={setImportDnsServers}
        onNamePrefixChange={setImportNamePrefix}
        onGroupNameChange={setImportGroupName}
        onDirectTextChange={setDirectImportText}
        onDirectFormChange={setDirectImportForm}
      />

      <ProxyImportPreviewModal
        open={previewModalOpen}
        importMode={importMode}
        dnsServers={importDnsServers}
        keyword={previewKeyword}
        latencyFilter={previewLatencyFilter}
        healthFilter={previewHealthFilter}
        countryFilter={previewCountryFilter}
        countryOptions={previewCountryOptions}
        previewList={previewList}
        filteredPreviewList={filteredPreviewList}
        selectedCount={previewSelectedCount}
        removedCount={removedPreviewProxyNames.length}
        testableCount={previewTestableList.length}
        testingAll={previewTestingAll}
        checkingAllIPHealth={previewCheckingAllIPHealth}
        hasActiveFilter={previewHasActiveFilter}
        importing={importing}
        columns={previewColumns}
        onClose={() => setPreviewModalOpen(false)}
        onBackToImport={() => { setPreviewModalOpen(false); setImportModalOpen(true) }}
        onConfirmImport={handleConfirmImport}
        onKeywordChange={setPreviewKeyword}
        onLatencyFilterChange={setPreviewLatencyFilter}
        onHealthFilterChange={setPreviewHealthFilter}
        onCountryFilterChange={setPreviewCountryFilter}
        onTestAll={handlePreviewTestAll}
        onCheckIPHealth={handlePreviewCheckIPHealth}
        onSelectOnlyFiltered={handleSelectOnlyFilteredPreview}
        onSelectAll={() => { setPreviewSelectedIds(new Set(previewList.map(item => item.proxyId))); setPreviewSourceFilterJson('') }}
        onClearSelection={() => { setPreviewSelectedIds(new Set()); setPreviewSourceFilterJson('') }}
        onKeepFiltered={handleKeepFilteredPreview}
        onRemoveFiltered={handleRemoveFilteredPreview}
      />

      <ProxyEditModal
        open={editModalOpen}
        form={editForm}
        groups={groups}
        saving={saving}
        onClose={() => setEditModalOpen(false)}
        onSave={handleSaveProxy}
        onFormChange={setEditForm}
      />

      <ProxySourceEditModal
        open={sourceEditModalOpen}
        form={sourceEditForm}
        groups={groups}
        onClose={() => setSourceEditModalOpen(false)}
        onSave={handleSaveSource}
        onFormChange={setSourceEditForm}
      />

      <ProxyIPHealthDetailModal
        open={ipHealthDetailOpen}
        detail={currentIPHealthDetail}
        onClose={closeIPHealthDetail}
      />

      <ConfirmModal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} onConfirm={handleDeleteConfirm}
        title="确认删除" content="确定要删除这个代理吗？此操作不可恢复。" confirmText="删除" danger />

      <ConfirmModal open={batchDeleteConfirmOpen} onClose={() => setBatchDeleteConfirmOpen(false)} onConfirm={handleBatchDeleteConfirm}
        title="批量删除" content={`确定要删除选中的 ${selectedCount} 个代理吗？此操作不可恢复。`} confirmText="删除" danger />

      <ConfirmModal open={deleteTimeoutConfirmOpen} onClose={() => setDeleteTimeoutConfirmOpen(false)} onConfirm={handleDeleteTimeoutConfirm}
        title="删除测试超时节点" content={`确定要删除 ${timeoutProxyIds.length} 个测试超时节点吗？直连和本地代理会保留，此操作不可恢复。`} confirmText="删除超时节点" danger />

      <ConfirmModal open={sourceDeleteConfirmOpen} onClose={() => setSourceDeleteConfirmOpen(false)} onConfirm={handleDeleteSourceConfirm}
        title="删除订阅" content={`确定删除订阅「${deletingSource ? sourceHostLabel(deletingSource.sourceUrl) : ''}」及其 ${deletingSource?.proxyCount || 0} 个节点吗？此操作不可恢复。`} confirmText="删除订阅" danger />
    </div>
  )
}
