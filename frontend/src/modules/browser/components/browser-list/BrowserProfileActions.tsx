import { Link } from 'react-router-dom'
import { Copy, Download, Eraser, Focus, Key, Play, RotateCcw, Settings, Shuffle, Square, Trash2 } from 'lucide-react'
import { Button } from '../../../../shared/components'
import type { BrowserProfile } from '../../types'

interface BrowserProfileActionsProps {
  record: BrowserProfile
  mode: 'table' | 'card'
  disabledBySync: boolean
  isStarting: boolean
  isStopping: boolean
  isSwitchingProxy: boolean
  isPinning: boolean
  isExportingCookies: boolean
  isClearingCookies: boolean
  isBusy: boolean
  canExportCookies: boolean
  canClearCookies: boolean
  exportCookieTitle: string
  clearCookieTitle: string
  onStart: (profileId: string) => void
  onStop: (profileId: string) => void
  onSwitchProxyNow: (profileId: string) => void
  onPinCenter: (profileId: string) => void
  onRestart: (profileId: string) => void
  onOpenKeywords: (record: BrowserProfile) => void
  onExportCookies: (record: BrowserProfile) => void
  onClearCookies: (record: BrowserProfile) => void
  onCopy: (record: BrowserProfile) => void
  onDelete: (profileId: string) => void
}

export function BrowserProfileActions({
  record,
  mode,
  disabledBySync,
  isStarting,
  isStopping,
  isSwitchingProxy,
  isPinning,
  isExportingCookies,
  isClearingCookies,
  isBusy,
  canExportCookies,
  canClearCookies,
  exportCookieTitle,
  clearCookieTitle,
  onStart,
  onStop,
  onSwitchProxyNow,
  onPinCenter,
  onRestart,
  onOpenKeywords,
  onExportCookies,
  onClearCookies,
  onCopy,
  onDelete,
}: BrowserProfileActionsProps) {
  const compact = mode === 'table'
  const iconClass = compact ? 'w-3.5 h-3.5' : 'w-4 h-4 mr-1.5'
  const iconOnlyClass = compact ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const ghostClass = compact ? undefined : 'px-3'

  return (
    <div className={compact ? 'flex justify-end gap-1' : 'flex items-center gap-1 flex-wrap'}>
      {record.running ? (
        <Button size="sm" variant="secondary" onClick={() => onStop(record.profileId)} title={disabledBySync ? '同步状态下无法修改主控窗口' : (isStopping ? '停止中' : '停止')} loading={isStopping} disabled={disabledBySync}>
          {!isStopping && <Square className={iconClass} />}
          {!compact && (isStopping ? '停止中' : '停止')}
        </Button>
      ) : (
        <Button size="sm" onClick={() => onStart(record.profileId)} title={disabledBySync ? '同步状态下无法修改主控窗口' : (isStarting ? '启动中' : '启动')} loading={isStarting} disabled={disabledBySync}>
          {!isStarting && <Play className={`${iconClass} fill-current`} />}
          {!compact && (isStarting ? '启动中' : '启动')}
        </Button>
      )}
      {record.running && record.autoProxySwitchEnabled && (
        <Button size="sm" variant="ghost" onClick={() => onSwitchProxyNow(record.profileId)} title={disabledBySync ? '同步状态下无法修改主控窗口' : '手动切换出口'} className={ghostClass} loading={isSwitchingProxy} disabled={disabledBySync || (isBusy && !isSwitchingProxy)}>
          {!isSwitchingProxy && <Shuffle className={iconClass} />}
          {!compact && (isSwitchingProxy ? '切换中' : '切换出口')}
        </Button>
      )}
      {record.running && (
        <Button size="sm" variant="ghost" onClick={() => onPinCenter(record.profileId)} title="置顶居中" className={ghostClass} loading={isPinning} disabled={isBusy && !isPinning}>
          {!isPinning && <Focus className={iconClass} />}
          {!compact && (isPinning ? '定位中' : '置顶居中')}
        </Button>
      )}
      {!compact && <span className="w-px h-4 bg-[var(--color-border-muted)] mx-1"></span>}
      <Button size="sm" variant="ghost" onClick={() => onRestart(record.profileId)} title={disabledBySync ? '同步状态下无法修改主控窗口' : '重启'} className={ghostClass} disabled={disabledBySync || isBusy}><RotateCcw className={iconClass} />{!compact && '重启'}</Button>
      <Button size="sm" variant="ghost" onClick={() => onOpenKeywords(record)} title={compact ? '关键字' : '关键字管理'} className={ghostClass} disabled={isBusy}><Key className={iconClass} />{!compact && '关键字'}</Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onExportCookies(record)}
        aria-label="导出 Cookie 文本"
        title={exportCookieTitle}
        className={ghostClass}
        loading={isExportingCookies}
        disabled={!canExportCookies || isClearingCookies || (isBusy && !isExportingCookies)}
      >
        {!isExportingCookies && <Download className={iconOnlyClass} />}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onClearCookies(record)}
        aria-label={record.running ? '清空全部 Cookie' : '清空用户数据'}
        title={clearCookieTitle}
        className={compact ? undefined : 'px-3 text-red-500 hover:text-red-600 hover:bg-red-50'}
        loading={isClearingCookies}
        disabled={!canClearCookies || isExportingCookies || (isBusy && !isClearingCookies)}
      >
        {!isClearingCookies && <Eraser className={`${iconOnlyClass} text-red-500`} />}
      </Button>
      <Link to={`/browser/edit/${record.profileId}`}><Button size="sm" variant="ghost" title={disabledBySync ? '同步状态下无法修改主控窗口' : '配置'} className={ghostClass} disabled={disabledBySync || isBusy}><Settings className={iconClass} />{!compact && '配置'}</Button></Link>
      <Button size="sm" variant="ghost" onClick={() => onCopy(record)} title="克隆" className={ghostClass} disabled={isBusy}><Copy className={iconClass} />{!compact && '克隆'}</Button>
      <Button size="sm" variant="ghost" onClick={() => onDelete(record.profileId)} title={disabledBySync ? '同步状态下无法修改主控窗口' : '删除'} className={compact ? undefined : 'px-3 text-red-500 hover:text-red-600 hover:bg-red-50'} disabled={disabledBySync || isBusy}><Trash2 className={`${iconClass} text-red-500`} />{!compact && '删除'}</Button>
    </div>
  )
}
