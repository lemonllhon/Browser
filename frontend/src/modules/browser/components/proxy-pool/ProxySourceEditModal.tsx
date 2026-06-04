import { Button, FormItem, Input, Modal, Textarea } from '../../../../shared/components'

export interface ProxySourceEditForm {
  sourceUrl: string
  groupName: string
  namePrefix: string
  dnsServers: string
}

interface ProxySourceEditModalProps {
  open: boolean
  form: ProxySourceEditForm
  groups: string[]
  onClose: () => void
  onSave: () => void
  onFormChange: (updater: (prev: ProxySourceEditForm) => ProxySourceEditForm) => void
}

export function ProxySourceEditModal({
  open,
  form,
  groups,
  onClose,
  onSave,
  onFormChange,
}: ProxySourceEditModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑订阅"
      width="560px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={onSave}>保存</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormItem label="订阅 URL / 手动资源标识" required>
          <Input
            value={form.sourceUrl}
            onChange={e => onFormChange(prev => ({ ...prev, sourceUrl: e.target.value }))}
            placeholder="https://example.com/clash/subscription"
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1">手动添加资源会使用 manual-* 标识；补充为 http/https URL 后即可刷新。</p>
        </FormItem>
        <FormItem label="分组名称（可选）">
          <Input
            value={form.groupName}
            onChange={e => onFormChange(prev => ({ ...prev, groupName: e.target.value }))}
            placeholder="例如：香港、美国、机场A"
            list="edit-source-groups-datalist"
          />
          <datalist id="edit-source-groups-datalist">
            {groups.map(g => <option key={g} value={g} />)}
          </datalist>
        </FormItem>
        <FormItem label="名称前缀（可选）">
          <Input
            value={form.namePrefix}
            onChange={e => onFormChange(prev => ({ ...prev, namePrefix: e.target.value }))}
            placeholder="例如：HK、US、机场A"
          />
        </FormItem>
        <FormItem label="批量 DNS 配置（可选）">
          <Textarea
            value={form.dnsServers}
            onChange={e => onFormChange(prev => ({ ...prev, dnsServers: e.target.value }))}
            rows={5}
            placeholder={`dns:\n  enable: true\n  nameserver:\n    - 119.29.29.29\n    - 223.5.5.5`}
          />
        </FormItem>
        <p className="text-xs text-[var(--color-text-muted)]">
          保存后会同步更新该订阅下的全部节点；下次刷新订阅会继续使用这些来源配置。
        </p>
      </div>
    </Modal>
  )
}
