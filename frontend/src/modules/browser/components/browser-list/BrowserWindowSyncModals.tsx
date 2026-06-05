import { Layers, LayoutGrid, RefreshCw, Sliders } from 'lucide-react'
import { Badge, Button, FormItem, Input, Modal, Switch } from '../../../../shared/components'
import type { WindowSyncCandidate, WindowSyncLayoutSettings, WindowSyncSettings, WindowSyncState } from '../../types'

type WindowSyncModalProps = {
  open: boolean
  state: WindowSyncState | null
  candidates: WindowSyncCandidate[]
  selectedIds: Set<string>
  masterId: string
  loading: boolean
  onClose: () => void
  onStop: () => void
  onStart: () => void
  onSelectAll: () => void
  onClear: () => void
  onRefresh: () => void
  onToggleCandidate: (profileId: string) => void
  onMasterChange: (profileId: string) => void
}

export function BrowserWindowSyncModal({
  open,
  state,
  candidates,
  selectedIds,
  masterId,
  loading,
  onClose,
  onStop,
  onStart,
  onSelectAll,
  onClear,
  onRefresh,
  onToggleCandidate,
  onMasterChange,
}: WindowSyncModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="窗口同步"
      width="760px"
      footer={(
        <>
          {state?.active && (
            <Button variant="secondary" onClick={onStop} loading={loading}>
              停止同步
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>取消</Button>
          {!state?.active && (
            <Button onClick={onStart} loading={loading}>
              开始同步窗口
            </Button>
          )}
        </>
      )}
    >
      <div className="space-y-4">
        {state?.active && (
          <div className="rounded-lg border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-primary)]">
              <Badge variant="info" dot dotClassName="w-2 h-2">同步中</Badge>
              <span>主控窗口：{state.windows.find(item => item.profileId === state.masterProfileId)?.profileName || state.masterProfileId}</span>
              <span className="text-[var(--color-text-muted)]">同步状态下无法修改主控窗口。</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">选择需要同时操控的窗口</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">已运行实例会立即加入同步；未运行实例可勾选，并在开始同步时自动启动。</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onSelectAll} disabled={!!state?.active || candidates.length === 0}>
              全选
            </Button>
            <Button size="sm" variant="ghost" onClick={onClear} disabled={!!state?.active || selectedIds.size === 0}>
              清空
            </Button>
            <Button size="sm" variant="secondary" onClick={onRefresh} loading={loading}>
              <RefreshCw className="w-4 h-4" />刷新
            </Button>
          </div>
        </div>

        <div className="border border-[var(--color-border-default)] rounded-lg overflow-hidden">
          <div className="grid grid-cols-[44px_1.4fr_120px_120px_96px] gap-3 bg-[var(--color-bg-secondary)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]">
            <span>选择</span>
            <span>窗口</span>
            <span>状态</span>
            <span>主控窗口</span>
            <span>调试端口</span>
          </div>
          <div className="max-h-[360px] overflow-y-auto divide-y divide-[var(--color-border-muted)]">
            {candidates.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-[var(--color-text-muted)]">
                {loading ? '正在加载窗口...' : '暂无可同步窗口，请先启动至少 2 个实例。'}
              </div>
            ) : (
              candidates.map(candidate => {
                const checked = selectedIds.has(candidate.profileId)
                const isMaster = masterId === candidate.profileId
                const selectable = candidate.canSync || !!candidate.canAutoStart
                const statusLabel = candidate.canSync ? '可同步' : candidate.canAutoStart ? '将启动' : '不可用'
                const statusVariant = candidate.canSync ? 'success' : candidate.canAutoStart ? 'info' : 'warning'
                return (
                  <div
                    key={candidate.profileId}
                    className={`grid grid-cols-[44px_1.4fr_120px_120px_96px] gap-3 items-center px-3 py-2 text-sm ${selectable ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] bg-[var(--color-bg-muted)]/30'}`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-[var(--color-accent)]"
                      checked={checked}
                      disabled={!selectable || !!state?.active}
                      onChange={() => onToggleCandidate(candidate.profileId)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate font-medium">{candidate.profileName}</span>
                        {candidate.master && <Badge variant="info" size="sm">当前主控</Badge>}
                      </div>
                      {!candidate.canSync && candidate.unavailable && (
                        <div className={`text-xs mt-0.5 ${candidate.canAutoStart ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-error)]'}`}>{candidate.unavailable}</div>
                      )}
                    </div>
                    <Badge variant={statusVariant} size="sm" dot>
                      {statusLabel}
                    </Badge>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="window-sync-master"
                        className="w-4 h-4 accent-[var(--color-accent)]"
                        checked={isMaster}
                        disabled={!selectable || !checked || !!state?.active}
                        onChange={() => onMasterChange(candidate.profileId)}
                      />
                      <span className="text-xs">{isMaster ? '主控' : '设为主控'}</span>
                    </label>
                    <span className="text-xs font-mono text-[var(--color-text-muted)]">{candidate.debugPort || '-'}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span>已选 {selectedIds.size} 个窗口</span>
          <span>主控：{candidates.find(item => item.profileId === masterId)?.profileName || '未选择'}</span>
        </div>
      </div>
    </Modal>
  )
}

type WindowSyncLayoutModalProps = {
  open: boolean
  layout: WindowSyncLayoutSettings
  loading: boolean
  onClose: () => void
  onApply: (settings?: WindowSyncLayoutSettings) => void
  onLayoutChange: (settings: WindowSyncLayoutSettings) => void
  onLayoutPatch: (patch: Partial<WindowSyncLayoutSettings>) => void
}

const WINDOW_SYNC_LAYOUT_OPTIONS = [
  { mode: 'grid', label: '宫格布局', icon: <LayoutGrid className="w-4 h-4" /> },
  { mode: 'stack', label: '堆叠布局', icon: <Layers className="w-4 h-4" /> },
  { mode: 'custom', label: '自定义', icon: <Sliders className="w-4 h-4" /> },
]

export function BrowserWindowSyncLayoutModal({
  open,
  layout,
  loading,
  onClose,
  onApply,
  onLayoutChange,
  onLayoutPatch,
}: WindowSyncLayoutModalProps) {
  const handleModeClick = (mode: string) => {
    const next = { ...layout, mode }
    onLayoutChange(next)
    if (mode !== 'custom') {
      void onApply(next)
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="窗口布局"
      width="560px"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>关闭</Button>
          <Button
            onClick={() => {
              void onApply()
              onClose()
            }}
            loading={loading}
          >
            应用布局
          </Button>
        </>
      )}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {WINDOW_SYNC_LAYOUT_OPTIONS.map(item => (
            <Button
              key={item.mode}
              size="sm"
              variant={layout.mode === item.mode ? 'primary' : 'secondary'}
              onClick={() => handleModeClick(item.mode)}
              loading={loading && layout.mode === item.mode}
            >
              {item.icon}{item.label}
            </Button>
          ))}
        </div>

        <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            {layout.mode === 'stack' ? '堆叠布局' : layout.mode === 'custom' ? '自定义布局' : '宫格布局'}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {layout.mode === 'stack'
              ? '所有同步窗口撑满主屏，主控窗口保持在最上层。'
              : layout.mode === 'custom'
                ? '按尺寸、间距和每行数量排列，允许窗口溢出主屏。'
                : '所有同步窗口会在主屏工作区自动平铺排列。'}
          </p>
        </div>

        <div className={layout.mode === 'custom' ? 'space-y-4' : 'space-y-4 opacity-60'}>
          <div className="grid grid-cols-2 gap-4">
            <FormItem label="窗口宽度">
              <Input
                type="number"
                min={320}
                step={10}
                disabled={layout.mode !== 'custom'}
                value={layout.width}
                onChange={e => onLayoutPatch({ width: Math.max(320, Number(e.target.value) || 1500) })}
              />
            </FormItem>
            <FormItem label="窗口高度">
              <Input
                type="number"
                min={240}
                step={10}
                disabled={layout.mode !== 'custom'}
                value={layout.height}
                onChange={e => onLayoutPatch({ height: Math.max(240, Number(e.target.value) || 500) })}
              />
            </FormItem>
            <FormItem label="水平间距">
              <Input
                type="number"
                min={0}
                step={1}
                disabled={layout.mode !== 'custom'}
                value={layout.gapX}
                onChange={e => onLayoutPatch({ gapX: Math.max(0, Number(e.target.value) || 0) })}
              />
            </FormItem>
            <FormItem label="垂直间距">
              <Input
                type="number"
                min={0}
                step={1}
                disabled={layout.mode !== 'custom'}
                value={layout.gapY}
                onChange={e => onLayoutPatch({ gapY: Math.max(0, Number(e.target.value) || 0) })}
              />
            </FormItem>
          </div>
          <FormItem label="每行数量">
            <Input
              type="number"
              min={1}
              step={1}
              disabled={layout.mode !== 'custom'}
              value={layout.perRow}
              onChange={e => onLayoutPatch({ perRow: Math.max(1, Number(e.target.value) || 2) })}
            />
          </FormItem>
        </div>
      </div>
    </Modal>
  )
}

type WindowSyncSettingsModalProps = {
  open: boolean
  settings: WindowSyncSettings
  loading: boolean
  onClose: () => void
  onSave: () => void
  onSettingsChange: (patch: Partial<WindowSyncSettings>) => void
}

export function BrowserWindowSyncSettingsModal({
  open,
  settings,
  loading,
  onClose,
  onSave,
  onSettingsChange,
}: WindowSyncSettingsModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="窗口同步设置"
      width="460px"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={onSave} loading={loading}>保存</Button>
        </>
      )}
    >
      <div className="space-y-5">
        <FormItem label="主控窗口颜色">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings.masterColor || '#2563eb'}
              onChange={e => onSettingsChange({ masterColor: e.target.value })}
              className="h-9 w-12 rounded border border-[var(--color-border-default)] bg-transparent"
            />
            <Input
              value={settings.masterColor || '#2563eb'}
              onChange={e => onSettingsChange({ masterColor: e.target.value })}
              placeholder="#2563eb"
            />
          </div>
        </FormItem>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-[var(--color-border-default)] px-3 py-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">同步键盘输入</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">开启后，主控窗口的按键会发送到被控窗口。</p>
            </div>
            <Switch
              checked={settings.syncKeyboard}
              onChange={checked => onSettingsChange({ syncKeyboard: checked })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[var(--color-border-default)] px-3 py-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">同步鼠标输入</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">开启后，点击和滚动会发送到被控窗口。</p>
            </div>
            <Switch
              checked={settings.syncMouse}
              onChange={checked => onSettingsChange({ syncMouse: checked })}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
