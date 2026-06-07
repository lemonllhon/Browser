import { useEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent } from 'react'
import { Eye, GripHorizontal, Keyboard, Link, List, Pause, Play, Power, RefreshCw, Settings, SquareStack, X } from 'lucide-react'
import { Button, ToastContainer, toast } from '../../../shared/components'
import { ThemeProvider } from '../../../shared/theme'
import type { WindowSyncActionResult, WindowSyncBatchInputDifferentItem, WindowSyncBatchInputResult, WindowSyncSettings, WindowSyncState } from '../types'
import {
  applyWindowSyncLayout,
  defaultWindowSyncLayoutSettings,
  getWindowSyncState,
  onWindowSyncStateChanged,
  pauseWindowSync,
  resizeWindowSyncToolbar,
  resumeWindowSync,
  saveWindowSyncSettings,
  showAllWindowSyncWindows,
  stopWindowSync,
  windowSyncBatchInputDifferent,
  windowSyncBatchInputSame,
  windowSyncCloseBlankTabs,
  windowSyncCloseCurrentTab,
  windowSyncCloseOtherTabs,
  windowSyncOpenUrls,
} from '../api'

const collapsedToolbarWidth = 360
const collapsedToolbarHeight = 76
const expandedToolbarWidth = 900
const panelToolbarHeight = 430
const defaultWindowSyncMasterColor = '#2563eb'
const themedMasterColor = 'var(--color-accent)'
type ToolbarMasterColorStyle = CSSProperties & { '--window-sync-master-color': string }

function profileCount(state: WindowSyncState | null) {
  return state?.windows?.length || state?.profileIds?.length || 0
}

function orderedWindows(state: WindowSyncState | null) {
  const windows = [...(state?.windows || [])]
  return windows.sort((a, b) => {
    if (a.master && !b.master) return -1
    if (!a.master && b.master) return 1
    return 0
  })
}

function resultMessage(result: WindowSyncBatchInputResult | null) {
  if (!result) return '批量输入已执行'
  return `批量输入完成：成功 ${result.success}/${result.total}${result.failed > 0 ? `，失败 ${result.failed}` : ''}`
}

function actionResultMessage(action: string, result: WindowSyncActionResult | null) {
  if (!result) return `${action}已执行`
  return `${action}完成：成功 ${result.success}/${result.total}${result.failed > 0 ? `，失败 ${result.failed}` : ''}`
}

function stateToSettings(state: WindowSyncState | null): WindowSyncSettings {
  return {
    masterColor: state?.masterColor || defaultWindowSyncMasterColor,
    syncKeyboard: state?.syncKeyboard ?? true,
    syncMouse: state?.syncMouse ?? true,
  }
}

function normalizeColor(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return defaultWindowSyncMasterColor
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
}

function toolbarMasterColor(value?: string) {
  const color = normalizeColor(value || '')
  return color.toLowerCase() === defaultWindowSyncMasterColor ? themedMasterColor : color
}

function layoutForMode(state: WindowSyncState | null, mode: 'grid' | 'stack', scope?: 'app-screen' | 'toolbar-screen' | 'all-screens') {
  const fallback = defaultWindowSyncLayoutSettings()
  const layout = state?.layout
  return {
    ...fallback,
    ...(layout || {}),
    mode,
    width: layout?.width || fallback.width,
    height: layout?.height || fallback.height,
    gapX: layout?.gapX || fallback.gapX,
    gapY: layout?.gapY || fallback.gapY,
    perRow: layout?.perRow || fallback.perRow,
    scope: scope || layout?.scope || fallback.scope,
  }
}

export function WindowSyncFloatingToolbar() {
  const [state, setState] = useState<WindowSyncState | null>(null)
  const [loadingCommand, setLoadingCommand] = useState<string>('')
  const [expanded, setExpanded] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchMode, setBatchMode] = useState<'same' | 'different'>('same')
  const [sameText, setSameText] = useState('')
  const [differentTexts, setDifferentTexts] = useState<Record<string, string>>({})
  const [batchResult, setBatchResult] = useState<WindowSyncBatchInputResult | null>(null)
  const [tabPanelOpen, setTabPanelOpen] = useState(false)
  const [openUrlsText, setOpenUrlsText] = useState('')
  const [tabResult, setTabResult] = useState<WindowSyncActionResult | null>(null)
  const [listPanelOpen, setListPanelOpen] = useState(false)
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<WindowSyncSettings>(() => stateToSettings(null))
  const differentInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const loadStateInFlightRef = useRef(false)

  const loadState = async () => {
    if (loadStateInFlightRef.current) {
      return
    }
    loadStateInFlightRef.current = true
    try {
      const next = await getWindowSyncState()
      setState(next?.active ? next : null)
    } catch {
      setState(null)
    } finally {
      loadStateInFlightRef.current = false
    }
  }

  const runCommand = async (command: string) => {
    setLoadingCommand(command)
    try {
      let next: WindowSyncState | null = null
      if (command === 'show-all') {
        next = await showAllWindowSyncWindows()
      } else if (command === 'pause') {
        next = await pauseWindowSync()
      } else if (command === 'resume') {
        next = await resumeWindowSync()
      } else if (command === 'stop') {
        next = await stopWindowSync()
      }
      setState(next?.active ? next : null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '工具栏操作失败')
    } finally {
      setLoadingCommand('')
    }
  }

  const runBatchInput = async () => {
    const windows = orderedWindows(state)
    if (windows.length === 0) {
      toast.error('当前没有可批量输入的同步窗口')
      return
    }
    if (batchMode === 'same' && sameText.trim() === '') {
      toast.error('请输入需要填充到所有窗口的文本')
      return
    }
    if (batchMode === 'different') {
      const missingWindow = windows.find(window => (differentTexts[window.profileId] || '').trim() === '')
      if (missingWindow) {
        toast.error(`请填写「${missingWindow.profileName || missingWindow.profileId}」的差异文本`)
        const index = windows.findIndex(window => window.profileId === missingWindow.profileId)
        focusDifferentTextInput(index)
        return
      }
    }
    setLoadingCommand(`batch-input:${batchMode}`)
    try {
      const result =
        batchMode === 'same'
          ? await windowSyncBatchInputSame(sameText)
          : await windowSyncBatchInputDifferent(
              windows.map<WindowSyncBatchInputDifferentItem>(window => ({
                profileId: window.profileId,
                text: differentTexts[window.profileId] || '',
              })),
            )
      setBatchResult(result)
      if ((result?.failed || 0) > 0) {
        toast.warning(resultMessage(result))
      } else {
        toast.success(resultMessage(result))
      }
      await loadState()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '批量输入失败')
    } finally {
      setLoadingCommand('')
    }
  }

  const applyLayout = async (mode: 'grid' | 'stack', scope?: 'app-screen' | 'toolbar-screen' | 'all-screens') => {
    const command = `layout:${mode}:${scope || 'keep'}`
    setLoadingCommand(command)
    try {
      const next = await applyWindowSyncLayout(layoutForMode(state, mode, scope))
      setState(next?.active ? next : null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '布局切换失败')
    } finally {
      setLoadingCommand('')
    }
  }

  const runTabCommand = async (command: string, label: string, urls?: string[]) => {
    setLoadingCommand(command)
    try {
      let result: WindowSyncActionResult
      if (command === 'close-other-tabs') {
        result = await windowSyncCloseOtherTabs()
      } else if (command === 'close-current-tab') {
        result = await windowSyncCloseCurrentTab()
      } else if (command === 'close-blank-tabs') {
        result = await windowSyncCloseBlankTabs()
      } else {
        result = await windowSyncOpenUrls(urls || [])
      }
      setTabResult(result)
      if ((result?.failed || 0) > 0) {
        toast.warning(actionResultMessage(label, result))
      } else {
        toast.success(actionResultMessage(label, result))
      }
      await loadState()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${label}失败`)
    } finally {
      setLoadingCommand('')
    }
  }

  const runOpenUrls = async () => {
    const urls = openUrlsText
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean)
    if (urls.length === 0) {
      toast.error('请输入需要打开的网址')
      return
    }
    await runTabCommand('open-urls', '打开网站', urls)
  }

  const openSinglePanel = (panel: 'batch' | 'tab' | 'list' | 'settings') => {
    setBatchOpen(panel === 'batch' ? open => !open : false)
    setTabPanelOpen(panel === 'tab' ? open => !open : false)
    setListPanelOpen(panel === 'list' ? open => !open : false)
    setSettingsPanelOpen(panel === 'settings' ? open => !open : false)
    if (panel === 'settings') {
      setSettingsDraft(stateToSettings(state))
    }
    setBatchResult(null)
    setTabResult(null)
  }

  const closePanelsForCollapse = () => {
    setBatchOpen(false)
    setTabPanelOpen(false)
    setListPanelOpen(false)
    setSettingsPanelOpen(false)
    setBatchResult(null)
    setTabResult(null)
  }

  const saveSettings = async () => {
    setLoadingCommand('save-settings')
    try {
      const next = await saveWindowSyncSettings({
        ...settingsDraft,
        masterColor: normalizeColor(settingsDraft.masterColor),
      })
      setState(next?.active ? next : null)
      setSettingsDraft(stateToSettings(next))
      toast.success('同步设置已保存')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存同步设置失败')
    } finally {
      setLoadingCommand('')
    }
  }

  const focusDifferentTextInput = (index: number) => {
    const windows = orderedWindows(state)
    if (windows.length === 0) return
    const nextIndex = ((index % windows.length) + windows.length) % windows.length
    const nextProfileId = windows[nextIndex]?.profileId
    if (!nextProfileId) return
    window.requestAnimationFrame(() => {
      const input = differentInputRefs.current[nextProfileId]
      input?.focus()
      input?.select()
    })
  }

  const applyDifferentTextLines = (profileId: string, rawText: string) => {
    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    if (!normalized.includes('\n')) return false

    const lines = normalized
      .split('\n')
      .map(line => line.replace(/\s+$/g, ''))
      .filter(line => line.trim() !== '')
    if (lines.length <= 1) return false

    const windows = orderedWindows(state)
    const startIndex = windows.findIndex(window => window.profileId === profileId)
    if (startIndex < 0) return false

    const targets = windows.slice(startIndex)
    const fillCount = Math.min(targets.length, lines.length)
    if (fillCount <= 0) return false

    setDifferentTexts(prev => {
      const next = { ...prev }
      for (let index = 0; index < fillCount; index += 1) {
        next[targets[index].profileId] = lines[index]
      }
      return next
    })

    const ignoredCount = Math.max(0, lines.length - fillCount)
    toast.success(`已按窗口顺序填充 ${fillCount} 项${ignoredCount > 0 ? `，多出的 ${ignoredCount} 行已忽略` : ''}`)
    focusDifferentTextInput(startIndex + fillCount - 1)
    return true
  }

  const handleSameTextKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return
    event.preventDefault()
    void runBatchInput()
  }

  const handleDifferentTextKeyDown = (profileId: string, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    const windows = orderedWindows(state)
    const index = windows.findIndex(window => window.profileId === profileId)
    if (index < 0) return
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      focusDifferentTextInput(index + 1)
      return
    }
    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault()
      focusDifferentTextInput(index + 1)
      return
    }
    if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault()
      focusDifferentTextInput(index - 1)
    }
  }

  const handleDifferentTextPaste = (profileId: string, event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text')
    if (applyDifferentTextLines(profileId, text)) {
      event.preventDefault()
    }
  }

  const panelOpen = batchOpen || tabPanelOpen || listPanelOpen || settingsPanelOpen

  useEffect(() => {
    document.body.classList.add('window-sync-toolbar-body')
    void loadState()
    const offStateChanged = onWindowSyncStateChanged(next => {
      setState(next?.active ? next : null)
    })
    const timer = window.setInterval(() => void loadState(), 2500)
    return () => {
      document.body.classList.remove('window-sync-toolbar-body')
      offStateChanged()
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const width = panelOpen || expanded ? expandedToolbarWidth : collapsedToolbarWidth
    const height = panelOpen ? panelToolbarHeight : collapsedToolbarHeight
    void resizeWindowSyncToolbar(width, height).catch(() => {
      // The toolbar remains usable even if the host window is already shutting down.
    })
  }, [expanded, panelOpen])

  useEffect(() => {
    const windows = orderedWindows(state)
    const activeProfileIds = new Set(windows.map(window => window.profileId))
    for (const profileId of Object.keys(differentInputRefs.current)) {
      if (!activeProfileIds.has(profileId)) {
        delete differentInputRefs.current[profileId]
      }
    }
    setDifferentTexts(prev => {
      const next: Record<string, string> = {}
      for (const window of windows) {
        next[window.profileId] = prev[window.profileId] || ''
      }
      return next
    })
  }, [state?.sessionId, state?.windows])

  useEffect(() => {
    if (settingsPanelOpen) {
      setSettingsDraft(stateToSettings(state))
    }
  }, [settingsPanelOpen, state?.masterColor, state?.syncKeyboard, state?.syncMouse])

  const paused = !!state?.paused
  const count = profileCount(state)
  const windows = orderedWindows(state)
  const batchLoading = loadingCommand === 'batch-input:same' || loadingCommand === 'batch-input:different'
  const masterColor = toolbarMasterColor(state?.masterColor)

  return (
    <ThemeProvider>
      <main
        className={`window-sync-floating-toolbar ${panelOpen ? 'is-panel-open' : ''}`}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => {
          setExpanded(false)
          closePanelsForCollapse()
        }}
      >
        <div className="window-sync-toolbar-row">
          <div className="window-sync-toolbar-drag" title="拖动工具栏">
            <GripHorizontal className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: paused ? 'var(--color-warning)' : masterColor }}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                {paused ? '窗口同步已暂停' : state?.active ? '窗口同步中' : '等待同步状态'}
              </div>
              <div className="truncate text-[11px] text-[var(--color-text-muted)]">
                {count > 0 ? `${count} 个窗口 · 主控固定` : '连接主程序中'}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              title="展示窗口"
              onClick={() => void runCommand('show-all')}
              loading={loadingCommand === 'show-all'}
              className="h-9 w-9 px-0"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="danger"
              title="停止同步"
              onClick={() => void runCommand('stop')}
              loading={loadingCommand === 'stop'}
              className="h-9 w-9 px-0"
            >
              <Power className="h-4 w-4" />
            </Button>
          </div>
          <div className={`window-sync-toolbar-expanded ${expanded || panelOpen ? 'is-expanded' : ''}`}>
            <Button
              size="sm"
              variant="secondary"
              title={paused ? '恢复同步' : '暂停同步'}
              onClick={() => void runCommand(paused ? 'resume' : 'pause')}
              loading={loadingCommand === 'pause' || loadingCommand === 'resume'}
              className="h-9 px-3"
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {paused ? '恢复' : '暂停'}
            </Button>
            <Button
              size="sm"
              variant={batchOpen ? 'secondary' : 'ghost'}
              title="批量输入"
              onClick={() => openSinglePanel('batch')}
              className="window-sync-toolbar-command"
            >
              <Keyboard className="h-4 w-4" />
              输入
            </Button>
            <Button
              size="sm"
              variant={tabPanelOpen ? 'secondary' : 'ghost'}
              title="标签控制"
              onClick={() => openSinglePanel('tab')}
              className="window-sync-toolbar-command"
            >
              <Link className="h-4 w-4" />
              标签
            </Button>
            <Button
              size="sm"
              variant={listPanelOpen ? 'secondary' : 'ghost'}
              title="同步窗口列表"
              onClick={() => openSinglePanel('list')}
              className="window-sync-toolbar-command"
            >
              <List className="h-4 w-4" />
              列表
            </Button>
            <Button
              size="sm"
              variant={settingsPanelOpen ? 'secondary' : 'ghost'}
              title="同步设置"
              onClick={() => openSinglePanel('settings')}
              className="window-sync-toolbar-command"
            >
              <Settings className="h-4 w-4" />
              设置
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="宫格布局"
              onClick={() => void applyLayout('grid')}
              loading={loadingCommand === 'layout:grid:keep'}
              className="window-sync-toolbar-command"
            >
              <SquareStack className="h-4 w-4" />
              宫格
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="堆叠布局"
              onClick={() => void applyLayout('stack')}
              loading={loadingCommand === 'layout:stack:keep'}
              className="window-sync-toolbar-command"
            >
              <SquareStack className="h-4 w-4" />
              堆叠
            </Button>
            <Button
              size="sm"
              variant={state?.layout?.scope === 'toolbar-screen' ? 'secondary' : 'ghost'}
              title="按工具栏所在屏幕重新宫格排列"
              onClick={() => void applyLayout('grid', 'toolbar-screen')}
              loading={loadingCommand === 'layout:grid:toolbar-screen'}
              className="window-sync-toolbar-command"
            >
              当前屏
            </Button>
            <Button
              size="sm"
              variant={state?.layout?.scope === 'all-screens' ? 'secondary' : 'ghost'}
              title="按所有屏幕区域重新宫格排列"
              onClick={() => void applyLayout('grid', 'all-screens')}
              loading={loadingCommand === 'layout:grid:all-screens'}
              className="window-sync-toolbar-command"
            >
              全部屏
            </Button>
            <Button size="sm" variant="ghost" title="刷新状态" onClick={() => void loadState()} className="h-9 w-9 px-0">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {batchOpen && (
          <section className="window-sync-batch-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">批量输入</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  当前同步窗口 {windows.length} 个，差异文本支持多行粘贴按序填充；Ctrl+Enter 跳到下一个输入框，Alt+↑/↓ 上下切换。
                </div>
              </div>
              <Button size="sm" variant="ghost" title="关闭批量输入" onClick={() => setBatchOpen(false)} className="h-8 w-8 px-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="window-sync-batch-tabs">
              <button type="button" className={batchMode === 'same' ? 'is-active' : ''} onClick={() => setBatchMode('same')}>相同文本</button>
              <button type="button" className={batchMode === 'different' ? 'is-active' : ''} onClick={() => setBatchMode('different')}>差异文本</button>
            </div>
            {batchMode === 'same' ? (
              <textarea
                className="window-sync-batch-textarea"
                value={sameText}
                onChange={event => setSameText(event.target.value)}
                onKeyDown={handleSameTextKeyDown}
                title="Ctrl+Enter 执行批量输入"
                placeholder="输入要填充到所有同步窗口当前焦点输入框的文本"
              />
            ) : (
              <div className="window-sync-batch-window-list">
                {windows.map((window, index) => (
                  <label key={window.profileId} className="window-sync-batch-window-item">
                    <span className="window-sync-batch-window-label">
                      <span className="window-sync-index-badge">{index + 1}</span>
                      <span className={window.master ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}>
                        {window.master ? '主控' : '被控'}
                      </span>
                      <span className="truncate">{window.profileName || window.profileId}</span>
                    </span>
                    <input
                      ref={node => {
                        differentInputRefs.current[window.profileId] = node
                      }}
                      value={differentTexts[window.profileId] || ''}
                      onChange={event => setDifferentTexts(prev => ({ ...prev, [window.profileId]: event.target.value }))}
                      onKeyDown={event => handleDifferentTextKeyDown(window.profileId, event)}
                      onPaste={event => handleDifferentTextPaste(window.profileId, event)}
                      title="粘贴多行会从当前窗口开始按顺序填充，Ctrl+Enter 跳到下一个窗口"
                      placeholder="该窗口输入内容"
                    />
                  </label>
                ))}
              </div>
            )}
            {batchResult && (
              <div className="window-sync-batch-result">
                {batchResult.results.map(item => (
                  <div key={item.profileId} className={item.success ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                    {(item.master ? '主控' : '被控')} · {item.profileName || item.profileId}：{item.success ? '成功' : item.error || '失败'}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setBatchResult(null)}>清除结果</Button>
              <Button size="sm" onClick={() => void runBatchInput()} loading={batchLoading}>输入</Button>
            </div>
          </section>
        )}
        {tabPanelOpen && (
          <section className="window-sync-batch-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">标签控制</div>
                <div className="text-xs text-[var(--color-text-muted)]">当前同步窗口 {windows.length} 个，按主控当前标签执行。</div>
              </div>
              <Button size="sm" variant="ghost" title="关闭标签控制" onClick={() => setTabPanelOpen(false)} className="h-8 w-8 px-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="window-sync-tab-actions">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void runTabCommand('close-other-tabs', '关闭其他标签页')}
                loading={loadingCommand === 'close-other-tabs'}
              >
                关闭其他标签页
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void runTabCommand('close-current-tab', '关闭当前标签页')}
                loading={loadingCommand === 'close-current-tab'}
              >
                关闭当前标签页
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void runTabCommand('close-blank-tabs', '关闭空白标签页')}
                loading={loadingCommand === 'close-blank-tabs'}
              >
                关闭空白标签页
              </Button>
            </div>
            <textarea
              className="window-sync-batch-textarea window-sync-open-urls-textarea"
              value={openUrlsText}
              onChange={event => setOpenUrlsText(event.target.value)}
              placeholder="输入要在所有同步窗口打开的网址，多个网址换行区分"
            />
            {tabResult && (
              <div className="window-sync-batch-result">
                {tabResult.results.map(item => (
                  <div key={item.profileId} className={item.success ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                    {(item.master ? '主控' : '被控')} · {item.profileName || item.profileId}：{item.success ? '成功' : item.error || '失败'}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setTabResult(null)}>清除结果</Button>
              <Button size="sm" onClick={() => void runOpenUrls()} loading={loadingCommand === 'open-urls'}>打开网站</Button>
            </div>
          </section>
        )}
        {listPanelOpen && (
          <section className="window-sync-batch-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">同步窗口列表</div>
                <div className="text-xs text-[var(--color-text-muted)]">当前同步窗口 {windows.length} 个，主控窗口固定。</div>
              </div>
              <Button size="sm" variant="ghost" title="关闭窗口列表" onClick={() => setListPanelOpen(false)} className="h-8 w-8 px-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="window-sync-window-list">
              {windows.map((window, index) => (
                <div key={window.profileId} className="window-sync-window-list-item">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="window-sync-index-badge">{index + 1}</span>
                      <span
                        className={window.master ? 'window-sync-role-badge is-master' : 'window-sync-role-badge'}
                        style={window.master ? ({ '--window-sync-master-color': masterColor } as ToolbarMasterColorStyle) : undefined}
                      >
                        {window.master ? '主控' : '被控'}
                      </span>
                      <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">{window.profileName || window.profileId}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                      PID {window.pid || '-'} · 调试端口 {window.debugPort || '-'}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={window.running ? 'text-xs text-[var(--color-success)]' : 'text-xs text-[var(--color-error)]'}>
                      {window.running ? '运行中' : '未运行'}
                    </div>
                    <div className={window.debugReady ? 'mt-1 text-xs text-[var(--color-success)]' : 'mt-1 text-xs text-[var(--color-text-muted)]'}>
                      {window.debugReady ? '调试就绪' : '调试未就绪'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => void loadState()}>刷新</Button>
              <Button size="sm" variant="secondary" onClick={() => void runCommand('show-all')} loading={loadingCommand === 'show-all'}>展示窗口</Button>
            </div>
          </section>
        )}
        {settingsPanelOpen && (
          <section className="window-sync-batch-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">同步设置</div>
                <div className="text-xs text-[var(--color-text-muted)]">保存后立即应用到当前同步会话。</div>
              </div>
              <Button size="sm" variant="ghost" title="关闭同步设置" onClick={() => setSettingsPanelOpen(false)} className="h-8 w-8 px-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="window-sync-settings-panel">
              <label className="window-sync-setting-row">
                <span>
                  <span className="block text-sm font-medium text-[var(--color-text-primary)]">主控窗口颜色</span>
                  <span className="block text-xs text-[var(--color-text-muted)]">用于主控窗口标识。</span>
                </span>
                <span className="flex items-center gap-2">
                  <input
                    type="color"
                    value={normalizeColor(settingsDraft.masterColor)}
                    onChange={event => setSettingsDraft(prev => ({ ...prev, masterColor: event.target.value }))}
                    className="window-sync-color-input"
                  />
                  <input
                    value={settingsDraft.masterColor}
                    onChange={event => setSettingsDraft(prev => ({ ...prev, masterColor: event.target.value }))}
                    className="window-sync-color-text"
                    placeholder={defaultWindowSyncMasterColor}
                  />
                </span>
              </label>
              <label className="window-sync-setting-row">
                <span>
                  <span className="block text-sm font-medium text-[var(--color-text-primary)]">同步键盘输入</span>
                  <span className="block text-xs text-[var(--color-text-muted)]">开启后主控按键会同步到被控窗口。</span>
                </span>
                <input
                  type="checkbox"
                  checked={settingsDraft.syncKeyboard}
                  onChange={event => setSettingsDraft(prev => ({ ...prev, syncKeyboard: event.target.checked }))}
                  className="window-sync-toggle"
                />
              </label>
              <label className="window-sync-setting-row">
                <span>
                  <span className="block text-sm font-medium text-[var(--color-text-primary)]">同步鼠标输入</span>
                  <span className="block text-xs text-[var(--color-text-muted)]">开启后点击、滚动和拖动会同步到被控窗口。</span>
                </span>
                <input
                  type="checkbox"
                  checked={settingsDraft.syncMouse}
                  onChange={event => setSettingsDraft(prev => ({ ...prev, syncMouse: event.target.checked }))}
                  className="window-sync-toggle"
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSettingsDraft(stateToSettings(state))}>重置</Button>
              <Button size="sm" onClick={() => void saveSettings()} loading={loadingCommand === 'save-settings'}>保存</Button>
            </div>
          </section>
        )}
      </main>
      <ToastContainer />
    </ThemeProvider>
  )
}
