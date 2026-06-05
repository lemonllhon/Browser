import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from '../../../shared/components'
import type { BrowserProfile } from '../types'
import { copyBrowserProfile, deleteBrowserProfile, startBrowserInstance, stopBrowserInstance } from '../api'
import { resolveActionFeedback } from '../utils/actionErrors'

type PendingIdSetter = Dispatch<SetStateAction<Set<string>>>

type CopyModalState = {
  open: boolean
  profile: BrowserProfile | null
}

type UseBrowserProfileBatchActionsInput = {
  profiles: BrowserProfile[]
  filteredProfiles: BrowserProfile[]
  selectedIds: Set<string>
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  setStartingIds: PendingIdSetter
  setStoppingIds: PendingIdSetter
  mergeProfileState: (profile: BrowserProfile | null | undefined) => void
  loadProfiles: () => Promise<BrowserProfile[] | void>
  setOpError: (message: string) => void
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

export function useBrowserProfileBatchActions({
  profiles,
  filteredProfiles,
  selectedIds,
  setSelectedIds,
  setStartingIds,
  setStoppingIds,
  mergeProfileState,
  loadProfiles,
  setOpError,
}: UseBrowserProfileBatchActionsInput) {
  const [batchLoading, setBatchLoading] = useState(false)
  const [copyModal, setCopyModal] = useState<CopyModalState>({ open: false, profile: null })
  const [copyName, setCopyName] = useState('')
  const [copying, setCopying] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BrowserProfile | null>(null)
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false)

  const openCopyModal = (profile: BrowserProfile) => {
    setCopyName(`${profile.profileName} (副本)`)
    setCopyModal({ open: true, profile })
  }

  const closeCopyModal = () => {
    setCopyModal({ open: false, profile: null })
    setCopyName('')
  }

  const handleDelete = async (profileId: string) => {
    const profile = profiles.find(item => item.profileId === profileId)
    if (!profile) {
      toast.error('实例不存在或已被删除')
      return
    }
    setDeleteTarget(profile)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    await deleteBrowserProfile(deleteTarget.profileId)
    toast.success('实例和用户数据目录已删除')
    setDeleteTarget(null)
    await loadProfiles()
  }

  const toggleSelect = (profileId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(profileId) ? next.delete(profileId) : next.add(profileId)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredProfiles.map(profile => profile.profileId)))
  }

  const handleDeselectAll = () => {
    setSelectedIds(new Set())
  }

  const handleBatchStart = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchLoading(true)
    let success = 0, pending = 0, failed = 0
    const pendingMessages: string[] = []
    const failureMessages: string[] = []
    for (const id of ids) {
      const profile = profiles.find(item => item.profileId === id)
      if (!profile || profile.running) continue
      updatePendingIds(setStartingIds, id, true)
      try {
        const startedProfile = await startBrowserInstance(id)
        mergeProfileState(startedProfile)
        success++
      } catch (error: any) {
        const feedback = resolveActionFeedback(error, '实例启动失败')
        if (feedback.pendingAttach) {
          pending++
          pendingMessages.push(`${profile.profileName}：${feedback.message}`)
        } else {
          failed++
          failureMessages.push(`${profile.profileName}：${feedback.message}`)
        }
      } finally {
        updatePendingIds(setStartingIds, id, false)
      }
    }
    setBatchLoading(false)
    const summary = [`成功 ${success}`]
    if (pending > 0) summary.push(`待接管 ${pending}`)
    if (failed > 0) summary.push(`失败 ${failed}`)
    toast.success(`批量启动完成：${summary.join('，')}`)
    if (pendingMessages.length > 0) {
      const preview = pendingMessages.slice(0, 3)
      const more = pendingMessages.length > preview.length ? `\n另有 ${pendingMessages.length - preview.length} 个实例已打开窗口，仍在后台接管。` : ''
      toast.warning(`以下实例已打开窗口，仍在后台接管：\n${preview.join('\n')}${more}`)
    }
    if (failureMessages.length > 0) {
      const preview = failureMessages.slice(0, 3)
      const more = failureMessages.length > preview.length ? `\n另有 ${failureMessages.length - preview.length} 个实例启动失败，请逐个检查。` : ''
      toast.error(`以下实例启动失败：\n${preview.join('\n')}${more}`)
    }
    void loadProfiles()
  }

  const handleBatchStop = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchLoading(true)
    let success = 0, failed = 0
    for (const id of ids) {
      const profile = profiles.find(item => item.profileId === id)
      if (!profile || !profile.running) continue
      updatePendingIds(setStoppingIds, id, true)
      try {
        const stoppedProfile = await stopBrowserInstance(id)
        mergeProfileState(stoppedProfile)
        success++
      } catch {
        failed++
      } finally {
        updatePendingIds(setStoppingIds, id, false)
      }
    }
    setBatchLoading(false)
    toast.success(`批量停止完成：成功 ${success}${failed > 0 ? `，失败 ${failed}` : ''}`)
    void loadProfiles()
  }

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchDeleteConfirmOpen(true)
  }

  const handleConfirmBatchDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchDeleteConfirmOpen(false)
    setBatchLoading(true)
    try {
      for (const id of ids) {
        await deleteBrowserProfile(id)
      }
      setSelectedIds(new Set())
      toast.success(`已删除 ${ids.length} 个实例`)
      await loadProfiles()
    } finally {
      setBatchLoading(false)
    }
  }

  const handleCopy = async (profileId: string) => {
    if (!copyModal.profile) return
    setCopying(true)
    try {
      await copyBrowserProfile(profileId, copyName)
      toast.success('实例已复制')
      closeCopyModal()
      void loadProfiles()
    } catch (error: any) {
      closeCopyModal()
      setOpError(typeof error === 'string' ? error : error?.message || '复制失败')
    } finally {
      setCopying(false)
    }
  }

  return {
    batchLoading,
    copyModal,
    copyName,
    copying,
    deleteTarget,
    batchDeleteConfirmOpen,
    setCopyName,
    setDeleteTarget,
    setBatchDeleteConfirmOpen,
    openCopyModal,
    closeCopyModal,
    toggleSelect,
    handleSelectAll,
    handleDeselectAll,
    handleDelete,
    handleConfirmDelete,
    handleBatchStart,
    handleBatchStop,
    handleBatchDelete,
    handleConfirmBatchDelete,
    handleCopy,
  }
}
