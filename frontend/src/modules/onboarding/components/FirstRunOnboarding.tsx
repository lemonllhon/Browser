import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Download,
  FileArchive,
  Globe2,
  Layers3,
  ListChecks,
  Monitor,
  MousePointer2,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Tags,
  Upload,
  Wand2,
} from 'lucide-react'
import { Button, Modal } from '../../../shared/components'
import {
  FIRST_RUN_ONBOARDING_OPEN_EVENT,
  markFirstRunOnboardingCompleted,
  shouldShowFirstRunOnboarding,
} from '../onboardingStorage'
import { OnboardingAnimation, type OnboardingSceneKey } from './OnboardingAnimation'

type OnboardingStep = {
  id: string
  sceneKey: OnboardingSceneKey
  icon: ReactNode
  section: string
  title: string
  description: string
  bullets?: string[]
  routePath?: string
  actionLabel?: string
  actionPath?: string
  actionNextId?: string
}

type OnboardingOpenDetail = {
  manual?: boolean
  startStepId?: string
}

const FIRST_RUN_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'overview',
    sceneKey: 'overview',
    icon: <Layers3 className="h-4 w-4" />,
    section: '产品总览',
    title: '统一管理多个指纹浏览器实例',
    description: '把实例、代理、内核、标签和插件集中到一个工作台里，先理解整体链路，再逐段进入演示。',
    bullets: ['内核负责启动基础', '代理池负责出口网络', '实例承载指纹、标签、插件与启动参数'],
  },
  {
    id: 'core-entry',
    sceneKey: 'core',
    icon: <Cpu className="h-4 w-4" />,
    section: '内核管理',
    title: '先准备可用浏览器内核',
    description: '进入内核管理后，演示会继续说明下载内核、扫描内核和新增内核，不会因为跳转页面而结束。',
    actionLabel: '进入内核管理并继续',
    actionPath: '/browser/cores',
    actionNextId: 'core-download',
  },
  {
    id: 'core-download',
    sceneKey: 'core-tools',
    icon: <Download className="h-4 w-4" />,
    section: '内核管理',
    title: '下载内核',
    description: '下载内核用于从 GitHub Releases 或自定义 ZIP 地址拉取 fingerprint-chromium，并在完成后注册到内核列表。',
    routePath: '/browser/cores',
    bullets: ['可选择官方 Releases 资产', '可配置下载代理', '下载完成后可重命名内核目录'],
  },
  {
    id: 'core-scan',
    sceneKey: 'core-tools',
    icon: <Search className="h-4 w-4" />,
    section: '内核管理',
    title: '扫描内核',
    description: '扫描内核会检查本地 chrome 目录，自动发现已有的 chrome.exe 并注册，适合手动解压后的场景。',
    routePath: '/browser/cores',
    bullets: ['避免重复手填路径', '适合离线复制内核目录', '扫描后可设置默认内核'],
  },
  {
    id: 'core-add',
    sceneKey: 'core-tools',
    icon: <Plus className="h-4 w-4" />,
    section: '内核管理',
    title: '新增内核',
    description: '新增内核用于手动登记一个已存在的浏览器目录，保存前会校验路径是否可启动。',
    routePath: '/browser/cores',
    bullets: ['填写内核名称和路径', '校验 chrome.exe 是否存在', '保存后可在实例中选择'],
  },
  {
    id: 'proxy-entry',
    sceneKey: 'proxy',
    icon: <Globe2 className="h-4 w-4" />,
    section: '代理池管理',
    title: '把代理节点集中放进代理池',
    description: '进入代理池后，演示会继续说明资源订阅、代理节点、超时清理、刷新订阅、IP 健康和测试全部。',
    actionLabel: '进入代理池并继续',
    actionPath: '/browser/proxy-pool',
    actionNextId: 'proxy-resource',
  },
  {
    id: 'proxy-resource',
    sceneKey: 'proxy-tools',
    icon: <Upload className="h-4 w-4" />,
    section: '代理池管理',
    title: '添加资源与订阅管理',
    description: '添加资源可以导入 Clash 订阅、YAML、Base64 分享链接或批量代理，导入后会在订阅管理中形成来源记录。',
    routePath: '/browser/proxy-pool',
    bullets: ['订阅 URL 可后续刷新', '手动资源也会归档来源', '支持批量 DNS 和建议分组'],
  },
  {
    id: 'proxy-node',
    sceneKey: 'proxy-tools',
    icon: <Globe2 className="h-4 w-4" />,
    section: '代理池管理',
    title: '代理节点列表',
    description: '代理节点列表用于查看每个节点协议、来源、延迟、IP 健康状态和分组，实例编辑页会复用这些节点。',
    routePath: '/browser/proxy-pool',
    bullets: ['支持按来源和分组筛选', '支持单节点测速与 IP 健康', '可批量选择和删除'],
  },
  {
    id: 'proxy-maintain',
    sceneKey: 'proxy-tools',
    icon: <RefreshCw className="h-4 w-4" />,
    section: '代理池管理',
    title: '刷新订阅、IP 健康、测试全部和删除超时节点',
    description: '这些维护动作可以快速把代理池从“有节点”变成“可用节点”，同时删除超时节点会保留直连和本地代理。',
    routePath: '/browser/proxy-pool',
    bullets: ['刷新订阅同步来源节点', '检测 IP 健康确认出口质量', '测试全部更新延迟并支持清理超时'],
  },
  {
    id: 'list-entry',
    sceneKey: 'list-tools',
    icon: <Monitor className="h-4 w-4" />,
    section: '实例列表',
    title: '进入实例列表查看主要操作入口',
    description: '实例列表是新建配置、批量生成、实例备份恢复、窗口同步和面板收起展开的集中入口。',
    actionLabel: '进入实例列表并继续',
    actionPath: '/browser/list',
    actionNextId: 'list-panel',
  },
  {
    id: 'list-panel',
    sceneKey: 'list-tools',
    icon: <ListChecks className="h-4 w-4" />,
    section: '实例列表',
    title: '收起面板和展开面板',
    description: '实例列表顶部的统计和筛选区域可以收起，数据量多时能保留更多表格空间，需要筛选时再展开。',
    routePath: '/browser/list',
    bullets: ['收起后保留核心工具栏', '展开后显示统计和筛选', '适合多实例反复操作'],
  },
  {
    id: 'profile-create-entry',
    sceneKey: 'profile',
    icon: <Plus className="h-4 w-4" />,
    section: '新建实例',
    title: '从实例列表进入新建配置',
    description: '点击新建配置后，演示会继续覆盖基础信息、代理配置、指纹配置和启动参数。',
    actionLabel: '打开新建配置并继续',
    actionPath: '/browser/edit/new',
    actionNextId: 'profile-basic',
  },
  {
    id: 'profile-basic',
    sceneKey: 'profile-edit',
    icon: <Monitor className="h-4 w-4" />,
    section: '新建实例',
    title: '基础信息',
    description: '基础信息用于配置实例名称、Code、浏览器内核、分组和标签，是后续启动和快速检索的基础。',
    routePath: '/browser/edit/new',
    bullets: ['名称用于列表识别', 'Code 可用于快速启动和 API 启动', '标签和分组会进入组织管理联动'],
  },
  {
    id: 'profile-proxy',
    sceneKey: 'profile-edit',
    icon: <Globe2 className="h-4 w-4" />,
    section: '新建实例',
    title: '代理配置',
    description: '代理配置可以选择代理池节点、手动代理，也可以启用代理池自动切换来按分钟轮询出口。',
    routePath: '/browser/edit/new',
    bullets: ['选择代理池节点会忽略手动代理', '自动切换会走本地固定中转端口', '可按代理分组切换'],
  },
  {
    id: 'profile-fingerprint',
    sceneKey: 'profile-edit',
    icon: <ShieldCheck className="h-4 w-4" />,
    section: '新建实例',
    title: '指纹配置',
    description: '指纹配置用于生成浏览器设备画像，地区会联动语言、时区等参数，降低手动配置成本。',
    routePath: '/browser/edit/new',
    bullets: ['地区国家会带出语言和时区', '指纹参数可随机生成', '保存后绑定到实例配置'],
  },
  {
    id: 'profile-launch',
    sceneKey: 'profile-edit',
    icon: <Settings className="h-4 w-4" />,
    section: '新建实例',
    title: '启动参数',
    description: '启动参数支持每行一个 Chromium 参数，新建时会提供轻量模板，也可以按业务自行追加。',
    routePath: '/browser/edit/new',
    bullets: ['可切换无痕模式', '支持自定义启动参数', '保存后启动实例时生效'],
  },
  {
    id: 'profile-batch',
    sceneKey: 'list-tools',
    icon: <Wand2 className="h-4 w-4" />,
    section: '实例列表',
    title: '批量生成',
    description: '批量生成会按参数模板创建多个实例，并为每个实例生成独立设备画像和指纹种子。',
    routePath: '/browser/list',
    bullets: ['适合批量准备账号环境', '可以统一模板再随机化', '生成后直接进入实例列表管理'],
  },
  {
    id: 'profile-backup',
    sceneKey: 'backup',
    icon: <FileArchive className="h-4 w-4" />,
    section: '实例列表',
    title: '实例备份与恢复',
    description: '实例备份与恢复用于导出实例配置和用户数据包，也能从备份包恢复实例。',
    routePath: '/browser/list',
    bullets: ['导出支持全部、选中、筛选和自定义范围', '恢复前会先校验和预览备份包', 'Cookie 恢复可按需启用'],
  },
  {
    id: 'backup-export',
    sceneKey: 'backup',
    icon: <Download className="h-4 w-4" />,
    section: '实例备份与恢复',
    title: '导出演示',
    description: '导出时先选择范围，再选择是否包含 Cookie，进度日志会展示每个组件的打包状态。',
    routePath: '/browser/list',
    bullets: ['运行中无痕 Cookie 不会持久保留', '导出完成会生成备份包', '可用作迁移或灾备'],
  },
  {
    id: 'backup-restore',
    sceneKey: 'backup',
    icon: <Upload className="h-4 w-4" />,
    section: '实例备份与恢复',
    title: '恢复演示',
    description: '恢复时先选择备份包并预览实例，再勾选要恢复的实例和 Cookie，避免误覆盖不需要的数据。',
    routePath: '/browser/list',
    bullets: ['先校验备份包', '支持选择部分实例恢复', '恢复后刷新实例列表'],
  },
  {
    id: 'organization-entry',
    sceneKey: 'organization',
    icon: <Tags className="h-4 w-4" />,
    section: '组织管理',
    title: '进入组织管理',
    description: '组织管理统一维护标签、分组、默认功能和联动规则，演示会按模块继续说明。',
    actionLabel: '进入组织管理并继续',
    actionPath: '/browser/organization',
    actionNextId: 'organization-tags',
  },
  {
    id: 'organization-tags',
    sceneKey: 'organization',
    icon: <Tags className="h-4 w-4" />,
    section: '组织管理',
    title: '标签管理',
    description: '标签用于给实例增加业务语义，后续可以在实例列表筛选、批量操作和默认规则中复用。',
    routePath: '/browser/organization',
    bullets: ['支持新建、编辑和删除标签', '实例列表会同步展示', '适合标记账号状态或业务场景'],
  },
  {
    id: 'organization-groups',
    sceneKey: 'organization',
    icon: <Layers3 className="h-4 w-4" />,
    section: '组织管理',
    title: '分组管理',
    description: '分组用于建立层级结构和项目归属，实例编辑、新建和筛选都会读取最新分组数据。',
    routePath: '/browser/organization?tab=groups',
    bullets: ['可建立父子分组', '适合项目、客户或环境归类', '多窗口修改会同步刷新'],
  },
  {
    id: 'organization-default',
    sceneKey: 'organization',
    icon: <CheckCircle2 className="h-4 w-4" />,
    section: '组织管理',
    title: '默认功能和联动',
    description: '默认功能负责新建实例时的预置内容，联动规则负责让标签、分组和默认内容互相配合。',
    routePath: '/browser/organization?tab=defaults',
    bullets: ['默认标签和分组降低重复配置', '默认内容可联动实例创建', '调整后其他窗口会收到更新'],
  },
  {
    id: 'extension-entry',
    sceneKey: 'extension',
    icon: <Puzzle className="h-4 w-4" />,
    section: '扩展插件管理',
    title: '进入扩展插件管理',
    description: '扩展插件管理用于导入本地插件、查看插件库，并设置插件与实例的绑定关系。',
    actionLabel: '进入扩展插件管理并继续',
    actionPath: '/browser/extensions',
    actionNextId: 'extension-import',
  },
  {
    id: 'extension-import',
    sceneKey: 'extension',
    icon: <Upload className="h-4 w-4" />,
    section: '扩展插件管理',
    title: '导入插件',
    description: '可以导入扩展目录、ZIP 或 CRX，也支持拖拽导入。导入后会复制到扩展库中统一管理。',
    routePath: '/browser/extensions',
    bullets: ['目录需要包含 manifest.json', 'ZIP/CRX 会自动解包或复制', '可覆盖已有扩展或作为新扩展导入'],
  },
  {
    id: 'extension-manage',
    sceneKey: 'extension',
    icon: <Puzzle className="h-4 w-4" />,
    section: '扩展插件管理',
    title: '插件管理',
    description: '插件管理可以查看扩展信息、批量绑定实例，也可以设置新建、复制和启动实例时自动绑定。',
    routePath: '/browser/extensions',
    bullets: ['插件可绑定指定实例', '默认绑定会影响新建和复制实例', '刷新可同步扩展库状态'],
  },
  {
    id: 'sync',
    sceneKey: 'sync',
    icon: <MousePointer2 className="h-4 w-4" />,
    section: '窗口同步',
    title: '多窗口同步操作',
    description: '窗口同步从实例列表进入，主控窗口发出的鼠标、滚轮和常用操作会同步到被控窗口。',
    routePath: '/browser/list',
    bullets: ['适合批量重复流程', '高频 mousemove 和 wheel 已做节流', 'CDP target 查询已复用连接降低开销'],
  },
  {
    id: 'settings-entry',
    sceneKey: 'settings',
    icon: <Settings className="h-4 w-4" />,
    section: '系统设置',
    title: '系统设置中也能进入演示模式',
    description: '系统设置页会新增“播放新手演示”入口，点击后可随时重新进入完整演示模式。',
    actionLabel: '进入系统设置并继续',
    actionPath: '/settings',
    actionNextId: 'settings-demo',
  },
  {
    id: 'settings-demo',
    sceneKey: 'settings',
    icon: <Play className="h-4 w-4" />,
    section: '系统设置',
    title: '播放新手演示',
    description: '在系统设置点击播放新手演示，会从第一步重新进入当前这套跨页面演示流程。',
    routePath: '/settings',
    bullets: ['手动回放不会强制清空完成状态', '演示模式跨页面保持打开', '只有关闭、跳过或完成才退出'],
  },
  {
    id: 'finish',
    sceneKey: 'finish',
    icon: <Rocket className="h-4 w-4" />,
    section: '完成',
    title: '演示完成，可以开始配置第一个实例',
    description: '完整路径已经覆盖内核、代理池、实例、组织、插件、系统设置和窗口同步。完成后不会再自动弹出。',
    bullets: ['先准备内核', '再维护代理池', '最后创建并启动实例'],
  },
]

function isSpecialWindow() {
  if (typeof window === 'undefined') return true
  const params = new URLSearchParams(window.location.search)
  return params.get('toolbar') === '1' || params.get('windowSyncPrompt') === 'master-closed'
}

function findStepIndex(stepId?: string) {
  if (!stepId) return 0
  const index = FIRST_RUN_ONBOARDING_STEPS.findIndex(item => item.id === stepId)
  return index >= 0 ? index : 0
}

export function FirstRunOnboarding() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [manualReplay, setManualReplay] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const step = FIRST_RUN_ONBOARDING_STEPS[stepIndex]
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === FIRST_RUN_ONBOARDING_STEPS.length - 1

  const openAtStep = useCallback((stepId?: string, manual = false) => {
    const index = findStepIndex(stepId)
    const target = FIRST_RUN_ONBOARDING_STEPS[index]
    setManualReplay(manual)
    setStepIndex(index)
    setOpen(true)
    if (target.routePath) {
      navigate(target.routePath)
    }
  }, [navigate])

  useEffect(() => {
    if (isSpecialWindow() || !shouldShowFirstRunOnboarding()) return

    const timer = window.setTimeout(() => {
      openAtStep(undefined, false)
    }, 3200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [openAtStep])

  useEffect(() => {
    const onReplay = (event: Event) => {
      const detail = (event as CustomEvent<OnboardingOpenDetail>).detail || {}
      openAtStep(detail.startStepId, detail.manual !== false)
    }

    window.addEventListener(FIRST_RUN_ONBOARDING_OPEN_EVENT, onReplay)
    return () => {
      window.removeEventListener(FIRST_RUN_ONBOARDING_OPEN_EVENT, onReplay)
    }
  }, [openAtStep])

  const navigateForStep = useCallback((target: OnboardingStep) => {
    if (target.routePath) {
      navigate(target.routePath)
    }
  }, [navigate])

  const setStepAndNavigate = useCallback((nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(FIRST_RUN_ONBOARDING_STEPS.length - 1, nextIndex))
    const next = FIRST_RUN_ONBOARDING_STEPS[boundedIndex]
    setStepIndex(boundedIndex)
    navigateForStep(next)
  }, [navigateForStep])

  const closeOnboarding = useCallback(() => {
    if (!manualReplay) {
      markFirstRunOnboardingCompleted()
    }
    setOpen(false)
  }, [manualReplay])

  const skipOnboarding = useCallback(() => {
    markFirstRunOnboardingCompleted()
    setOpen(false)
  }, [])

  const finishOnboarding = useCallback(() => {
    markFirstRunOnboardingCompleted()
    setOpen(false)
  }, [])

  const handleStepAction = useCallback((current: OnboardingStep) => {
    if (current.actionPath) {
      navigate(current.actionPath)
    }
    if (current.actionNextId) {
      setStepIndex(findStepIndex(current.actionNextId))
    }
  }, [navigate])

  const nextStep = useCallback(() => {
    setStepAndNavigate(stepIndex + 1)
  }, [setStepAndNavigate, stepIndex])

  const previousStep = useCallback(() => {
    setStepAndNavigate(stepIndex - 1)
  }, [setStepAndNavigate, stepIndex])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeOnboarding()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        previousStep()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        nextStep()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        if (isLastStep) {
          finishOnboarding()
          return
        }
        nextStep()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeOnboarding, finishOnboarding, isLastStep, nextStep, open, previousStep])

  const progressPercent = Math.round(((stepIndex + 1) / FIRST_RUN_ONBOARDING_STEPS.length) * 100)

  const footer = useMemo(() => {
    return (
      <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]">
            <span className="truncate">{step.section}</span>
            <span className="shrink-0">第 {stepIndex + 1} / {FIRST_RUN_ONBOARDING_STEPS.length} 步</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-muted)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-end">
          <Button variant="ghost" onClick={skipOnboarding}>
            跳过
          </Button>
          <Button variant="secondary" onClick={previousStep} disabled={isFirstStep}>
            <ArrowLeft className="h-4 w-4" />
            上一步
          </Button>
          {isLastStep ? (
            <Button onClick={finishOnboarding}>
              <CheckCircle2 className="h-4 w-4" />
              完成
            </Button>
          ) : (
            <Button onClick={nextStep}>
              下一步
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    )
  }, [finishOnboarding, isFirstStep, isLastStep, nextStep, previousStep, progressPercent, skipOnboarding, step.section, stepIndex])

  return (
    <Modal open={open} onClose={closeOnboarding} title="演示模式" width="960px" footer={footer}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]">
        <OnboardingAnimation sceneKey={step.sceneKey} />
        <div className="flex min-w-0 flex-col justify-between gap-5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-base)] p-4">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent-muted)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent)]">
              {step.icon}
              {step.section}
            </div>
            <h2 className="text-xl font-semibold leading-snug text-[var(--color-text-primary)]">{step.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">{step.description}</p>
            {step.bullets && step.bullets.length > 0 ? (
              <div className="mt-4 space-y-2">
                {step.bullets.map(item => (
                  <div key={item} className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            {step.actionPath && step.actionLabel ? (
              <Button className="w-full" size="lg" onClick={() => handleStepAction(step)}>
                <Play className="h-4 w-4" />
                {step.actionLabel}
              </Button>
            ) : null}
            {step.id === 'finish' ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" onClick={() => navigate('/browser/edit/new')}>
                  开始创建实例
                </Button>
                <Button variant="secondary" onClick={() => navigate('/system/tutorial')}>
                  打开使用教程
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  )
}
