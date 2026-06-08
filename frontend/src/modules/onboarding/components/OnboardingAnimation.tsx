import {
  CheckCircle2,
  ChevronRight,
  Cloud,
  Cpu,
  Download,
  Gauge,
  Globe2,
  Layers3,
  Monitor,
  MousePointer2,
  Play,
  Rocket,
  Server,
  ShieldCheck,
  Sparkles,
  Tags,
  Wifi,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type OnboardingStepKey = 'overview' | 'core' | 'proxy' | 'profile' | 'sync' | 'finish'

interface OnboardingAnimationProps {
  stepKey: OnboardingStepKey
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
        <div className="flex items-center gap-2 min-w-0">
          <Monitor className="h-4 w-4 text-[var(--color-accent)] shrink-0" />
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
      className={`flex min-w-[86px] flex-col items-center gap-2 rounded-lg border px-3 py-3 text-center transition-all duration-300 ${
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

function OverviewScene() {
  return (
    <div className="onboarding-stage-scene">
      <div className="absolute left-6 top-8 w-[46%]">
        <MiniInstanceCard name="Amazon-US-01" tag="运营组" proxy="US 42ms" running className="onboarding-float" />
      </div>
      <div className="absolute right-7 top-20 w-[45%]">
        <MiniInstanceCard name="TikTok-EU-02" tag="素材组" proxy="DE 68ms" className="onboarding-float onboarding-delay-1" />
      </div>
      <div className="absolute left-14 bottom-12 w-[48%]">
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

function FinishScene() {
  return (
    <div className="onboarding-stage-scene flex flex-col items-center justify-center gap-6">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <FlowNode icon={<Cpu className="h-5 w-5" />} label="内核" active />
        <ChevronRight className="h-5 w-5 text-[var(--color-text-muted)]" />
        <FlowNode icon={<Cloud className="h-5 w-5" />} label="代理池" active />
        <ChevronRight className="h-5 w-5 text-[var(--color-text-muted)]" />
        <FlowNode icon={<ShieldCheck className="h-5 w-5" />} label="实例" active />
        <ChevronRight className="h-5 w-5 text-[var(--color-text-muted)]" />
        <FlowNode icon={<Rocket className="h-5 w-5" />} label="启动" active />
      </div>
      <div className="flex h-24 w-24 items-center justify-center rounded-full border border-[var(--color-success)] bg-[var(--color-bg-muted)] text-[var(--color-success)] onboarding-finish-pop">
        <Sparkles className="h-10 w-10" />
      </div>
    </div>
  )
}

export function OnboardingAnimation({ stepKey }: OnboardingAnimationProps) {
  return (
    <div className="onboarding-stage" aria-hidden="true">
      {stepKey === 'overview' ? <OverviewScene /> : null}
      {stepKey === 'core' ? <CoreScene /> : null}
      {stepKey === 'proxy' ? <ProxyScene /> : null}
      {stepKey === 'profile' ? <ProfileScene /> : null}
      {stepKey === 'sync' ? <SyncScene /> : null}
      {stepKey === 'finish' ? <FinishScene /> : null}
    </div>
  )
}
