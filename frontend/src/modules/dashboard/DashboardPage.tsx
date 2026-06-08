import { useEffect, useState } from 'react'
import { Monitor, Play, Shield, Cpu, ArrowRight, Globe, Settings } from 'lucide-react'
import { useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../shared/components'
import { onRuntimeEvent } from '../../shared/backend/runtime'
import { fetchDashboardStats, reloadConfig } from './api'
import type { DashboardStats } from './types'
import { getBrowserSharedDataSnapshot, refreshBrowserSharedData, useBrowserSharedData } from '../browser/stores/browserSharedDataStore'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-[var(--color-text-muted)]">{title}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-semibold text-[var(--color-text-primary)]">{value}</div>
    </div>
  )
}

const QUICK_LINKS = [
  { to: '/browser/list', icon: <Monitor className="w-5 h-5" />, label: '浏览器实例', desc: '管理所有指纹浏览器' },
  { to: '/browser/proxy-pool', icon: <Shield className="w-5 h-5" />, label: '代理池', desc: '配置和测试代理节点' },
  { to: '/browser/cores', icon: <Cpu className="w-5 h-5" />, label: '内核管理', desc: '管理 Chrome 内核版本' },
  { to: '/settings', icon: <Settings className="w-5 h-5" />, label: '系统设置', desc: '全局参数配置' },
]

const mergeSharedCounts = (stats: DashboardStats): DashboardStats => {
  const snapshot = getBrowserSharedDataSnapshot()
  return {
    ...stats,
    totalInstances: snapshot.loaded.profiles ? snapshot.profiles.length : stats.totalInstances,
    runningInstances: snapshot.loaded.profiles ? snapshot.profiles.filter(item => item.running).length : stats.runningInstances,
    proxyCount: snapshot.loaded.proxies ? snapshot.proxies.length : stats.proxyCount,
    coreCount: snapshot.loaded.cores ? snapshot.cores.length : stats.coreCount,
  }
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalInstances: 0,
    runningInstances: 0,
    proxyCount: 0,
    coreCount: 0,
    memUsedMB: 0,
    maxProfileLimit: 0,
    appVersion: 'dev',
  })
  const [loading, setLoading] = useState(true)
  const refreshTimerRef = useRef<number | null>(null)
  const sharedData = useBrowserSharedData(['profiles', 'proxies', 'cores'])

  const load = useCallback(async ({ silent = false, reload = true } = {}) => {
    if (!silent) setLoading(true)
    try {
      if (reload) {
        await reloadConfig() // 强制从本地磁盘刷一次最新配置，解决各种情况下的容量不同步
      }
      await refreshBrowserSharedData(['profiles', 'proxies', 'cores'], { silent: true }).catch(() => {})
      setStats(mergeSharedCounts(await fetchDashboardStats()))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setStats(prev => ({
      ...prev,
      totalInstances: sharedData.loaded.profiles ? sharedData.profiles.length : prev.totalInstances,
      runningInstances: sharedData.loaded.profiles ? sharedData.profiles.filter(item => item.running).length : prev.runningInstances,
      proxyCount: sharedData.loaded.proxies ? sharedData.proxies.length : prev.proxyCount,
      coreCount: sharedData.loaded.cores ? sharedData.cores.length : prev.coreCount,
    }))
  }, [
    sharedData.cores,
    sharedData.loaded.cores,
    sharedData.loaded.profiles,
    sharedData.loaded.proxies,
    sharedData.profiles,
    sharedData.proxies,
  ])

  useEffect(() => {
    const scheduleRefresh = () => {
      if (document.visibilityState !== 'visible') return
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null
        void load({ silent: true, reload: false })
      }, 150)
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void load({ silent: true, reload: false })
      }
    }

    const offStarted = onRuntimeEvent('browser:instance:started', scheduleRefresh)
    const offUpdated = onRuntimeEvent('browser:instance:updated', scheduleRefresh)
    const offStopped = onRuntimeEvent('browser:instance:stopped', scheduleRefresh)
    const offCrashed = onRuntimeEvent('browser:instance:crashed', scheduleRefresh)
    const offProfilesUpdated = onRuntimeEvent('browser:profiles:updated', scheduleRefresh)
    const offProxiesUpdated = onRuntimeEvent('browser:proxies:updated', scheduleRefresh)
    const offCoresUpdated = onRuntimeEvent('browser:cores:updated', scheduleRefresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)

    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      offStarted?.()
      offUpdated?.()
      offStopped?.()
      offCrashed?.()
      offProfilesUpdated?.()
      offProxiesUpdated?.()
      offCoresUpdated?.()
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [load])

  const v = (n: number) => loading ? '-' : n.toString()

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">控制台</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">浏览器指纹管理平台概览</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="实例总数"
          value={v(stats.totalInstances)}
          icon={<Monitor className="w-4 h-4 text-blue-500" />}
          color="bg-blue-50 dark:bg-blue-900/20"
        />
        <StatCard
          title="运行中"
          value={v(stats.runningInstances)}
          icon={<Play className="w-4 h-4 text-green-500" />}
          color="bg-green-50 dark:bg-green-900/20"
        />
        <StatCard
          title="代理节点"
          value={v(stats.proxyCount)}
          icon={<Globe className="w-4 h-4 text-purple-500" />}
          color="bg-purple-50 dark:bg-purple-900/20"
        />
        <StatCard
          title="内核版本"
          value={v(stats.coreCount)}
          icon={<Cpu className="w-4 h-4 text-orange-500" />}
          color="bg-orange-50 dark:bg-orange-900/20"
        />
      </div>

      {/* 快捷操作 + 系统信息 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="快捷操作">
          <div className="grid grid-cols-2 gap-3">
            {QUICK_LINKS.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className="group flex items-center gap-3 p-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)]
                         hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)] transition-all duration-150"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-muted)] flex items-center justify-center text-[var(--color-text-secondary)]
                              group-hover:bg-[var(--color-accent)] group-hover:text-[var(--color-text-inverse)] transition-colors shrink-0">
                  {link.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{link.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">{link.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-[var(--color-text-muted)] opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
              </Link>
            ))}
          </div>
        </Card>

        <Card title="系统信息">
          <div className="space-y-1">
            {[
              { label: '系统版本', value: loading ? '-' : stats.appVersion },
              { label: '运行环境', value: 'Wails v3 + React' },
              { label: '通信协议', value: 'Protocol Buffers Binary IPC' },
              { label: '数据存储', value: 'SQLite 本地数据库 / YAML 配置文件' },
              { label: '内存占用', value: loading ? '-' : `${stats.memUsedMB} MB` },
              { label: '实例运行', value: loading ? '-' : `${stats.runningInstances} / ${stats.totalInstances}` },
              { label: '实例扩容', value: loading ? '-' : '无限制' },
            ].map(item => (
              <div
                key={item.label}
                className="flex justify-between items-center py-3 border-b border-[var(--color-border-muted)] last:border-0"
              >
                <span className="text-sm text-[var(--color-text-muted)]">{item.label}</span>
                <span className="text-sm font-medium text-[var(--color-text-primary)]">{item.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-[var(--color-success)]/20 bg-[var(--color-success)]/10 p-4">
            <h3 className="text-sm font-medium text-[var(--color-text-primary)]">扩容系统</h3>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">当前为无限制扩容模式，无需兑换码即可继续创建或复制实例。</p>
          </div>
        </Card>
      </div>
    </div>
  )
}
