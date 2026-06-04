import { useEffect, useState } from 'react'
import { toast } from '../../../shared/components'
import { browserProxyBatchCheckIPHealth, browserProxyBatchTestSpeed, browserProxyCheckIPHealth, browserProxyTestSpeed, onBrowserProxyIPHealthResult, onBrowserProxySpeedResult } from '../api'
import type { ProxyIPHealthResult } from '../types'
import { readIPHealthCache, readLatencyCache, toLatencyValue, writeIPHealthCache, writeLatencyCache } from '../utils/proxyProbeCache'
import type { ProxyDisplayInfo } from '../utils/proxyDisplay'

export function useProxyProbeState() {
  const [latencyMap, setLatencyMap] = useState<Record<string, number>>(readLatencyCache)
  const [testingAll, setTestingAll] = useState(false)
  const [ipHealthMap, setIPHealthMap] = useState<Record<string, ProxyIPHealthResult>>(readIPHealthCache)
  const [checkingIPHealthIds, setCheckingIPHealthIds] = useState<Set<string>>(new Set())
  const [checkingAllIPHealth, setCheckingAllIPHealth] = useState(false)
  const [ipHealthDetailOpen, setIPHealthDetailOpen] = useState(false)
  const [currentIPHealthDetail, setCurrentIPHealthDetail] = useState<ProxyIPHealthResult | null>(null)

  useEffect(() => {
    writeLatencyCache(latencyMap)
  }, [latencyMap])

  useEffect(() => {
    writeIPHealthCache(ipHealthMap)
  }, [ipHealthMap])

  const pruneProbeCaches = (validIds: Set<string>) => {
    setLatencyMap(prev => {
      let changed = false
      const next: Record<string, number> = {}
      Object.entries(prev).forEach(([proxyId, latency]) => {
        if (validIds.has(proxyId)) {
          next[proxyId] = latency
        } else {
          changed = true
        }
      })
      return changed ? next : prev
    })

    setIPHealthMap(prev => {
      let changed = false
      const next: Record<string, ProxyIPHealthResult> = {}
      Object.entries(prev).forEach(([proxyId, health]) => {
        if (validIds.has(proxyId)) {
          next[proxyId] = health
        } else {
          changed = true
        }
      })
      return changed ? next : prev
    })
  }

  const removeProbeResults = (deleteIds: Set<string>) => {
    setLatencyMap(prev => {
      const next = { ...prev }
      deleteIds.forEach(id => { delete next[id] })
      return next
    })
    setIPHealthMap(prev => {
      const next = { ...prev }
      deleteIds.forEach(id => { delete next[id] })
      return next
    })
  }

  const handleTestOne = async (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      toast.info('直连模式无需测速')
      return
    }
    setLatencyMap(prev => ({ ...prev, [record.proxyId]: -1 }))
    const result = await browserProxyTestSpeed(record.proxyId)
    const val = toLatencyValue(result.ok, result.latencyMs, result.error)
    setLatencyMap(prev => ({ ...prev, [record.proxyId]: val }))
  }

  const handleTestAll = async (testable: ProxyDisplayInfo[]) => {
    if (testable.length === 0) return
    setTestingAll(true)
    const init: Record<string, number> = {}
    testable.forEach(p => { init[p.proxyId] = -1 })
    setLatencyMap(prev => ({ ...prev, ...init }))

    const off = onBrowserProxySpeedResult((data: { proxyId: string; ok: boolean; latencyMs: number; error: string }) => {
      const val = toLatencyValue(data.ok, data.latencyMs, data.error)
      setLatencyMap(prev => ({ ...prev, [data.proxyId]: val }))
    })

    try {
      const proxyIds = testable.map(p => p.proxyId)
      const results = await browserProxyBatchTestSpeed(proxyIds, 20)
      setLatencyMap(prev => {
        const next = { ...prev }
        results.forEach(result => {
          next[result.proxyId] = toLatencyValue(result.ok, result.latencyMs, result.error)
        })
        return next
      })
    } finally {
      off()
      setTestingAll(false)
    }
  }

  const handleCheckOneIPHealth = async (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      toast.info('直连模式无需检测')
      return
    }
    if (checkingIPHealthIds.has(record.proxyId)) return

    setCheckingIPHealthIds(prev => new Set(prev).add(record.proxyId))
    try {
      const result = await browserProxyCheckIPHealth(record.proxyId)
      setIPHealthMap(prev => ({ ...prev, [record.proxyId]: result }))
      if (!result.ok) {
        toast.error(result.error || `${record.proxyName} 检测失败`)
      }
    } finally {
      setCheckingIPHealthIds(prev => {
        const next = new Set(prev)
        next.delete(record.proxyId)
        return next
      })
    }
  }

  const handleCheckAllIPHealth = async (testable: ProxyDisplayInfo[]) => {
    if (testable.length === 0) return
    setCheckingAllIPHealth(true)

    const ids = testable.map(p => p.proxyId)
    const idSet = new Set(ids)
    setCheckingIPHealthIds(prev => new Set([...Array.from(prev), ...ids]))

    const off = onBrowserProxyIPHealthResult((data: ProxyIPHealthResult) => {
      if (!data?.proxyId || !idSet.has(data.proxyId)) return
      setIPHealthMap(prev => ({ ...prev, [data.proxyId]: data }))
      setCheckingIPHealthIds(prev => {
        const next = new Set(prev)
        next.delete(data.proxyId)
        return next
      })
    })

    try {
      const results = await browserProxyBatchCheckIPHealth(ids, 10)
      setIPHealthMap(prev => {
        const next = { ...prev }
        results.forEach(result => {
          if (result?.proxyId && idSet.has(result.proxyId)) {
            next[result.proxyId] = result
          }
        })
        return next
      })
      const failed = results.filter(r => !r.ok).length
      if (failed > 0) {
        toast.info(`IP 健康检测完成：成功 ${results.length - failed}，失败 ${failed}`)
      } else {
        toast.success(`IP 健康检测完成：共 ${results.length} 条`)
      }
    } finally {
      off()
      setCheckingIPHealthIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
      setCheckingAllIPHealth(false)
    }
  }

  const openIPHealthDetail = (proxyId: string) => {
    const result = ipHealthMap[proxyId]
    if (!result) return
    setCurrentIPHealthDetail(result)
    setIPHealthDetailOpen(true)
  }

  const openIPHealthDetailResult = (result: ProxyIPHealthResult | undefined) => {
    if (!result) return
    setCurrentIPHealthDetail(result)
    setIPHealthDetailOpen(true)
  }

  return {
    latencyMap,
    setLatencyMap,
    testingAll,
    ipHealthMap,
    setIPHealthMap,
    checkingIPHealthIds,
    checkingAllIPHealth,
    ipHealthDetailOpen,
    currentIPHealthDetail,
    closeIPHealthDetail: () => setIPHealthDetailOpen(false),
    pruneProbeCaches,
    removeProbeResults,
    handleTestOne,
    handleTestAll,
    handleCheckOneIPHealth,
    handleCheckAllIPHealth,
    openIPHealthDetail,
    openIPHealthDetailResult,
  }
}
