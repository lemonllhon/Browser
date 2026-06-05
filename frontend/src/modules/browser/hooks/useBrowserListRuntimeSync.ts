import { useEffect } from 'react'
import { onRuntimeEvent } from '../../../shared/backend/runtime'
import { getWindowSyncLayoutSettings, getWindowSyncSettings, getWindowSyncState, onWindowSyncStateChanged } from '../api'
import type { WindowSyncLayoutSettings, WindowSyncSettings, WindowSyncState } from '../types'

interface UseBrowserListRuntimeSyncOptions {
  loadProfiles: (options?: { silent?: boolean; syncRuntimeState?: boolean }) => Promise<unknown>
  loadGroups: () => Promise<void>
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
  setStartingIds,
  setStoppingIds,
  setWindowSyncState,
  setWindowSyncSettings,
  setWindowSyncLayout,
}: UseBrowserListRuntimeSyncOptions) {
  useEffect(() => {
    const refreshProfiles = () => {
      void loadProfiles({ silent: true, syncRuntimeState: true })
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
    const offGroupsUpdated = onRuntimeEvent('browser:groups:updated', () => { void loadGroups() })
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
      void loadGroups()
    }, 2000)

    return () => {
      window.clearInterval(timer)
      offStarted?.()
      offUpdated?.()
      offProfilesUpdated?.()
      offGroupsUpdated?.()
      offStopped?.()
      offCrashed?.()
      offWindowSyncChanged?.()
    }
  }, [])
}
