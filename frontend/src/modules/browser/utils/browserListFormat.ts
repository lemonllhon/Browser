import type { BrowserProfile } from '../types'

export const naturalCompareText = (a: string, b: string): number => {
  const re = /(\d+)|(\D+)/g
  const partsA = a.match(re) || []
  const partsB = b.match(re) || []
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    if (i >= partsA.length) return -1
    if (i >= partsB.length) return 1
    const pa = partsA[i], pb = partsB[i]
    const na = Number(pa), nb = Number(pb)
    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb
    } else {
      const cmp = pa.localeCompare(pb, 'zh-CN')
      if (cmp !== 0) return cmp
    }
  }
  return 0
}

export const resolveProfileStatus = (running: boolean, debugReady: boolean, starting: boolean, stopping: boolean) => {
  if (starting) {
    return { variant: 'info' as const, label: '启动中' }
  }
  if (stopping) {
    return { variant: 'default' as const, label: '停止中' }
  }
  if (running && !debugReady) {
    return { variant: 'info' as const, label: '运行中（待就绪）' }
  }
  if (running) {
    return { variant: 'success' as const, label: '运行中' }
  }
  return { variant: 'warning' as const, label: '已停止' }
}

export const formatInstanceMarkerLabel = (profile: BrowserProfile) => {
  const index = Number(profile.instanceMarkerIndex || 0)
  if (index > 0) {
    return `#${String(index).padStart(2, '0')}`
  }
  const match = String(profile.instanceMarker || '').match(/#(\d{1,3})/)
  return match ? `#${match[1].padStart(2, '0')}` : '-'
}

export const formatTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN')
}

export const sanitizeFilenamePart = (value: string) => {
  const safe = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return (safe || 'profile').slice(0, 80)
}

export const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const getCookieActionTitle = (profile: BrowserProfile, action: 'export' | 'clear') => {
  if (action === 'export') {
    if (!profile.running) return '实例启动后才能导出 Cookie'
    if (!profile.debugReady) return '调试接口就绪后才能导出 Cookie'
    return '导出 Cookie 文本'
  }
  if (!profile.running) return '清空用户数据目录'
  if (!profile.debugReady) return '调试接口就绪后才能清空 Cookie'
  return '清空全部 Cookie'
}

export const normalizeWindowSyncColor = (value?: string) => {
  const raw = (value || '').trim()
  if (!raw) return '#2563eb'
  const color = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase()
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color.toLowerCase()
  }
  return null
}
