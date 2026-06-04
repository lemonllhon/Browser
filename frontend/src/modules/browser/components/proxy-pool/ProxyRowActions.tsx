import { Button } from '../../../../shared/components'
import { BUILTIN_PROXY_IDS } from '../../utils/proxyDisplay'
import type { ProxyDisplayInfo } from '../../utils/proxyDisplay'

interface ProxyRowActionsProps {
  record: ProxyDisplayInfo
  latencyValue?: number
  checkingIPHealth: boolean
  refreshingSource: boolean
  onRefreshSource: (sourceId: string) => void
  onTest: (record: ProxyDisplayInfo) => void
  onCheckIPHealth: (record: ProxyDisplayInfo) => void
  onEdit: (record: ProxyDisplayInfo) => void
  onDelete: (proxyId: string) => void
}

export function ProxyRowActions({
  record,
  latencyValue,
  checkingIPHealth,
  refreshingSource,
  onRefreshSource,
  onTest,
  onCheckIPHealth,
  onEdit,
  onDelete,
}: ProxyRowActionsProps) {
  const isBuiltin = BUILTIN_PROXY_IDS.has(record.proxyId)
  const hasSource = !!record.sourceId && !!record.sourceUrl

  return (
    <div className="flex gap-2">
      {hasSource && (
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => { e.stopPropagation(); onRefreshSource(record.sourceId) }}
          loading={refreshingSource}
        >
          刷新订阅
        </Button>
      )}
      <Button
        size="sm" variant="ghost"
        onClick={(e) => { e.stopPropagation(); onTest(record) }}
        loading={latencyValue === -1}
        disabled={record.proxyConfig === 'direct://'}
      >测速</Button>
      <Button
        size="sm" variant="ghost"
        onClick={(e) => { e.stopPropagation(); onCheckIPHealth(record) }}
        loading={checkingIPHealth}
        disabled={record.proxyConfig === 'direct://'}
      >IP健康</Button>
      <Button
        size="sm" variant="ghost"
        disabled={isBuiltin}
        title={isBuiltin ? '内置代理不可编辑' : undefined}
        onClick={(e) => { e.stopPropagation(); if (!isBuiltin) onEdit(record) }}
      >编辑</Button>
      <Button
        size="sm" variant="danger"
        disabled={isBuiltin}
        title={isBuiltin ? '内置代理不可删除' : undefined}
        onClick={(e) => { e.stopPropagation(); if (!isBuiltin) onDelete(record.proxyId) }}
      >删除</Button>
    </div>
  )
}
