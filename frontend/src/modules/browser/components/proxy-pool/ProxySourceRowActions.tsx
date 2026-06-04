import { Button } from '../../../../shared/components'
import type { URLImportSourceMeta } from '../../utils/proxySourceMeta'
import { isRefreshableSourceURL } from '../../utils/proxySourceMeta'

interface ProxySourceRowActionsProps {
  record: URLImportSourceMeta
  refreshing: boolean
  onRefresh: (sourceId: string) => void
  onViewNodes: (record: URLImportSourceMeta) => void
  onEdit: (record: URLImportSourceMeta) => void
  onDelete: (record: URLImportSourceMeta) => void
}

export function ProxySourceRowActions({
  record,
  refreshing,
  onRefresh,
  onViewNodes,
  onEdit,
  onDelete,
}: ProxySourceRowActionsProps) {
  const refreshable = isRefreshableSourceURL(record.sourceUrl)

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onRefresh(record.sourceId)}
        loading={refreshing}
        disabled={!refreshable}
        title={refreshable ? '刷新订阅' : '手动添加资源没有可刷新 URL'}
      >
        刷新
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onViewNodes(record)}
      >
        查看节点
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onEdit(record)}
      >
        编辑
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() => onDelete(record)}
      >
        删除
      </Button>
    </div>
  )
}
