import { Button, Card, Input, Switch, Table } from '../../../../shared/components'
import type { SortOrder, TableColumn } from '../../../../shared/components/Table'
import type { URLImportSourceMeta } from '../../utils/proxySourceMeta'
import type { ProxyDisplayInfo } from '../../utils/proxyDisplay'

export type ProxyResourceView = 'proxies' | 'sources'

interface ProxyResourcePanelProps {
  resourceView: ProxyResourceView
  sourceCount: number
  sourceColumns: TableColumn<URLImportSourceMeta>[]
  sourceMetas: URLImportSourceMeta[]
  proxyColumns: TableColumn<ProxyDisplayInfo>[]
  proxies: ProxyDisplayInfo[]
  loading: boolean
  filterKeyword: string
  filterProtocol: string
  filterGroup: string
  protocolOptions: string[]
  groups: string[]
  globalAutoRefreshEnabled: boolean
  globalRefreshIntervalM: string
  allFilteredSelected: boolean
  someFilteredSelected: boolean
  selectedCount: number
  sortColumn: string
  sortOrder: SortOrder
  onResourceViewChange: (view: ProxyResourceView) => void
  onOpenImportCenter: () => void
  onFilterKeywordChange: (value: string) => void
  onFilterProtocolChange: (value: string) => void
  onFilterGroupChange: (value: string) => void
  onClearFilters: () => void
  onGlobalAutoRefreshChange: (checked: boolean) => void
  onGlobalRefreshIntervalChange: (value: string) => void
  onToggleAll: () => void
  onBatchDelete: () => void
  onSort: (input: { column: string; order: SortOrder }) => void
}

export function ProxyResourcePanel({
  resourceView,
  sourceCount,
  sourceColumns,
  sourceMetas,
  proxyColumns,
  proxies,
  loading,
  filterKeyword,
  filterProtocol,
  filterGroup,
  protocolOptions,
  groups,
  globalAutoRefreshEnabled,
  globalRefreshIntervalM,
  allFilteredSelected,
  someFilteredSelected,
  selectedCount,
  sortColumn,
  sortOrder,
  onResourceViewChange,
  onOpenImportCenter,
  onFilterKeywordChange,
  onFilterProtocolChange,
  onFilterGroupChange,
  onClearFilters,
  onGlobalAutoRefreshChange,
  onGlobalRefreshIntervalChange,
  onToggleAll,
  onBatchDelete,
  onSort,
}: ProxyResourcePanelProps) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Button
          size="sm"
          variant={resourceView === 'proxies' ? undefined : 'secondary'}
          onClick={() => onResourceViewChange('proxies')}
        >
          代理节点
        </Button>
        <Button
          size="sm"
          variant={resourceView === 'sources' ? undefined : 'secondary'}
          onClick={() => onResourceViewChange('sources')}
        >
          订阅管理{sourceCount > 0 ? ` (${sourceCount})` : ''}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onOpenImportCenter}
        >
          添加资源
        </Button>
      </div>
      {resourceView === 'sources' && (
        <Table
          columns={sourceColumns}
          data={sourceMetas}
          rowKey="sourceId"
          loading={loading}
          emptyText="暂无订阅来源，点击「添加资源」添加 Clash 订阅 URL"
          tableLayout="fixed"
          tableMinWidth="1280px"
        />
      )}
      {resourceView === 'proxies' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <Input
              value={filterKeyword}
              onChange={e => onFilterKeywordChange(e.target.value)}
              placeholder="搜索名称或服务器..."
              style={{ width: '220px' }}
            />
            <select
              value={filterProtocol}
              onChange={e => onFilterProtocolChange(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            >
              {protocolOptions.map(p => (
                <option key={p} value={p}>{p === 'all' ? '全部协议' : p.toUpperCase()}</option>
              ))}
            </select>
            <select
              value={filterGroup}
              onChange={e => onFilterGroupChange(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            >
              <option value="all">全部分组</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            {(filterProtocol !== 'all' || filterKeyword || filterGroup !== 'all') && (
              <Button size="sm" variant="ghost" onClick={onClearFilters}>清除筛选</Button>
            )}
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1.5">
              <span className="text-xs text-[var(--color-text-muted)]">全局自动刷新</span>
              <Switch
                checked={globalAutoRefreshEnabled}
                onChange={onGlobalAutoRefreshChange}
              />
              <Input
                type="number"
                min={5}
                max={1440}
                value={globalRefreshIntervalM}
                onChange={e => onGlobalRefreshIntervalChange(e.target.value)}
                className="w-24"
                disabled={!globalAutoRefreshEnabled}
              />
              <span className="text-xs text-[var(--color-text-muted)]">分钟</span>
            </div>
            <div className="flex-1" />
            {proxies.length > 0 && (
              <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  ref={el => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected }}
                  onChange={onToggleAll}
                  className="w-4 h-4 rounded border-[var(--color-border)] accent-[var(--color-primary)] cursor-pointer"
                />
                全选
              </label>
            )}
            {selectedCount > 0 && (
              <Button size="sm" variant="danger" onClick={onBatchDelete}>
                删除所选 ({selectedCount})
              </Button>
            )}
          </div>
          <Table
            columns={proxyColumns}
            data={proxies}
            rowKey="proxyId"
            loading={loading}
            emptyText="暂无代理配置，点击上方按钮添加或导入"
            sortColumn={sortColumn}
            sortOrder={sortOrder}
            onSort={onSort}
          />
        </>
      )}
    </Card>
  )
}
