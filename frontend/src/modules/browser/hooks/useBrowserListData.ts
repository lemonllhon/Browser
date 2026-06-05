import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { BrowserCore, BrowserGroupWithCount, BrowserProfile, BrowserProxy } from '../types'
import { fetchBrowserCores, fetchBrowserProfiles, fetchBrowserProxies, fetchGroups } from '../api'

type PendingIdSetter = Dispatch<SetStateAction<Set<string>>>

type LoadProfilesOptions = {
  silent?: boolean
  syncRuntimeState?: boolean
}

type UseBrowserListDataInput = {
  setStartingIds: PendingIdSetter
  setStoppingIds: PendingIdSetter
}

const updatePendingIds = (
  setter: PendingIdSetter,
  profileId: string,
  active: boolean
) => {
  setter(prev => {
    const next = new Set(prev)
    if (active) {
      next.add(profileId)
    } else {
      next.delete(profileId)
    }
    return next
  })
}

export function useBrowserListData({ setStartingIds, setStoppingIds }: UseBrowserListDataInput) {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [proxies, setProxies] = useState<BrowserProxy[]>([])
  const [groups, setGroups] = useState<BrowserGroupWithCount[]>([])
  const [cores, setCores] = useState<BrowserCore[]>([])
  const profilesRef = useRef<BrowserProfile[]>([])
  const silentRefreshInFlightRef = useRef(false)

  const replaceProfilesState = useCallback((items: BrowserProfile[]) => {
    profilesRef.current = items
    setProfiles(items)
  }, [])

  const updateProfilesState = useCallback((updater: (items: BrowserProfile[]) => BrowserProfile[]) => {
    const next = updater(profilesRef.current)
    profilesRef.current = next
    setProfiles(next)
  }, [])

  const mergeProfileState = useCallback((profile: BrowserProfile | null | undefined) => {
    if (!profile) return
    updateProfilesState(prev => prev.map(item => (
      item.profileId === profile.profileId ? { ...item, ...profile } : item
    )))
  }, [updateProfilesState])

  const syncProfiles = useCallback((items: BrowserProfile[], syncRuntimeState: boolean) => {
    if (syncRuntimeState) {
      const previousById = new Map(profilesRef.current.map(item => [item.profileId, item]))
      const newlyRunning = items.find(item => item.running && !previousById.get(item.profileId)?.running)
      if (newlyRunning) {
        updatePendingIds(setStartingIds, newlyRunning.profileId, false)
        updatePendingIds(setStoppingIds, newlyRunning.profileId, false)
      }
      items.forEach(item => {
        if (!item.running && previousById.get(item.profileId)?.running) {
          updatePendingIds(setStartingIds, item.profileId, false)
          updatePendingIds(setStoppingIds, item.profileId, false)
        }
      })
    }
    replaceProfilesState(items)
  }, [replaceProfilesState, setStartingIds, setStoppingIds])

  const loadProfiles = useCallback(async ({ silent = false, syncRuntimeState = false }: LoadProfilesOptions = {}) => {
    if (silent && silentRefreshInFlightRef.current) {
      return profilesRef.current
    }
    if (!silent) {
      setLoading(true)
    } else {
      silentRefreshInFlightRef.current = true
    }
    try {
      const items = await fetchBrowserProfiles()
      syncProfiles(items, syncRuntimeState)
      return items
    } finally {
      if (silent) {
        silentRefreshInFlightRef.current = false
      } else {
        setLoading(false)
      }
    }
  }, [syncProfiles])

  const loadGroups = useCallback(async () => {
    setGroups(await fetchGroups())
  }, [])

  const loadCores = useCallback(async () => {
    setCores(await fetchBrowserCores())
  }, [])

  const loadProxies = useCallback(async () => {
    setProxies(await fetchBrowserProxies())
  }, [])

  useEffect(() => {
    void loadProfiles()
    void loadGroups()
    void loadProxies()
    void loadCores()
  }, [loadCores, loadGroups, loadProfiles, loadProxies])

  return {
    profiles,
    loading,
    proxies,
    groups,
    cores,
    setCores,
    updateProfilesState,
    mergeProfileState,
    loadProfiles,
    loadGroups,
    loadCores,
    loadProxies,
  }
}
