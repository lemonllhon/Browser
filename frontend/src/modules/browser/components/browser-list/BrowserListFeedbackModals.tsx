import { Link } from 'react-router-dom'
import { XCircle } from 'lucide-react'
import { Button, ConfirmModal, FormItem, Input, Modal } from '../../../../shared/components'
import type { BrowserProfile } from '../../types'

type CopyModalState = {
  open: boolean
  profile: BrowserProfile | null
}

type BrowserListFeedbackModalsProps = {
  proxyErrorOpen: boolean
  proxyErrorMessage: string
  pendingStartId: string | null
  onCloseProxyError: () => void
  expandOpen: boolean
  profileCount: number
  onCloseExpand: () => void
  copyModal: CopyModalState
  copyName: string
  copying: boolean
  onCloseCopy: () => void
  onCopyNameChange: (value: string) => void
  onConfirmCopy: (profileId: string) => void
  operationError: string
  onCloseOperationError: () => void
  cookieClearTarget: BrowserProfile | null
  onCloseCookieClear: () => void
  onConfirmCookieClear: () => void
  deleteTarget: BrowserProfile | null
  onCloseDelete: () => void
  onConfirmDelete: () => void
  batchDeleteOpen: boolean
  selectedCount: number
  onCloseBatchDelete: () => void
  onConfirmBatchDelete: () => void
}

export function BrowserListFeedbackModals({
  proxyErrorOpen,
  proxyErrorMessage,
  pendingStartId,
  onCloseProxyError,
  expandOpen,
  profileCount,
  onCloseExpand,
  copyModal,
  copyName,
  copying,
  onCloseCopy,
  onCopyNameChange,
  onConfirmCopy,
  operationError,
  onCloseOperationError,
  cookieClearTarget,
  onCloseCookieClear,
  onConfirmCookieClear,
  deleteTarget,
  onCloseDelete,
  onConfirmDelete,
  batchDeleteOpen,
  selectedCount,
  onCloseBatchDelete,
  onConfirmBatchDelete,
}: BrowserListFeedbackModalsProps) {
  return (
    <>
      <Modal
        open={proxyErrorOpen}
        onClose={onCloseProxyError}
        title="代理链路不可用"
        width="420px"
        footer={(
          <>
            <Button variant="secondary" onClick={onCloseProxyError}>取消</Button>
            {pendingStartId && (
              <Link to={`/browser/edit/${pendingStartId}`}>
                <Button onClick={onCloseProxyError}>去修改代理</Button>
              </Link>
            )}
          </>
        )}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--color-bg-secondary)]">
            <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-[var(--color-text-primary)]">{proxyErrorMessage}</p>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">请前往编辑页面重新选择可用链路；如果是订阅导入，先刷新订阅并确认该节点仍存在。</p>
        </div>
      </Modal>

      <Modal
        open={expandOpen}
        onClose={onCloseExpand}
        title="实例扩容情况"
        width="480px"
        footer={<Button variant="secondary" onClick={onCloseExpand}>关闭</Button>}
      >
        <div className="space-y-4">
          <div className="bg-[var(--color-bg-secondary)] p-4 rounded-lg flex items-center justify-between border border-[var(--color-border-default)]">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">当前使用情况</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">实例数量不再设置固定上限</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-semibold text-[var(--color-success)]">
                {profileCount}
              </span>
              <span className="text-sm text-[var(--color-text-muted)] ml-1">/ 无限制</span>
            </div>
          </div>

          <div className="mt-4 p-3 bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-lg">
            <p className="text-sm text-[var(--color-text-primary)]">当前为无限制扩容模式，无需兑换码即可继续创建或复制实例。</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={copyModal.open}
        onClose={onCloseCopy}
        title="复制实例"
        width="420px"
        footer={(
          <>
            <Button variant="secondary" onClick={onCloseCopy}>取消</Button>
            <Button onClick={() => copyModal.profile && onConfirmCopy(copyModal.profile.profileId)} loading={copying}>确认复制</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            复制实例将保留原有的代理、内核、启动参数、标签等配置，但会生成新的指纹种子。
          </p>
          <FormItem label="新实例名称" required>
            <Input
              value={copyName}
              onChange={e => onCopyNameChange(e.target.value)}
              placeholder="请输入新实例名称"
              autoFocus
            />
          </FormItem>
        </div>
      </Modal>

      <Modal
        open={!!operationError}
        onClose={onCloseOperationError}
        title="操作失败"
        width="420px"
        footer={<Button onClick={onCloseOperationError}>知道了</Button>}
      >
        <div className="text-[var(--color-text-secondary)] whitespace-pre-line">{operationError}</div>
      </Modal>

      <ConfirmModal
        open={!!cookieClearTarget}
        onClose={onCloseCookieClear}
        onConfirm={onConfirmCookieClear}
        title={cookieClearTarget?.running ? '清空 Cookie' : '清空用户数据'}
        content={(
          <div className="space-y-2">
            <p>{cookieClearTarget?.running ? `确定清空实例「${cookieClearTarget?.profileName || ''}」的所有 Cookie？` : `确定清空实例「${cookieClearTarget?.profileName || ''}」的用户数据目录？`}</p>
            <p className="text-sm text-red-500">
              {cookieClearTarget?.running ? '该操作会删除当前浏览器会话中的全部 Cookie，无法恢复。' : '实例未运行时会删除该用户数据目录下的全部文件，无法恢复。'}
            </p>
          </div>
        )}
        confirmText={cookieClearTarget?.running ? '清空 Cookie' : '清空用户数据'}
        danger
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={onCloseDelete}
        onConfirm={onConfirmDelete}
        title="删除实例"
        content={(
          <div className="space-y-2">
            <p>确定删除实例「{deleteTarget?.profileName || ''}」？</p>
            <p className="text-sm text-red-500">该操作会同时删除这个实例的用户数据目录，无法恢复。</p>
          </div>
        )}
        confirmText="删除实例"
        danger
      />

      <ConfirmModal
        open={batchDeleteOpen}
        onClose={onCloseBatchDelete}
        onConfirm={onConfirmBatchDelete}
        title="批量删除实例"
        content={(
          <div className="space-y-2">
            <p>确定删除选中的 {selectedCount} 个实例？</p>
            <p className="text-sm text-red-500">该操作会同时删除这些实例的用户数据目录，无法恢复。</p>
          </div>
        )}
        confirmText="删除所选"
        danger
      />
    </>
  )
}
