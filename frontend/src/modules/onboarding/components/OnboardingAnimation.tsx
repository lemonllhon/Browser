import {
  CheckCircle2,
  ChevronRight,
  Cloud,
  Cpu,
  Download,
  FileArchive,
  Gauge,
  Globe2,
  Layers3,
  ListChecks,
  Monitor,
  MousePointer2,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Rocket,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  Wand2,
  Wifi,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type OnboardingSceneKey =
  | 'overview'
  | 'core'
  | 'core-tools'
  | 'proxy'
  | 'proxy-tools'
  | 'list-tools'
  | 'profile'
  | 'profile-edit'
  | 'backup'
  | 'organization'
  | 'extension'
  | 'settings'
  | 'sync'
  | 'cloud-sync'
  | 'finish'

interface OnboardingAnimationProps {
  sceneKey: OnboardingSceneKey
  activeStepId?: string
}

function StatusDot({ active = false }: { active?: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${active ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-muted)]'}`}
    />
  )
}

function MiniInstanceCard({
  name,
  tag,
  proxy,
  running,
  className = '',
}: {
  name: string
  tag: string
  proxy: string
  running?: boolean
  className?: string
}) {
  return (
    <div className={`onboarding-stage-card p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Monitor className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
          <span className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{name}</span>
        </div>
        <StatusDot active={running} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-md bg-[var(--color-accent-muted)] px-2 py-1 text-[var(--color-accent)]">{tag}</span>
        <span className="rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-[var(--color-text-secondary)]">{proxy}</span>
      </div>
    </div>
  )
}

function FlowNode({
  icon,
  label,
  active,
}: {
  icon: ReactNode
  label: string
  active?: boolean
}) {
  return (
    <div
      className={`flex min-w-[82px] flex-col items-center gap-2 rounded-lg border px-3 py-3 text-center transition-all duration-300 ${
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
          : 'border-[var(--color-border-default)] bg-[var(--color-bg-base)] text-[var(--color-text-secondary)]'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </div>
  )
}

function ToolTile({
  icon,
  title,
  detail,
  active,
  delay = '',
}: {
  icon: ReactNode
  title: string
  detail: string
  active?: boolean
  delay?: string
}) {
  return (
    <div
      className={`rounded-xl border p-3 shadow-sm onboarding-float ${delay} ${
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
          : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]'
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <p className="text-xs leading-5">{detail}</p>
    </div>
  )
}

function OverviewScene() {
  return (
    <div className="onboarding-stage-scene">
      <div className="absolute left-6 top-8 w-[46%]">
        <MiniInstanceCard name="Amazon-US-01" tag="运营组" proxy="US 42ms" running className="onboarding-float" />
      </div>
      <div className="absolute right-7 top-20 w-[45%]">
        <MiniInstanceCard name="TikTok-EU-02" tag="素材组" proxy="DE 68ms" className="onboarding-float onboarding-delay-1" />
      </div>
      <div className="absolute bottom-12 left-14 w-[48%]">
        <MiniInstanceCard name="Shopify-Asia" tag="店铺组" proxy="SG 35ms" running className="onboarding-float onboarding-delay-2" />
      </div>
      <div className="absolute bottom-10 right-10 flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-sm">
        <Layers3 className="h-4 w-4 text-[var(--color-accent)]" />
        多实例统一调度
      </div>
    </div>
  )
}

function CoreScene() {
  return (
    <div className="onboarding-stage-scene">
      <div className="absolute left-8 top-9 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-base)] shadow-sm onboarding-float">
        <Download className="h-7 w-7 text-[var(--color-accent)]" />
      </div>
      <div className="absolute left-[40%] top-16 flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)] onboarding-package-drop">
        <Cpu className="h-8 w-8" />
      </div>
      <div className="absolute bottom-9 left-8 right-8 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">内核管理</span>
          <span className="rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs text-[var(--color-success)]">已就绪</span>
        </div>
        <div className="space-y-2">
          {['fingerprint-chromium 142', 'Chrome 便携内核', '默认启动配置'].map((item, index) => (
            <div key={item} className="flex items-center justify-between rounded-lg bg-[var(--color-bg-base)] px-3 py-2 text-xs">
              <span className="text-[var(--color-text-secondary)]">{item}</span>
              {index === 0 ? <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" /> : <ChevronRight className="h-4 w-4 text-[var(--color-text-muted)]" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CoreToolsScene({ activeStepId }: { activeStepId?: string }) {
  return (
    <div className="onboarding-stage-scene grid grid-cols-1 gap-3 p-8 sm:grid-cols-3">
      <ToolTile icon={<Download className="h-5 w-5" />} title="下载内核" detail="从 Releases 或自定义地址下载对应平台内核。" active={activeStepId === 'core-download'} />
      <ToolTile icon={<Search className="h-5 w-5" />} title="扫描内核" detail="扫描 chrome 目录并自动注册可用内核。" active={activeStepId === 'core-scan'} delay="onboarding-delay-1" />
      <ToolTile icon={<Plus className="h-5 w-5" />} title="新增内核" detail="手动登记已有 chrome.exe 路径。" active={activeStepId === 'core-add'} delay="onboarding-delay-2" />
      <div className="col-span-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <Cpu className="h-4 w-4 text-[var(--color-accent)]" />
          默认内核
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-[var(--color-bg-muted)]">
          <div className="h-full w-4/5 rounded-full bg-[var(--color-accent)] onboarding-fill-bar" />
        </div>
      </div>
    </div>
  )
}

function ProxyScene() {
  const nodes = [
    { label: 'HTTP', top: '18%', left: '8%', delay: '' },
    { label: 'SOCKS5', top: '12%', left: '62%', delay: 'onboarding-delay-1' },
    { label: 'VMess', top: '47%', left: '10%', delay: 'onboarding-delay-2' },
    { label: 'Trojan', top: '52%', left: '67%', delay: 'onboarding-delay-3' },
  ]

  return (
    <div className="onboarding-stage-scene">
      {nodes.map(node => (
        <div
          key={node.label}
          className={`absolute flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-sm onboarding-proxy-node ${node.delay}`}
          style={{ top: node.top, left: node.left }}
        >
          <Globe2 className="h-4 w-4 text-[var(--color-accent)]" />
          {node.label}
        </div>
      ))}
      <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)] shadow-sm onboarding-pool-pulse">
        <Server className="h-8 w-8" />
        <span className="text-xs font-semibold">代理池</span>
      </div>
      <div className="absolute bottom-8 left-8 right-8 grid grid-cols-3 gap-2">
        {['35ms', '68ms', '121ms'].map(latency => (
          <div key={latency} className="rounded-lg bg-[var(--color-bg-surface)] px-3 py-2 text-center text-xs text-[var(--color-text-secondary)]">
            <Gauge className="mx-auto mb-1 h-4 w-4 text-[var(--color-success)]" />
            {latency}
          </div>
        ))}
      </div>
    </div>
  )
}

function ProxyToolsScene({ activeStepId }: { activeStepId?: string }) {
  const maintainActive = activeStepId === 'proxy-maintain'
  return (
    <div className="onboarding-stage-scene p-7">
      <div className="grid grid-cols-2 gap-3">
        <ToolTile icon={<Upload className="h-5 w-5" />} title="添加资源" detail="导入 Clash 订阅、YAML 或批量代理。" active={activeStepId === 'proxy-resource'} />
        <ToolTile icon={<Server className="h-5 w-5" />} title="代理节点" detail="集中查看节点协议、延迟、分组和来源。" active={activeStepId === 'proxy-node'} delay="onboarding-delay-1" />
        <ToolTile icon={<RefreshCw className="h-5 w-5" />} title="刷新订阅" detail="批量刷新订阅并同步来源下节点。" active={maintainActive} delay="onboarding-delay-2" />
        <ToolTile icon={<ShieldCheck className="h-5 w-5" />} title="IP健康 / 测试全部" detail="检测出口 IP 与连通性，快速筛掉不可用节点。" active={maintainActive} delay="onboarding-delay-3" />
      </div>
      <div className={`mt-3 flex items-center justify-between rounded-xl border px-4 py-3 text-xs ${
        maintainActive
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
          : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]'
      }`}>
        <span className="inline-flex items-center gap-2"><Trash2 className="h-4 w-4 text-[var(--color-error)]" />删除超时节点</span>
        <span className="rounded-md bg-[var(--color-bg-muted)] px-2 py-1">保留直连 / 本地代理</span>
      </div>
    </div>
  )
}

function ListToolsScene({ activeStepId }: { activeStepId?: string }) {
  const isActive = (title: string) => {
    if (title === '收起面板') return activeStepId === 'list-panel'
    if (title === '新建配置') return activeStepId === 'profile-create-entry'
    if (title === '批量生成') return activeStepId === 'profile-batch'
    if (title === '备份与恢复') return activeStepId === 'profile-backup' || activeStepId === 'backup-export' || activeStepId === 'backup-restore' || activeStepId === 'backup-restore-source'
    return false
  }
  return (
    <div className="onboarding-stage-scene p-7">
      <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">实例列表工具栏</span>
          <span className="rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs text-[var(--color-text-muted)]">可收起</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['收起面板', '筛选区可快速折叠'],
            ['新建配置', '进入实例编辑流程'],
            ['批量生成', '批量创建随机指纹实例'],
            ['备份与恢复', '导出或恢复实例包'],
          ].map(([title, detail], index) => (
            <div
              key={title}
              className={`rounded-lg border p-3 onboarding-float ${index % 2 ? 'onboarding-delay-1' : ''} ${
                isActive(title)
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border-default)] bg-[var(--color-bg-base)] text-[var(--color-text-secondary)]'
              }`}
            >
              <div className="font-semibold">{title}</div>
              <div className="mt-1">{detail}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {['配置总数', '运行中', '停止实例'].map((item, index) => (
          <div key={item} className="rounded-lg bg-[var(--color-bg-surface)] p-3 text-center text-xs text-[var(--color-text-secondary)] shadow-sm">
            <div className="mb-1 text-lg font-semibold text-[var(--color-accent)]">{index === 0 ? '18' : index === 1 ? '6' : '12'}</div>
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function ProfileScene() {
  return (
    <div className="onboarding-stage-scene">
      <div className="absolute left-7 top-7 w-[52%] rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <Monitor className="h-4 w-4 text-[var(--color-accent)]" />
          新建实例
        </div>
        {['实例名称', '浏览器内核', '代理节点', '指纹参数'].map((label, index) => (
          <div key={label} className="mb-2">
            <div className="mb-1 text-[11px] text-[var(--color-text-muted)]">{label}</div>
            <div className="h-8 overflow-hidden rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-base)]">
              <div
                className="h-full bg-[var(--color-accent-muted)] onboarding-fill-bar"
                style={{ width: `${76 - index * 9}%`, animationDelay: `${index * 140}ms` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-8 right-8 w-[42%]">
        <MiniInstanceCard name="New-Profile-01" tag="新标签" proxy="已绑定代理" running className="onboarding-card-create" />
      </div>
      <div className="absolute right-10 top-10 flex items-center gap-2 rounded-lg bg-[var(--color-bg-base)] px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-sm">
        <Tags className="h-4 w-4 text-[var(--color-accent)]" />
        分组 / 标签
      </div>
    </div>
  )
}

function ProfileEditScene({ activeStepId }: { activeStepId?: string }) {
  return (
    <div className="onboarding-stage-scene p-7">
      <div className="grid grid-cols-2 gap-3">
        <ToolTile icon={<Monitor className="h-5 w-5" />} title="基础信息" detail="名称、Code、内核、分组、标签。" active={activeStepId === 'profile-basic'} />
        <ToolTile icon={<Globe2 className="h-5 w-5" />} title="代理配置" detail="代理池选择、手动代理和自动切换。" active={activeStepId === 'profile-proxy'} delay="onboarding-delay-1" />
        <ToolTile icon={<ShieldCheck className="h-5 w-5" />} title="指纹配置" detail="地区、时区、语言和完整指纹参数。" active={activeStepId === 'profile-fingerprint'} delay="onboarding-delay-2" />
        <ToolTile icon={<Settings className="h-5 w-5" />} title="启动参数" detail="无痕模式和每行一个浏览器启动参数。" active={activeStepId === 'profile-launch'} delay="onboarding-delay-3" />
      </div>
      <div className="mt-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <Wand2 className="h-4 w-4 text-[var(--color-accent)]" />
          保存后回到实例列表启动
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-[var(--color-bg-muted)]">
          <div className="h-full w-3/4 rounded-full bg-[var(--color-accent)] onboarding-fill-bar" />
        </div>
      </div>
    </div>
  )
}

function BackupScene({ activeStepId }: { activeStepId?: string }) {
  const exportActive = activeStepId === 'profile-backup' || activeStepId === 'backup-export'
  const restoreActive = activeStepId === 'backup-restore' || activeStepId === 'backup-restore-source'
  const sourceActive = activeStepId === 'backup-restore-source'
  return (
    <div className="onboarding-stage-scene p-7">
      <div className="grid grid-cols-2 gap-4">
        <div className={`rounded-xl border p-5 onboarding-float ${
          exportActive
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
            : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]'
        }`}>
          <FileArchive className="mb-3 h-8 w-8" />
          <div className="text-sm font-semibold">导出实例备份</div>
          <p className="mt-2 text-xs leading-5">可按全部、选中、筛选或自定义范围导出实例包。</p>
        </div>
        <div className={`rounded-xl border p-5 onboarding-float onboarding-delay-1 ${
          restoreActive
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
            : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]'
        }`}>
          <Upload className="mb-3 h-8 w-8 text-[var(--color-accent)]" />
          <div className="text-sm font-semibold text-[var(--color-text-primary)]">恢复实例备份</div>
          <p className="mt-2 text-xs leading-5">选择备份包后预览实例，再按需恢复 Cookie 和配置。</p>
        </div>
      </div>
      <div className={`mt-4 rounded-xl border p-3 ${
        sourceActive
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
          : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]'
      }`}>
        <div className="mb-2 text-xs font-semibold">恢复来源</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-3 py-2">本地文件</div>
          <div className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-bg-base)] px-3 py-2 text-[var(--color-accent)]">云端备份</div>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-[var(--color-bg-surface)] p-4">
        <div className="mb-2 text-xs text-[var(--color-text-muted)]">备份进度</div>
        <div className="h-3 overflow-hidden rounded-full bg-[var(--color-bg-muted)]">
          <div className="h-full w-2/3 rounded-full bg-[var(--color-success)] onboarding-fill-bar" />
        </div>
      </div>
    </div>
  )
}

function OrganizationScene({ activeStepId }: { activeStepId?: string }) {
  return (
    <div className="onboarding-stage-scene p-7">
      <div className="grid grid-cols-2 gap-3">
        <ToolTile icon={<Tags className="h-5 w-5" />} title="标签" detail="用于实例标记、筛选和批量组织。" active={activeStepId === 'organization-tags'} />
        <ToolTile icon={<Layers3 className="h-5 w-5" />} title="分组" detail="为实例建立业务层级与归属。" active={activeStepId === 'organization-groups'} delay="onboarding-delay-1" />
        <ToolTile icon={<CheckCircle2 className="h-5 w-5" />} title="默认功能" detail="新建实例时自动应用默认标签、分组和内容。" active={activeStepId === 'organization-default'} delay="onboarding-delay-2" />
        <ToolTile icon={<ListChecks className="h-5 w-5" />} title="联动" detail="标签、分组与默认内容规则联动同步。" active={activeStepId === 'organization-default'} delay="onboarding-delay-3" />
      </div>
      <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
        <FlowNode icon={<Tags className="h-5 w-5" />} label="标签" active />
        <ChevronRight className="h-5 w-5 text-[var(--color-text-muted)]" />
        <FlowNode icon={<Layers3 className="h-5 w-5" />} label="分组" active />
        <ChevronRight className="h-5 w-5 text-[var(--color-text-muted)]" />
        <FlowNode icon={<Monitor className="h-5 w-5" />} label="实例" active />
      </div>
    </div>
  )
}

function ExtensionScene({ activeStepId }: { activeStepId?: string }) {
  return (
    <div className="onboarding-stage-scene p-7">
      <div className="grid grid-cols-2 gap-4">
        <ToolTile icon={<Upload className="h-5 w-5" />} title="导入插件" detail="支持目录、ZIP、CRX，也支持拖拽导入。" active={activeStepId === 'extension-import'} />
        <ToolTile icon={<Puzzle className="h-5 w-5" />} title="插件管理" detail="查看版本、绑定实例、设置默认自动绑定。" active={activeStepId === 'extension-manage'} delay="onboarding-delay-1" />
      </div>
      <div className="mt-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
        <div className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">扩展库</div>
        {['账号助手', 'Cookie 工具', '风控检测'].map((name, index) => (
          <div key={name} className="mb-2 flex items-center justify-between rounded-lg bg-[var(--color-bg-base)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
            <span>{name}</span>
            <span className="rounded bg-[var(--color-bg-muted)] px-2 py-1">{index === 0 ? '默认绑定' : '可选'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SettingsScene({ activeStepId }: { activeStepId?: string }) {
  return (
    <div className="onboarding-stage-scene p-7">
      <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            <Settings className="h-5 w-5 text-[var(--color-accent)]" />
            系统设置
          </div>
          <span className="rounded-md bg-[var(--color-accent-muted)] px-2 py-1 text-xs text-[var(--color-accent)]">演示模式</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ToolTile icon={<Settings className="h-5 w-5" />} title="全局配置" detail="主题、语言、更新检查和基础参数。" active={activeStepId === 'settings-entry'} />
          <ToolTile icon={<Download className="h-5 w-5" />} title="配置备份" detail="系统级配置导出、加载和初始化。" active={activeStepId === 'settings-entry'} delay="onboarding-delay-1" />
        </div>
      </div>
    </div>
  )
}

function SyncScene() {
  return (
    <div className="onboarding-stage-scene">
      <div className="absolute left-8 top-10 h-32 w-[43%] rounded-xl border border-[var(--color-accent)] bg-[var(--color-accent-muted)] p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[var(--color-accent)]">
          主控窗口
          <Wifi className="h-4 w-4" />
        </div>
        <div className="h-20 rounded-lg bg-[var(--color-bg-base)]" />
      </div>
      <div className="absolute right-8 top-14 h-28 w-[38%] rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 shadow-sm">
        <div className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">被控窗口 A</div>
        <div className="h-16 rounded-lg bg-[var(--color-bg-base)]" />
      </div>
      <div className="absolute bottom-10 right-14 h-24 w-[34%] rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 shadow-sm">
        <div className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">被控窗口 B</div>
        <div className="h-12 rounded-lg bg-[var(--color-bg-base)]" />
      </div>
      <MousePointer2 className="absolute left-[26%] top-[48%] h-6 w-6 text-[var(--color-accent)] onboarding-sync-cursor" />
      <div className="absolute bottom-8 left-8 flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
        <Play className="h-4 w-4 text-[var(--color-success)]" />
        mousemove / wheel 已节流同步
      </div>
    </div>
  )
}

function CloudSyncAuthScene() {
  return (
    <div className="onboarding-stage-scene p-7">
      <div className="rounded-xl border border-[var(--color-accent)] bg-[var(--color-accent-muted)] p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
            <Cloud className="h-5 w-5" />
            云端同步授权
          </div>
          <span className="rounded-md bg-[var(--color-bg-base)] px-2 py-1 text-xs text-[var(--color-accent)]">OAuth / 调试登录</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ToolTile icon={<ShieldCheck className="h-5 w-5" />} title="重新授权" detail="通过同步服务重新绑定当前设备。" active />
          <ToolTile icon={<RefreshCw className="h-5 w-5" />} title="刷新状态" detail="确认授权、在线状态和最后心跳。" active delay="onboarding-delay-1" />
          <ToolTile icon={<Upload className="h-5 w-5" />} title="云端备份" detail="全量和实例备份上传到云端。" active delay="onboarding-delay-2" />
          <ToolTile icon={<Download className="h-5 w-5" />} title="云端恢复" detail="下载、解密并恢复云端备份。" active delay="onboarding-delay-3" />
        </div>
      </div>
    </div>
  )
}

function FinishScene() {
  return (
    <div className="onboarding-stage-scene flex flex-col items-center justify-center gap-6">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <FlowNode icon={<Cpu className="h-5 w-5" />} label="内核" active />
        <ChevronRight className="h-5 w-5 text-[var(--color-text-muted)]" />
        <FlowNode icon={<Cloud className="h-5 w-5" />} label="代理池" active />
        <ChevronRight className="h-5 w-5 text-[var(--color-text-muted)]" />
        <FlowNode icon={<Monitor className="h-5 w-5" />} label="实例" active />
        <ChevronRight className="h-5 w-5 text-[var(--color-text-muted)]" />
        <FlowNode icon={<Rocket className="h-5 w-5" />} label="启动" active />
      </div>
      <div className="flex h-24 w-24 items-center justify-center rounded-full border border-[var(--color-success)] bg-[var(--color-bg-muted)] text-[var(--color-success)] onboarding-finish-pop">
        <Sparkles className="h-10 w-10" />
      </div>
    </div>
  )
}

export function OnboardingAnimation({ sceneKey, activeStepId }: OnboardingAnimationProps) {
  return (
    <div className="onboarding-stage" aria-hidden="true">
      {sceneKey === 'overview' ? <OverviewScene /> : null}
      {sceneKey === 'core' ? <CoreScene /> : null}
      {sceneKey === 'core-tools' ? <CoreToolsScene activeStepId={activeStepId} /> : null}
      {sceneKey === 'proxy' ? <ProxyScene /> : null}
      {sceneKey === 'proxy-tools' ? <ProxyToolsScene activeStepId={activeStepId} /> : null}
      {sceneKey === 'list-tools' ? <ListToolsScene activeStepId={activeStepId} /> : null}
      {sceneKey === 'profile' ? <ProfileScene /> : null}
      {sceneKey === 'profile-edit' ? <ProfileEditScene activeStepId={activeStepId} /> : null}
      {sceneKey === 'backup' ? <BackupScene activeStepId={activeStepId} /> : null}
      {sceneKey === 'organization' ? <OrganizationScene activeStepId={activeStepId} /> : null}
      {sceneKey === 'extension' ? <ExtensionScene activeStepId={activeStepId} /> : null}
      {sceneKey === 'settings' ? <SettingsScene activeStepId={activeStepId} /> : null}
      {sceneKey === 'sync' ? <SyncScene /> : null}
      {sceneKey === 'cloud-sync' ? <CloudSyncAuthScene /> : null}
      {sceneKey === 'finish' ? <FinishScene /> : null}
    </div>
  )
}
