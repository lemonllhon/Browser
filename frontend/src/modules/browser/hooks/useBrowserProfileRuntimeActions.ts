import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from '../../../shared/components'
import type { BrowserProfile, BrowserProxy } from '../types'
import {
  clearBrowserCookies,
  exportBrowserCookies,
  pinCenterBrowserInstance,
  restartBrowserInstance,
  startBrowserInstance,
  stopBrowserInstance,
  switchBrowserProfileProxyNow,
  validateProxyConfig,
} from '../api'
import { resolveActionErrorMessage, resolveActionFeedback } from '../utils/actionErrors'
import { downloadTextFile, getCookieActionTitle, sanitizeFilenamePart } from '../utils/browserListFormat'

type PendingIdSetter = Dispatch<SetStateAction<Set<string>>>

type LoadProfilesOptions = {
  silent?: boolean
  syncRuntimeState?: boolean
}

type UseBrowserProfileRuntimeActionsInput = {
  profiles: BrowserProfile[]
  proxies: BrowserProxy[]
  setStartingIds: PendingIdSetter
  setStoppingIds: PendingIdSetter
  mergeProfileState: (profile: BrowserProfile | null | undefined) => void
  loadProfiles: (options?: LoadProfilesOptions) => Promise<BrowserProfile[] | void>
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

export function useBrowserProfileRuntimeActions({
  profiles,
  proxies,
  setStartingIds,
  setStoppingIds,
  mergeProfileState,
  loadProfiles,
  setOpError,
}: UseBrowserProfileRuntimeActionsInput) {
  const [proxyErrorModal, setProxyErrorModal] = useState(false)
  const [proxyErrorMsg, setProxyErrorMsg] = useState('')
  const [pendingStartId, setPendingStartId] = useState<string | null>(null)
  const [switchingProxyIds, setSwitchingProxyIds] = useState<Set<string>>(new Set())
  const [pinningIds, setPinningIds] = useState<Set<string>>(new Set())
  const [exportingCookieIds, setExportingCookieIds] = useState<Set<string>>(new Set())
  const [clearingCookieIds, setClearingCookieIds] = useState<Set<string>>(new Set())
  const [cookieClearTarget, setCookieClearTarget] = useState<BrowserProfile | null>(null)

  const isProfileSwitchingProxy = (profileId: string) => switchingProxyIds.has(profileId)
  const isProfilePinning = (profileId: string) => pinningIds.has(profileId)
  const isProfileExportingCookies = (profileId: string) => exportingCookieIds.has(profileId)
  const isProfileClearingCookies = (profileId: string) => clearingCookieIds.has(profileId)

  const closeProxyError = () => {
    setProxyErrorModal(false)
    setPendingStartId(null)
  }

  const handleStart = async (profileId: string) => {
    const profile = profiles.find(item => item.profileId === profileId)
    updatePendingIds(setStartingIds, profileId, true)
    try {
      if (profile) {
        const result = await validateProxyConfig(profile.proxyConfig || '', profile.proxyId || '')
        if (!result.supported) {
          setProxyErrorMsg(result.errorMsg)
          setPendingStartId(profileId)
          setProxyErrorModal(true)
          return
        }
      }

      const startedProfile = await startBrowserInstance(profileId)
      mergeProfileState(startedProfile)
      if (startedProfile?.running && !startedProfile.debugReady && startedProfile.runtimeWarning) {
        toast.warning(startedProfile.runtimeWarning)
      } else {
        toast.success(`实例已启动${startedProfile?.profileName ? `：${startedProfile.profileName}` : ''}`)
      }
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      const feedback = resolveActionFeedback(error, '实例启动失败')
      if (feedback.tone === 'warning') {
        toast.warning(feedback.message)
      } else {
        toast.error(feedback.message)
      }
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } finally {
      updatePendingIds(setStartingIds, profileId, false)
    }
  }

  const handleStop = async (profileId: string) => {
    updatePendingIds(setStoppingIds, profileId, true)
    try {
      const stoppedProfile = await stopBrowserInstance(profileId)
      mergeProfileState(stoppedProfile)
      toast.success('实例已停止')
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      toast.error(resolveActionErrorMessage(error, '实例停止失败'))
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } finally {
      updatePendingIds(setStoppingIds, profileId, false)
    }
  }

  const handleRestart = async (profileId: string) => {
    updatePendingIds(setStoppingIds, profileId, true)
    try {
      const restartedProfile = await restartBrowserInstance(profileId)
      mergeProfileState(restartedProfile)
      toast.success(`实例已重启${restartedProfile?.profileName ? `：${restartedProfile.profileName}` : ''}`)
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      const feedback = resolveActionFeedback(error, '实例重启失败')
      if (feedback.tone === 'warning') {
        toast.warning(feedback.message)
      } else {
        setOpError(feedback.message)
      }
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } finally {
      updatePendingIds(setStoppingIds, profileId, false)
    }
  }

  const handleSwitchProxyNow = async (profileId: string) => {
    updatePendingIds(setSwitchingProxyIds, profileId, true)
    try {
      const updatedProfile = await switchBrowserProfileProxyNow(profileId)
      mergeProfileState(updatedProfile)
      const proxy = proxies.find(item => item.proxyId === updatedProfile?.autoProxySwitchLastProxyId)
      toast.success(`出口已切换${proxy?.proxyName ? `：${proxy.proxyName}` : ''}`)
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      toast.error(error?.message || '手动切换出口失败')
    } finally {
      updatePendingIds(setSwitchingProxyIds, profileId, false)
    }
  }

  const handlePinCenter = async (profileId: string) => {
    updatePendingIds(setPinningIds, profileId, true)
    try {
      await pinCenterBrowserInstance(profileId)
      toast.success('实例窗口已置顶居中')
    } catch (error: any) {
      toast.error(error?.message || '置顶居中失败')
    } finally {
      updatePendingIds(setPinningIds, profileId, false)
    }
  }

  const handleExportCookies = async (profile: BrowserProfile) => {
    if (!profile.running || !profile.debugReady) {
      toast.warning(getCookieActionTitle(profile, 'export'))
      return
    }
    updatePendingIds(setExportingCookieIds, profile.profileId, true)
    try {
      const content = await exportBrowserCookies(profile.profileId)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `cookies_${sanitizeFilenamePart(profile.profileName || profile.profileId)}_${stamp}.txt`
      downloadTextFile(filename, content)
      toast.success(`Cookie 已导出：${profile.profileName || profile.profileId}`)
    } catch (error: any) {
      toast.error(error?.message || '导出 Cookie 失败')
    } finally {
      updatePendingIds(setExportingCookieIds, profile.profileId, false)
    }
  }

  const handleConfirmClearCookies = async () => {
    const target = cookieClearTarget
    if (!target) return
    if (target.running && !target.debugReady) {
      toast.warning(getCookieActionTitle(target, 'clear'))
      return
    }
    updatePendingIds(setClearingCookieIds, target.profileId, true)
    try {
      await clearBrowserCookies(target.profileId)
      toast.success(target.running ? `Cookie 已清空：${target.profileName || target.profileId}` : `用户数据已清空，指纹已重置：${target.profileName || target.profileId}`)
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      toast.error(error?.message || (target.running ? '清空 Cookie 失败' : '清空用户数据失败'))
    } finally {
      updatePendingIds(setClearingCookieIds, target.profileId, false)
      setCookieClearTarget(null)
    }
  }

  return {
    proxyErrorModal,
    proxyErrorMsg,
    pendingStartId,
    cookieClearTarget,
    setCookieClearTarget,
    closeProxyError,
    isProfileSwitchingProxy,
    isProfilePinning,
    isProfileExportingCookies,
    isProfileClearingCookies,
    handleStart,
    handleStop,
    handleRestart,
    handleSwitchProxyNow,
    handlePinCenter,
    handleExportCookies,
    handleConfirmClearCookies,
  }
}
