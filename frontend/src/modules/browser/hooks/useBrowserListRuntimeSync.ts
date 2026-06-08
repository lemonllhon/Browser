import { useEffect } from 'react'
import { onRuntimeEvent } from '../../../shared/backend/runtime'
import { beginTracePerformanceMetric, incrementTracePerformanceCounter } from '../../../shared/performance/tracePerformance'
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

type RefreshChannel = 'profiles' | 'groups' | 'proxies' | 'cores'

const EVENT_REFRESH_DEBOUNCE_MS = 200
const RUNTIME_REFRESH_DEBOUNCE_MS = 120
const VISIBLE_POLL_INTERVAL_MS = 15000
const VISIBILITY_RESUME_REFRESH_MS = 50

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
    let disposed = false
    let lastRuntimeEventAt = Date.now()
    const refreshInFlight: Record<RefreshChannel, boolean> = {
      profiles: false,
      groups: false,
      proxies: false,
      cores: false,
    }
    const refreshDirty: Record<RefreshChannel, boolean> = {
      profiles: false,
      groups: false,
      proxies: false,
      cores: false,
    }
    const refreshTimers: Partial<Record<RefreshChannel, number>> = {}

    const isVisible = () => document.visibilityState === 'visible'

    const runRefresh = (channel: RefreshChannel, reason: string) => {
      if (disposed) return
      if (!isVisible()) {
        refreshDirty[channel] = true
        incrementTracePerformanceCounter(`browserList.refresh.${channel}.deferred`)
        return
      }
      if (refreshInFlight[channel]) {
        refreshDirty[channel] = true
        incrementTracePerformanceCounter(`browserList.refresh.${channel}.coalesced`)
        return
      }

      refreshDirty[channel] = false
      refreshInFlight[channel] = true
      const finishMetric = beginTracePerformanceMetric(`browserList.refresh.${channel}`, {
        reason,
        visible: true,
      })
      let success = true
      let refreshPromise: Promise<unknown>
      try {
        const refreshResult = channel === 'profiles'
          ? loadProfiles({ silent: true, syncRuntimeState: true })
          : channel === 'groups'
            ? loadGroups()
            : channel === 'proxies'
              ? loadProxies()
              : loadCores()
        refreshPromise = Promise.resolve(refreshResult)
      } catch {
        refreshInFlight[channel] = false
        finishMetric({ success: false, synchronous: true })
        return
      }

      void refreshPromise
        .catch(() => {
          success = false
        })
        .finally(() => {
          refreshInFlight[channel] = false
          finishMetric({ success })
          if (!disposed && refreshDirty[channel] && isVisible()) {
            scheduleRefresh(channel, 'pending', EVENT_REFRESH_DEBOUNCE_MS)
          }
        })
    }

    const scheduleRefresh = (channel: RefreshChannel, reason: string, delayMs = EVENT_REFRESH_DEBOUNCE_MS) => {
      refreshDirty[channel] = true
      incrementTracePerformanceCounter(`browserList.refresh.${channel}.scheduled`)
      if (!isVisible()) {
        incrementTracePerformanceCounter(`browserList.refresh.${channel}.deferred`)
        return
      }
      const existingTimer = refreshTimers[channel]
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer)
      }
      refreshTimers[channel] = window.setTimeout(() => {
        delete refreshTimers[channel]
        runRefresh(channel, reason)
      }, delayMs)
    }

    const trackRuntimeEvent = (eventName: string) => {
      lastRuntimeEventAt = Date.now()
      incrementTracePerformanceCounter(`browserList.event.${eventName}`)
    }

    const clearPendingAndRefresh = (eventName: string) => (payload: unknown) => {
      trackRuntimeEvent(eventName)
      const profileId = resolveRuntimeProfileID(payload)
      if (profileId) {
        updatePendingId(setStartingIds, profileId, false)
        updatePendingId(setStoppingIds, profileId, false)
      }
      scheduleRefresh('profiles', 'runtime-event', RUNTIME_REFRESH_DEBOUNCE_MS)
    }

    const offStarted = onRuntimeEvent('browser:instance:started', clearPendingAndRefresh('browser:instance:started'))
    const offUpdated = onRuntimeEvent('browser:instance:updated', () => {
      trackRuntimeEvent('browser:instance:updated')
      scheduleRefresh('profiles', 'instance-updated', RUNTIME_REFRESH_DEBOUNCE_MS)
    })
    const offProfilesUpdated = onRuntimeEvent('browser:profiles:updated', () => {
      trackRuntimeEvent('browser:profiles:updated')
      scheduleRefresh('profiles', 'profiles-updated')
    })
    const offGroupsUpdated = onRuntimeEvent('browser:groups:updated', () => {
      trackRuntimeEvent('browser:groups:updated')
      scheduleRefresh('groups', 'groups-updated')
    })
    const offProxiesUpdated = onRuntimeEvent('browser:proxies:updated', () => {
      trackRuntimeEvent('browser:proxies:updated')
      scheduleRefresh('proxies', 'proxies-updated')
    })
    const offCoresUpdated = onRuntimeEvent('browser:cores:updated', () => {
      trackRuntimeEvent('browser:cores:updated')
      scheduleRefresh('cores', 'cores-updated')
    })
    const offStopped = onRuntimeEvent('browser:instance:stopped', clearPendingAndRefresh('browser:instance:stopped'))
    const offCrashed = onRuntimeEvent('browser:instance:crashed', clearPendingAndRefresh('browser:instance:crashed'))
    const offWindowSyncChanged = onWindowSyncStateChanged(state => {
      trackRuntimeEvent('window-sync:state-changed')
      syncWindowStateToSettings(state, setWindowSyncState, setWindowSyncSettings)
    })

    void getWindowSyncState().then(state => {
      syncWindowStateToSettings(state, setWindowSyncState, setWindowSyncSettings, setWindowSyncLayout)
    })
    void getWindowSyncLayoutSettings().then(setWindowSyncLayout)
    void getWindowSyncSettings().then(setWindowSyncSettings)

    const timer = window.setInterval(() => {
      if (!isVisible()) return
      if (Date.now() - lastRuntimeEventAt < VISIBLE_POLL_INTERVAL_MS) return
      scheduleRefresh('profiles', 'visible-poll')
      scheduleRefresh('groups', 'visible-poll')
    }, VISIBLE_POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (!isVisible()) return
      scheduleRefresh('profiles', 'visibility-resume', VISIBILITY_RESUME_REFRESH_MS)
      scheduleRefresh('groups', 'visibility-resume', VISIBILITY_RESUME_REFRESH_MS)
      if (refreshDirty.proxies) {
        scheduleRefresh('proxies', 'visibility-resume', VISIBILITY_RESUME_REFRESH_MS)
      }
      if (refreshDirty.cores) {
        scheduleRefresh('cores', 'visibility-resume', VISIBILITY_RESUME_REFRESH_MS)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      disposed = true
      window.clearInterval(timer)
      Object.values(refreshTimers).forEach(timerId => {
        if (timerId !== undefined) {
          window.clearTimeout(timerId)
        }
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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
