export type ProxyPoolColumnOption = {
  key: string
  label: string
  locked?: boolean
}

export const PROXY_COLUMNS_STORAGE_KEY = 'browser:proxyPoolColumns:v1'
export const DEFAULT_PROXY_COLUMN_KEYS = ['checkbox', 'proxyName', 'type', 'server', 'port', 'latency', 'ipHealth', 'actions']

export const PROXY_COLUMN_OPTIONS: ProxyPoolColumnOption[] = [
  { key: 'checkbox', label: '选择', locked: true },
  { key: 'proxyName', label: '代理名称' },
  { key: 'groupName', label: '分组' },
  { key: 'source', label: '来源' },
  { key: 'type', label: '类型' },
  { key: 'server', label: '服务器' },
  { key: 'port', label: '端口' },
  { key: 'latency', label: '延迟' },
  { key: 'ipHealth', label: 'IP健康' },
  { key: 'actions', label: '操作', locked: true },
]

export function getLockedProxyColumnKeys() {
  return PROXY_COLUMN_OPTIONS.filter(item => item.locked).map(item => item.key)
}

export function normalizeProxyColumnKeys(keys: string[]) {
  const allowed = new Set(PROXY_COLUMN_OPTIONS.map(item => item.key))
  const valid = keys.filter((key): key is string => typeof key === 'string' && allowed.has(key))
  if (valid.length === 0) {
    return DEFAULT_PROXY_COLUMN_KEYS
  }
  return Array.from(new Set([...getLockedProxyColumnKeys(), ...valid]))
}

export function readStoredProxyColumnKeys() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROXY_COLUMNS_STORAGE_KEY) || '[]')
    if (Array.isArray(parsed)) {
      return normalizeProxyColumnKeys(parsed)
    }
  } catch { /* ignore */ }
  return DEFAULT_PROXY_COLUMN_KEYS
}

export function writeStoredProxyColumnKeys(keys: string[]) {
  localStorage.setItem(PROXY_COLUMNS_STORAGE_KEY, JSON.stringify(normalizeProxyColumnKeys(keys)))
}
