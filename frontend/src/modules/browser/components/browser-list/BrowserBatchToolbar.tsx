import { Play, Square, Trash2 } from 'lucide-react'
import { Button } from '../../../../shared/components'

interface BrowserBatchToolbarProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onBatchStart: () => void
  onBatchStop: () => void
  onBatchDelete: () => void
  batchLoading: boolean
}

export function BrowserBatchToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onBatchStart,
  onBatchStop,
  onBatchDelete,
  batchLoading,
}: BrowserBatchToolbarProps) {
  if (selectedCount === 0) return null
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 rounded-lg">
      <span className="text-sm font-medium text-[var(--color-accent)]">已选 {selectedCount} / {totalCount}</span>
      <div className="flex gap-1.5 ml-auto">
        <Button size="sm" variant="ghost" onClick={onSelectAll}>全选</Button>
        <Button size="sm" variant="ghost" onClick={onDeselectAll}>取消</Button>
        <Button size="sm" onClick={onBatchStart} loading={batchLoading} title="批量启动">
          <Play className="w-3.5 h-3.5" />启动
        </Button>
        <Button size="sm" variant="secondary" onClick={onBatchStop} loading={batchLoading} title="批量停止">
          <Square className="w-3.5 h-3.5" />停止
        </Button>
        <Button size="sm" variant="ghost" onClick={onBatchDelete} title="批量删除" className="text-red-500 hover:text-red-600">
          <Trash2 className="w-3.5 h-3.5" />删除
        </Button>
      </div>
    </div>
  )
}
