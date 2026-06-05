import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { GripVertical } from 'lucide-react'
import type { BrowserProfile } from '../types'
import { naturalCompareText } from '../utils/browserListFormat'
import {
  PROFILE_ORDER_CHANNEL_NAME,
  PROFILE_ORDER_STORAGE_KEY,
  areStringArraysEqual,
  parseProfileOrderValue,
  readStoredProfileOrder,
  sanitizeProfileOrder,
  writeStoredProfileOrder,
} from '../config/browserListTable'

type ProfileDragLayout = 'table' | 'card'
type ProfileDragPlacement = 'before' | 'after'

const getProfileDragPlacement = (event: DragEvent<HTMLElement>, layout: ProfileDragLayout): ProfileDragPlacement => {
  const rect = event.currentTarget.getBoundingClientRect()
  if (layout === 'card' && rect.width > rect.height) {
    const verticalDistance = Math.abs(event.clientY - (rect.top + rect.height / 2))
    if (verticalDistance < rect.height * 0.35) {
      return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before'
    }
  }
  return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
}

type UseBrowserProfileOrderDnDInput = {
  profiles: BrowserProfile[]
}

export function useBrowserProfileOrderDnD({ profiles }: UseBrowserProfileOrderDnDInput) {
  const [profileOrder, setProfileOrder] = useState<string[]>(readStoredProfileOrder)
  const [draggingProfileId, setDraggingProfileId] = useState<string | null>(null)
  const [dragOverProfileId, setDragOverProfileId] = useState<string | null>(null)
  const [dragOverPlacement, setDragOverPlacement] = useState<ProfileDragPlacement>('before')
  const profileOrderChannelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    writeStoredProfileOrder(profileOrder)
    profileOrderChannelRef.current?.postMessage(profileOrder)
  }, [profileOrder])

  useEffect(() => {
    const applyExternalProfileOrder = (nextOrder: string[]) => {
      setProfileOrder(prev => areStringArraysEqual(prev, nextOrder) ? prev : nextOrder)
    }

    let channel: BroadcastChannel | null = null
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(PROFILE_ORDER_CHANNEL_NAME)
      profileOrderChannelRef.current = channel
      channel.onmessage = (event) => {
        applyExternalProfileOrder(sanitizeProfileOrder(event.data))
      }
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PROFILE_ORDER_STORAGE_KEY) return
      applyExternalProfileOrder(parseProfileOrderValue(event.newValue))
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('storage', handleStorage)
      channel?.close()
      if (profileOrderChannelRef.current === channel) {
        profileOrderChannelRef.current = null
      }
    }
  }, [])

  const reconcileProfileOrder = useCallback((items: BrowserProfile[]) => {
    setProfileOrder(prev => {
      const existingIds = new Set(items.map(item => item.profileId))
      const keptIds = prev.filter(id => existingIds.has(id))
      const keptSet = new Set(keptIds)
      const appendedIds = items
        .filter(item => !keptSet.has(item.profileId))
        .sort((a, b) => naturalCompareText(a.profileName, b.profileName))
        .map(item => item.profileId)
      const next = [...keptIds, ...appendedIds]
      return areStringArraysEqual(prev, next) ? prev : next
    })
  }, [])

  useEffect(() => {
    reconcileProfileOrder(profiles)
  }, [profiles, reconcileProfileOrder])

  const reorderProfileOrder = useCallback((sourceId: string, targetId: string, placement: ProfileDragPlacement, visibleProfiles: BrowserProfile[]) => {
    if (sourceId === targetId) return
    const visibleIds = visibleProfiles.map(item => item.profileId)
    if (!visibleIds.includes(sourceId) || !visibleIds.includes(targetId)) return

    const visibleWithoutSource = visibleIds.filter(id => id !== sourceId)
    const targetIndex = visibleWithoutSource.indexOf(targetId)
    if (targetIndex < 0) return

    const insertIndex = placement === 'after' ? targetIndex + 1 : targetIndex
    const nextVisibleIds = [
      ...visibleWithoutSource.slice(0, insertIndex),
      sourceId,
      ...visibleWithoutSource.slice(insertIndex),
    ]
    const visibleSet = new Set(nextVisibleIds)

    setProfileOrder(prev => {
      const currentIds = profiles.map(item => item.profileId)
      const currentIdSet = new Set(currentIds)
      const prevSet = new Set(prev)
      const appendedIds = profiles
        .filter(item => !prevSet.has(item.profileId))
        .sort((a, b) => naturalCompareText(a.profileName, b.profileName))
        .map(item => item.profileId)
      const fullOrder = [
        ...prev.filter(id => currentIdSet.has(id)),
        ...appendedIds,
      ]

      let visibleIndex = 0
      const next = fullOrder.map(id => {
        if (!visibleSet.has(id)) return id
        return nextVisibleIds[visibleIndex++]
      })
      return areStringArraysEqual(prev, next) ? prev : next
    })
  }, [profiles])

  const handleProfileDragStart = useCallback((event: DragEvent<HTMLElement>, profileId: string) => {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-trace-profile-id', profileId)
    event.dataTransfer.setData('text/plain', profileId)
    setDraggingProfileId(profileId)
    setDragOverProfileId(null)
  }, [])

  const handleProfileDragOver = useCallback((event: DragEvent<HTMLElement>, targetId: string, layout: ProfileDragLayout) => {
    if (!draggingProfileId || draggingProfileId === targetId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const placement = getProfileDragPlacement(event, layout)
    setDragOverProfileId(prev => prev === targetId ? prev : targetId)
    setDragOverPlacement(prev => prev === placement ? prev : placement)
  }, [draggingProfileId])

  const handleProfileDragLeave = useCallback((event: DragEvent<HTMLElement>, targetId: string) => {
    const relatedTarget = event.relatedTarget as Node | null
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) return
    setDragOverProfileId(prev => prev === targetId ? null : prev)
  }, [])

  const handleProfileDragEnd = useCallback(() => {
    setDraggingProfileId(null)
    setDragOverProfileId(null)
  }, [])

  const handleProfileDrop = useCallback((event: DragEvent<HTMLElement>, targetId: string, layout: ProfileDragLayout, visibleProfiles: BrowserProfile[]) => {
    event.preventDefault()
    const sourceId = event.dataTransfer.getData('application/x-trace-profile-id') || event.dataTransfer.getData('text/plain') || draggingProfileId
    if (sourceId) {
      reorderProfileOrder(sourceId, targetId, getProfileDragPlacement(event, layout), visibleProfiles)
    }
    handleProfileDragEnd()
  }, [draggingProfileId, handleProfileDragEnd, reorderProfileOrder])

  const getProfileDragClassName = useCallback((profileId: string) => {
    const classes: string[] = []
    if (draggingProfileId === profileId) {
      classes.push('opacity-60')
    }
    if (dragOverProfileId === profileId) {
      classes.push('bg-[var(--color-accent)]/5')
      classes.push(dragOverPlacement === 'before' ? 'shadow-[inset_0_3px_0_var(--color-accent)]' : 'shadow-[inset_0_-3px_0_var(--color-accent)]')
    }
    return classes.join(' ')
  }, [dragOverPlacement, dragOverProfileId, draggingProfileId])

  const renderProfileDragHandle = useCallback((record: BrowserProfile) => (
    <button
      type="button"
      draggable
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] cursor-grab active:cursor-grabbing"
      title="拖动排序"
      aria-label={`拖动排序 ${record.profileName}`}
      onDragStart={(event) => handleProfileDragStart(event, record.profileId)}
      onDragEnd={handleProfileDragEnd}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  ), [handleProfileDragEnd, handleProfileDragStart])

  return {
    profileOrder,
    handleProfileDragOver,
    handleProfileDragLeave,
    handleProfileDrop,
    getProfileDragClassName,
    renderProfileDragHandle,
  }
}
