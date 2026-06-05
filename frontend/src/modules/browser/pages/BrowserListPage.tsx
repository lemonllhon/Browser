import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edit2, Star, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Table } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'
import type { BrowserCore, BrowserProfile } from '../types'
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
import { useBrowserListViewState } from '../hooks/useBrowserListViewState'
import { useBrowserListData } from '../hooks/useBrowserListData'
import { useBrowserListRuntimeSync } from '../hooks/useBrowserListRuntimeSync'
import { useBrowserWindowSync } from '../hooks/useBrowserWindowSync'
import { useBrowserCoreSettings } from '../hooks/useBrowserCoreSettings'
import { useBrowserProfileBatchActions } from '../hooks/useBrowserProfileBatchActions'
import { useBrowserProfileRuntimeActions } from '../hooks/useBrowserProfileRuntimeActions'
import { InstanceBackupRestoreModal } from '../components/InstanceBackupRestoreModal'
import { BatchRandomFingerprintModal } from '../components/BatchRandomFingerprintModal'
import { formatInstanceMarkerLabel, formatTime, getCookieActionTitle, resolveProfileStatus } from '../utils/browserListFormat'
import { filterAndSortBrowserProfiles, getBrowserProfileCoreLabel, resolveBrowserProfileCore } from '../utils/browserListFilters'
export function BrowserListPage() {
  const {
    viewMode,
    setViewMode,
    visibleColumnKeys,
    filters,
    setFilters,
    headerCollapsed,
    toggleHeaderCollapsed,
    toggleVisibleColumn,
  } = useBrowserListViewState()

  // 勾选状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const {
    windowSyncModalOpen,
    windowSyncCandidates,
    windowSyncSelectedIds,
    windowSyncMasterId,
    windowSyncState,
    windowSyncLoading,
    windowSyncLayoutModalOpen,
    windowSyncLayout,
    windowSyncSettingsModalOpen,
    windowSyncSettings,
    setWindowSyncModalOpen,
    setWindowSyncMasterId,
    setWindowSyncState,
    setWindowSyncLayoutModalOpen,
    setWindowSyncLayout,
    setWindowSyncSettingsModalOpen,
    setWindowSyncSettings,
    loadWindowSyncCandidates,
    handleOpenWindowSyncModal,
    toggleWindowSyncCandidate,
    selectAllWindowSyncCandidates,
    clearWindowSyncCandidates,
    handleStartWindowSync,
    handleStopWindowSync,
    updateWindowSyncLayout,
    updateWindowSyncSettings,
    handleApplyWindowSyncLayout,
    handleSaveWindowSyncSettings,
  } = useBrowserWindowSync({ selectedIds })

  // 代理不支持弹窗
  const [opError, setOpError] = useState('')
  const [startingIds, setStartingIds] = useState<Set<string>>(new Set())
  const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set())
  const [backupModalOpen, setBackupModalOpen] = useState(false)
  const [batchRandomModalOpen, setBatchRandomModalOpen] = useState(false)

  // 关键字弹窗
  const [kwModal, setKwModal] = useState<{ open: boolean; profile: BrowserProfile | null }>({ open: false, profile: null })

  const openKwModal = (profile: BrowserProfile) => setKwModal({ open: true, profile })
  const closeKwModal = () => setKwModal({ open: false, profile: null })

  const {
    profiles,
    loading,
    proxies,
    groups,
    cores,
    updateProfilesState,
    mergeProfileState,
    loadProfiles,
    loadGroups,
    loadCores,
  } = useBrowserListData({ setStartingIds, setStoppingIds })

  const {
    settingsModalOpen,
    settings,
    fingerprintText,
    launchText,
    savingSettings,
    coreModalOpen,
    coreForm,
    coreValidation,
    savingCore,
    setSettingsModalOpen,
    setSettings,
    setFingerprintText,
    setLaunchText,
    setCoreModalOpen,
    setCoreForm,
    setCoreValidation,
    handleOpenSettings,
    handleSaveSettings,
    handleOpenCoreModal,
    handleValidateCorePath,
    handleSaveCore,
    handleDeleteCore,
    handleSetDefaultCore,
  } = useBrowserCoreSettings({ cores, loadCores })

  // 扩容管理
  const [expandModalOpen, setExpandModalOpen] = useState(false)

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

  const resolveProfileCore = (profile: BrowserProfile) => resolveBrowserProfileCore(profile, cores, defaultCore)
  const getProfileCoreLabel = (profile: BrowserProfile) => getBrowserProfileCoreLabel(profile, cores, defaultCore)

  const isProfileStarting = (profileId: string) => startingIds.has(profileId)
  const isProfileStopping = (profileId: string) => stoppingIds.has(profileId)
  const {
    proxyErrorModal,
    proxyErrorMsg,
    pendingStartId,
    cookieClearTarget,
    setCookieClearTarget,
    closeProxyError,
    isProfileSwitchingProxy,
    isProfilePinning,
    isProfileExportingCookies,
    isProfileClearingCookies,
    handleStart,
    handleStop,
    handleRestart,
    handleSwitchProxyNow,
    handlePinCenter,
    handleExportCookies,
    handleConfirmClearCookies,
  } = useBrowserProfileRuntimeActions({
    profiles,
    proxies,
    setStartingIds,
    setStoppingIds,
    mergeProfileState,
    loadProfiles,
    setOpError,
  })

  const isProfileBusy = (profileId: string) => isProfileStarting(profileId) || isProfileStopping(profileId) || isProfileSwitchingProxy(profileId) || isProfilePinning(profileId)
  const isWindowSyncMaster = (profileId: string) => !!windowSyncState?.active && windowSyncState.masterProfileId === profileId

  const getProfileStatus = (profile: BrowserProfile) => (
    resolveProfileStatus(profile.running, profile.debugReady, isProfileStarting(profile.profileId), isProfileStopping(profile.profileId))
  )

  const {
    profileOrder,
    handleProfileDragOver,
    handleProfileDragLeave,
    handleProfileDrop,
    getProfileDragClassName,
    renderProfileDragHandle,
  } = useBrowserProfileOrderDnD({ profiles })

  const filteredProfiles = useMemo(() => filterAndSortBrowserProfiles({
    profiles,
    filters,
    profileOrder,
    cores,
    defaultCore,
  }), [profiles, filters, defaultCore, cores, profileOrder])

  const selectedProfileIds = useMemo(() => Array.from(selectedIds), [selectedIds])
  const filteredProfileIds = useMemo(() => filteredProfiles.map(item => item.profileId), [filteredProfiles])

  const {
    batchLoading,
    copyModal,
    copyName,
    copying,
    deleteTarget,
    batchDeleteConfirmOpen,
    setCopyName,
    setDeleteTarget,
    setBatchDeleteConfirmOpen,
    openCopyModal,
    closeCopyModal,
    toggleSelect,
    handleSelectAll,
    handleDeselectAll,
    handleDelete,
    handleConfirmDelete,
    handleBatchStart,
    handleBatchStop,
    handleBatchDelete,
    handleConfirmBatchDelete,
    handleCopy,
  } = useBrowserProfileBatchActions({
    profiles,
    filteredProfiles,
    selectedIds,
    setSelectedIds,
    setStartingIds,
    setStoppingIds,
    mergeProfileState,
    loadProfiles,
    setOpError,
  })

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
        onToggleHeaderCollapsed={toggleHeaderCollapsed}
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
        onCloseProxyError={closeProxyError}
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
