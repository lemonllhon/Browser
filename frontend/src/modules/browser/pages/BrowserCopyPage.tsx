import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, FormItem, Input, Select, toast } from '../../../shared/components'
import { createBrowserProfile } from '../api'
import { type FingerprintCopyMode, prepareFingerprintArgsForCopy } from '../utils/fingerprintSerializer'
import { useBrowserSharedData } from '../stores/browserSharedDataStore'

const FINGERPRINT_COPY_OPTIONS: Array<{ value: FingerprintCopyMode; label: string; hint: string }> = [
  {
    value: 'regenerateSeed',
    label: '重新生成指纹种子（推荐）',
    hint: '保留源配置的设备参数，只替换 --fingerprint，适合快速复制但避免同噪声指纹。',
  },
  {
    value: 'randomHardware',
    label: '重新随机完整设备画像',
    hint: '保留语言和时区，重新生成系统、浏览器品牌、屏幕、CPU、内存、WebGL、媒体设备和字体。',
  },
  {
    value: 'keep',
    label: '完全保留源指纹',
    hint: '不修改任何指纹参数，副本会与源配置保持相同指纹。',
  },
]

export function BrowserCopyPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sourceId, setSourceId] = useState(id || '')
  const [targetName, setTargetName] = useState('')
  const [fingerprintMode, setFingerprintMode] = useState<FingerprintCopyMode>('regenerateSeed')
  const [saving, setSaving] = useState(false)
  const sharedData = useBrowserSharedData(['profiles'])
  const profiles = sharedData.profiles

  useEffect(() => {
    setSourceId(id || '')
  }, [id])

  useEffect(() => {
    if (!sharedData.loaded.profiles) return
    setSourceId(current => {
      if (current && profiles.some(item => item.profileId === current)) return current
      return profiles[0]?.profileId || ''
    })
  }, [profiles, sharedData.loaded.profiles])

  const sourceProfile = profiles.find(item => item.profileId === sourceId)
  const fingerprintModeHint = FINGERPRINT_COPY_OPTIONS.find(item => item.value === fingerprintMode)?.hint || ''

  const handleCopy = async () => {
    if (!sourceProfile || !targetName) {
      toast.error('请填写目标名称')
      return
    }
    setSaving(true)
    try {
      await createBrowserProfile({
        profileName: targetName,
        userDataDir: `${sourceProfile.userDataDir}-copy`,
        coreId: sourceProfile.coreId,
        fingerprintArgs: prepareFingerprintArgsForCopy(sourceProfile.fingerprintArgs || [], fingerprintMode),
        proxyId: sourceProfile.proxyId,
        proxyConfig: sourceProfile.proxyConfig,
        launchArgs: sourceProfile.launchArgs,
        tags: sourceProfile.tags,
        keywords: sourceProfile.keywords || [],
        groupId: sourceProfile.groupId || '',
      })
      toast.success('配置已复制')
      navigate('/browser/list')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">配置复制</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">基于现有配置快速创建</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate('/browser/list')}>返回列表</Button>
          <Button size="sm" onClick={handleCopy} loading={saving}>生成配置</Button>
        </div>
      </div>

      <Card title="复制设置" subtitle="选择源配置并设置名称">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormItem label="源配置">
            <Select
              value={sourceId}
              onChange={e => setSourceId(e.target.value)}
              options={profiles.map(item => ({ value: item.profileId, label: item.profileName }))}
            />
          </FormItem>
          <FormItem label="新配置名称">
            <Input value={targetName} onChange={e => setTargetName(e.target.value)} placeholder="请输入名称" />
          </FormItem>
          <FormItem label="指纹处理" hint={fingerprintModeHint}>
            <Select
              value={fingerprintMode}
              onChange={e => setFingerprintMode(e.target.value as FingerprintCopyMode)}
              options={FINGERPRINT_COPY_OPTIONS.map(item => ({ value: item.value, label: item.label }))}
            />
          </FormItem>
          {sourceProfile && (
            <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs text-[var(--color-text-muted)] md:self-end">
              源配置当前有 {sourceProfile.fingerprintArgs?.length || 0} 条指纹参数；生成配置时会按上方策略处理后保存。
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
