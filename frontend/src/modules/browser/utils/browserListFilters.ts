import type { InstanceFilters } from '../components/InstanceFilterBar'
import type { BrowserCore, BrowserProfile } from '../types'
import { naturalCompareText } from './browserListFormat'

export const resolveBrowserProfileCore = (
  profile: BrowserProfile,
  cores: BrowserCore[],
  defaultCore: BrowserCore | null,
) => {
  const coreId = (profile.coreId || '').trim()
  if (coreId && !/^default$/i.test(coreId)) {
    return cores.find(core => core.coreId === coreId) || null
  }
  return defaultCore
}

export const getBrowserProfileCoreLabel = (
  profile: BrowserProfile,
  cores: BrowserCore[],
  defaultCore: BrowserCore | null,
) => {
  const resolvedCore = resolveBrowserProfileCore(profile, cores, defaultCore)
  if (resolvedCore) {
    return resolvedCore.coreName
  }

  const coreId = (profile.coreId || '').trim()
  if (!coreId || /^default$/i.test(coreId)) {
    return '使用默认内核'
  }
  return coreId
}

interface FilterAndSortBrowserProfilesOptions {
  profiles: BrowserProfile[]
  filters: InstanceFilters
  profileOrder: string[]
  cores: BrowserCore[]
  defaultCore: BrowserCore | null
}

export const filterAndSortBrowserProfiles = ({
  profiles,
  filters,
  profileOrder,
  cores,
  defaultCore,
}: FilterAndSortBrowserProfilesOptions) => {
  const profileOrderIndex = new Map(profileOrder.map((profileId, index) => [profileId, index]))
  const keyword = filters.keyword.toLowerCase()
  const keywordSearch = filters.kwSearch.toLowerCase()

  return profiles.filter(profile => {
    if (filters.groupId === '__ungrouped__' && profile.groupId) return false
    if (filters.groupId && filters.groupId !== '__ungrouped__' && profile.groupId !== filters.groupId) return false

    if (keyword && !profile.profileName.toLowerCase().includes(keyword)) return false
    if (filters.status === 'running' && !profile.running) return false
    if (filters.status === 'stopped' && profile.running) return false
    if (filters.proxyId === '__none__' && (profile.proxyId || profile.proxyConfig)) return false
    if (filters.proxyId && filters.proxyId !== '__none__' && profile.proxyId !== filters.proxyId) return false
    if (filters.coreId) {
      const effectiveCore = resolveBrowserProfileCore(profile, cores, defaultCore)
      if (!effectiveCore || effectiveCore.coreId !== filters.coreId) return false
    }
    if (filters.tags.size > 0 && !profile.tags?.some(tag => filters.tags.has(tag))) return false
    if (keywordSearch) {
      const hit = profile.keywords?.some(value => value.toLowerCase().includes(keywordSearch))
      if (!hit) return false
    }
    return true
  }).sort((left, right) => {
    const orderLeft = profileOrderIndex.get(left.profileId)
    const orderRight = profileOrderIndex.get(right.profileId)
    if (orderLeft !== undefined || orderRight !== undefined) {
      if (orderLeft === undefined) return 1
      if (orderRight === undefined) return -1
      if (orderLeft !== orderRight) return orderLeft - orderRight
    }
    return naturalCompareText(left.profileName, right.profileName)
  })
}
