import { Button } from '../../../../shared/components'
import { ProxyColumnVisibilityMenu } from './ProxyColumnVisibilityMenu'

interface ProxyPoolHeaderProps {
  refreshingAllSources: boolean
  hasURLImportSources: boolean
  checkingAllIPHealth: boolean
  testingAll: boolean
  filteredCount: number
  timeoutCount: number
  visibleColumnKeys: string[]
  onRefreshAllSources: () => void
  onCheckAllIPHealth: () => void
  onTestAll: () => void
  onDeleteTimeout: () => void
  onToggleColumn: (key: string) => void
}

export function ProxyPoolHeader({
  refreshingAllSources,
  hasURLImportSources,
  checkingAllIPHealth,
  testingAll,
  filteredCount,
  timeoutCount,
  visibleColumnKeys,
  onRefreshAllSources,
  onCheckAllIPHealth,
  onTestAll,
  onDeleteTimeout,
  onToggleColumn,
}: ProxyPoolHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">代理资源中心</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">统一管理订阅、YAML 节点与 HTTP / HTTPS / SOCKS5 批量导入</p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={onRefreshAllSources}
          loading={refreshingAllSources}
          disabled={!hasURLImportSources}
        >
          刷新订阅
        </Button>
        <Button size="sm" variant="secondary" onClick={onCheckAllIPHealth} loading={checkingAllIPHealth} disabled={filteredCount === 0}>检测IP健康</Button>
        <Button size="sm" variant="secondary" onClick={onTestAll} loading={testingAll} disabled={filteredCount === 0}>测试全部</Button>
        <Button
          size="sm"
          variant="danger"
          onClick={onDeleteTimeout}
          disabled={timeoutCount === 0}
          title="删除除直连和本地代理之外，最近测速结果为超时的节点"
        >
          删除超时节点{timeoutCount > 0 ? ` (${timeoutCount})` : ''}
        </Button>
        <ProxyColumnVisibilityMenu visibleColumnKeys={visibleColumnKeys} onToggleColumn={onToggleColumn} />
      </div>
    </div>
  )
}
