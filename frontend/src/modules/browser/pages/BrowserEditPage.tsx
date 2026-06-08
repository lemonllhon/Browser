import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FolderOpen, Layers } from 'lucide-react'
import { Button, Card, ConfirmModal, FormItem, Input, Modal, Select, Textarea, toast } from '../../../shared/components'
import type { BrowserCore, BrowserProfile, BrowserProfileInput, BrowserProxy, BrowserGroup, BrowserSettings } from '../types'
import { createBrowserProfile, openProfileUserDataDir, openUserDataDir, updateBrowserProfile } from '../api'
import { resolveActionErrorMessage } from '../utils/actionErrors'
import { FingerprintPanel } from '../components/FingerprintPanel'
import { TagInput } from '../components/TagInput'
import { GroupSelector } from '../components/GroupSelector'
import { ProxyPickerModal } from '../components/ProxyPickerModal'
import { REGION_OPTIONS, findRegionPreset, findRegionPresetByLocale, pickRegionTimezone, regionTimezones } from '../config/regionPresets'
import { deserialize as deserializeFingerprint, serialize as serializeFingerprint } from '../utils/fingerprintSerializer'
import { useVisibleRefresh } from '../hooks/useVisibleRefresh'
import { useSingleFlightCallback } from '../hooks/useSingleFlightCallback'
import { getBrowserSharedDataSnapshot, refreshBrowserSharedData, useBrowserSharedData, type BrowserSharedDataState } from '../stores/browserSharedDataStore'

const fallbackLowLaunchArgs = ['--disable-sync', '--no-first-run']
const incognitoArg = '--incognito'

function normalizeLaunchArgs(args: string[]): string[] {
  return (args || []).map(item => item.trim()).filter(Boolean)
}

function resolveDefaultLaunchArgs(args: string[]): string[] {
  const normalized = normalizeLaunchArgs(args)
  return normalized.length > 0 ? normalized : fallbackLowLaunchArgs
}

function setLaunchArgEnabled(args: string[], targetArg: string, enabled: boolean): string[] {
  const normalized = normalizeLaunchArgs(args)
  const withoutTarget = normalized.filter(arg => arg.toLowerCase() !== targetArg.toLowerCase())
  return enabled ? [...withoutTarget, targetArg] : withoutTarget
}

function hasLaunchArg(argsText: string, targetArg: string): boolean {
  return normalizeLaunchArgs(argsText.split('\n')).some(arg => arg.toLowerCase() === targetArg.toLowerCase())
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback)
  }
  return fallback
}

function snapshotToInput(current: BrowserProfile): { input: BrowserProfileInput; launchArgsText: string } {
  const currentLaunchArgs = normalizeLaunchArgs(current.launchArgs)
  const normalizedCoreId = !current.coreId || current.coreId.toLowerCase() === 'default'
    ? ''
    : current.coreId
  return {
    input: {
      profileName: current.profileName,
      userDataDir: current.userDataDir,
      coreId: normalizedCoreId,
      fingerprintArgs: current.fingerprintArgs,
      proxyId: current.proxyId,
      proxyConfig: current.proxyConfig,
      autoProxySwitchEnabled: current.autoProxySwitchEnabled || false,
      autoProxySwitchGroupName: current.autoProxySwitchGroupName || '',
      autoProxySwitchMode: current.autoProxySwitchMode || 'interval',
      autoProxySwitchIntervalM: current.autoProxySwitchIntervalM || 5,
      autoProxySwitchRotateByGroup: current.autoProxySwitchRotateByGroup || false,
      launchArgs: currentLaunchArgs,
      tags: current.tags,
      keywords: current.keywords || [],
      groupId: current.groupId || '',
    },
    launchArgsText: currentLaunchArgs.join('\n'),
  }
}

function mergeCleanProfileFields(
  previous: BrowserProfileInput,
  latest: BrowserProfileInput,
  dirtyFields: Set<keyof BrowserProfileInput>,
): BrowserProfileInput {
  const merged: BrowserProfileInput = { ...latest }
  const previousByField = previous as unknown as Record<string, unknown>
  const mergedByField = merged as unknown as Record<string, unknown>
  dirtyFields.forEach(field => {
    mergedByField[field] = previousByField[field]
  })
  return merged
}

export function BrowserEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isCreate = id === 'new'
  const [formData, setFormData] = useState<BrowserProfileInput>({
    profileName: '',
    userDataDir: '',
    coreId: '',
    fingerprintArgs: [],
    proxyId: '',
    proxyConfig: '',
    autoProxySwitchEnabled: false,
    autoProxySwitchGroupName: '',
    autoProxySwitchMode: 'interval',
    autoProxySwitchIntervalM: 5,
    autoProxySwitchRotateByGroup: false,
    launchArgs: [],
    tags: [],
    keywords: [],
    groupId: '',
  })
  const [cores, setCores] = useState<BrowserCore[]>([])
  const [proxies, setProxies] = useState<BrowserProxy[]>([])
  const [groups, setGroups] = useState<BrowserGroup[]>([])
  const [launchArgsText, setLaunchArgsText] = useState('')
  const [allTags, setAllTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [proxyPickerOpen, setProxyPickerOpen] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [leaveConfirm, setLeaveConfirm] = useState(false)
  const [saveError, setSaveError] = useState('')
  const dirtyFieldsRef = useRef<Set<keyof BrowserProfileInput>>(new Set())
  const incognitoEnabled = hasLaunchArg(launchArgsText, incognitoArg)
  const sharedData = useBrowserSharedData(['profiles', 'cores', 'proxies', 'groups', 'tags', 'settings'])

  const markDirty = useCallback((...fields: Array<keyof BrowserProfileInput>) => {
    fields.forEach(field => dirtyFieldsRef.current.add(field))
    setIsDirty(true)
  }, [])

  const applyProfileSnapshot = useCallback((current: BrowserProfile, preserveDirty = false) => {
    const latest = snapshotToInput(current)
    const shouldPreserveDirty = preserveDirty && dirtyFieldsRef.current.size > 0
    setFormData(prev => shouldPreserveDirty
      ? mergeCleanProfileFields(prev, latest.input, dirtyFieldsRef.current)
      : latest.input
    )
    if (!shouldPreserveDirty || !dirtyFieldsRef.current.has('launchArgs')) {
      setLaunchArgsText(latest.launchArgsText)
    }
  }, [])

  const applyCreateDefaults = useCallback((settings: BrowserSettings, groupList: BrowserGroup[], preserveDirty = false) => {
    const dirtyFields = dirtyFieldsRef.current
    const resolvedDefaultLaunchArgs = resolveDefaultLaunchArgs(settings.defaultLaunchArgs || [])
    setFormData(prev => {
      const next = { ...prev }
      if (!preserveDirty || !dirtyFields.has('fingerprintArgs')) {
        next.fingerprintArgs = settings.defaultFingerprintArgs || []
      }
      if (next.groupId && !groupList.some(group => group.groupId === next.groupId) && (!preserveDirty || !dirtyFields.has('groupId'))) {
        next.groupId = ''
      }
      return next
    })
    if (!preserveDirty || !dirtyFields.has('launchArgs')) {
      setLaunchArgsText(resolvedDefaultLaunchArgs.join('\n'))
    }
  }, [])

  const applySharedDataSnapshot = useCallback((snapshot: BrowserSharedDataState, preserveDirty = false) => {
    const coreList = snapshot.cores
    const proxyList = snapshot.proxies
    const tagList = snapshot.tags
    const groupList = snapshot.groups
    const settings = snapshot.browserSettings
    setCores(coreList)
    setProxies(proxyList)
    setAllTags(tagList)
    setGroups(groupList)
    if (isCreate) {
      applyCreateDefaults(settings, groupList, preserveDirty)
      return
    }

    const current = snapshot.profiles.find(item => item.profileId === id)
    if (!current) return
    applyProfileSnapshot(current, preserveDirty)
  }, [applyCreateDefaults, applyProfileSnapshot, id, isCreate])

  const loadData = useCallback(async (preserveDirty = false) => {
    await refreshBrowserSharedData(['profiles', 'cores', 'proxies', 'groups', 'tags', 'settings'], { silent: true })
    applySharedDataSnapshot(getBrowserSharedDataSnapshot(), preserveDirty)
  }, [applySharedDataSnapshot])

  useEffect(() => {
    if (saving) return
    const requiredLoaded = sharedData.loaded.cores
      && sharedData.loaded.proxies
      && sharedData.loaded.groups
      && sharedData.loaded.tags
      && sharedData.loaded.settings
      && (isCreate || sharedData.loaded.profiles)
    if (!requiredLoaded) return
    applySharedDataSnapshot(sharedData, true)
  }, [applySharedDataSnapshot, isCreate, saving, sharedData])
  const refreshData = useSingleFlightCallback((preserveDirty: boolean = true) => loadData(preserveDirty))

  useEffect(() => {
    void loadData(false)
  }, [loadData])

  useVisibleRefresh(() => refreshData(true), 2000, !saving)

  const handleChange = (field: keyof BrowserProfileInput, value: string | string[] | boolean | number) => {
    markDirty(field)
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleAutoProxySwitchToggle = () => {
    markDirty('autoProxySwitchEnabled', 'proxyId', 'proxyConfig')
    setFormData(prev => {
      const enabled = !prev.autoProxySwitchEnabled
      return {
        ...prev,
        autoProxySwitchEnabled: enabled,
        proxyId: enabled ? '' : prev.proxyId,
        proxyConfig: enabled ? '' : prev.proxyConfig,
      }
    })
  }

  const handleRegionChange = (code: string) => {
    const current = deserializeFingerprint(formData.fingerprintArgs)
    if (!code) {
      const nextFingerprint = {
        ...current,
        region: undefined,
        lang: undefined,
        timezone: undefined,
      }
      markDirty('fingerprintArgs')
      setFormData(prev => ({ ...prev, fingerprintArgs: serializeFingerprint(nextFingerprint) }))
      return
    }
    const preset = findRegionPreset(code)
    if (!preset) return
    const nextFingerprint = {
      ...current,
      region: preset.code,
      lang: preset.lang,
      timezone: pickRegionTimezone(code) || preset.timezone,
    }
    markDirty('fingerprintArgs')
    setFormData(prev => ({ ...prev, fingerprintArgs: serializeFingerprint(nextFingerprint) }))
  }

  const handleAutoProxySwitchGroupChange = (groupName: string) => {
    markDirty('autoProxySwitchGroupName', 'autoProxySwitchRotateByGroup')
    setFormData(prev => ({
      ...prev,
      autoProxySwitchGroupName: groupName,
      autoProxySwitchRotateByGroup: groupName ? false : prev.autoProxySwitchRotateByGroup,
    }))
  }

  const handleRotateByGroupToggle = () => {
    markDirty('autoProxySwitchRotateByGroup')
    setFormData(prev => ({
      ...prev,
      autoProxySwitchRotateByGroup: !prev.autoProxySwitchRotateByGroup,
    }))
  }

  const handleIncognitoToggle = () => {
    const nextArgs = setLaunchArgEnabled(launchArgsText.split('\n'), incognitoArg, !incognitoEnabled)
    setLaunchArgsText(nextArgs.join('\n'))
    markDirty('launchArgs')
  }

  const handleSave = async () => {
    setSaving(true)
    const payload: BrowserProfileInput = {
      ...formData,
      launchArgs: normalizeLaunchArgs(launchArgsText.split('\n')),
    }
    if (payload.autoProxySwitchEnabled) {
      payload.proxyId = ''
      payload.proxyConfig = ''
      payload.autoProxySwitchRotateByGroup = !payload.autoProxySwitchGroupName && payload.autoProxySwitchRotateByGroup === true
    } else {
      payload.autoProxySwitchRotateByGroup = false
    }
    try {
      if (isCreate) {
        await createBrowserProfile(payload)
        toast.success('配置已创建')
      } else if (id) {
        await updateBrowserProfile(id, payload)
        toast.success('配置已更新')
      }
      dirtyFieldsRef.current.clear()
      setIsDirty(false)
      navigate('/browser/list')
    } catch (error: unknown) {
      setSaveError(resolveActionErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    if (isDirty) { setLeaveConfirm(true) } else { navigate('/browser/list') }
  }

  const defaultCore = cores.find(c => c.isDefault)
  const proxyGroupOptions = Array.from(new Set(proxies.map(p => (p.groupName || '').trim()).filter(Boolean))).sort()
  const autoProxySwitchEnabled = !!formData.autoProxySwitchEnabled
  const showRotateByGroupButton = autoProxySwitchEnabled && !formData.autoProxySwitchGroupName
  const currentFingerprint = deserializeFingerprint(formData.fingerprintArgs)
  const selectedRegionCode = currentFingerprint.region && findRegionPreset(currentFingerprint.region)
    ? currentFingerprint.region
    : findRegionPresetByLocale(currentFingerprint.lang, currentFingerprint.timezone)?.code || ''
  const selectedRegion = selectedRegionCode ? findRegionPreset(selectedRegionCode) : undefined
  const selectedRegionTimezones = selectedRegion ? regionTimezones(selectedRegion) : []

  const handleOpenUserDataDir = async () => {
    const fallbackDir = !isCreate && id ? id : ''
    const targetDir = formData.userDataDir.trim() || fallbackDir
    if (!targetDir) {
      toast.error('请先输入用户数据目录')
      return
    }

    if (!isCreate && id && !formData.userDataDir.trim()) {
      try {
        const opened = await openProfileUserDataDir(id)
        if (opened) return
      } catch {
        // 新绑定不可用或后端未刷新时，回退到旧接口按 data/<实例ID> 打开。
      }
    }

    try {
      await openUserDataDir(targetDir)
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, '打开目录失败'))
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{isCreate ? '新建配置' : '编辑配置'}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">完善指纹与启动参数</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleBack}>返回列表</Button>
          <Button size="sm" onClick={handleSave} loading={saving}>保存配置</Button>
        </div>
      </div>

      <Card title="基础信息" subtitle="实例与配置名称">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormItem label="配置名称" required>
            <Input value={formData.profileName} onChange={e => handleChange('profileName', e.target.value)} placeholder="请输入配置名称" />
          </FormItem>
          <FormItem label="用户数据目录（留空自动生成）">
            <div className="flex gap-2">
              <Input
                value={formData.userDataDir}
                onChange={e => handleChange('userDataDir', e.target.value)}
                placeholder="留空自动生成"
                className="flex-1"
              />
              <Button variant="secondary" size="sm" onClick={handleOpenUserDataDir} title="在资源管理器中打开">
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
          </FormItem>
          <FormItem label="内核">
            <Select
              value={formData.coreId}
              onChange={e => handleChange('coreId', e.target.value)}
              options={
                cores.length > 0 ? [
                  { value: '', label: defaultCore ? `使用默认 (${defaultCore.coreName})` : '使用默认内核' },
                  ...cores.map(c => ({ value: c.coreId, label: c.coreName })),
                ] : [
                  { value: '', label: '暂无内核，请添加内核' }
                ]
              }
            />
          </FormItem>
          <FormItem label="标签">
            <TagInput
              value={formData.tags}
              onChange={tags => handleChange('tags', tags)}
              suggestions={allTags}
              placeholder="输入标签后按回车，支持从已有标签选择"
            />
          </FormItem>
          <FormItem label="分组">
            <GroupSelector
              groups={groups}
              value={formData.groupId || ''}
              onChange={groupId => handleChange('groupId', groupId)}
              placeholder="未分组"
              className="w-full"
            />
          </FormItem>
        </div>
      </Card>

      <Card title="代理配置" subtitle="选择代理池中的代理或手动输入">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormItem label="代理池选择">
            <div className="flex gap-2">
              <Select
                value={formData.proxyId}
                onChange={e => handleChange('proxyId', e.target.value)}
                disabled={autoProxySwitchEnabled}
                options={[
                  { value: '', label: '不使用代理池' },
                  ...proxies.map(p => ({ value: p.proxyId, label: p.proxyName || p.proxyId })),
                ]}
                className="flex-1"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setProxyPickerOpen(true)}
                disabled={autoProxySwitchEnabled}
                title={autoProxySwitchEnabled ? '自动切换已启用，代理池选择由轮询分组决定' : '按分组选择代理'}
              >
                <Layers className="w-4 h-4" />
              </Button>
            </div>
          </FormItem>
          <FormItem label="手动代理配置">
            <Input
              value={formData.proxyConfig}
              onChange={e => handleChange('proxyConfig', e.target.value)}
              placeholder={autoProxySwitchEnabled ? '自动切换已启用，由轮询代理池分组决定出口' : 'http://127.0.0.1:7890'}
              disabled={autoProxySwitchEnabled || !!formData.proxyId}
            />
          </FormItem>
        </div>
        {autoProxySwitchEnabled && (
          <p className="text-xs text-[var(--color-text-muted)] mt-2">已启用代理池自动切换，代理池选择与手动代理配置会被清空并忽略，出口由下方轮询分组决定。</p>
        )}
        {!autoProxySwitchEnabled && formData.proxyId && (
          <p className="text-xs text-[var(--color-text-muted)] mt-2">已选择代理池代理，手动配置将被忽略</p>
        )}
        <div className="mt-4 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">代理池自动切换</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">启动时浏览器连接本地固定中转，初始出口从指定代理池随机选择；可按间隔自动换，也可仅手动切换。</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={formData.autoProxySwitchEnabled ? 'primary' : 'secondary'}
              onClick={handleAutoProxySwitchToggle}
            >
              {formData.autoProxySwitchEnabled ? '已启用自动切换' : '启用自动切换'}
            </Button>
          </div>
          {formData.autoProxySwitchEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <FormItem label="轮询代理池分组" hint="留空则从全部代理池节点中随机切换">
                <Select
                  value={formData.autoProxySwitchGroupName || ''}
                  onChange={e => handleAutoProxySwitchGroupChange(e.target.value)}
                  options={[
                    { value: '', label: '全部代理池节点' },
                    ...proxyGroupOptions.map(group => ({ value: group, label: group })),
                  ]}
                />
              </FormItem>
              <FormItem label="切换模式">
                <Select
                  value={formData.autoProxySwitchMode || 'interval'}
                  onChange={e => handleChange('autoProxySwitchMode', e.target.value)}
                  options={[
                    { value: 'interval', label: '定时轮询切换' },
                    { value: 'manual', label: '仅手动切换' },
                  ]}
                />
              </FormItem>
              {(formData.autoProxySwitchMode || 'interval') === 'interval' && (
              <FormItem label="切换间隔（分钟）">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={String(formData.autoProxySwitchIntervalM || 5)}
                  onChange={e => handleChange('autoProxySwitchIntervalM', Math.max(1, Math.min(1440, Number(e.target.value) || 5)))}
                  placeholder="5"
                />
              </FormItem>
              )}
              {showRotateByGroupButton && (
                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">按代理分组切换</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">启用后每次切换都会先换到另一个代理分组，再从该分组内随机选择节点。</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={formData.autoProxySwitchRotateByGroup ? 'primary' : 'secondary'}
                    onClick={handleRotateByGroupToggle}
                  >
                    {formData.autoProxySwitchRotateByGroup ? '已按分组切换' : '按分组切换'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <ProxyPickerModal
        open={proxyPickerOpen && !autoProxySwitchEnabled}
        currentProxyId={formData.proxyId}
        onSelect={proxy => handleChange('proxyId', proxy.proxyId)}
        onClose={() => setProxyPickerOpen(false)}
      />

      <Card title="指纹配置" subtitle="配置浏览器指纹参数">
        <div className="mb-4 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
            <FormItem label="地区国家" hint="选择后自动写入语言和时区；多时区国家会随机选择候选时区">
              <Select
                value={selectedRegionCode}
                onChange={e => handleRegionChange(e.target.value)}
                options={REGION_OPTIONS}
              />
            </FormItem>
            {selectedRegionTimezones.length > 1 && (
              <div className="md:pb-1">
                <Button type="button" variant="secondary" size="sm" onClick={() => handleRegionChange(selectedRegionCode)}>
                  随机时区
                </Button>
              </div>
            )}
          </div>
          <div className="text-xs text-[var(--color-text-muted)] mt-2">
            会自动更新 <span className="font-mono">--lang</span> 与 <span className="font-mono">--timezone</span>
            {selectedRegionTimezones.length > 1 && (
              <span>，当前国家含 {selectedRegionTimezones.length} 个候选时区</span>
            )}
          </div>
        </div>
        <FingerprintPanel
          value={formData.fingerprintArgs}
          onChange={args => handleChange('fingerprintArgs', args)}
        />
      </Card>

      <Card title="启动参数" subtitle={isCreate ? '新建时默认填入轻量参数模板，直接改这里即可' : '每行一个参数'}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">无痕模式打开</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">启用后保存到启动参数，实例启动时会带上 <span className="font-mono">--incognito</span></p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={incognitoEnabled ? 'primary' : 'secondary'}
              onClick={handleIncognitoToggle}
            >
              {incognitoEnabled ? '已启用无痕' : '无痕模式打开'}
            </Button>
          </div>
          <Textarea
            value={launchArgsText}
            onChange={e => { setLaunchArgsText(e.target.value); markDirty('launchArgs') }}
            rows={6}
            placeholder="--disable-sync"
          />
          {isCreate && (
            <p className="text-xs text-[var(--color-text-muted)]">这里默认就是轻量参数模板；需要更复杂的参数，直接在此基础上修改。</p>
          )}
        </div>
      </Card>

      <ConfirmModal
        open={leaveConfirm}
        onClose={() => setLeaveConfirm(false)}
        onConfirm={() => navigate('/browser/list')}
        title="放弃未保存的更改？"
        content="当前页面有未保存的修改，离开后将丢失这些更改。"
        confirmText="放弃并离开"
        cancelText="继续编辑"
        danger
      />

      <Modal
        open={!!saveError}
        onClose={() => setSaveError('')}
        title="保存失败"
        width="420px"
        footer={<Button onClick={() => setSaveError('')}>知道了</Button>}
      >
        <div className="text-[var(--color-text-secondary)]">{saveError}</div>
      </Modal>
    </div>
  )
}
