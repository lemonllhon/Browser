import type { ProxyIPHealthResult } from '../types'

const PROXY_LATENCY_CACHE_KEY = 'browser:proxyPool:latencyMap:v1'
const PROXY_IP_HEALTH_CACHE_KEY = 'browser:proxyPool:ipHealthMap:v1'
const PROXY_LATENCY_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const PROXY_IP_HEALTH_CACHE_TTL_MS = 12 * 60 * 60 * 1000

function cleanLatencyMap(data: Record<string, number>): Record<string, number> {
  const cleaned: Record<string, number> = {}
  Object.entries(data).forEach(([proxyId, latency]) => {
    if (typeof latency === 'number' && Number.isFinite(latency) && latency !== -1) {
      cleaned[proxyId] = latency
    }
  })
  return cleaned
}

export function toLatencyValue(ok: boolean, latencyMs: number, error?: string): number {
  if (ok) return latencyMs
  return error?.includes('不支持') ? -3 : -2
}

export function readLatencyCache(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PROXY_LATENCY_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { timestamp?: number; data?: Record<string, number> }
    if (!parsed?.timestamp || !parsed?.data) return {}
    if (Date.now() - parsed.timestamp > PROXY_LATENCY_CACHE_TTL_MS) return {}
    return cleanLatencyMap(parsed.data)
  } catch {
    return {}
  }
}

export function writeLatencyCache(data: Record<string, number>) {
  try {
    localStorage.setItem(PROXY_LATENCY_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: cleanLatencyMap(data),
    }))
  } catch {
    // ignore write failures
  }
}

export function readIPHealthCache(): Record<string, ProxyIPHealthResult> {
  try {
    const raw = localStorage.getItem(PROXY_IP_HEALTH_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { timestamp?: number; data?: Record<string, ProxyIPHealthResult> }
    if (!parsed?.timestamp || !parsed?.data) return {}
    if (Date.now() - parsed.timestamp > PROXY_IP_HEALTH_CACHE_TTL_MS) return {}
    const cleaned: Record<string, ProxyIPHealthResult> = {}
    Object.entries(parsed.data).forEach(([proxyId, item]) => {
      if (item && typeof item === 'object') {
        cleaned[proxyId] = item
      }
    })
    return cleaned
  } catch {
    return {}
  }
}

export function writeIPHealthCache(data: Record<string, ProxyIPHealthResult>) {
  try {
    localStorage.setItem(PROXY_IP_HEALTH_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data,
    }))
  } catch {
    // ignore write failures
  }
}
