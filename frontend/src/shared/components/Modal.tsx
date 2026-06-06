import { ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

let nextModalId = 1
const modalStack: number[] = []
const modalStackListeners = new Set<() => void>()

function getTopModalId() {
  return modalStack.length > 0 ? modalStack[modalStack.length - 1] : null
}

function syncModalBodyLock() {
  document.body.style.overflow = modalStack.length > 0 ? 'hidden' : ''
}

function notifyModalStack() {
  syncModalBodyLock()
  modalStackListeners.forEach(listener => listener())
}

function addModalToStack(id: number) {
  if (!modalStack.includes(id)) {
    modalStack.push(id)
    notifyModalStack()
  }
}

function removeModalFromStack(id: number) {
  const index = modalStack.indexOf(id)
  if (index >= 0) {
    modalStack.splice(index, 1)
    notifyModalStack()
  }
}

function useModalStack(open: boolean) {
  const idRef = useRef(0)
  const [topModalId, setTopModalId] = useState<number | null>(() => getTopModalId())

  if (idRef.current === 0) {
    idRef.current = nextModalId
    nextModalId += 1
  }

  useLayoutEffect(() => {
    const listener = () => {
      setTopModalId(getTopModalId())
    }
    modalStackListeners.add(listener)
    return () => {
      modalStackListeners.delete(listener)
    }
  }, [])

  useLayoutEffect(() => {
    const id = idRef.current
    if (!open) {
      removeModalFromStack(id)
      return
    }
    addModalToStack(id)
    return () => {
      removeModalFromStack(id)
    }
  }, [open])

  return topModalId === idRef.current
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  width?: string
  closable?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = '500px',
  closable = true,
}: ModalProps) {
  const isTopModal = useModalStack(open)

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center${isTopModal ? '' : ' invisible pointer-events-none'}`}
      aria-hidden={isTopModal ? undefined : true}
    >
      {/* 遮罩层 */}
      {isTopModal && (
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={closable ? onClose : undefined}
        />
      )}

      {/* 弹窗内容 */}
      <div
        className="relative bg-[var(--color-bg-elevated)] rounded-xl shadow-2xl animate-scale-in max-h-[90vh] w-full flex flex-col"
        style={{ width, maxWidth: '90vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        {(title || closable) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] flex-shrink-0">
            {title && (
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {title}
              </h3>
            )}
            {closable && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] transition-colors ml-auto"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* 内容区 */}
        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
          {children}
        </div>

        {/* 底部按钮 */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)] flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// 确认对话框
interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  content: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = '确认',
  content,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="400px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {cancelText}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="text-[var(--color-text-secondary)]">{content}</div>
    </Modal>
  )
}
