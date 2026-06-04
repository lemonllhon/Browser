import { Button, FormItem, Input, Modal, Select, Textarea } from '../../../../shared/components'
import { DIRECT_PROXY_PROTOCOL_OPTIONS } from '../../utils/directProxyImport'
import type { DirectImportForm } from '../../utils/directProxyImport'

type ProxyImportMode = 'clash' | 'direct'

interface ProxyImportModalProps {
  open: boolean
  mode: ProxyImportMode
  sourceName: string
  importUrl: string
  resolvedUrl: string
  importText: string
  dnsServers: string
  namePrefix: string
  groupName: string
  groups: string[]
  directForm: DirectImportForm
  directText: string
  fetching: boolean
  canParse: boolean
  onClose: () => void
  onParse: () => void
  onModeChange: (mode: ProxyImportMode) => void
  onSourceNameChange: (value: string) => void
  onImportUrlChange: (value: string) => void
  onResolvedUrlChange: (value: string) => void
  onFetchImportURL: () => void
  onImportTextChange: (value: string) => void
  onDnsServersChange: (value: string) => void
  onNamePrefixChange: (value: string) => void
  onGroupNameChange: (value: string) => void
  onDirectTextChange: (value: string) => void
  onDirectFormChange: (updater: (prev: DirectImportForm) => DirectImportForm) => void
}

export function ProxyImportModal({
  open,
  mode,
  sourceName,
  importUrl,
  resolvedUrl,
  importText,
  dnsServers,
  namePrefix,
  groupName,
  groups,
  directForm,
  directText,
  fetching,
  canParse,
  onClose,
  onParse,
  onModeChange,
  onSourceNameChange,
  onImportUrlChange,
  onResolvedUrlChange,
  onFetchImportURL,
  onImportTextChange,
  onDnsServersChange,
  onNamePrefixChange,
  onGroupNameChange,
  onDirectTextChange,
  onDirectFormChange,
}: ProxyImportModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="订阅与代理导入" width="640px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={fetching}>取消</Button>
          <Button onClick={onParse} disabled={fetching || !canParse}>解析</Button>
        </>
      }>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={mode === 'clash' ? undefined : 'secondary'}
            onClick={() => onModeChange('clash')}
          >
            <span className="flex flex-col items-center leading-tight">
              <span>订阅 / YAML</span>
              <span className="text-[11px] opacity-80">Clash、Base64、分享链接</span>
            </span>
          </Button>
          <Button
            variant={mode === 'direct' ? undefined : 'secondary'}
            onClick={() => onModeChange('direct')}
          >
            HTTP / HTTPS / SOCKS5
          </Button>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          {mode === 'clash'
            ? '支持管理 Clash 订阅 URL、直接粘贴 YAML，也支持 v2rayN Base64 订阅/分享链接；AnyTLS 等 sing-box 节点会自动桥接'
            : '支持批量粘贴 HTTP / HTTPS / SOCKS5 代理，也可以用表单补充单条带认证代理'}
        </p>
        <FormItem label="资源名称（可选）">
          <Input
            value={sourceName}
            onChange={e => onSourceNameChange(e.target.value)}
            placeholder={mode === 'clash' ? '例如：机场A、手动订阅A' : '例如：批量代理A、单个代理A'}
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1">本次添加会作为一条资源出现在订阅管理中；不填写时会自动生成名称。</p>
        </FormItem>
        {mode === 'clash' && (
          <>
            <FormItem label="订阅 URL（可选）">
              <div className="flex gap-2">
                <Input
                  value={importUrl}
                  onChange={e => {
                    const next = e.target.value
                    onImportUrlChange(next)
                    if (resolvedUrl.trim() && next.trim() !== resolvedUrl.trim()) {
                      onResolvedUrlChange('')
                    }
                  }}
                  placeholder="https://example.com/clash/subscription"
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  onClick={onFetchImportURL}
                  loading={fetching}
                  disabled={!importUrl.trim()}
                >
                  从 URL 获取
                </Button>
              </div>
              {resolvedUrl.trim() && (
                <p className="text-xs text-[var(--color-success)] mt-1 break-all">
                  已绑定订阅：{resolvedUrl}
                </p>
              )}
              <p className="text-xs text-[var(--color-text-muted)] mt-1">获取成功后会自动回填可解析文本，并尝试自动填充 DNS 与建议分组；自动刷新时间请在列表顶部统一配置</p>
            </FormItem>
            <Textarea
              value={importText}
              onChange={e => onImportTextChange(e.target.value)}
              rows={12}
              placeholder={`proxies:\n  - name: hysteria2-node\n    type: hysteria2\n    server: example.com\n    port: 443\n    password: your-password\n    sni: example.com\n\n或粘贴 Base64 订阅 / vless:// / vmess:// / trojan:// / hysteria2:// / hy2:// / anytls:// 节点`}
            />
          </>
        )}
        {mode === 'direct' && (
          <div className="space-y-4">
            <FormItem label="批量代理（可选）">
              <Textarea
                value={directText}
                onChange={e => onDirectTextChange(e.target.value)}
                rows={8}
                placeholder={`124.155.254.202:8938:T2n4c7u6Q5B3:H4H6j9q5h5v8\n124.155.246.100:9752:a2G8i8f2u2N6:A9q1Q9A4h5D7\nsocks5://127.0.0.1:1080 本地SOCKS5`}
              />
              <p className="text-xs text-[var(--color-text-muted)] mt-1">每行一个代理，支持 host:port、host:port:账号:密码、标准 URL；未写协议时使用下方选择的协议</p>
            </FormItem>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormItem label="单条协议">
                <Select
                  options={[...DIRECT_PROXY_PROTOCOL_OPTIONS]}
                  value={directForm.protocol}
                  onChange={e => onDirectFormChange(prev => ({ ...prev, protocol: e.target.value as DirectImportForm['protocol'] }))}
                />
              </FormItem>
              <FormItem label="单条名称（可选）">
                <Input
                  value={directForm.proxyName}
                  onChange={e => onDirectFormChange(prev => ({ ...prev, proxyName: e.target.value }))}
                  placeholder="例如：香港节点"
                />
              </FormItem>
              <FormItem label="单条地址">
                <Input
                  value={directForm.server}
                  onChange={e => onDirectFormChange(prev => ({ ...prev, server: e.target.value }))}
                  placeholder="例如：127.0.0.1 或 hk.example.com"
                />
              </FormItem>
              <FormItem label="单条端口">
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={directForm.port}
                  onChange={e => onDirectFormChange(prev => ({ ...prev, port: e.target.value }))}
                  placeholder="例如：1080"
                />
              </FormItem>
              <FormItem label="账号（可选）">
                <Input
                  value={directForm.username}
                  onChange={e => onDirectFormChange(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="留空则不使用认证"
                />
              </FormItem>
              <FormItem label="密码（可选）">
                <Input
                  type="password"
                  value={directForm.password}
                  onChange={e => onDirectFormChange(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="留空则不使用密码"
                />
              </FormItem>
            </div>
          </div>
        )}
        <FormItem label="分组名称（可选）">
          <Input
            value={groupName}
            onChange={e => onGroupNameChange(e.target.value)}
            placeholder="例如：香港、美国、机场A"
            list="proxy-groups-datalist"
          />
          {groups.length > 0 && (
            <datalist id="proxy-groups-datalist">
              {groups.map(g => <option key={g} value={g} />)}
            </datalist>
          )}
          <p className="text-xs text-[var(--color-text-muted)] mt-1">填写后本次导入的代理将归入该分组，可按分组筛选</p>
        </FormItem>
        {mode === 'clash' && (
          <FormItem label="名称前缀（可选）">
            <Input
              value={namePrefix}
              onChange={e => onNamePrefixChange(e.target.value)}
              placeholder="例如：HK、US、机场A"
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              填写后代理名称将变为 <code className="px-1 bg-[var(--color-bg-secondary)] rounded">前缀-原名称</code>，留空则保持原名
            </p>
          </FormItem>
        )}
        {mode === 'clash' && (
          <FormItem label="批量 DNS 配置（可选）">
            <Textarea value={dnsServers} onChange={e => onDnsServersChange(e.target.value)} rows={5}
              placeholder={`dns:\n  enable: true\n  nameserver:\n    - 119.29.29.29\n    - 223.5.5.5`} />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">留空则不配置 DNS，填写后将应用到本次导入的所有代理</p>
          </FormItem>
        )}
      </div>
    </Modal>
  )
}
