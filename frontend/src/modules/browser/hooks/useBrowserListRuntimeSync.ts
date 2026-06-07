import { useEffect } from 'react'
import { onRuntimeEvent } from '../../../shared/backend/runtime'
import { getWindowSyncLayoutSettings, getWindowSyncSettings, getWindowSyncState, onWindowSyncStateChanged } from '../api'
import type { WindowSyncLayoutSettings, WindowSyncSettings, WindowSyncState } from '../types'

interface UseBrowserListRuntimeSyncOptions {
  loadProfiles: (options?: { silent?: boolean; syncRuntimeState?: boolean }) => Promise<unknown>
  loadGroups: () => Promise<void>
  loadProxies: () => Promise<void>
  loadCores: () => Promise<void>
  setStartingIds: (updater: (prev: Set<string>) => Set<string>) => void
  setStoppingIds: (updater: (prev: Set<string>) => Set<string>) => void
  setWindowSyncState: (state: WindowSyncState | null) => void
  setWindowSyncSettings: (settings: WindowSyncSettings) => void
  setWindowSyncLayout: (layout: WindowSyncLayoutSettings) => void
}

function updatePendingId(
  setter: (updater: (prev: Set<string>) => Set<string>) => void,
  profileId: string,
  active: boolean
) {
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

function resolveRuntimeProfileID(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object') {
    const profileId = (payload as { profileId?: unknown }).profileId
    return typeof profileId === 'string' ? profileId : ''
  }
  return ''
}

function syncWindowStateToSettings(
  state: WindowSyncState | null | undefined,
  setWindowSyncState: (state: WindowSyncState | null) => void,
  setWindowSyncSettings: (settings: WindowSyncSettings) => void,
  setWindowSyncLayout?: (layout: WindowSyncLayoutSettings) => void
) {
  setWindowSyncState(state?.active ? state : null)
  if (state?.layout && setWindowSyncLayout) {
    setWindowSyncLayout(state.layout)
  }
  if (state?.active) {
    setWindowSyncSettings({
      masterColor: state.masterColor || '#2563eb',
      syncKeyboard: state.syncKeyboard !== false,
      syncMouse: state.syncMouse !== false,
    })
  }
}

export function useBrowserListRuntimeSync({
  loadProfiles,
  loadGroups,
  loadProxies,
  loadCores,
  setStartingIds,
  setStoppingIds,
  setWindowSyncState,
  setWindowSyncSettings,
  setWindowSyncLayout,
}: UseBrowserListRuntimeSyncOptions) {
  useEffect(() => {
    let profileRefreshInFlight = false
    let groupRefreshInFlight = false
    let proxyRefreshInFlight = false
    let coreRefreshInFlight = false
    const refreshProfiles = () => {
      if (profileRefreshInFlight) return
      profileRefreshInFlight = true
      try {
        void loadProfiles({ silent: true, syncRuntimeState: true })
          .catch(() => undefined)
          .finally(() => {
            profileRefreshInFlight = false
          })
      } catch {
        profileRefreshInFlight = false
      }
    }
    const refreshGroups = () => {
      if (groupRefreshInFlight) return
      groupRefreshInFlight = true
      try {
        void loadGroups()
          .catch(() => undefined)
          .finally(() => {
            groupRefreshInFlight = false
          })
      } catch {
        groupRefreshInFlight = false
      }
    }
    const refreshProxies = () => {
      if (proxyRefreshInFlight) return
      proxyRefreshInFlight = true
      try {
        void loadProxies()
          .catch(() => undefined)
          .finally(() => {
            proxyRefreshInFlight = false
          })
      } catch {
        proxyRefreshInFlight = false
      }
    }
    const refreshCores = () => {
      if (coreRefreshInFlight) return
      coreRefreshInFlight = true
      try {
        void loadCores()
          .catch(() => undefined)
          .finally(() => {
            coreRefreshInFlight = false
          })
      } catch {
        coreRefreshInFlight = false
      }
    }
    const clearPendingAndRefresh = (payload: unknown) => {
      const profileId = resolveRuntimeProfileID(payload)
      if (profileId) {
        updatePendingId(setStartingIds, profileId, false)
        updatePendingId(setStoppingIds, profileId, false)
      }
      refreshProfiles()
    }

    const offStarted = onRuntimeEvent('browser:instance:started', clearPendingAndRefresh)
    const offUpdated = onRuntimeEvent('browser:instance:updated', refreshProfiles)
    const offProfilesUpdated = onRuntimeEvent('browser:profiles:updated', refreshProfiles)
    const offGroupsUpdated = onRuntimeEvent('browser:groups:updated', refreshGroups)
    const offProxiesUpdated = onRuntimeEvent('browser:proxies:updated', refreshProxies)
    const offCoresUpdated = onRuntimeEvent('browser:cores:updated', refreshCores)
    const offStopped = onRuntimeEvent('browser:instance:stopped', clearPendingAndRefresh)
    const offCrashed = onRuntimeEvent('browser:instance:crashed', clearPendingAndRefresh)
    const offWindowSyncChanged = onWindowSyncStateChanged(state => {
      syncWindowStateToSettings(state, setWindowSyncState, setWindowSyncSettings)
    })

    void getWindowSyncState().then(state => {
      syncWindowStateToSettings(state, setWindowSyncState, setWindowSyncSettings, setWindowSyncLayout)
    })
    void getWindowSyncLayoutSettings().then(setWindowSyncLayout)
    void getWindowSyncSettings().then(setWindowSyncSettings)

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      refreshProfiles()
      refreshGroups()
    }, 3000)

    return () => {
      window.clearInterval(timer)
      offStarted?.()
      offUpdated?.()
      offProfilesUpdated?.()
      offGroupsUpdated?.()
      offProxiesUpdated?.()
      offCoresUpdated?.()
      offStopped?.()
      offCrashed?.()
      offWindowSyncChanged?.()
    }
  }, [])
}
