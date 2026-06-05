import { Link } from 'react-router-dom'
import { Activity, ChevronRight, ChevronUp, Download, FileText, LayoutGrid, List, MonitorUp, Play, Plus, RefreshCw, Sliders, Square, Wand2 } from 'lucide-react'
import { Button, StatCard } from '../../../../shared/components'
import type { BrowserCore, BrowserGroupWithCount, BrowserProxy } from '../../types'
import { EMPTY_FILTERS, InstanceFilterBar } from '../InstanceFilterBar'
import type { InstanceFilters } from '../InstanceFilterBar'
import { BrowserColumnVisibilityMenu } from './BrowserColumnVisibilityMenu'

interface BrowserListHeaderPanelProps {
  profilesCount: number
  filteredCount: number
  runningCount: number
  headerCollapsed: boolean
  viewMode: 'card' | 'table'
  visibleColumnKeys: string[]
  filters: InstanceFilters
  proxies: BrowserProxy[]
  cores: BrowserCore[]
  allTags: string[]
  groups: BrowserGroupWithCount[]
  onToggleHeaderCollapsed: () => void
  onRefresh: () => void
  onOpenBatchRandom: () => void
  onOpenBackup: () => void
  onOpenWindowSync: () => void
  onOpenSettings: () => void
  onOpenExpand: () => void
  onViewModeChange: (viewMode: 'card' | 'table') => void
  onToggleColumn: (key: string) => void
  onFiltersChange: (filters: InstanceFilters) => void
}

export function BrowserListHeaderPanel({
  profilesCount,
  filteredCount,
  runningCount,
  headerCollapsed,
  viewMode,
  visibleColumnKeys,
  filters,
  proxies,
  cores,
  allTags,
  groups,
  onToggleHeaderCollapsed,
  onRefresh,
  onOpenBatchRandom,
  onOpenBackup,
  onOpenWindowSync,
  onOpenSettings,
  onOpenExpand,
  onViewModeChange,
  onToggleColumn,
  onFiltersChange,
}: BrowserListHeaderPanelProps) {
  return (
    <>
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="shrink-0">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">实例列表</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            当前配置总数 {profilesCount}
            {filteredCount !== profilesCount && <span className="ml-1 text-[var(--color-accent)]">（已筛选 {filteredCount}）</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-start 2xl:justify-end gap-2 min-w-0">
          <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={onToggleHeaderCollapsed}>{headerCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}{headerCollapsed ? '展开面板' : '收起面板'}</Button>
          <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={onRefresh}><RefreshCw className="w-4 h-4" />刷新</Button>
          <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={onOpenBatchRandom}><Wand2 className="w-4 h-4" />批量生成</Button>
          <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={onOpenBackup}><Download className="w-4 h-4" />实例备份与恢复</Button>
          <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={onOpenWindowSync}><MonitorUp className="w-4 h-4" />窗口同步</Button>
          <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={onOpenSettings}><Sliders className="w-4 h-4" />基础配置</Button>
          <Button variant="secondary" size="sm" onClick={onOpenExpand} className="shrink-0 whitespace-nowrap text-[var(--color-primary)] border-[var(--color-primary)] hover:bg-[var(--color-primary)]/10">
            <Plus className="w-4 h-4" />扩容情况
          </Button>
          <div className="flex shrink-0 items-center bg-[var(--color-bg-secondary)] rounded-md border border-[var(--color-border-default)] p-0.5">
            <button
              className={`p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors ${viewMode === 'card' ? 'bg-[var(--color-bg-surface)] shadow-sm text-[var(--color-accent)]' : ''}`}
              onClick={() => onViewModeChange('card')}
              title="卡片视图"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              className={`p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors ${viewMode === 'table' ? 'bg-[var(--color-bg-surface)] shadow-sm text-[var(--color-accent)]' : ''}`}
              onClick={() => onViewModeChange('table')}
              title="表格视图"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <BrowserColumnVisibilityMenu visibleColumnKeys={visibleColumnKeys} onToggleColumn={onToggleColumn} />
          <span className="w-px h-4 bg-[var(--color-border-muted)] mx-1 self-center shrink-0"></span>
          <Link to="/browser/edit/new" className="shrink-0"><Button size="sm" className="shrink-0 whitespace-nowrap"><Play className="w-4 h-4" />新建配置</Button></Link>
        </div>
      </div>

      {!headerCollapsed && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="配置总数" value={`${profilesCount}`} icon={<FileText className="w-5 h-5" />} />
            <StatCard title="运行中实例" value={`${runningCount}`} icon={<Activity className="w-5 h-5" />} />
            <StatCard title="停止实例" value={`${profilesCount - runningCount}`} icon={<Square className="w-5 h-5 text-gray-400" />} />
          </div>

          <InstanceFilterBar
            filters={filters || EMPTY_FILTERS}
            onChange={onFiltersChange}
            proxies={proxies}
            cores={cores}
            allTags={allTags}
            groups={groups}
          />
        </>
      )}
    </>
  )
}
