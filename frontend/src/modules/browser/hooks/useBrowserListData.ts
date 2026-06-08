import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { BrowserCore, BrowserGroupWithCount, BrowserProfile, BrowserProxy } from '../types'
import { getBrowserSharedDataSnapshot, refreshBrowserSharedData, useBrowserSharedData } from '../stores/browserSharedDataStore'

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
  const sharedData = useBrowserSharedData(['profiles', 'groups', 'proxies', 'cores'])

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
      await refreshBrowserSharedData(['profiles', 'tags'], { silent })
      const items = getBrowserSharedDataSnapshot().profiles
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
    await refreshBrowserSharedData(['groups'])
    setGroups(getBrowserSharedDataSnapshot().groups)
  }, [])

  const loadCores = useCallback(async () => {
    await refreshBrowserSharedData(['cores'])
    setCores(getBrowserSharedDataSnapshot().cores)
  }, [])

  const loadProxies = useCallback(async () => {
    await refreshBrowserSharedData(['proxies'])
    setProxies(getBrowserSharedDataSnapshot().proxies)
  }, [])

  useEffect(() => {
    void loadProfiles()
    void loadGroups()
    void loadProxies()
    void loadCores()
  }, [loadCores, loadGroups, loadProfiles, loadProxies])

  useEffect(() => {
    if (sharedData.loaded.profiles) {
      syncProfiles(sharedData.profiles, true)
    }
  }, [sharedData.loaded.profiles, sharedData.profiles, syncProfiles])

  useEffect(() => {
    if (sharedData.loaded.groups) {
      setGroups(sharedData.groups)
    }
  }, [sharedData.loaded.groups, sharedData.groups])

  useEffect(() => {
    if (sharedData.loaded.proxies) {
      setProxies(sharedData.proxies)
    }
  }, [sharedData.loaded.proxies, sharedData.proxies])

  useEffect(() => {
    if (sharedData.loaded.cores) {
      setCores(sharedData.cores)
    }
  }, [sharedData.loaded.cores, sharedData.cores])

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
