const PROXY_GLOBAL_AUTO_REFRESH_KEY = 'browser:proxyPool:globalAutoRefreshEnabled:v1'
const PROXY_GLOBAL_REFRESH_INTERVAL_KEY = 'browser:proxyPool:globalRefreshIntervalM:v1'

export function parseTimestampMs(value: string): number {
  const v = (value || '').trim()
  if (!v) return 0
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : 0
}

export function normalizeRefreshIntervalM(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value < 5) return 5
  if (value > 24 * 60) return 24 * 60
  return Math.round(value)
}

export function readGlobalRefreshConfig(): { enabled: boolean; intervalM: number } {
  try {
    const rawEnabled = localStorage.getItem(PROXY_GLOBAL_AUTO_REFRESH_KEY)
    const rawInterval = localStorage.getItem(PROXY_GLOBAL_REFRESH_INTERVAL_KEY)
    const enabled = rawEnabled === '1'
    const interval = normalizeRefreshIntervalM(Number(rawInterval || 0))
    return {
      enabled,
      intervalM: interval > 0 ? interval : 60,
    }
  } catch {
    return { enabled: false, intervalM: 60 }
  }
}

export function writeGlobalRefreshConfig(enabled: boolean, intervalM: number) {
  try {
    localStorage.setItem(PROXY_GLOBAL_AUTO_REFRESH_KEY, enabled ? '1' : '0')
    localStorage.setItem(PROXY_GLOBAL_REFRESH_INTERVAL_KEY, String(intervalM))
  } catch {
    // ignore write failures
  }
}
