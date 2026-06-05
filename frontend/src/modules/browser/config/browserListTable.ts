export type BrowserProfileColumnOption = {
  key: string
  label: string
  locked?: boolean
}

export const PROFILE_COLUMN_OPTIONS: BrowserProfileColumnOption[] = [
  { key: 'selection', label: '选择', locked: true },
  { key: 'instanceMarkerIndex', label: '窗口标识' },
  { key: 'profileName', label: '实例名称' },
  { key: 'running', label: '状态' },
  { key: 'coreId', label: '核心' },
  { key: 'proxyId', label: '代理' },
  { key: 'launchCode', label: '快捷打开码' },
  { key: 'keywords', label: '关键字' },
  { key: 'updatedAt', label: '上次更新' },
  { key: 'actions', label: '操作', locked: true },
]

export const DEFAULT_PROFILE_COLUMN_KEYS = ['selection', 'instanceMarkerIndex', 'profileName', 'running', 'coreId', 'proxyId', 'launchCode', 'actions']
export const PROFILE_COLUMNS_STORAGE_KEY = 'browser:profileTableColumns:v2'
export const PROFILE_ORDER_STORAGE_KEY = 'browser:profileOrder:v1'
export const PROFILE_ORDER_CHANNEL_NAME = 'browser:profileOrder:changed'

export function getLockedProfileColumnKeys() {
  return PROFILE_COLUMN_OPTIONS.filter(item => item.locked).map(item => item.key)
}

export function readStoredProfileColumnKeys() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_COLUMNS_STORAGE_KEY) || '[]')
    if (Array.isArray(parsed)) {
      const allowedKeys = PROFILE_COLUMN_OPTIONS.map(item => item.key)
      const valid = parsed.filter((key): key is string => typeof key === 'string' && allowedKeys.includes(key))
      if (valid.length > 0) return valid
    }
  } catch { /* ignore */ }
  return DEFAULT_PROFILE_COLUMN_KEYS
}

export function normalizeProfileColumnKeys(keys: string[]) {
  return Array.from(new Set([...getLockedProfileColumnKeys(), ...keys]))
}

export function writeStoredProfileColumnKeys(keys: string[]) {
  localStorage.setItem(PROFILE_COLUMNS_STORAGE_KEY, JSON.stringify(normalizeProfileColumnKeys(keys)))
}

export function sanitizeProfileOrder(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0)))
}

export function parseProfileOrderValue(value: string | null) {
  try {
    return sanitizeProfileOrder(JSON.parse(value || '[]'))
  } catch {
    return []
  }
}

export function readStoredProfileOrder() {
  return parseProfileOrderValue(localStorage.getItem(PROFILE_ORDER_STORAGE_KEY))
}

export function writeStoredProfileOrder(profileOrder: string[]) {
  localStorage.setItem(PROFILE_ORDER_STORAGE_KEY, JSON.stringify(profileOrder))
}

export const areStringArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}
