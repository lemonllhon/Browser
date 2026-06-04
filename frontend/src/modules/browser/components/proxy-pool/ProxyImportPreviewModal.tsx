import { Button, Input, Modal, Select, Table } from '../../../../shared/components'
import type { TableColumn } from '../../../../shared/components/Table'
import type { ProxyDisplayInfo } from '../../utils/proxyDisplay'
import { PREVIEW_HEALTH_FILTER_OPTIONS, PREVIEW_LATENCY_FILTER_OPTIONS } from '../../utils/proxyPreviewFilters'
import type { PreviewHealthFilter, PreviewLatencyFilter } from '../../utils/proxyPreviewFilters'

interface ProxyImportPreviewModalProps {
  open: boolean
  importMode: 'clash' | 'direct'
  dnsServers: string
  keyword: string
  latencyFilter: PreviewLatencyFilter
  healthFilter: PreviewHealthFilter
  countryFilter: string
  countryOptions: { value: string; label: string }[]
  previewList: ProxyDisplayInfo[]
  filteredPreviewList: ProxyDisplayInfo[]
  selectedCount: number
  removedCount: number
  testableCount: number
  testingAll: boolean
  checkingAllIPHealth: boolean
  hasActiveFilter: boolean
  importing: boolean
  columns: TableColumn<ProxyDisplayInfo>[]
  onClose: () => void
  onBackToImport: () => void
  onConfirmImport: () => void
  onKeywordChange: (value: string) => void
  onLatencyFilterChange: (value: PreviewLatencyFilter) => void
  onHealthFilterChange: (value: PreviewHealthFilter) => void
  onCountryFilterChange: (value: string) => void
  onTestAll: () => void
  onCheckIPHealth: () => void
  onSelectOnlyFiltered: () => void
  onSelectAll: () => void
  onClearSelection: () => void
  onKeepFiltered: () => void
  onRemoveFiltered: () => void
}

export function ProxyImportPreviewModal({
  open,
  importMode,
  dnsServers,
  keyword,
  latencyFilter,
  healthFilter,
  countryFilter,
  countryOptions,
  previewList,
  filteredPreviewList,
  selectedCount,
  removedCount,
  testableCount,
  testingAll,
  checkingAllIPHealth,
  hasActiveFilter,
  importing,
  columns,
  onClose,
  onBackToImport,
  onConfirmImport,
  onKeywordChange,
  onLatencyFilterChange,
  onHealthFilterChange,
  onCountryFilterChange,
  onTestAll,
  onCheckIPHealth,
  onSelectOnlyFiltered,
  onSelectAll,
  onClearSelection,
  onKeepFiltered,
  onRemoveFiltered,
}: ProxyImportPreviewModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="确认导入以下代理"
      width="980px"
      footer={
        <>
          <Button variant="secondary" onClick={onBackToImport}>返回修改</Button>
          <Button onClick={onConfirmImport} loading={importing} disabled={selectedCount === 0}>
            导入选中{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {importMode === 'clash' && dnsServers.trim() && (
          <p className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] px-3 py-2 rounded">已配置批量 DNS，将应用到以下所有代理</p>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,1fr)_150px_150px_150px] gap-2">
          <Input
            value={keyword}
            onChange={e => onKeywordChange(e.target.value)}
            placeholder="搜索名称、服务器、国家、地区、IP、运营商"
          />
          <Select
            value={latencyFilter}
            onChange={e => onLatencyFilterChange(e.target.value as PreviewLatencyFilter)}
            options={PREVIEW_LATENCY_FILTER_OPTIONS}
          />
          <Select
            value={healthFilter}
            onChange={e => onHealthFilterChange(e.target.value as PreviewHealthFilter)}
            options={PREVIEW_HEALTH_FILTER_OPTIONS}
          />
          <Select
            value={countryFilter}
            onChange={e => onCountryFilterChange(e.target.value)}
            options={countryOptions}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onTestAll} loading={testingAll} disabled={testableCount === 0}>检测延迟</Button>
          <Button size="sm" variant="secondary" onClick={onCheckIPHealth} loading={checkingAllIPHealth} disabled={testableCount === 0}>检测IP健康</Button>
          <Button size="sm" variant="ghost" onClick={onSelectOnlyFiltered} disabled={filteredPreviewList.length === 0}>只选择当前筛选</Button>
          <Button size="sm" variant="ghost" onClick={onSelectAll} disabled={previewList.length === 0}>全选</Button>
          <Button size="sm" variant="ghost" onClick={onClearSelection} disabled={selectedCount === 0}>清空选择</Button>
          <Button size="sm" variant="secondary" onClick={onKeepFiltered} disabled={!hasActiveFilter || filteredPreviewList.length === 0}>只保留筛选</Button>
          <Button size="sm" variant="danger" onClick={onRemoveFiltered} disabled={filteredPreviewList.length === 0}>删除筛选</Button>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          共 {previewList.length} 条，当前显示 {filteredPreviewList.length} 条，已选择 {selectedCount} 条，已删除 {removedCount} 条。确认导入只会导入已选择的代理。
        </p>
        <Table columns={columns} data={filteredPreviewList} rowKey="proxyId" maxHeight="420px" emptyText="无代理数据" tableMinWidth="1040px" />
      </div>
    </Modal>
  )
}
