import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '../../../shared/components'
import { onRuntimeEvent } from '../../../shared/backend/runtime'
import type { BrowserCore, BrowserCoreInput, BrowserCoreValidateResult, BrowserSettings } from '../types'
import {
  deleteBrowserCore,
  fetchBrowserSettings,
  saveBrowserCore,
  saveBrowserSettings,
  setDefaultBrowserCore,
  validateBrowserCorePath,
} from '../api'
import { resolveActionErrorMessage } from '../utils/actionErrors'
import { useVisibleRefresh } from './useVisibleRefresh'

const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
  userDataRoot: 'data',
  defaultFingerprintArgs: [],
  defaultLaunchArgs: [],
  defaultProxy: '',
  startReadyTimeoutMs: 3000,
  startStableWindowMs: 1200,
}

const DEFAULT_CORE_FORM: BrowserCoreInput = {
  coreId: '',
  coreName: '',
  corePath: '',
  isDefault: false,
}

type UseBrowserCoreSettingsInput = {
  cores: BrowserCore[]
  loadCores: () => Promise<void>
}

type BrowserSettingsField = keyof BrowserSettings

export function useBrowserCoreSettings({ cores, loadCores }: UseBrowserCoreSettingsInput) {
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [settings, setSettings] = useState<BrowserSettings>(DEFAULT_BROWSER_SETTINGS)
  const [fingerprintText, setFingerprintText] = useState('')
  const [launchText, setLaunchText] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [coreModalOpen, setCoreModalOpen] = useState(false)
  const [coreForm, setCoreForm] = useState<BrowserCoreInput>(DEFAULT_CORE_FORM)
  const [coreValidation, setCoreValidation] = useState<BrowserCoreValidateResult | null>(null)
  const [savingCore, setSavingCore] = useState(false)
  const dirtySettingsFieldsRef = useRef<Set<BrowserSettingsField>>(new Set())

  const applySettingsSnapshot = useCallback((data: BrowserSettings, preserveDirty = false) => {
    const dirtyFields = dirtySettingsFieldsRef.current
    setSettings(prev => {
      if (!preserveDirty || dirtyFields.size === 0) return data
      const next = { ...data }
      dirtyFields.forEach(field => {
        next[field] = prev[field] as never
      })
      return next
    })
    if (!preserveDirty || !dirtyFields.has('defaultFingerprintArgs')) {
      setFingerprintText((data.defaultFingerprintArgs || []).join('\n'))
    }
    if (!preserveDirty || !dirtyFields.has('defaultLaunchArgs')) {
      setLaunchText((data.defaultLaunchArgs || []).join('\n'))
    }
  }, [])

  const loadSettings = useCallback(async (preserveDirty = false) => {
    const data = await fetchBrowserSettings()
    applySettingsSnapshot(data, preserveDirty)
  }, [applySettingsSnapshot])

  useEffect(() => {
    const offSettingsUpdated = onRuntimeEvent('browser:settings:updated', () => {
      if (settingsModalOpen) {
        void loadSettings(true)
      }
    })
    const offCoresUpdated = onRuntimeEvent('browser:cores:updated', () => {
      void loadCores()
    })
    return () => {
      offSettingsUpdated?.()
      offCoresUpdated?.()
    }
  }, [settingsModalOpen, loadCores, loadSettings])

  useVisibleRefresh(() => {
    if (!settingsModalOpen) return
    return loadSettings(true)
  }, 2000, settingsModalOpen && !savingSettings)

  const handleOpenSettings = async () => {
    dirtySettingsFieldsRef.current.clear()
    await Promise.all([loadSettings(), loadCores()])
    setSettingsModalOpen(true)
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await saveBrowserSettings({
        ...settings,
        defaultFingerprintArgs: fingerprintText.split('\n').map(value => value.trim()).filter(Boolean),
        defaultLaunchArgs: launchText.split('\n').map(value => value.trim()).filter(Boolean),
      })
      dirtySettingsFieldsRef.current.clear()
      toast.success('配置已保存')
      setSettingsModalOpen(false)
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '保存失败'))
    } finally {
      setSavingSettings(false)
    }
  }

  const handleSettingsFieldChange = useCallback(<K extends BrowserSettingsField>(field: K, value: BrowserSettings[K]) => {
    dirtySettingsFieldsRef.current.add(field)
    setSettings(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleFingerprintTextChange = useCallback((value: string) => {
    dirtySettingsFieldsRef.current.add('defaultFingerprintArgs')
    setFingerprintText(value)
  }, [])

  const handleLaunchTextChange = useCallback((value: string) => {
    dirtySettingsFieldsRef.current.add('defaultLaunchArgs')
    setLaunchText(value)
  }, [])

  const handleOpenCoreModal = (core?: BrowserCore) => {
    setCoreForm(core ? { ...core } : DEFAULT_CORE_FORM)
    setCoreValidation(null)
    setCoreModalOpen(true)
  }

  const handleValidateCorePath = async () => {
    if (!coreForm.corePath.trim()) {
      setCoreValidation({ valid: false, message: '请输入路径' })
      return
    }
    const result = await validateBrowserCorePath(coreForm.corePath)
    setCoreValidation(result)
  }

  const handleSaveCore = async () => {
    if (!coreForm.coreName.trim()) {
      toast.error('请输入内核名称')
      return
    }
    if (!coreForm.corePath.trim()) {
      toast.error('请输入内核路径')
      return
    }
    setSavingCore(true)
    try {
      await saveBrowserCore(coreForm)
      toast.success('内核已保存')
      setCoreModalOpen(false)
      await loadCores()
    } catch (error: unknown) {
      toast.error(resolveActionErrorMessage(error, '保存失败'))
    } finally {
      setSavingCore(false)
    }
  }

  const handleDeleteCore = async (coreId: string) => {
    if (cores.length <= 1) {
      toast.error('至少保留一个内核')
      return
    }
    await deleteBrowserCore(coreId)
    toast.success('内核已删除')
    await loadCores()
  }

  const handleSetDefaultCore = async (coreId: string) => {
    await setDefaultBrowserCore(coreId)
    toast.success('已设为默认')
    await loadCores()
  }

  return {
    settingsModalOpen,
    settings,
    fingerprintText,
    launchText,
    savingSettings,
    coreModalOpen,
    coreForm,
    coreValidation,
    savingCore,
    setSettingsModalOpen,
    setSettings,
    setFingerprintText: handleFingerprintTextChange,
    setLaunchText: handleLaunchTextChange,
    handleSettingsFieldChange,
    setCoreModalOpen,
    setCoreForm,
    setCoreValidation,
    handleOpenSettings,
    handleSaveSettings,
    handleOpenCoreModal,
    handleValidateCorePath,
    handleSaveCore,
    handleDeleteCore,
    handleSetDefaultCore,
  }
}
