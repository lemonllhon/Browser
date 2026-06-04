import type { BrowserProxy } from '../types'

const PROXY_SOURCE_META_STORAGE_KEY = 'browser:proxyPool:sourceMetas:v1'

type ProxyImportMode = 'clash' | 'direct'

export interface URLImportSourceMeta {
  sourceId: string
  sourceUrl: string
  sourceNamePrefix: string
  sourceGroupName: string
  sourceDnsServers: string
  sourceFilterJson: string
  sourceAutoRefresh: boolean
  sourceRefreshIntervalM: number
  sourceLastRefreshAt: string
  proxyCount: number
}

function encodeManualSourceName(name: string): string {
  return encodeURIComponent(name.trim()).replace(/%20/g, '+')
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseTimestampMs(value: string): number {
  const v = (value || '').trim()
  if (!v) return 0
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : 0
}

function normalizeRefreshIntervalM(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value < 5) return 5
  if (value > 24 * 60) return 24 * 60
  return Math.round(value)
}

export function sourceHostLabel(sourceURL: string): string {
  const raw = (sourceURL || '').trim()
  if (!raw) return ''
  const manual = parseManualSourceURL(raw)
  if (manual) return manual.name
  try {
    const u = new URL(raw)
    return u.host || raw
  } catch {
    return raw
  }
}

export function parseManualSourceURL(sourceURL: string): { kind: string; name: string } | null {
  const raw = (sourceURL || '').trim()
  const match = raw.match(/^manual-(subscription|direct):\/\/(.+)$/i)
  if (!match) return null
  const kind = match[1].toLowerCase()
  const encoded = match[2] || ''
  const name = safeDecodeURIComponent(encoded.replace(/\+/g, '%20')).trim()
  return { kind, name: name || (kind === 'subscription' ? '手动订阅' : '手动代理') }
}

export function isRefreshableSourceURL(sourceURL: string): boolean {
  const raw = (sourceURL || '').trim()
  if (!raw || parseManualSourceURL(raw)) return false
  try {
    const scheme = new URL(raw).protocol.toLowerCase()
    return scheme === 'http:' || scheme === 'https:'
  } catch {
    return false
  }
}

export function normalizeSourceURL(sourceURL: string): string {
  const raw = (sourceURL || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return raw
  }
}

function buildStableSourceID(sourceURL: string, sourceNamePrefix: string, sourceGroupName: string): string {
  const key = `${normalizeSourceURL(sourceURL)}|||${sourceGroupName.trim()}|||${sourceNamePrefix.trim()}`
  // djb2 变体，输出稳定且实现简单。
  let hash = 5381
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i)
  }
  const unsigned = hash >>> 0
  return `src-${unsigned.toString(36)}`
}

export function buildManualSourceURL(mode: ProxyImportMode, name: string): string {
  const fallback = mode === 'clash' ? '手动订阅' : '手动代理'
  return `manual-${mode === 'clash' ? 'subscription' : 'direct'}://${encodeManualSourceName(name || fallback)}`
}

export function defaultImportSourceName(mode: ProxyImportMode, groupName: string, prefix: string, selectedCount: number): string {
  const group = groupName.trim()
  const namePrefix = prefix.trim()
  if (group) return group
  if (namePrefix) return namePrefix
  return mode === 'clash'
    ? `手动订阅 ${new Date().toLocaleString()}`
    : `${selectedCount > 1 ? '批量代理' : '单个代理'} ${new Date().toLocaleString()}`
}

export function resolveImportSourceID(list: BrowserProxy[], sourceURL: string, sourceNamePrefix: string, sourceGroupName: string): string {
  const normalizedURL = normalizeSourceURL(sourceURL)
  const normalizedPrefix = sourceNamePrefix.trim()
  const normalizedGroup = sourceGroupName.trim()
  const existing = list.find(item =>
    normalizeSourceURL(item.sourceUrl || '') === normalizedURL &&
    (item.groupName || '').trim() === normalizedGroup &&
    (item.sourceNamePrefix || '').trim() === normalizedPrefix &&
    (item.sourceId || '').trim() !== ''
  )
  if (existing?.sourceId?.trim()) {
    return existing.sourceId.trim()
  }
  const candidate = buildStableSourceID(sourceURL, sourceNamePrefix, sourceGroupName)
  const collidesWithDifferentSource = list.some(item =>
    (item.sourceId || '').trim() === candidate &&
    (
      normalizeSourceURL(item.sourceUrl || '') !== normalizedURL ||
      (item.groupName || '').trim() !== normalizedGroup ||
      (item.sourceNamePrefix || '').trim() !== normalizedPrefix
    )
  )
  if (collidesWithDifferentSource) {
    return `${candidate}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  }
  return candidate
}

export function normalizeSourceMeta(meta: URLImportSourceMeta): URLImportSourceMeta {
  return {
    sourceId: meta.sourceId.trim(),
    sourceUrl: meta.sourceUrl.trim(),
    sourceNamePrefix: meta.sourceNamePrefix.trim(),
    sourceGroupName: meta.sourceGroupName.trim(),
    sourceDnsServers: meta.sourceDnsServers.trim(),
    sourceFilterJson: meta.sourceFilterJson.trim(),
    sourceAutoRefresh: !!meta.sourceAutoRefresh,
    sourceRefreshIntervalM: normalizeRefreshIntervalM(Number(meta.sourceRefreshIntervalM || 0)),
    sourceLastRefreshAt: meta.sourceLastRefreshAt.trim(),
    proxyCount: Math.max(0, Number(meta.proxyCount || 0)),
  }
}

export function readStoredSourceMetas(): URLImportSourceMeta[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROXY_SOURCE_META_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item): URLImportSourceMeta | null => {
        if (!item || typeof item !== 'object') return null
        const record = item as Record<string, unknown>
        const sourceId = String(record.sourceId || '').trim()
        const sourceUrl = String(record.sourceUrl || '').trim()
        if (!sourceId || !sourceUrl) return null
        return normalizeSourceMeta({
          sourceId,
          sourceUrl,
          sourceNamePrefix: String(record.sourceNamePrefix || ''),
          sourceGroupName: String(record.sourceGroupName || ''),
          sourceDnsServers: String(record.sourceDnsServers || ''),
          sourceFilterJson: String(record.sourceFilterJson || ''),
          sourceAutoRefresh: !!record.sourceAutoRefresh,
          sourceRefreshIntervalM: Number(record.sourceRefreshIntervalM || 0),
          sourceLastRefreshAt: String(record.sourceLastRefreshAt || ''),
          proxyCount: Number(record.proxyCount || 0),
        })
      })
      .filter((item): item is URLImportSourceMeta => !!item)
  } catch {
    return []
  }
}

export function writeStoredSourceMetas(metas: URLImportSourceMeta[]) {
  const deduped = new Map<string, URLImportSourceMeta>()
  metas.forEach((meta) => {
    const normalized = normalizeSourceMeta(meta)
    if (normalized.sourceId && normalized.sourceUrl) {
      deduped.set(normalized.sourceId, normalized)
    }
  })
  localStorage.setItem(PROXY_SOURCE_META_STORAGE_KEY, JSON.stringify(Array.from(deduped.values())))
}

export function collectURLImportSources(list: BrowserProxy[], archived: URLImportSourceMeta[] = []): URLImportSourceMeta[] {
  const sourceMap = new Map<string, URLImportSourceMeta>()
  archived.forEach((meta) => {
    const normalized = normalizeSourceMeta({ ...meta, proxyCount: 0 })
    if (normalized.sourceId && normalized.sourceUrl) {
      sourceMap.set(normalized.sourceId, normalized)
    }
  })
  for (const item of list) {
    const sourceId = (item.sourceId || '').trim()
    const sourceUrl = (item.sourceUrl || '').trim()
    if (!sourceId || !sourceUrl) continue

    const last = sourceMap.get(sourceId)
    const currentLastRefreshAt = item.sourceLastRefreshAt || ''
    if (!last) {
      sourceMap.set(sourceId, {
        sourceId,
        sourceUrl,
        sourceNamePrefix: (item.sourceNamePrefix || '').trim(),
        sourceGroupName: (item.groupName || '').trim(),
        sourceDnsServers: (item.dnsServers || '').trim(),
        sourceFilterJson: (item.sourceFilterJson || '').trim(),
        sourceAutoRefresh: !!item.sourceAutoRefresh,
        sourceRefreshIntervalM: normalizeRefreshIntervalM(Number(item.sourceRefreshIntervalM || 0)),
        sourceLastRefreshAt: currentLastRefreshAt,
        proxyCount: 1,
      })
      continue
    }

    last.proxyCount += 1
    last.sourceUrl = sourceUrl
    last.sourceNamePrefix = (item.sourceNamePrefix || '').trim()
    last.sourceGroupName = (item.groupName || '').trim()
    last.sourceDnsServers = (item.dnsServers || '').trim()
    last.sourceAutoRefresh = !!item.sourceAutoRefresh
    last.sourceRefreshIntervalM = normalizeRefreshIntervalM(Number(item.sourceRefreshIntervalM || 0))
    if (
      parseTimestampMs(currentLastRefreshAt) > parseTimestampMs(last.sourceLastRefreshAt) &&
      currentLastRefreshAt.trim()
    ) {
      last.sourceLastRefreshAt = currentLastRefreshAt
    }
    if (!last.sourceFilterJson && (item.sourceFilterJson || '').trim()) {
      last.sourceFilterJson = (item.sourceFilterJson || '').trim()
    }
  }
  return Array.from(sourceMap.values())
}
