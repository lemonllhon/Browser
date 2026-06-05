import { useEffect, useState } from 'react'
import { EMPTY_FILTERS } from '../components/InstanceFilterBar'
import type { InstanceFilters } from '../components/InstanceFilterBar'
import {
  PROFILE_COLUMN_OPTIONS,
  normalizeProfileColumnKeys,
  readStoredProfileColumnKeys,
  writeStoredProfileColumnKeys,
} from '../config/browserListTable'

type BrowserListViewMode = 'card' | 'table'

const FILTERS_STORAGE_KEY = 'browser:filters'
const VIEW_MODE_STORAGE_KEY = 'browser:viewMode'
const HEADER_COLLAPSED_STORAGE_KEY = 'browser:headerCollapsed'

const readStoredFilters = (): InstanceFilters => {
  try {
    const saved = localStorage.getItem(FILTERS_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return { ...EMPTY_FILTERS, ...parsed, tags: new Set(parsed.tags || []) }
    }
  } catch { /* ignore */ }
  return EMPTY_FILTERS
}

export function useBrowserListViewState() {
  const [viewMode, setViewMode] = useState<BrowserListViewMode>(() => {
    return (localStorage.getItem(VIEW_MODE_STORAGE_KEY) as BrowserListViewMode) || 'table'
  })
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => normalizeProfileColumnKeys(readStoredProfileColumnKeys()))
  const [filters, setFilters] = useState<InstanceFilters>(readStoredFilters)
  const [headerCollapsed, setHeaderCollapsed] = useState(() => {
    return localStorage.getItem(HEADER_COLLAPSED_STORAGE_KEY) === 'true'
  })

  useEffect(() => {
    const serializable = { ...filters, tags: Array.from(filters.tags) }
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(serializable))
  }, [filters])

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    writeStoredProfileColumnKeys(visibleColumnKeys)
  }, [visibleColumnKeys])

  useEffect(() => {
    localStorage.setItem(HEADER_COLLAPSED_STORAGE_KEY, String(headerCollapsed))
  }, [headerCollapsed])

  const toggleVisibleColumn = (key: string) => {
    const option = PROFILE_COLUMN_OPTIONS.find(item => item.key === key)
    if (option?.locked) return
    setVisibleColumnKeys(prev => {
      const next = prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
      return normalizeProfileColumnKeys(next)
    })
  }

  const toggleHeaderCollapsed = () => {
    setHeaderCollapsed(prev => !prev)
  }

  return {
    viewMode,
    setViewMode,
    visibleColumnKeys,
    filters,
    setFilters,
    headerCollapsed,
    toggleHeaderCollapsed,
    toggleVisibleColumn,
  }
}
