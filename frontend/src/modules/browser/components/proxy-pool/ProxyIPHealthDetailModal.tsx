import { Button, Modal } from '../../../../shared/components'
import type { ProxyIPHealthResult } from '../../types'

interface ProxyIPHealthDetailModalProps {
  open: boolean
  detail: ProxyIPHealthResult | null
  onClose: () => void
}

export function ProxyIPHealthDetailModal({ open, detail, onClose }: ProxyIPHealthDetailModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="IP健康原始返回"
      width="760px"
      footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}
    >
      <div className="space-y-3">
        {detail && (
          <>
            <div className="text-xs text-[var(--color-text-muted)]">
              代理ID：{detail.proxyId} | 来源：{detail.source} | 时间：{detail.updatedAt}
            </div>
            {!detail.ok && (
              <div className="text-sm text-red-500">{detail.error || '检测失败'}</div>
            )}
            <pre className="max-h-[420px] overflow-auto text-xs leading-5 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-3">
              {JSON.stringify(detail.rawData || {}, null, 2)}
            </pre>
          </>
        )}
      </div>
    </Modal>
  )
}
