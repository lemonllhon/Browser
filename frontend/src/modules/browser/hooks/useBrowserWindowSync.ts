import { useState } from 'react'
import type { WindowSyncCandidate, WindowSyncLayoutSettings, WindowSyncSettings, WindowSyncState } from '../types'
import {
  applyWindowSyncLayout,
  defaultWindowSyncLayoutSettings,
  defaultWindowSyncSettings,
  listWindowSyncCandidates,
  saveWindowSyncLayoutSettings,
  saveWindowSyncSettings,
  startWindowSync,
  stopWindowSync,
} from '../api'
import { toast } from '../../../shared/components'
import { normalizeWindowSyncColor } from '../utils/browserListFormat'

type UseBrowserWindowSyncInput = {
  selectedIds: Set<string>
}

const isSelectableWindowSyncCandidate = (candidate: WindowSyncCandidate) => candidate.canSync || !!candidate.canAutoStart

export function useBrowserWindowSync({ selectedIds }: UseBrowserWindowSyncInput) {
  const [windowSyncModalOpen, setWindowSyncModalOpen] = useState(false)
  const [windowSyncCandidates, setWindowSyncCandidates] = useState<WindowSyncCandidate[]>([])
  const [windowSyncSelectedIds, setWindowSyncSelectedIds] = useState<Set<string>>(new Set())
  const [windowSyncMasterId, setWindowSyncMasterId] = useState('')
  const [windowSyncState, setWindowSyncState] = useState<WindowSyncState | null>(null)
  const [windowSyncLoading, setWindowSyncLoading] = useState(false)
  const [windowSyncLayoutModalOpen, setWindowSyncLayoutModalOpen] = useState(false)
  const [windowSyncLayout, setWindowSyncLayout] = useState<WindowSyncLayoutSettings>(() => defaultWindowSyncLayoutSettings())
  const [windowSyncSettingsModalOpen, setWindowSyncSettingsModalOpen] = useState(false)
  const [windowSyncSettings, setWindowSyncSettings] = useState<WindowSyncSettings>(() => defaultWindowSyncSettings())

  const loadWindowSyncCandidates = async () => {
    setWindowSyncLoading(true)
    try {
      const items = await listWindowSyncCandidates()
      setWindowSyncCandidates(items)
      const selectableIds = new Set(items.filter(isSelectableWindowSyncCandidate).map(item => item.profileId))
      setWindowSyncSelectedIds(prev => {
        const next = new Set(Array.from(prev).filter(id => selectableIds.has(id)))
        if (next.size === 0) {
          const selectedSelectable = Array.from(selectedIds).filter(id => selectableIds.has(id))
          selectedSelectable.forEach(id => next.add(id))
        }
        return next
      })
      setWindowSyncMasterId(prev => {
        if (prev && selectableIds.has(prev)) return prev
        const activeMaster = items.find(item => item.master && item.canSync)?.profileId
        if (activeMaster) return activeMaster
        const selectedSelectable = Array.from(selectedIds).find(id => selectableIds.has(id))
        if (selectedSelectable) return selectedSelectable
        return items.find(isSelectableWindowSyncCandidate)?.profileId || ''
      })
    } finally {
      setWindowSyncLoading(false)
    }
  }

  const handleOpenWindowSyncModal = async () => {
    setWindowSyncModalOpen(true)
    await loadWindowSyncCandidates()
  }

  const toggleWindowSyncCandidate = (profileId: string) => {
    const candidate = windowSyncCandidates.find(item => item.profileId === profileId)
    if (!candidate || !isSelectableWindowSyncCandidate(candidate)) return
    setWindowSyncSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(profileId)) {
        next.delete(profileId)
        if (windowSyncMasterId === profileId) {
          setWindowSyncMasterId(Array.from(next)[0] || '')
        }
      } else {
        next.add(profileId)
        if (!windowSyncMasterId) {
          setWindowSyncMasterId(profileId)
        }
      }
      return next
    })
  }

  const selectAllWindowSyncCandidates = () => {
    if (windowSyncState?.active) return
    const selectable = windowSyncCandidates.filter(isSelectableWindowSyncCandidate)
    const nextIds = new Set(selectable.map(candidate => candidate.profileId))
    setWindowSyncSelectedIds(nextIds)
    setWindowSyncMasterId(prev => (prev && nextIds.has(prev) ? prev : selectable[0]?.profileId || ''))
  }

  const clearWindowSyncCandidates = () => {
    if (windowSyncState?.active) return
    setWindowSyncSelectedIds(new Set())
    setWindowSyncMasterId('')
  }

  const handleStartWindowSync = async () => {
    const profileIds = Array.from(windowSyncSelectedIds)
    if (profileIds.length < 2) {
      toast.error('至少选择 2 个窗口')
      return
    }
    if (!windowSyncMasterId || !windowSyncSelectedIds.has(windowSyncMasterId)) {
      toast.error('请选择一个已选窗口作为主控窗口')
      return
    }
    setWindowSyncLoading(true)
    try {
      const state = await startWindowSync({ profileIds, masterProfileId: windowSyncMasterId })
      setWindowSyncState(state?.active ? state : null)
      if (state?.layout) {
        setWindowSyncLayout(state.layout)
      }
      if (state?.active) {
        setWindowSyncSettings({
          masterColor: state.masterColor || '#2563eb',
          syncKeyboard: state.syncKeyboard !== false,
          syncMouse: state.syncMouse !== false,
        })
      }
      setWindowSyncModalOpen(false)
      toast.success('窗口同步已创建，未运行实例已自动启动并加入同步')
    } catch (error: any) {
      toast.error(error?.message || '开始窗口同步失败')
    } finally {
      setWindowSyncLoading(false)
    }
  }

  const handleStopWindowSync = async () => {
    setWindowSyncLoading(true)
    try {
      await stopWindowSync()
      setWindowSyncState(null)
      toast.success('窗口同步已停止')
    } catch (error: any) {
      toast.error(error?.message || '停止窗口同步失败')
    } finally {
      setWindowSyncLoading(false)
    }
  }

  const updateWindowSyncLayout = (patch: Partial<WindowSyncLayoutSettings>) => {
    setWindowSyncLayout(prev => ({ ...prev, ...patch }))
  }

  const updateWindowSyncSettings = (patch: Partial<WindowSyncSettings>) => {
    setWindowSyncSettings(prev => ({ ...prev, ...patch }))
  }

  const handleApplyWindowSyncLayout = async (settings?: WindowSyncLayoutSettings) => {
    const nextSettings = settings || windowSyncLayout
    setWindowSyncLoading(true)
    try {
      await saveWindowSyncLayoutSettings(nextSettings)
      const state = await applyWindowSyncLayout(nextSettings)
      if (state?.active) {
        setWindowSyncState(state)
        if (state.layout) {
          setWindowSyncLayout(state.layout)
        }
      } else {
        setWindowSyncLayout(nextSettings)
      }
      toast.success('窗口布局已应用')
    } catch (error: any) {
      toast.error(error?.message || '应用窗口布局失败')
    } finally {
      setWindowSyncLoading(false)
    }
  }

  const handleSaveWindowSyncSettings = async () => {
    const masterColor = normalizeWindowSyncColor(windowSyncSettings.masterColor)
    if (!masterColor) {
      toast.error('主控窗口颜色格式应为 #RGB 或 #RRGGBB')
      return
    }
    setWindowSyncLoading(true)
    try {
      const state = await saveWindowSyncSettings({ ...windowSyncSettings, masterColor })
      if (state?.active) {
        setWindowSyncState(state)
        setWindowSyncSettings({
          masterColor: state.masterColor || '#2563eb',
          syncKeyboard: state.syncKeyboard !== false,
          syncMouse: state.syncMouse !== false,
        })
      }
      setWindowSyncSettingsModalOpen(false)
      toast.success('同步基础设置已保存')
    } catch (error: any) {
      toast.error(error?.message || '保存同步基础设置失败')
    } finally {
      setWindowSyncLoading(false)
    }
  }

  return {
    windowSyncModalOpen,
    windowSyncCandidates,
    windowSyncSelectedIds,
    windowSyncMasterId,
    windowSyncState,
    windowSyncLoading,
    windowSyncLayoutModalOpen,
    windowSyncLayout,
    windowSyncSettingsModalOpen,
    windowSyncSettings,
    setWindowSyncModalOpen,
    setWindowSyncMasterId,
    setWindowSyncState,
    setWindowSyncLayoutModalOpen,
    setWindowSyncLayout,
    setWindowSyncSettingsModalOpen,
    setWindowSyncSettings,
    loadWindowSyncCandidates,
    handleOpenWindowSyncModal,
    toggleWindowSyncCandidate,
    selectAllWindowSyncCandidates,
    clearWindowSyncCandidates,
    handleStartWindowSync,
    handleStopWindowSync,
    updateWindowSyncLayout,
    updateWindowSyncSettings,
    handleApplyWindowSyncLayout,
    handleSaveWindowSyncSettings,
  }
}
