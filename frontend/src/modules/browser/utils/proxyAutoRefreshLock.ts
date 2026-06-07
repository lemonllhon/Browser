const PROXY_AUTO_REFRESH_LOCK_KEY = 'browser:proxyPool:autoRefreshLock:v1'

interface ProxyAutoRefreshLock {
  ownerId: string
  expiresAt: number
}

function readLock(): ProxyAutoRefreshLock | null {
  try {
    const raw = localStorage.getItem(PROXY_AUTO_REFRESH_LOCK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ProxyAutoRefreshLock>
    const ownerId = typeof parsed.ownerId === 'string' ? parsed.ownerId.trim() : ''
    const expiresAt = Number(parsed.expiresAt || 0)
    if (!ownerId || !Number.isFinite(expiresAt)) return null
    return { ownerId, expiresAt }
  } catch {
    return null
  }
}

export function createProxyAutoRefreshOwnerId() {
  return `proxy-auto-refresh-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function acquireProxyAutoRefreshLock(ownerId: string, ttlMs = 10 * 60 * 1000): boolean {
  const owner = ownerId.trim()
  if (!owner) return false
  const now = Date.now()
  try {
    const current = readLock()
    if (current && current.ownerId !== owner && current.expiresAt > now) {
      return false
    }
    const next: ProxyAutoRefreshLock = { ownerId: owner, expiresAt: now + ttlMs }
    localStorage.setItem(PROXY_AUTO_REFRESH_LOCK_KEY, JSON.stringify(next))
    return readLock()?.ownerId === owner
  } catch {
    return true
  }
}

export function releaseProxyAutoRefreshLock(ownerId: string) {
  const owner = ownerId.trim()
  if (!owner) return
  try {
    const current = readLock()
    if (current?.ownerId === owner) {
      localStorage.removeItem(PROXY_AUTO_REFRESH_LOCK_KEY)
    }
  } catch {
    // ignore lock cleanup failures
  }
}
