import { useState } from 'react'
import { toast } from '../../../shared/components'
import { browserProxyPreviewBatchCheckIPHealth, browserProxyPreviewBatchTestSpeed, onBrowserProxyPreviewIPHealthResult, onBrowserProxyPreviewSpeedResult } from '../api'
import type { ProxyIPHealthResult } from '../types'
import { toLatencyValue } from '../utils/proxyProbeCache'
import type { ProxyDisplayInfo } from '../utils/proxyDisplay'

export function useProxyPreviewProbeState() {
  const [previewLatencyMap, setPreviewLatencyMap] = useState<Record<string, number>>({})
  const [previewIPHealthMap, setPreviewIPHealthMap] = useState<Record<string, ProxyIPHealthResult>>({})
  const [previewCheckingIPHealthIds, setPreviewCheckingIPHealthIds] = useState<Set<string>>(new Set())
  const [previewTestingAll, setPreviewTestingAll] = useState(false)
  const [previewCheckingAllIPHealth, setPreviewCheckingAllIPHealth] = useState(false)

  const resetPreviewProbeState = () => {
    setPreviewLatencyMap({})
    setPreviewIPHealthMap({})
    setPreviewCheckingIPHealthIds(new Set())
    setPreviewTestingAll(false)
    setPreviewCheckingAllIPHealth(false)
  }

  const removePreviewProbeResults = (removeIds: Set<string>) => {
    setPreviewLatencyMap(prev => {
      const next = { ...prev }
      removeIds.forEach(id => { delete next[id] })
      return next
    })
    setPreviewIPHealthMap(prev => {
      const next = { ...prev }
      removeIds.forEach(id => { delete next[id] })
      return next
    })
    setPreviewCheckingIPHealthIds(prev => {
      const next = new Set(prev)
      removeIds.forEach(id => next.delete(id))
      return next
    })
  }

  const handlePreviewTestAll = async (testable: ProxyDisplayInfo[]) => {
    if (testable.length === 0) {
      toast.info('当前筛选没有可测速的代理')
      return
    }
    setPreviewTestingAll(true)
    const init: Record<string, number> = {}
    testable.forEach(p => { init[p.proxyId] = -1 })
    setPreviewLatencyMap(prev => ({ ...prev, ...init }))

    const idSet = new Set(testable.map(p => p.proxyId))
    const off = onBrowserProxyPreviewSpeedResult((data: { proxyId: string; ok: boolean; latencyMs: number; error: string }) => {
      if (!data?.proxyId || !idSet.has(data.proxyId)) return
      setPreviewLatencyMap(prev => ({ ...prev, [data.proxyId]: toLatencyValue(data.ok, data.latencyMs, data.error) }))
    })

    try {
      const results = await browserProxyPreviewBatchTestSpeed(
        testable.map(p => ({ proxyId: p.proxyId, proxyConfig: p.proxyConfig })),
        20
      )
      setPreviewLatencyMap(prev => {
        const next = { ...prev }
        results.forEach(result => {
          if (result?.proxyId && idSet.has(result.proxyId)) {
            next[result.proxyId] = toLatencyValue(result.ok, result.latencyMs, result.error)
          }
        })
        return next
      })
      const failed = results.filter(result => !result.ok).length
      if (failed > 0) {
        toast.info(`预览测速完成：可用 ${results.length - failed}，异常 ${failed}`)
      } else {
        toast.success(`预览测速完成：共 ${results.length} 条`)
      }
    } finally {
      off()
      setPreviewTestingAll(false)
    }
  }

  const handlePreviewCheckIPHealth = async (testable: ProxyDisplayInfo[]) => {
    if (testable.length === 0) {
      toast.info('当前筛选没有可检测的代理')
      return
    }
    setPreviewCheckingAllIPHealth(true)
    const ids = testable.map(p => p.proxyId)
    const idSet = new Set(ids)
    setPreviewCheckingIPHealthIds(prev => new Set([...Array.from(prev), ...ids]))

    const off = onBrowserProxyPreviewIPHealthResult((data: ProxyIPHealthResult) => {
      if (!data?.proxyId || !idSet.has(data.proxyId)) return
      setPreviewIPHealthMap(prev => ({ ...prev, [data.proxyId]: data }))
      setPreviewCheckingIPHealthIds(prev => {
        const next = new Set(prev)
        next.delete(data.proxyId)
        return next
      })
    })

    try {
      const results = await browserProxyPreviewBatchCheckIPHealth(
        testable.map(p => ({ proxyId: p.proxyId, proxyConfig: p.proxyConfig })),
        10
      )
      setPreviewIPHealthMap(prev => {
        const next = { ...prev }
        results.forEach(result => {
          if (result?.proxyId && idSet.has(result.proxyId)) {
            next[result.proxyId] = result
          }
        })
        return next
      })
      const failed = results.filter(result => !result.ok).length
      if (failed > 0) {
        toast.info(`预览 IP 健康检测完成：成功 ${results.length - failed}，失败 ${failed}`)
      } else {
        toast.success(`预览 IP 健康检测完成：共 ${results.length} 条`)
      }
    } finally {
      off()
      setPreviewCheckingIPHealthIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
      setPreviewCheckingAllIPHealth(false)
    }
  }

  return {
    previewLatencyMap,
    setPreviewLatencyMap,
    previewIPHealthMap,
    setPreviewIPHealthMap,
    previewCheckingIPHealthIds,
    previewTestingAll,
    previewCheckingAllIPHealth,
    resetPreviewProbeState,
    removePreviewProbeResults,
    handlePreviewTestAll,
    handlePreviewCheckIPHealth,
  }
}
