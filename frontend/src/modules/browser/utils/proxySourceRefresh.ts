import type { BrowserProxy } from '../types'
import type { ClashProxy } from './clashProxyImport'
import { proxyToYaml } from './clashProxyImport'
import type { ImportCandidate } from './directProxyImport'
import type { URLImportSourceMeta } from './proxySourceMeta'

const PROXY_SOURCE_IGNORED_NAMES_KEY = 'browser:proxyPool:sourceIgnoredProxyNames:v1'

export function nextProxyID(): string {
  return `proxy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function resolveImportedProxyName(proxy: ClashProxy, index: number, prefix: string): string {
  const rawName = (proxy.name || '').trim() || `导入代理 ${index + 1}`
  return prefix ? `${prefix}-${rawName}` : rawName
}

export function buildImportCandidatesFromClash(parsedProxies: ClashProxy[], prefix: string): ImportCandidate[] {
  return parsedProxies.map((proxy, index) => ({
    proxyName: resolveImportedProxyName(proxy, index, prefix),
    proxyConfig: proxyToYaml(proxy),
  }))
}

export function createExistingProxyIDPicker(oldSourceProxies: BrowserProxy[]) {
  const exactMap = new Map<string, BrowserProxy[]>()
  const nameMap = new Map<string, BrowserProxy[]>()
  oldSourceProxies.forEach(item => {
    const exactKey = `${item.proxyName}|||${item.proxyConfig}`
    const exactList = exactMap.get(exactKey) || []
    exactList.push(item)
    exactMap.set(exactKey, exactList)

    const nameKey = item.proxyName
    const nameList = nameMap.get(nameKey) || []
    nameList.push(item)
    nameMap.set(nameKey, nameList)
  })

  return (name: string, configText: string): string | null => {
    const exactKey = `${name}|||${configText}`
    const exactList = exactMap.get(exactKey)
    if (exactList && exactList.length > 0) {
      const item = exactList.shift()
      if (item?.proxyId) return item.proxyId
    }

    const nameList = nameMap.get(name)
    if (nameList && nameList.length > 0) {
      const item = nameList.shift()
      if (item?.proxyId) return item.proxyId
    }
    return null
  }
}

export function buildRefreshedSourceProxies(
  parsedProxies: ClashProxy[],
  oldSourceProxies: BrowserProxy[],
  meta: URLImportSourceMeta,
  refreshedAt: string
): BrowserProxy[] {
  const pickExisting = createExistingProxyIDPicker(oldSourceProxies)

  const prefix = meta.sourceNamePrefix.trim()
  const sourceGroupName = meta.sourceGroupName.trim()
  const sourceDnsServers = meta.sourceDnsServers.trim()
  const refreshed: BrowserProxy[] = []

  parsedProxies.forEach((proxy, idx) => {
    const proxyName = resolveImportedProxyName(proxy, idx, prefix)
    const proxyConfig = proxyToYaml(proxy)
    const proxyId = pickExisting(proxyName, proxyConfig) || nextProxyID()

    refreshed.push({
      proxyId,
      proxyName,
      proxyConfig,
      dnsServers: sourceDnsServers || undefined,
      groupName: sourceGroupName || undefined,
      sourceId: meta.sourceId,
      sourceUrl: meta.sourceUrl,
      sourceNamePrefix: prefix || undefined,
      sourceFilterJson: meta.sourceFilterJson || undefined,
      sourceAutoRefresh: meta.sourceAutoRefresh,
      sourceRefreshIntervalM: meta.sourceRefreshIntervalM,
      sourceLastRefreshAt: refreshedAt,
    })
  })

  return refreshed
}

export function renameSourceProxyName(proxyName: string, oldPrefix: string, newPrefix: string): string {
  const currentName = proxyName.trim()
  const old = oldPrefix.trim()
  const next = newPrefix.trim()
  const baseName = old && currentName.startsWith(`${old}-`)
    ? currentName.slice(old.length + 1)
    : currentName
  return next ? `${next}-${baseName}` : baseName
}

export function readSourceIgnoredProxyNames(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(PROXY_SOURCE_IGNORED_NAMES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const cleaned: Record<string, string[]> = {}
    Object.entries(parsed as Record<string, unknown>).forEach(([sourceId, value]) => {
      if (!sourceId.trim() || !Array.isArray(value)) return
      const names = value
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
      if (names.length > 0) {
        cleaned[sourceId] = names
      }
    })
    return cleaned
  } catch {
    return {}
  }
}

function writeSourceIgnoredProxyNames(data: Record<string, string[]>) {
  try {
    const cleaned: Record<string, string[]> = {}
    Object.entries(data).forEach(([sourceId, names]) => {
      const key = sourceId.trim()
      if (!key || !Array.isArray(names)) return
      const validNames = names.map(name => (name || '').trim()).filter(Boolean)
      if (validNames.length > 0) {
        cleaned[key] = validNames
      }
    })
    localStorage.setItem(PROXY_SOURCE_IGNORED_NAMES_KEY, JSON.stringify(cleaned))
  } catch {
    // ignore write failures
  }
}

export function appendSourceIgnoredProxyNames(sourceId: string, names: string[]) {
  const sourceKey = sourceId.trim()
  if (!sourceKey || names.length === 0) return
  const cleaned = names.map(name => name.trim()).filter(Boolean)
  if (cleaned.length === 0) return

  const existing = readSourceIgnoredProxyNames()
  existing[sourceKey] = [...(existing[sourceKey] || []), ...cleaned]
  writeSourceIgnoredProxyNames(existing)
}

export function applyIgnoredProxyNamesForSource(
  parsedProxies: ClashProxy[],
  sourceNamePrefix: string,
  ignoredProxyNames: string[]
): ClashProxy[] {
  if (ignoredProxyNames.length === 0) return parsedProxies
  const ignoredCounter = new Map<string, number>()
  ignoredProxyNames.forEach(name => {
    const key = name.trim()
    if (!key) return
    ignoredCounter.set(key, (ignoredCounter.get(key) || 0) + 1)
  })
  if (ignoredCounter.size === 0) return parsedProxies

  return parsedProxies.filter((proxy, idx) => {
    const proxyName = resolveImportedProxyName(proxy, idx, sourceNamePrefix)
    const count = ignoredCounter.get(proxyName) || 0
    if (count <= 0) return true
    if (count === 1) {
      ignoredCounter.delete(proxyName)
    } else {
      ignoredCounter.set(proxyName, count - 1)
    }
    return false
  })
}
