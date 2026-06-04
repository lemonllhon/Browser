import yaml from 'js-yaml'
import type { BrowserProxy } from '../types'
import type { ClashProxy } from './clashProxyImport'
import type { ImportCandidate } from './directProxyImport'

export const BUILTIN_PROXY_IDS = new Set(['__direct__', '__local__'])

const BUILTIN_PROXIES: BrowserProxy[] = [
  { proxyId: '__direct__', proxyName: '直连（不走代理）', proxyConfig: 'direct://' },
  { proxyId: '__local__', proxyName: '本地代理', proxyConfig: 'http://127.0.0.1:7890' },
]

export interface ProxyDisplayInfo {
  proxyId: string
  proxyName: string
  proxyConfig: string
  groupName: string
  sourceId: string
  sourceUrl: string
  sourceFilterJson: string
  sourceAutoRefresh: boolean
  sourceRefreshIntervalM: number
  sourceLastRefreshAt: string
  type: string
  server: string
  port: number
  latencyMs?: number
}

export function isBuiltinProxy(proxy: Pick<BrowserProxy, 'proxyId' | 'proxyConfig'>): boolean {
  return BUILTIN_PROXY_IDS.has(proxy.proxyId) || proxy.proxyConfig.trim() === 'direct://'
}

export function ensureBuiltinProxies(proxies: BrowserProxy[]): BrowserProxy[] {
  const result = [...proxies]
  for (const builtin of BUILTIN_PROXIES) {
    if (!result.find(p => p.proxyId === builtin.proxyId)) {
      result.unshift(builtin)
    }
  }
  return result
}

export function parseProxyInfo(proxyConfig: string): { type: string; server: string; port: number } {
  const cfg = proxyConfig.trim()
  if (cfg === 'direct://') return { type: 'direct', server: '-', port: 0 }
  const urlMatch = cfg.match(/^([a-zA-Z0-9+\-]+):\/\//)
  if (urlMatch) {
    const scheme = urlMatch[1].toLowerCase()
    try {
      const u = new URL(cfg)
      return { type: scheme, server: u.hostname, port: parseInt(u.port) || 0 }
    } catch {
      return { type: scheme, server: '-', port: 0 }
    }
  }
  try {
    const parsed = yaml.load(cfg) as ClashProxy[] | ClashProxy
    const proxy = Array.isArray(parsed) ? parsed[0] : parsed
    return { type: proxy?.type || '-', server: proxy?.server || '-', port: proxy?.port || 0 }
  } catch {
    return { type: '-', server: '-', port: 0 }
  }
}

export function toDisplayList(proxies: BrowserProxy[]): ProxyDisplayInfo[] {
  return proxies.map(p => {
    const info = parseProxyInfo(p.proxyConfig)
    return {
      proxyId: p.proxyId,
      proxyName: p.proxyName,
      proxyConfig: p.proxyConfig,
      groupName: p.groupName || '',
      sourceId: p.sourceId || '',
      sourceUrl: p.sourceUrl || '',
      sourceFilterJson: p.sourceFilterJson || '',
      sourceAutoRefresh: !!p.sourceAutoRefresh,
      sourceRefreshIntervalM: Math.max(0, Number(p.sourceRefreshIntervalM || 0)),
      sourceLastRefreshAt: p.sourceLastRefreshAt || '',
      ...info,
    }
  })
}

export function buildImportPreview(candidates: ImportCandidate[], groupName: string): ProxyDisplayInfo[] {
  return candidates.map((candidate, index) => {
    const info = parseProxyInfo(candidate.proxyConfig)
    return {
      proxyId: `preview-${index}`,
      proxyName: candidate.proxyName,
      proxyConfig: candidate.proxyConfig,
      groupName,
      sourceId: '',
      sourceUrl: '',
      sourceFilterJson: '',
      sourceAutoRefresh: false,
      sourceRefreshIntervalM: 0,
      sourceLastRefreshAt: '',
      type: info.type || '-',
      server: info.server || '-',
      port: info.port || 0,
    }
  })
}
