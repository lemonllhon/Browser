import { Plus } from 'lucide-react'
import { Button, Card, FormItem, Input, Modal, Table, Textarea } from '../../../../shared/components'
import type { TableColumn } from '../../../../shared/components/Table'
import type { BrowserCore, BrowserSettings } from '../../types'

type BrowserListSettingsModalProps = {
  open: boolean
  settings: BrowserSettings
  fingerprintText: string
  launchText: string
  saving: boolean
  cores: BrowserCore[]
  coreColumns: TableColumn<BrowserCore>[]
  onClose: () => void
  onSave: () => void
  onSettingsChange: (updater: (prev: BrowserSettings) => BrowserSettings) => void
  onFingerprintTextChange: (value: string) => void
  onLaunchTextChange: (value: string) => void
  onOpenCoreModal: () => void
}

export function BrowserListSettingsModal({
  open,
  settings,
  fingerprintText,
  launchText,
  saving,
  cores,
  coreColumns,
  onClose,
  onSave,
  onSettingsChange,
  onFingerprintTextChange,
  onLaunchTextChange,
  onOpenCoreModal,
}: BrowserListSettingsModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="基础配置"
      width="700px"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={onSave} loading={saving}>保存</Button>
        </>
      )}
    >
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">内核管理</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={onOpenCoreModal}><Plus className="w-4 h-4" />新增内核</Button>
            </div>
          </div>
          <Card padding="none">
            <Table columns={coreColumns} data={cores} rowKey="coreId" />
          </Card>
        </div>

        <FormItem label="用户数据根目录">
          <Input
            value={settings.userDataRoot}
            onChange={e => onSettingsChange(prev => ({ ...prev, userDataRoot: e.target.value }))}
            placeholder="data"
          />
        </FormItem>
        <FormItem label="默认指纹参数（每行一个）">
          <Textarea
            value={fingerprintText}
            onChange={e => onFingerprintTextChange(e.target.value)}
            rows={3}
            placeholder="--fingerprint-brand=Chrome"
          />
        </FormItem>
        <FormItem label="默认启动参数（每行一个）">
          <Textarea
            value={launchText}
            onChange={e => onLaunchTextChange(e.target.value)}
            rows={3}
            placeholder="--disable-sync"
          />
        </FormItem>
        <FormItem label="默认代理">
          <Input
            value={settings.defaultProxy}
            onChange={e => onSettingsChange(prev => ({ ...prev, defaultProxy: e.target.value }))}
            placeholder="http://127.0.0.1:7890"
          />
        </FormItem>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormItem label="启动就绪超时（毫秒）" hint="默认 3000，慢机器可调到 5000-10000">
            <Input
              type="number"
              min={1000}
              step={500}
              value={settings.startReadyTimeoutMs}
              onChange={e => onSettingsChange(prev => ({ ...prev, startReadyTimeoutMs: Math.max(1000, Number(e.target.value) || 3000) }))}
              placeholder="3000"
            />
          </FormItem>
          <FormItem label="启动稳定窗口（毫秒）" hint="建议 1200-3000">
            <Input
              type="number"
              min={0}
              step={100}
              value={settings.startStableWindowMs}
              onChange={e => onSettingsChange(prev => ({ ...prev, startStableWindowMs: Math.max(0, Number(e.target.value) || 1200) }))}
              placeholder="1200"
            />
          </FormItem>
        </div>
      </div>
    </Modal>
  )
}
