import { Button, FormItem, Input, Modal, Textarea } from '../../../../shared/components'

export interface ProxyEditForm {
  proxyName: string
  proxyConfig: string
  dnsServers: string
  groupName: string
}

interface ProxyEditModalProps {
  open: boolean
  form: ProxyEditForm
  groups: string[]
  saving: boolean
  onClose: () => void
  onSave: () => void
  onFormChange: (updater: (prev: ProxyEditForm) => ProxyEditForm) => void
}

export function ProxyEditModal({
  open,
  form,
  groups,
  saving,
  onClose,
  onSave,
  onFormChange,
}: ProxyEditModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑代理"
      width="500px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={onSave} loading={saving}>保存</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormItem label="代理名称" required>
          <Input
            value={form.proxyName}
            onChange={e => onFormChange(prev => ({ ...prev, proxyName: e.target.value }))}
            placeholder="例如：香港节点"
          />
        </FormItem>
        <FormItem label="分组名称（可选）">
          <Input
            value={form.groupName}
            onChange={e => onFormChange(prev => ({ ...prev, groupName: e.target.value }))}
            placeholder="例如：香港、美国"
            list="edit-proxy-groups-datalist"
          />
          <datalist id="edit-proxy-groups-datalist">
            {groups.map(g => <option key={g} value={g} />)}
          </datalist>
        </FormItem>
        <FormItem label="代理配置">
          <Textarea
            value={form.proxyConfig}
            onChange={e => onFormChange(prev => ({ ...prev, proxyConfig: e.target.value }))}
            rows={10}
            placeholder="支持 Clash YAML、http://、https://、socks5:// 代理配置"
          />
        </FormItem>
        <FormItem label="DNS 服务器（可选）">
          <Textarea
            value={form.dnsServers}
            onChange={e => onFormChange(prev => ({ ...prev, dnsServers: e.target.value }))}
            rows={6}
            placeholder={`dns:\n  enable: true\n  nameserver:\n    - 119.29.29.29\n    - 223.5.5.5`}
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1">支持 Clash dns: YAML 格式，主要用于 Clash / 桥接代理；直连 HTTP/SOCKS5 通常不会使用这里的 DNS 配置</p>
        </FormItem>
      </div>
    </Modal>
  )
}
