import { useState } from 'react'
import { toast } from '../../../shared/components'
import type { BrowserCore, BrowserCoreInput, BrowserCoreValidateResult, BrowserSettings } from '../types'
import {
  deleteBrowserCore,
  fetchBrowserSettings,
  saveBrowserCore,
  saveBrowserSettings,
  setDefaultBrowserCore,
  validateBrowserCorePath,
} from '../api'

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

  const loadSettings = async () => {
    const data = await fetchBrowserSettings()
    setSettings(data)
    setFingerprintText((data.defaultFingerprintArgs || []).join('\n'))
    setLaunchText((data.defaultLaunchArgs || []).join('\n'))
  }

  const handleOpenSettings = async () => {
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
      toast.success('配置已保存')
      setSettingsModalOpen(false)
    } catch (error: any) {
      toast.error(error?.message || '保存失败')
    } finally {
      setSavingSettings(false)
    }
  }

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
    } catch (error: any) {
      toast.error(error?.message || '保存失败')
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
    setFingerprintText,
    setLaunchText,
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
