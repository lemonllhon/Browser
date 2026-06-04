import type { ProxyIPHealthResult } from '../types'

export type PreviewLatencyFilter = 'all' | 'untested' | 'testing' | 'ok' | 'fast' | 'slow' | 'timeout' | 'unsupported'
export type PreviewHealthFilter = 'all' | 'untested' | 'ok' | 'failed' | 'highRisk' | 'residential' | 'datacenter'

export interface SourceRefreshFilter {
  keyword?: string
  latencyFilter?: PreviewLatencyFilter
  healthFilter?: PreviewHealthFilter
  countryFilter?: string
  requiresLatency?: boolean
  requiresIPHealth?: boolean
}

export interface ProxyFilterableItem {
  proxyName: string
  groupName: string
  type: string
  server: string
  port: number
}

export const PREVIEW_LATENCY_FILTER_OPTIONS: { value: PreviewLatencyFilter; label: string }[] = [
  { value: 'all', label: '全部延迟' },
  { value: 'untested', label: '未测速' },
  { value: 'testing', label: '测速中' },
  { value: 'ok', label: '可用' },
  { value: 'fast', label: '低延迟' },
  { value: 'slow', label: '高延迟' },
  { value: 'timeout', label: '超时' },
  { value: 'unsupported', label: '不支持' },
]

export const PREVIEW_HEALTH_FILTER_OPTIONS: { value: PreviewHealthFilter; label: string }[] = [
  { value: 'all', label: '全部健康' },
  { value: 'untested', label: '未检测' },
  { value: 'ok', label: '检测通过' },
  { value: 'failed', label: '检测失败' },
  { value: 'highRisk', label: '高风险' },
  { value: 'residential', label: '住宅IP' },
  { value: 'datacenter', label: '机房IP' },
]

function normalizeSourceRefreshFilter(input: unknown): SourceRefreshFilter | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const keyword = typeof record.keyword === 'string' ? record.keyword.trim() : ''
  const latencyFilter = PREVIEW_LATENCY_FILTER_OPTIONS.some(item => item.value === record.latencyFilter)
    ? record.latencyFilter as PreviewLatencyFilter
    : 'all'
  const healthFilter = PREVIEW_HEALTH_FILTER_OPTIONS.some(item => item.value === record.healthFilter)
    ? record.healthFilter as PreviewHealthFilter
    : 'all'
  const countryFilter = typeof record.countryFilter === 'string' && record.countryFilter.trim()
    ? record.countryFilter.trim()
    : 'all'
  const requiresLatency = !!record.requiresLatency
  const requiresIPHealth = !!record.requiresIPHealth

  const active = !!keyword || latencyFilter !== 'all' || healthFilter !== 'all' || countryFilter !== 'all'
  if (!active) return null
  return {
    keyword: keyword || undefined,
    latencyFilter,
    healthFilter,
    countryFilter,
    requiresLatency,
    requiresIPHealth,
  }
}

export function parseSourceRefreshFilter(raw: string): SourceRefreshFilter | null {
  const text = (raw || '').trim()
  if (!text) return null
  try {
    return normalizeSourceRefreshFilter(JSON.parse(text))
  } catch {
    return null
  }
}

function encodeSourceRefreshFilter(filter: SourceRefreshFilter | null): string {
  const normalized = normalizeSourceRefreshFilter(filter)
  return normalized ? JSON.stringify(normalized) : ''
}

export function buildSourceRefreshFilterSnapshot(
  keyword: string,
  latencyFilter: PreviewLatencyFilter,
  healthFilter: PreviewHealthFilter,
  countryFilter: string,
  hasIPHealthData: boolean
): string {
  const filter = normalizeSourceRefreshFilter({
    keyword,
    latencyFilter,
    healthFilter,
    countryFilter,
    requiresLatency: latencyFilter !== 'all' && latencyFilter !== 'untested',
    requiresIPHealth: countryFilter !== 'all' ||
      (healthFilter !== 'all' && healthFilter !== 'untested') ||
      (!!keyword.trim() && hasIPHealthData),
  })
  return encodeSourceRefreshFilter(filter)
}

export function sourceRefreshFilterLabel(raw: string): string {
  const filter = parseSourceRefreshFilter(raw)
  if (!filter) return '-'
  const parts: string[] = []
  if (filter.countryFilter && filter.countryFilter !== 'all') parts.push(`地区:${filter.countryFilter}`)
  if (filter.healthFilter && filter.healthFilter !== 'all') {
    parts.push(PREVIEW_HEALTH_FILTER_OPTIONS.find(item => item.value === filter.healthFilter)?.label || filter.healthFilter)
  }
  if (filter.latencyFilter && filter.latencyFilter !== 'all') {
    parts.push(PREVIEW_LATENCY_FILTER_OPTIONS.find(item => item.value === filter.latencyFilter)?.label || filter.latencyFilter)
  }
  if (filter.keyword) parts.push(`搜索:${filter.keyword}`)
  return parts.join(' / ') || '-'
}

export function normalizePreviewSearchText(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

export function previewLatencyMatchesFilter(latency: number | undefined, filter: PreviewLatencyFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'untested') return latency === undefined
  if (filter === 'testing') return latency === -1
  if (filter === 'timeout') return latency === -2
  if (filter === 'unsupported') return latency === -3
  if (filter === 'ok') return typeof latency === 'number' && latency >= 0
  if (filter === 'fast') return typeof latency === 'number' && latency >= 0 && latency < 200
  if (filter === 'slow') return typeof latency === 'number' && latency >= 500
  return true
}

export function previewHealthMatchesFilter(result: ProxyIPHealthResult | undefined, checking: boolean, filter: PreviewHealthFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'untested') return !checking && !result
  if (filter === 'ok') return !!result?.ok
  if (filter === 'failed') return !!result && !result.ok
  if (filter === 'highRisk') return !!result?.ok && (result.fraudScore >= 70 || result.isBroadcast)
  if (filter === 'residential') return !!result?.ok && result.isResidential
  if (filter === 'datacenter') return !!result?.ok && !result.isResidential
  return true
}

export function previewItemMatchesSourceRefreshFilter(
  item: ProxyFilterableItem,
  filter: SourceRefreshFilter,
  latency: number | undefined,
  health: ProxyIPHealthResult | undefined
): boolean {
  const latencyFilter = filter.latencyFilter || 'all'
  if (!previewLatencyMatchesFilter(latency, latencyFilter)) return false

  const healthFilter = filter.healthFilter || 'all'
  if (!previewHealthMatchesFilter(health, false, healthFilter)) return false

  const countryFilter = filter.countryFilter || 'all'
  if (countryFilter !== 'all' && (health?.country || '') !== countryFilter) return false

  const keyword = normalizePreviewSearchText(filter.keyword || '')
  if (!keyword) return true
  const searchText = [
    item.proxyName,
    item.groupName,
    item.type,
    item.server,
    item.port,
    health?.ip,
    health?.country,
    health?.region,
    health?.city,
    health?.asOrganization,
    health?.fraudScore,
    health?.isResidential ? '住宅 residential' : '机房 datacenter',
  ].map(normalizePreviewSearchText).join(' ')
  return searchText.includes(keyword)
}
