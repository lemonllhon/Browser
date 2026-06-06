import { useEffect, useMemo, useRef, useState } from 'react'
import { Wand2 } from 'lucide-react'
import { Button, FormItem, Input, Modal, Progress, Select, Textarea, toast } from '../../../shared/components'
import type { BrowserCore, BrowserGroupWithCount, BrowserProfile, BrowserProfileInput, BrowserProxy, BrowserSettings } from '../types'
import { createBrowserProfile, fetchBrowserSettings } from '../api'
import { onRuntimeEvent } from '../../../shared/backend/runtime'
import { FingerprintPanel } from './FingerprintPanel'
import { GroupSelector } from './GroupSelector'
import { TagInput } from './TagInput'
import { REGION_OPTIONS, findRegionPreset, findRegionPresetByLocale, pickRegionTimezone, regionTimezones } from '../config/regionPresets'
import {
  deserialize as deserializeFingerprint,
  randomFingerprintSeed,
  randomHardwareFingerprintConfig,
  serialize as serializeFingerprint,
} from '../utils/fingerprintSerializer'
import { resolveActionErrorMessage } from '../utils/actionErrors'

type FingerprintBatchMode = 'randomHardware' | 'seedOnly' | 'keepTemplate'
type ProxyMode = 'none' | 'pool' | 'manual' | 'autoSwitch'

interface Props {
  open: boolean
  onClose: () => void
  profiles: BrowserProfile[]
  cores: BrowserCore[]
  proxies: BrowserProxy[]
  groups: BrowserGroupWithCount[]
  allTags: string[]
  onGenerated: () => void
}

const fallbackLaunchArgs = ['--disable-sync', '--no-first-run']

const FINGERPRINT_BATCH_OPTIONS: Array<{ value: FingerprintBatchMode; label: string }> = [
  { value: 'randomHardware', label: '每个实例随机完整设备画像' },
  { value: 'seedOnly', label: '固定模板参数，仅随机种子' },
  { value: 'keepTemplate', label: '完全使用当前模板参数' },
]

const PROXY_MODE_OPTIONS: Array<{ value: ProxyMode; label: string }> = [
  { value: 'none', label: '不使用代理' },
  { value: 'pool', label: '绑定代理池节点' },
  { value: 'manual', label: '手动代理配置' },
  { value: 'autoSwitch', label: '代理池自动切换' },
]

function normalizeLines(text: string): string[] {
  return text.split('\n').map(item => item.trim()).filter(Boolean)
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function makeProfileName(prefix: string, number: number, width: number) {
  const safePrefix = prefix.trim() || '随机实例'
  return `${safePrefix} ${String(number).padStart(width, '0')}`
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function detectNextStartIndex(profiles: BrowserProfile[], prefix: string) {
  const safePrefix = prefix.trim() || '随机实例'
  const matcher = new RegExp(`^${escapeRegExp(safePrefix)}\\s+(\\d+)(?:\\s*\\(\\d+\\))?$`, 'i')
  let maxIndex = 0
  for (const profile of profiles) {
    const match = profile.profileName.trim().match(matcher)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value)) {
      maxIndex = Math.max(maxIndex, value)
    }
  }
  return Math.min(maxIndex + 1, 999999)
}

function uniqueProfileName(base: string, usedNames: Set<string>) {
  const normalized = (value: string) => value.trim().toLowerCase()
  let candidate = base.trim() || '随机实例'
  let key = normalized(candidate)
  if (!usedNames.has(key)) {
    usedNames.add(key)
    return candidate
  }
  for (let i = 2; ; i++) {
    candidate = `${base} (${i})`
    key = normalized(candidate)
    if (!usedNames.has(key)) {
      usedNames.add(key)
      return candidate
    }
  }
}

function buildBatchFingerprintArgs(templateArgs: string[], mode: FingerprintBatchMode): string[] {
  const base = deserializeFingerprint(templateArgs)
  if (mode === 'keepTemplate') {
    return serializeFingerprint(base)
  }
  if (mode === 'seedOnly') {
    return serializeFingerprint({
      ...base,
      autoHardware: false,
      seed: randomFingerprintSeed(),
    })
  }
  const next = randomHardwareFingerprintConfig(base)
  return serializeFingerprint({
    ...next,
    region: base.region,
    lang: base.lang,
    timezone: base.timezone,
    unknownArgs: base.unknownArgs,
  })
}

function seedVisibleFingerprintArgs(args: string[]) {
  const base = deserializeFingerprint(args)
  if (base.seed || base.autoHardware) return args
  return serializeFingerprint(randomHardwareFingerprintConfig(base))
}

export function BatchRandomFingerprintModal({
  open,
  onClose,
  profiles,
  cores,
  proxies,
  groups,
  allTags,
  onGenerated,
}: Props) {
  const [count, setCount] = useState(5)
  const [namePrefix, setNamePrefix] = useState('随机实例')
  const [coreId, setCoreId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [keywordsText, setKeywordsText] = useState('')
  const [proxyMode, setProxyMode] = useState<ProxyMode>('none')
  const [proxyId, setProxyId] = useState('')
  const [proxyConfig, setProxyConfig] = useState('')
  const [autoProxySwitchGroupName, setAutoProxySwitchGroupName] = useState('')
  const [autoProxySwitchMode, setAutoProxySwitchMode] = useState<'interval' | 'manual'>('interval')
  const [autoProxySwitchIntervalM, setAutoProxySwitchIntervalM] = useState(5)
  const [autoProxySwitchRotateByGroup, setAutoProxySwitchRotateByGroup] = useState(false)
  const [launchArgsText, setLaunchArgsText] = useState(fallbackLaunchArgs.join('\n'))
  const [fingerprintArgs, setFingerprintArgs] = useState<string[]>([])
  const [fingerprintMode, setFingerprintMode] = useState<FingerprintBatchMode>('randomHardware')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [lastSummary, setLastSummary] = useState('')
  const launchTemplateDirtyRef = useRef(false)
  const fingerprintTemplateDirtyRef = useRef(false)

  const applyDefaultSettingsTemplate = (settings: BrowserSettings, force = false) => {
    const launchArgs = settings.defaultLaunchArgs?.length ? settings.defaultLaunchArgs : fallbackLaunchArgs
    if (force || !launchTemplateDirtyRef.current) {
      setLaunchArgsText(launchArgs.join('\n'))
    }
    if (force || !fingerprintTemplateDirtyRef.current) {
      setFingerprintArgs(seedVisibleFingerprintArgs(settings.defaultFingerprintArgs || []))
    }
  }

  useEffect(() => {
    if (!open) return
    launchTemplateDirtyRef.current = false
    fingerprintTemplateDirtyRef.current = false
    setCount(5)
    setNamePrefix('随机实例')
    setCoreId('')
    setGroupId('')
    setTags([])
    setKeywordsText('')
    setProxyMode('none')
    setProxyId('')
    setProxyConfig('')
    setAutoProxySwitchGroupName('')
    setAutoProxySwitchMode('interval')
    setAutoProxySwitchIntervalM(5)
    setAutoProxySwitchRotateByGroup(false)
    setFingerprintMode('randomHardware')
    setBusy(false)
    setProgress(0)
    setProgressText('')
    setLastSummary('')
    void fetchBrowserSettings().then(settings => {
      applyDefaultSettingsTemplate(settings, true)
    }).catch(() => {
      setLaunchArgsText(fallbackLaunchArgs.join('\n'))
      setFingerprintArgs(seedVisibleFingerprintArgs([]))
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const offSettingsUpdated = onRuntimeEvent('browser:settings:updated', () => {
      if (busy || (launchTemplateDirtyRef.current && fingerprintTemplateDirtyRef.current)) {
        return
      }
      void fetchBrowserSettings().then(settings => {
        applyDefaultSettingsTemplate(settings)
      }).catch(() => {})
    })
    return () => {
      offSettingsUpdated?.()
    }
  }, [busy, open])

  const selectedProxyGroups = useMemo(() => (
    Array.from(new Set(proxies.map(item => (item.groupName || '').trim()).filter(Boolean))).sort()
  ), [proxies])

  const coreOptions = [
    { value: '', label: cores.find(item => item.isDefault)?.coreName ? `使用默认 (${cores.find(item => item.isDefault)?.coreName})` : '使用默认内核' },
    ...cores.map(item => ({ value: item.coreId, label: item.coreName || item.coreId })),
  ]

  const proxyOptions = [
    { value: '', label: '请选择代理池节点' },
    ...proxies.map(item => ({ value: item.proxyId, label: item.proxyName || item.proxyId })),
  ]

  const currentFingerprint = deserializeFingerprint(fingerprintArgs)
  const selectedRegionCode = currentFingerprint.region && findRegionPreset(currentFingerprint.region)
    ? currentFingerprint.region
    : findRegionPresetByLocale(currentFingerprint.lang, currentFingerprint.timezone)?.code || ''
  const selectedRegion = selectedRegionCode ? findRegionPreset(selectedRegionCode) : undefined
  const selectedRegionTimezones = selectedRegion ? regionTimezones(selectedRegion) : []
  const startIndex = useMemo(() => detectNextStartIndex(profiles, namePrefix), [profiles, namePrefix])

  const handleRegionChange = (code: string) => {
    fingerprintTemplateDirtyRef.current = true
    const current = deserializeFingerprint(fingerprintArgs)
    if (!code) {
      setFingerprintArgs(serializeFingerprint({
        ...current,
        region: undefined,
        lang: undefined,
        timezone: undefined,
      }))
      return
    }
    const preset = findRegionPreset(code)
    if (!preset) return
    setFingerprintArgs(serializeFingerprint({
      ...current,
      region: preset.code,
      lang: preset.lang,
      timezone: pickRegionTimezone(code) || preset.timezone,
    }))
  }

  const closeIfIdle = () => {
    if (!busy) onClose()
  }

  const handleGenerate = async () => {
    const total = clampNumber(count, 1, 200, 1)
    const start = clampNumber(startIndex, 1, 999999, 1)
    const width = Math.max(2, String(start + total - 1).length)
    const usedNames = new Set(profiles.map(item => item.profileName.trim().toLowerCase()).filter(Boolean))
    const keywords = normalizeLines(keywordsText)
    const launchArgs = normalizeLines(launchArgsText)
    const selectedProxy = proxyMode === 'pool' ? proxyId.trim() : ''
    const selectedProxyConfig = proxyMode === 'manual' ? proxyConfig.trim() : ''

    if (total <= 0) {
      toast.error('生成数量至少为 1')
      return
    }
    if (proxyMode === 'pool' && !selectedProxy) {
      toast.error('请选择代理池节点')
      return
    }
    if (proxyMode === 'manual' && !selectedProxyConfig) {
      toast.error('请输入手动代理配置')
      return
    }

    setBusy(true)
    setProgress(0)
    setProgressText('准备生成实例...')
    setLastSummary('')
    let success = 0
    let failed = 0
    const failures: string[] = []

    try {
      for (let i = 0; i < total; i++) {
        const number = start + i
        const baseName = makeProfileName(namePrefix, number, width)
        const profileName = uniqueProfileName(baseName, usedNames)
        setProgressText(`正在生成 ${i + 1}/${total}：${profileName}`)

        const input: BrowserProfileInput = {
          profileName,
          userDataDir: '',
          coreId,
          fingerprintArgs: buildBatchFingerprintArgs(fingerprintArgs, fingerprintMode),
          proxyId: selectedProxy,
          proxyConfig: selectedProxyConfig,
          autoProxySwitchEnabled: proxyMode === 'autoSwitch',
          autoProxySwitchGroupName: proxyMode === 'autoSwitch' ? autoProxySwitchGroupName : '',
          autoProxySwitchMode: proxyMode === 'autoSwitch' ? autoProxySwitchMode : 'interval',
          autoProxySwitchIntervalM: proxyMode === 'autoSwitch' ? autoProxySwitchIntervalM : 5,
          autoProxySwitchRotateByGroup: proxyMode === 'autoSwitch' && !autoProxySwitchGroupName && autoProxySwitchRotateByGroup,
          launchArgs,
          tags,
          keywords,
          groupId,
        }

        try {
          await createBrowserProfile(input)
          success++
        } catch (error: unknown) {
          failed++
          failures.push(`${profileName}：${resolveActionErrorMessage(error, '创建失败')}`)
        }
        setProgress(Math.round(((i + 1) / total) * 100))
      }

      const summary = `批量生成完成：成功 ${success}${failed ? `，失败 ${failed}` : ''}`
      setLastSummary(summary)
      if (success > 0) {
        toast.success(summary)
        onGenerated()
      }
      if (failures.length > 0) {
        toast.error(failures.slice(0, 3).join('\n'))
      }
    } finally {
      setBusy(false)
      setProgressText('')
    }
  }

  return (
    <Modal
      open={open}
      onClose={closeIfIdle}
      title="批量生成随机指纹"
      width="900px"
      closable={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={closeIfIdle} disabled={busy}>关闭</Button>
          <Button onClick={handleGenerate} loading={busy}>
            <Wand2 className="w-4 h-4" />
            开始生成
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">
          按新建配置的参数模板批量创建实例；默认会为每个实例生成独立的完整设备画像和指纹种子。
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <FormItem label="实例名称前缀" required className="md:col-span-2">
            <Input value={namePrefix} onChange={event => setNamePrefix(event.target.value)} placeholder="随机实例" />
          </FormItem>
          <FormItem label="生成数量" required>
            <Input
              type="number"
              min={1}
              max={200}
              value={String(count)}
              onChange={event => setCount(clampNumber(Number(event.target.value), 1, 200, 5))}
            />
          </FormItem>
          <FormItem label="起始序号" hint="自动识别，只做展示">
            <div
              className="h-9 w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 flex items-center font-mono text-sm text-[var(--color-text-primary)]"
              title="根据当前名称前缀自动识别，只做展示"
            >
              {startIndex}
            </div>
          </FormItem>
          <FormItem label="内核" className="md:col-span-2">
            <Select value={coreId} onChange={event => setCoreId(event.target.value)} options={coreOptions} />
          </FormItem>
          <FormItem label="分组" className="md:col-span-2">
            <GroupSelector groups={groups} value={groupId} onChange={setGroupId} placeholder="未分组" className="w-full h-9 bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border-[var(--color-border-default)] rounded-lg" />
          </FormItem>
          <FormItem label="标签" className="md:col-span-2">
            <TagInput value={tags} onChange={setTags} suggestions={allTags} placeholder="输入标签后按回车" />
          </FormItem>
          <FormItem label="系统关键字" hint="每行一个" className="md:col-span-2">
            <Textarea value={keywordsText} onChange={event => setKeywordsText(event.target.value)} rows={3} placeholder="关键字" />
          </FormItem>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormItem label="代理方式">
            <Select value={proxyMode} onChange={event => setProxyMode(event.target.value as ProxyMode)} options={PROXY_MODE_OPTIONS} />
          </FormItem>
          {proxyMode === 'pool' && (
            <FormItem label="代理池节点">
              <Select value={proxyId} onChange={event => setProxyId(event.target.value)} options={proxyOptions} />
            </FormItem>
          )}
          {proxyMode === 'manual' && (
            <FormItem label="手动代理配置">
              <Input value={proxyConfig} onChange={event => setProxyConfig(event.target.value)} placeholder="http://127.0.0.1:7890" />
            </FormItem>
          )}
          {proxyMode === 'autoSwitch' && (
            <>
              <FormItem label="轮询代理池分组" hint="留空为全部节点">
                <Select
                  value={autoProxySwitchGroupName}
                  onChange={event => {
                    setAutoProxySwitchGroupName(event.target.value)
                    if (event.target.value) setAutoProxySwitchRotateByGroup(false)
                  }}
                  options={[{ value: '', label: '全部代理池节点' }, ...selectedProxyGroups.map(group => ({ value: group, label: group }))]}
                />
              </FormItem>
              <FormItem label="切换模式">
                <Select
                  value={autoProxySwitchMode}
                  onChange={event => setAutoProxySwitchMode(event.target.value as 'interval' | 'manual')}
                  options={[
                    { value: 'interval', label: '定时轮询切换' },
                    { value: 'manual', label: '仅手动切换' },
                  ]}
                />
              </FormItem>
              {autoProxySwitchMode === 'interval' && (
                <FormItem label="切换间隔（分钟）">
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={String(autoProxySwitchIntervalM)}
                    onChange={event => setAutoProxySwitchIntervalM(clampNumber(Number(event.target.value), 1, 1440, 5))}
                  />
                </FormItem>
              )}
              {!autoProxySwitchGroupName && (
                <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] md:col-span-2">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[var(--color-accent)]"
                    checked={autoProxySwitchRotateByGroup}
                    onChange={event => setAutoProxySwitchRotateByGroup(event.target.checked)}
                  />
                  按代理分组轮换
                </label>
              )}
            </>
          )}
        </div>

        <FormItem label="启动参数" hint="每行一个">
          <Textarea
            value={launchArgsText}
            onChange={event => {
              launchTemplateDirtyRef.current = true
              setLaunchArgsText(event.target.value)
            }}
            rows={4}
            placeholder="--disable-sync"
          />
        </FormItem>

        <div className="rounded-md border border-[var(--color-border-default)] p-3 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] gap-4">
            <FormItem label="指纹生成策略">
              <Select value={fingerprintMode} onChange={event => setFingerprintMode(event.target.value as FingerprintBatchMode)} options={FINGERPRINT_BATCH_OPTIONS} />
            </FormItem>
            <FormItem label="地区国家">
              <Select value={selectedRegionCode} onChange={event => handleRegionChange(event.target.value)} options={REGION_OPTIONS} />
            </FormItem>
          </div>
          {selectedRegionTimezones.length > 1 && (
            <Button type="button" size="sm" variant="secondary" onClick={() => handleRegionChange(selectedRegionCode)}>
              随机当前国家时区
            </Button>
          )}
          <FingerprintPanel
            value={fingerprintArgs}
            onChange={value => {
              fingerprintTemplateDirtyRef.current = true
              setFingerprintArgs(value)
            }}
          />
        </div>

        {(busy || lastSummary) && (
          <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-secondary)]">{progressText || lastSummary}</span>
              <span className="text-[var(--color-text-muted)]">{progress}%</span>
            </div>
            <Progress percent={progress} size="sm" status={progress === 100 ? 'success' : 'normal'} />
          </div>
        )}
      </div>
    </Modal>
  )
}
