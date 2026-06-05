import { CheckCircle, XCircle } from 'lucide-react'
import { Button, FormItem, Input, Modal } from '../../../../shared/components'
import type { BrowserCoreInput } from '../../types'

type CoreValidation = {
  valid: boolean
  message: string
}

type BrowserCoreEditModalProps = {
  open: boolean
  form: BrowserCoreInput
  validation: CoreValidation | null
  saving: boolean
  onClose: () => void
  onSave: () => void
  onValidatePath: () => void
  onFormChange: (updater: (prev: BrowserCoreInput) => BrowserCoreInput) => void
  onValidationReset: () => void
}

export function BrowserCoreEditModal({
  open,
  form,
  validation,
  saving,
  onClose,
  onSave,
  onValidatePath,
  onFormChange,
  onValidationReset,
}: BrowserCoreEditModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form.coreId ? '编辑内核' : '新增内核'}
      width="500px"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={onSave} loading={saving}>保存</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <FormItem label="内核名称" required>
          <Input
            value={form.coreName}
            onChange={e => onFormChange(prev => ({ ...prev, coreName: e.target.value }))}
            placeholder="Chrome 142"
          />
        </FormItem>
        <FormItem label="内核路径" required>
          <div className="flex gap-2">
            <Input
              value={form.corePath}
              onChange={e => {
                onFormChange(prev => ({ ...prev, corePath: e.target.value }))
                onValidationReset()
              }}
              placeholder="chrome 或 D:/browsers/chrome-120"
              className="flex-1"
            />
            <Button variant="secondary" onClick={onValidatePath}>验证</Button>
          </div>
          {validation && (
            <div className={`flex items-center gap-1 mt-1 text-sm ${validation.valid ? 'text-green-600' : 'text-red-600'}`}>
              {validation.valid ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {validation.message}
            </div>
          )}
        </FormItem>
      </div>
    </Modal>
  )
}
