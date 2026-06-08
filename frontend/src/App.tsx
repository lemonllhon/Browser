import { Suspense, lazy, useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './shared/theme'
import { Layout } from './shared/layout'
import { ToastContainer, Modal, Button, Loading, Progress, toast } from './shared/components'
import { AlertCircle } from 'lucide-react'
import { useNotificationStore } from './store/notificationStore'
import { useBackupStore } from './store/backupStore'
import { forceQuitApp, quitAppOnly, saveWindowState, stopBrowserInstance } from './shared/backend/client'
import {
  checkAppUpdate,
  downloadAppUpdate,
  installDownloadedAppUpdate,
  onAppUpdateDownloadProgress,
  onAppUpdatePending,
  onAppUpdatePendingInstallFailed,
  onAppUpdatePendingNotification,
  openAppReleasePage,
  type AppUpdateDownloadProgress,
  type AppUpdateInfo,
  type AppUpdatePendingUpdate,
} from './modules/settings/api'
import {
  getRuntimeEnvironment,
  getRuntimeWindowSize,
  hideRuntimeWindow,
  isRuntimeWindowMaximised,
  isRuntimeWindowMinimised,
  isRuntimeWindowNormal,
  minimiseRuntimeWindow,
  onRuntimeEvent,
  quitRuntime,
} from './shared/backend/runtime'

function lazyNamed<TModule extends Record<string, ComponentType<any>>>(
  loader: () => Promise<TModule>,
  exportName: keyof TModule,
) {
  return lazy(async () => {
    const module = await loader()
    return {
      default: module[exportName] as ComponentType<any>,
    }
  })
}

const DashboardPage = lazyNamed(() => import('./modules/dashboard/DashboardPage'), 'DashboardPage')
const SettingsPage = lazyNamed(() => import('./modules/settings/SettingsPage'), 'SettingsPage')
const ProfilePage = lazyNamed(() => import('./modules/profile/ProfilePage'), 'ProfilePage')
const AdminKeygenPage = lazyNamed(() => import('./modules/profile/AdminKeygenPage'), 'AdminKeygenPage')
const ChartsPage = lazyNamed(() => import('./modules/charts/ChartsPage'), 'ChartsPage')
const BrowserListPage = lazyNamed(() => import('./modules/browser/pages/BrowserListPage'), 'BrowserListPage')
const BrowserDetailPage = lazyNamed(() => import('./modules/browser/pages/BrowserDetailPage'), 'BrowserDetailPage')
const BrowserEditPage = lazyNamed(() => import('./modules/browser/pages/BrowserEditPage'), 'BrowserEditPage')
const BrowserCopyPage = lazyNamed(() => import('./modules/browser/pages/BrowserCopyPage'), 'BrowserCopyPage')
const BrowserLogsPage = lazyNamed(() => import('./modules/browser/pages/BrowserLogsPage'), 'BrowserLogsPage')
const ProxyPoolPage = lazyNamed(() => import('./modules/browser/pages/ProxyPoolPage'), 'ProxyPoolPage')
const CoreManagementPage = lazyNamed(() => import('./modules/browser/pages/CoreManagementPage'), 'CoreManagementPage')
const ExtensionManagementPage = lazyNamed(() => import('./modules/browser/pages/ExtensionManagementPage'), 'ExtensionManagementPage')
const LaunchApiDocsPage = lazyNamed(() => import('./modules/browser/pages/LaunchApiDocsPage'), 'LaunchApiDocsPage')
const OrganizationManagementPage = lazyNamed(() => import('./modules/browser/pages/OrganizationManagementPage'), 'OrganizationManagementPage')
const AutomationPage = lazyNamed(() => import('./modules/browser/pages/AutomationPage'), 'AutomationPage')
const UsageTutorialPage = lazyNamed(() => import('./modules/browser/pages/UsageTutorialPage'), 'UsageTutorialPage')
const QuickLaunchModal = lazyNamed(() => import('./modules/browser/components/QuickLaunchModal'), 'QuickLaunchModal')
const FirstRunOnboarding = lazy(async () => {
  const module = await import('./modules/onboarding/components/FirstRunOnboarding')
  return { default: module.FirstRunOnboarding }
})

async function saveNormalWindowSize() {
  try {
    const [isNormal, isMaximised, isMinimised] = await Promise.all([
      isRuntimeWindowNormal().catch(() => false),
      isRuntimeWindowMaximised().catch(() => false),
      isRuntimeWindowMinimised().catch(() => false),
    ])
    if (!isNormal || isMaximised || isMinimised) return

    const size = await getRuntimeWindowSize()
    const width = Math.round(Number(size?.w || 0))
    const height = Math.round(Number(size?.h || 0))
    if (width <= 0 || height <= 0) return
    await saveWindowState(width, height)
  } catch {
    // 窗口状态保存失败不影响主流程。
  }
}

function useWailsNotifications() {
  const addNotification = useNotificationStore((s) => s.addNotification)

  useEffect(() => {
    const offCrashed = onRuntimeEvent(
      'browser:instance:crashed',
      (data: { profileId: string; profileName: string; error: string }) => {
        addNotification({
          type: 'error',
          title: '实例异常退出',
          message: `「${data.profileName || data.profileId}」意外崩溃：${data.error}`,
        })
      }
    )

    const offBridgeFailed = onRuntimeEvent(
      'proxy:bridge:failed',
      (data: { profileId: string; profileName: string; error: string }) => {
        addNotification({
          type: 'error',
          title: '代理连接失败',
          message: `「${data.profileName || data.profileId}」代理桥接启动失败：${data.error}`,
        })
      }
    )

    const offBridgeDied = onRuntimeEvent(
      'proxy:bridge:died',
      (data: { key: string; error: string }) => {
        addNotification({
          type: 'warning',
          title: '连接池节点失效',
          message: `代理节点 ${data.key} 连接中断，相关实例可能无法访问网络`,
        })
      }
    )

    const offPendingUpdate = onAppUpdatePendingNotification(
      (data) => {
        addNotification({
          type: 'info',
          title: '更新已准备好',
          message: data?.message || (data?.version ? `版本 ${data.version} 已下载，可在系统设置中完成安装` : '更新安装包已下载，可在系统设置中完成安装'),
        })
      }
    )

    const offPendingInstallFailed = onAppUpdatePendingInstallFailed(
      (data) => {
        addNotification({
          type: 'error',
          title: '自动安装更新失败',
          message: data?.error || '启动安装程序失败，可在更新弹窗中手动重试',
        })
      }
    )

    return () => {
      offCrashed?.()
      offBridgeFailed?.()
      offBridgeDied?.()
      offPendingUpdate?.()
      offPendingInstallFailed?.()
    }
  }, [addNotification])
}

type PendingUpdateInfo = AppUpdatePendingUpdate
type UpdateProgressInfo = AppUpdateDownloadProgress

function isOfficialInstallableUpdate(kind?: string) {
  return kind === 'installer' || kind === 'selfupdate'
}

function useAutoUpdateCheck() {
  const addNotification = useNotificationStore((s) => s.addNotification)
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null)
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdateInfo | null>(null)
  const [updateProgress, setUpdateProgress] = useState<UpdateProgressInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<'none' | 'download-now'>('none')

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const raw = localStorage.getItem('app_settings')
        const settings = raw ? JSON.parse(raw) : {}
        if (settings.enableAutoUpdate === false) return
        const info = await checkAppUpdate()
        if (cancelled || !info?.hasUpdate) return
        setUpdateInfo(info)
        setOpen(true)
        const manual = info.recommendedPackageKind === 'manual'
        addNotification({
          type: 'info',
          title: '发现新版本',
          message: manual
            ? `Trace Browser ${info.latestVersion} 已发布，可打开下载页手动下载解压版`
            : `Trace Browser ${info.latestVersion} 已发布，可下载官方安装包更新`,
        })
      } catch (error) {
        console.warn('Auto update check failed', error)
      }
    }, 1800)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [addNotification])

  useEffect(() => {
    const off = onAppUpdatePending((data: PendingUpdateInfo) => {
      setPendingUpdate(data || {})
      setOpen(true)
      addNotification({
        type: 'info',
        title: '更新已准备好',
        message: data?.version ? `版本 ${data.version} 已下载，可选择现在安装` : '更新安装包已下载，可选择现在安装',
      })
    })
    return () => {
      off?.()
    }
  }, [addNotification])

  useEffect(() => {
    const off = onAppUpdateDownloadProgress((data: UpdateProgressInfo) => {
      if (!data || typeof data !== 'object') return
      setUpdateProgress({
        phase: String(data.phase || 'downloading'),
        progress: Number.isFinite(data.progress) ? Math.max(0, Math.min(100, Math.round(data.progress))) : 0,
        message: String(data.message || '正在下载更新...'),
      })
    })
    return () => {
      off?.()
    }
  }, [])

  const handleDownload = async (installOnRestart: boolean) => {
    if (!updateInfo) return
    if (installOnRestart || !isOfficialInstallableUpdate(updateInfo.recommendedPackageKind)) {
      await openAppReleasePage(updateInfo.releaseUrl || '')
      return
    }
    setUpdateProgress({
      phase: 'starting',
      progress: 0,
      message: '准备通过官方 updater 下载安装包...',
    })
    setAction('download-now')
    try {
      const res = await downloadAppUpdate(updateInfo, installOnRestart)
      addNotification({
        type: 'success',
        title: '官方安装包已下载',
        message: '安装程序即将启动，应用会自动退出',
      })
      await installDownloadedAppUpdate(res?.installerPath || '')
    } catch (error) {
      addNotification({
        type: 'error',
        title: '更新失败',
        message: error instanceof Error ? error.message : '下载或安装更新失败',
      })
    } finally {
      setAction('none')
    }
  }

  const handleInstallPending = async () => {
    setAction('download-now')
    try {
      await installDownloadedAppUpdate(pendingUpdate?.installerPath || '')
    } catch (error) {
      addNotification({
        type: 'error',
        title: '安装更新失败',
        message: error instanceof Error ? error.message : '启动安装程序失败',
      })
      setAction('none')
    }
  }

  const isManualUpdate = updateInfo?.recommendedPackageKind === 'manual'
  const canApplyOfficialUpdate = isOfficialInstallableUpdate(updateInfo?.recommendedPackageKind) && !!updateInfo?.installerAsset

  const modal = (
    <Modal
      open={open}
      onClose={() => {
        if (action === 'none') setOpen(false)
      }}
      title="发现新版本"
      width="540px"
      closable={action === 'none'}
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={action !== 'none'}>
            稍后
          </Button>
          <Button variant={isManualUpdate ? 'primary' : 'secondary'} onClick={() => openAppReleasePage(updateInfo?.releaseUrl || pendingUpdate?.releaseUrl || '')} disabled={action !== 'none'}>
            下载页
          </Button>
          {pendingUpdate ? (
            <Button variant="danger" onClick={handleInstallPending} loading={action === 'download-now'} disabled={action !== 'none' && action !== 'download-now'}>
              立即安装
            </Button>
          ) : (
            <>
              {!isManualUpdate && (
                <Button variant="danger" onClick={() => handleDownload(false)} loading={action === 'download-now'} disabled={!canApplyOfficialUpdate || (action !== 'none' && action !== 'download-now')}>
                  下载并安装官方更新
                </Button>
              )}
            </>
          )}
        </>
      }
    >
      <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
        {pendingUpdate ? (
          <p>版本 {pendingUpdate.version || '最新版本'} 已下载完成，可以现在启动安装程序。</p>
        ) : (
          <>
            <p>
              当前版本 {updateInfo?.currentVersion || '-'}，最新版本 {updateInfo?.latestVersion || '-'}。
            </p>
            {updateInfo?.asset ? (
              <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
                {updateInfo.installerAsset && <p>安装包：{updateInfo.installerAsset.name}</p>}
              </div>
            ) : !isManualUpdate ? (
              <p className="text-xs text-[var(--color-warning)]">未匹配到当前系统安装包，可打开下载页手动下载。</p>
            ) : (
              <p className="text-xs text-[var(--color-warning)]">当前为解压版，请打开下载页手动下载 ZIP 并自行解压。</p>
            )}
          </>
        )}
        <p className="text-xs text-[var(--color-text-muted)]">
          {pendingUpdate
            ? '安装程序启动后应用会自动退出，方便更新文件完成替换。'
            : isManualUpdate
              ? '解压版不在应用内自动下载或替换文件，下载 ZIP 后自行解压即可。'
              : '当前为安装版：下载官方 Setup EXE 后会启动安装程序，并自动退出当前应用。'}
        </p>
        {updateProgress && (
          <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span>{updateProgress.message}</span>
              <span className="text-[var(--color-text-muted)]">{updateProgress.progress}%</span>
            </div>
            <Progress
              percent={updateProgress.progress}
              size="sm"
              status={updateProgress.phase === 'error' ? 'error' : updateProgress.phase === 'done' ? 'success' : 'normal'}
            />
          </div>
        )}
      </div>
    </Modal>
  )

  return modal
}

function CloseConfirmModal() {
  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState('windows')
  const [quittingAction, setQuittingAction] = useState<'app-only' | 'app-and-browser' | null>(null)
  const importInProgress = useBackupStore((s) => s.importInProgress)
  const importProgress = useBackupStore((s) => s.importProgress)
  const importMessage = useBackupStore((s) => s.importMessage)
  const supportsTray = platform === 'windows'
  const quitting = quittingAction !== null

  useEffect(() => {
    const off = onRuntimeEvent('app:request-close', () => {
      setQuittingAction(null)
      setOpen(true)
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    getRuntimeEnvironment()
      .then((info) => {
        if (!cancelled && info?.platform) {
          setPlatform(info.platform)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  const closeModal = () => {
    if (quitting) return
    setOpen(false)
  }

  const handleMinimize = () => {
    if (quitting) return
    setOpen(false)
    if (supportsTray) {
      hideRuntimeWindow()
      return
    }
    minimiseRuntimeWindow()
  }

  const handleQuitAppOnly = async () => {
    setQuittingAction('app-only')
    try {
      await saveNormalWindowSize()
      await quitAppOnly()
    } catch (error) {
      console.error('QuitAppOnly failed', error)
      setQuittingAction(null)
    }
  }

  const handleQuitAppAndBrowsers = async () => {
    setQuittingAction('app-and-browser')
    try {
      await saveNormalWindowSize()
      await Promise.race([
        forceQuitApp(),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ])
    } catch (error) {
      console.error('ForceQuit failed, falling back to runtime quit', error)
    }
    quitRuntime()
  }

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title={importInProgress ? '关闭应用确认' : undefined}
      width={importInProgress ? '360px' : '420px'}
      closable={!quitting}
    >
      <div className="flex flex-col items-center pt-2 pb-6 px-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
          importInProgress ? 'bg-amber-50 text-amber-500' : 'bg-red-50 text-red-500'
        }`}>
          <AlertCircle className="w-6 h-6" />
        </div>
        {importInProgress && (
          <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
            正在加载中，是否关闭？
          </h3>
        )}
        {importInProgress ? (
          <p className="text-sm text-[var(--color-text-secondary)] text-center mb-6">
            当前正在加载配置
            {importProgress > 0 ? `（${importProgress}%）` : ''}。
            <br />
            {importMessage || '强制关闭会中断本次加载，是否仍要关闭应用？'}
          </p>
        ) : (
          <p className="mb-6 text-sm text-center text-[var(--color-text-secondary)]">
            可仅退出应用，或关闭所有应用、浏览器与代理程序。
          </p>
        )}

        <div className={`w-full ${importInProgress ? 'flex gap-3' : 'flex flex-col gap-2'}`}>
          {importInProgress ? (
            <>
              <Button variant="secondary" className="flex-1" onClick={closeModal} disabled={quitting}>
                继续加载
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleQuitAppAndBrowsers}
                loading={quittingAction === 'app-and-browser'}
              >
                仍要关闭
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                className="w-full !bg-[#f3f4f6] !border-[#e5e7eb] !text-[var(--color-text-primary)] hover:!bg-[#e5e7eb]"
                onClick={supportsTray ? handleMinimize : closeModal}
                disabled={quitting}
              >
                {supportsTray ? '最小化到托盘' : '取消'}
              </Button>
              <Button
                className="w-full"
                onClick={handleQuitAppOnly}
                loading={quittingAction === 'app-only'}
                disabled={quitting}
              >
                仅退出应用
              </Button>
              <Button
                variant="danger"
                className="w-full"
                onClick={handleQuitAppAndBrowsers}
                loading={quittingAction === 'app-and-browser'}
                disabled={quitting}
              >
                退出所有应用与浏览器
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

type WindowSyncMasterClosedPayload = {
  profileId?: string
  profileName?: string
  key?: string
  remainingProfileIds?: string[]
}

function remainingSyncProfileIds(payload: WindowSyncMasterClosedPayload): string[] {
  const rawIds = Array.isArray(payload?.remainingProfileIds)
    ? payload.remainingProfileIds
    : String(payload?.key || '').split(/\r?\n/)
  const seen = new Set<string>()
  const ids: string[] = []
  for (const rawId of rawIds) {
    const id = String(rawId || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function WindowSyncMasterClosedModal() {
  const [pending, setPending] = useState<{ masterName: string; profileIds: string[] } | null>(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    return onRuntimeEvent<WindowSyncMasterClosedPayload>('window-sync:master-closed', payload => {
      const profileIds = remainingSyncProfileIds(payload || {})
      const masterName = String(payload?.profileName || payload?.profileId || '主控窗口')
      if (profileIds.length === 0) {
        toast.warning(`主控窗口「${masterName}」已关闭，窗口同步已停止`)
        return
      }
      setClosing(false)
      setPending({ masterName, profileIds })
    })
  }, [])

  const closeModal = () => {
    if (closing) return
    setPending(null)
  }

  const closeRemainingProfiles = async () => {
    if (!pending) return
    setClosing(true)
    const results = await Promise.allSettled(pending.profileIds.map(profileId => stopBrowserInstance(profileId)))
    const failed = results.filter(result => result.status === 'rejected').length
    if (failed > 0) {
      toast.warning(`已关闭部分剩余实例，${failed} 个实例关闭失败`)
    } else {
      toast.success(`已关闭剩余 ${pending.profileIds.length} 个同步实例`)
    }
    setClosing(false)
    setPending(null)
  }

  return (
    <Modal
      open={!!pending}
      onClose={closeModal}
      title="窗口同步已停止"
      width="420px"
      closable={!closing}
    >
      <div className="space-y-5">
        <div className="text-sm leading-6 text-[var(--color-text-secondary)]">
          主控实例「{pending?.masterName}」已关闭，窗口同步已立即停止。是否关闭剩余 {pending?.profileIds.length || 0} 个同步实例？
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={closeModal} disabled={closing}>
            保留实例
          </Button>
          <Button variant="danger" onClick={closeRemainingProfiles} loading={closing}>
            关闭剩余实例
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function App() {
  useWailsNotifications()
  const autoUpdateModal = useAutoUpdateCheck()
  const [quickLaunchOpen, setQuickLaunchOpen] = useState(false)
  const routeFallback = (
    <div className="flex min-h-[240px] items-center justify-center py-10">
      <Loading text="页面加载中..." />
    </div>
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      setQuickLaunchOpen((prev) => !prev)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    let timer: number | undefined

    const scheduleSave = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void saveNormalWindowSize()
      }, 600)
    }

    window.addEventListener('resize', scheduleSave)
    scheduleSave()
    return () => {
      if (timer) window.clearTimeout(timer)
      window.removeEventListener('resize', scheduleSave)
    }
  }, [])

  return (
    <ThemeProvider>
      <Router>
        <Layout>
          <Suspense fallback={routeFallback}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/charts" element={<ChartsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/admin/keygen" element={<AdminKeygenPage />} />
              <Route path="/browser/list" element={<BrowserListPage />} />
              <Route path="/browser/detail/:id" element={<BrowserDetailPage />} />
              <Route path="/browser/edit/:id" element={<BrowserEditPage />} />
              <Route path="/browser/copy/:id" element={<BrowserCopyPage />} />
              <Route path="/browser/monitor" element={<Navigate to="/browser/list" replace />} />
              <Route path="/browser/logs" element={<BrowserLogsPage />} />
              <Route path="/browser/proxy-pool" element={<ProxyPoolPage />} />
              <Route path="/browser/cores" element={<CoreManagementPage />} />
              <Route path="/browser/extensions" element={<ExtensionManagementPage />} />
              <Route path="/browser/bookmarks" element={<Navigate to="/browser/organization?tab=defaults" replace />} />
              <Route path="/browser/start-urls" element={<Navigate to="/browser/organization?tab=defaults" replace />} />
              <Route path="/browser/automation" element={<AutomationPage />} />
              <Route path="/browser/launch-api" element={<LaunchApiDocsPage />} />
              <Route path="/browser/organization" element={<OrganizationManagementPage />} />
              <Route path="/browser/tags" element={<Navigate to="/browser/organization" replace />} />
              <Route path="/browser/groups" element={<Navigate to="/browser/organization?tab=groups" replace />} />
              <Route path="/system/tutorial" element={<UsageTutorialPage />} />
            </Routes>
          </Suspense>
        </Layout>
        <ToastContainer />
        {autoUpdateModal}
        <CloseConfirmModal />
        <WindowSyncMasterClosedModal />
        <Suspense fallback={null}>
          <FirstRunOnboarding />
        </Suspense>
        <Suspense fallback={null}>
          {quickLaunchOpen ? (
            <QuickLaunchModal open={quickLaunchOpen} onClose={() => setQuickLaunchOpen(false)} />
          ) : null}
        </Suspense>
      </Router>
    </ThemeProvider>
  )
}

export default App
