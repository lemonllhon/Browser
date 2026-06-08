import { useEffect, useSyncExternalStore } from 'react'
import type {
  BrowserCore,
  BrowserExtension,
  BrowserGroupWithCount,
  BrowserProfile,
  BrowserProxy,
  BrowserSettings,
  DefaultContentRule,
} from '../types'
import {
  fetchAllTags,
  fetchBrowserCores,
  fetchBrowserProfiles,
  fetchBrowserProxies,
  fetchBrowserProxyGroups,
  fetchBrowserSettings,
  fetchDefaultContentRules,
  fetchGroups,
  fetchBrowserExtensions,
} from '../api'
import { getDataVersions, listAppLogs, type ProtoAppDataVersions, type ProtoAppLogEntry, type ProtoAppRuntimeEventPayload } from '../../../shared/backend/client'
import { onRuntimeEvent } from '../../../shared/backend/runtime'

export type BrowserSharedDataDomain =
  | 'profiles'
  | 'groups'
  | 'tags'
  | 'defaults'
  | 'cores'
  | 'proxies'
  | 'proxyGroups'
  | 'extensions'
  | 'settings'
  | 'logs'

type LoadingMap = Record<BrowserSharedDataDomain, boolean>
type LoadedMap = Record<BrowserSharedDataDomain, boolean>

export type BrowserSharedDataState = {
  profiles: BrowserProfile[]
  groups: BrowserGroupWithCount[]
  tags: string[]
  defaultContentRules: DefaultContentRule[]
  cores: BrowserCore[]
  proxies: BrowserProxy[]
  proxyGroups: string[]
  extensions: BrowserExtension[]
  browserSettings: BrowserSettings
  logs: ProtoAppLogEntry[]
  versions: ProtoAppDataVersions
  loading: LoadingMap
  loaded: LoadedMap
  lastUpdatedAt: number
}

const BROADCAST_CHANNEL_NAME = 'trace-browser-data'
const EVENT_REFRESH_DELAY_MS = 120

const ALL_DOMAINS: BrowserSharedDataDomain[] = [
  'profiles',
  'groups',
  'tags',
  'defaults',
  'cores',
  'proxies',
  'proxyGroups',
  'extensions',
  'settings',
  'logs',
]

const defaultVersions = (): ProtoAppDataVersions => ({
  timestampMs: 0,
  profilesVersion: 0,
  groupsVersion: 0,
  proxiesVersion: 0,
  coresVersion: 0,
  extensionsVersion: 0,
  defaultsVersion: 0,
  settingsVersion: 0,
  cookiesVersion: 0,
  snapshotsVersion: 0,
  logsVersion: 0,
})

const defaultBrowserSettings = (): BrowserSettings => ({
  userDataRoot: '',
  defaultFingerprintArgs: [],
  defaultLaunchArgs: [],
  defaultProxy: '',
  startReadyTimeoutMs: 3000,
  startStableWindowMs: 1200,
})

const defaultLoadingMap = (): LoadingMap => ({
  profiles: false,
  groups: false,
  tags: false,
  defaults: false,
  cores: false,
  proxies: false,
  proxyGroups: false,
  extensions: false,
  settings: false,
  logs: false,
})

const defaultLoadedMap = (): LoadedMap => ({
  profiles: false,
  groups: false,
  tags: false,
  defaults: false,
  cores: false,
  proxies: false,
  proxyGroups: false,
  extensions: false,
  settings: false,
  logs: false,
})

let state: BrowserSharedDataState = {
  profiles: [],
  groups: [],
  tags: [],
  defaultContentRules: [],
  cores: [],
  proxies: [],
  proxyGroups: [],
  extensions: [],
  browserSettings: defaultBrowserSettings(),
  logs: [],
  versions: defaultVersions(),
  loading: defaultLoadingMap(),
  loaded: defaultLoadedMap(),
  lastUpdatedAt: 0,
}

const listeners = new Set<() => void>()
const refreshInFlight: Partial<Record<BrowserSharedDataDomain, Promise<void>>> = {}
const refreshTimers: Partial<Record<BrowserSharedDataDomain, number>> = {}
let initialized = false
let broadcastChannel: BroadcastChannel | null = null

function emitChange() {
  listeners.forEach(listener => listener())
}

function patchState(patch: Partial<BrowserSharedDataState>) {
  state = {
    ...state,
    ...patch,
    lastUpdatedAt: Date.now(),
  }
  emitChange()
}

function patchLoading(domain: BrowserSharedDataDomain, value: boolean) {
  patchState({
    loading: {
      ...state.loading,
      [domain]: value,
    },
  })
}

function markLoaded(domain: BrowserSharedDataDomain) {
  state = {
    ...state,
    loaded: {
      ...state.loaded,
      [domain]: true,
    },
    lastUpdatedAt: Date.now(),
  }
}

function normalizeDomains(domains: BrowserSharedDataDomain[]): BrowserSharedDataDomain[] {
  return Array.from(new Set(domains)).filter(domain => ALL_DOMAINS.includes(domain))
}

function domainsForEvent(eventName: string): BrowserSharedDataDomain[] {
  switch (eventName) {
    case 'browser:profiles:updated':
    case 'browser:instance:started':
    case 'browser:instance:updated':
    case 'browser:instance:stopped':
    case 'browser:instance:crashed':
      return ['profiles', 'tags']
    case 'browser:groups:updated':
      return ['groups']
    case 'browser:defaults:updated':
      return ['defaults', 'tags', 'groups']
    case 'browser:cores:updated':
      return ['cores']
    case 'browser:proxies:updated':
      return ['proxies', 'proxyGroups']
    case 'browser:extensions:updated':
      return ['extensions']
    case 'browser:settings:updated':
      return ['settings']
    case 'browser:logs:updated':
      return ['logs']
    default:
      return []
  }
}

function domainsForVersionDelta(next: ProtoAppDataVersions): BrowserSharedDataDomain[] {
  const current = state.versions
  const domains: BrowserSharedDataDomain[] = []
  if (next.profilesVersion > current.profilesVersion) domains.push('profiles', 'tags')
  if (next.groupsVersion > current.groupsVersion) domains.push('groups')
  if (next.defaultsVersion > current.defaultsVersion) domains.push('defaults')
  if (next.coresVersion > current.coresVersion) domains.push('cores')
  if (next.proxiesVersion > current.proxiesVersion) domains.push('proxies', 'proxyGroups')
  if (next.extensionsVersion > current.extensionsVersion) domains.push('extensions')
  if (next.settingsVersion > current.settingsVersion) domains.push('settings')
  if (next.logsVersion > current.logsVersion) domains.push('logs')
  return normalizeDomains(domains)
}

function versionsFromEvent(payload: ProtoAppRuntimeEventPayload | undefined): Partial<ProtoAppDataVersions> {
  if (!payload) return {}
  return {
    profilesVersion: payload.profilesVersion ?? state.versions.profilesVersion,
    groupsVersion: payload.groupsVersion ?? state.versions.groupsVersion,
    proxiesVersion: payload.proxiesVersion ?? state.versions.proxiesVersion,
    coresVersion: payload.coresVersion ?? state.versions.coresVersion,
    extensionsVersion: payload.extensionsVersion ?? state.versions.extensionsVersion,
    defaultsVersion: payload.defaultsVersion ?? state.versions.defaultsVersion,
    settingsVersion: payload.settingsVersion ?? state.versions.settingsVersion,
    cookiesVersion: payload.cookiesVersion ?? state.versions.cookiesVersion,
    snapshotsVersion: payload.snapshotsVersion ?? state.versions.snapshotsVersion,
    logsVersion: payload.logsVersion ?? state.versions.logsVersion,
  }
}

function applyEventVersions(payload: ProtoAppRuntimeEventPayload | undefined) {
  if (!payload) return
  const patch = versionsFromEvent(payload)
  state = {
    ...state,
    versions: {
      ...state.versions,
      ...patch,
      timestampMs: Date.now(),
    },
    lastUpdatedAt: Date.now(),
  }
  emitChange()
}

function scheduleDomainsRefresh(domains: BrowserSharedDataDomain[]) {
  if (document.visibilityState !== 'visible') {
    return
  }
  normalizeDomains(domains).forEach(domain => {
    const existingTimer = refreshTimers[domain]
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer)
    }
    refreshTimers[domain] = window.setTimeout(() => {
      delete refreshTimers[domain]
      void refreshBrowserSharedData([domain], { silent: true })
    }, EVENT_REFRESH_DELAY_MS)
  })
}

function maybeBroadcast(eventName: string, payload: ProtoAppRuntimeEventPayload | undefined) {
  if (!broadcastChannel) return
  try {
    broadcastChannel.postMessage({
      type: 'runtime-event',
      eventName,
      payload,
      sentAt: Date.now(),
    })
  } catch {
    // BroadcastChannel is a best-effort cross-window fallback.
  }
}

function handleSharedRuntimeEvent(eventName: string, payload?: ProtoAppRuntimeEventPayload, fromBroadcast = false) {
  applyEventVersions(payload)
  const domains = domainsForEvent(eventName)
  if (domains.length > 0) {
    scheduleDomainsRefresh(domains)
  }
  if (!fromBroadcast) {
    maybeBroadcast(eventName, payload)
  }
}

async function refreshDomain(domain: BrowserSharedDataDomain, silent: boolean): Promise<void> {
  if (refreshInFlight[domain]) {
    return refreshInFlight[domain]
  }
  const task = (async () => {
    if (!silent) patchLoading(domain, true)
    try {
      switch (domain) {
        case 'profiles':
          patchState({ profiles: await fetchBrowserProfiles() })
          break
        case 'groups':
          patchState({ groups: await fetchGroups() })
          break
        case 'tags':
          patchState({ tags: await fetchAllTags() })
          break
        case 'defaults':
          patchState({ defaultContentRules: await fetchDefaultContentRules() })
          break
        case 'cores':
          patchState({ cores: await fetchBrowserCores() })
          break
        case 'proxies':
          patchState({ proxies: await fetchBrowserProxies() })
          break
        case 'proxyGroups':
          patchState({ proxyGroups: await fetchBrowserProxyGroups() })
          break
        case 'extensions':
          patchState({ extensions: await fetchBrowserExtensions() })
          break
        case 'settings':
          patchState({ browserSettings: await fetchBrowserSettings() })
          break
        case 'logs':
          patchState({ logs: await listAppLogs() })
          break
      }
      markLoaded(domain)
      emitChange()
    } finally {
      if (!silent) patchLoading(domain, false)
    }
  })()
  refreshInFlight[domain] = task
  try {
    return await task
  } finally {
    if (refreshInFlight[domain] === task) {
      delete refreshInFlight[domain]
    }
  }
}

export function getBrowserSharedDataSnapshot(): BrowserSharedDataState {
  return state
}

export function subscribeBrowserSharedData(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function initializeBrowserSharedDataStore() {
  if (initialized) return
  initialized = true

  const events = [
    'browser:profiles:updated',
    'browser:groups:updated',
    'browser:defaults:updated',
    'browser:cores:updated',
    'browser:proxies:updated',
    'browser:extensions:updated',
    'browser:settings:updated',
    'browser:logs:updated',
    'browser:instance:started',
    'browser:instance:updated',
    'browser:instance:stopped',
    'browser:instance:crashed',
  ]
  events.forEach(eventName => {
    onRuntimeEvent<ProtoAppRuntimeEventPayload>(eventName, payload => {
      handleSharedRuntimeEvent(eventName, payload)
    })
  })

  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    broadcastChannel.onmessage = event => {
      const data = event.data as { type?: string; eventName?: string; payload?: ProtoAppRuntimeEventPayload }
      if (data?.type === 'runtime-event' && data.eventName) {
        handleSharedRuntimeEvent(data.eventName, data.payload, true)
      }
    }
  }

  const syncStaleData = () => {
    if (document.visibilityState !== 'visible') return
    void syncBrowserSharedDataVersions()
  }
  document.addEventListener('visibilitychange', syncStaleData)
  window.addEventListener('focus', syncStaleData)
  void syncBrowserSharedDataVersions()
}

export async function syncBrowserSharedDataVersions() {
  const nextVersions = await getDataVersions()
  const staleDomains = domainsForVersionDelta(nextVersions)
  patchState({ versions: nextVersions })
  if (staleDomains.length > 0) {
    await refreshBrowserSharedData(staleDomains, { silent: true })
  }
}

export async function refreshBrowserSharedData(
  domains: BrowserSharedDataDomain[],
  options: { silent?: boolean } = {}
) {
  initializeBrowserSharedDataStore()
  await Promise.all(normalizeDomains(domains).map(domain => refreshDomain(domain, options.silent !== false)))
  return getBrowserSharedDataSnapshot()
}

export async function ensureBrowserSharedData(domains: BrowserSharedDataDomain[]) {
  initializeBrowserSharedDataStore()
  const missing = normalizeDomains(domains).filter(domain => !state.loaded[domain])
  if (missing.length > 0) {
    await refreshBrowserSharedData(missing, { silent: false })
  }
}

export function useBrowserSharedData(domains: BrowserSharedDataDomain[] = ALL_DOMAINS) {
  const snapshot = useSyncExternalStore(
    subscribeBrowserSharedData,
    getBrowserSharedDataSnapshot,
    getBrowserSharedDataSnapshot,
  )

  useEffect(() => {
    initializeBrowserSharedDataStore()
    void ensureBrowserSharedData(domains)
  }, [domains.join('|')])

  return snapshot
}
