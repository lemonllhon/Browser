import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
  Move,
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
  X,
} from 'lucide-react'
import { Button } from '../../../shared/components'
import {
  FIRST_RUN_ONBOARDING_OPEN_EVENT,
  markFirstRunOnboardingCompleted,
  shouldShowFirstRunOnboarding,
} from '../onboardingStorage'
import { requestBrowserListBackupDemo, type BackupRestoreDemoTab } from '../../browser/browserOnboardingEvents'
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

type FloatingPosition = {
  left: number
  top: number
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  startLeft: number
  startTop: number
}

type OnboardingTargetRole = 'button' | 'heading' | 'text'

type OnboardingTargetConfig = {
  text: string
  label?: string
  role?: OnboardingTargetRole
}

type OnboardingTargetRect = {
  left: number
  top: number
  width: number
  height: number
  label: string
}

type FloatingRect = {
  left: number
  top: number
  width: number
  height: number
}

const FLOATING_WINDOW_WIDTH = 960
const FLOATING_WINDOW_MARGIN = 16
const FLOATING_HEADER_VISIBLE_HEIGHT = 72

function getFloatingWindowWidth() {
  if (typeof window === 'undefined') return FLOATING_WINDOW_WIDTH
  return Math.min(FLOATING_WINDOW_WIDTH, Math.max(320, window.innerWidth - FLOATING_WINDOW_MARGIN * 2))
}

function constrainFloatingPosition(position: FloatingPosition): FloatingPosition {
  if (typeof window === 'undefined') return position

  const width = getFloatingWindowWidth()
  const maxLeft = Math.max(FLOATING_WINDOW_MARGIN, window.innerWidth - width - FLOATING_WINDOW_MARGIN)
  const maxTop = Math.max(FLOATING_WINDOW_MARGIN, window.innerHeight - FLOATING_HEADER_VISIBLE_HEIGHT)

  return {
    left: Math.min(Math.max(position.left, FLOATING_WINDOW_MARGIN), maxLeft),
    top: Math.min(Math.max(position.top, FLOATING_WINDOW_MARGIN), maxTop),
  }
}

function getInitialFloatingPosition(): FloatingPosition {
  if (typeof window === 'undefined') return { left: FLOATING_WINDOW_MARGIN, top: FLOATING_WINDOW_MARGIN }

  const width = getFloatingWindowWidth()
  return constrainFloatingPosition({
    left: Math.round((window.innerWidth - width) / 2),
    top: Math.max(72, Math.round(window.innerHeight - 560)),
  })
}

function normalizeElementText(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeTargetSearch(search: string | null | undefined) {
  if (!search || search === '?') return ''
  return search.startsWith('?') ? search : `?${search}`
}

function getRouteKey(pathname: string, search: string | null | undefined = '') {
  return `${pathname}${normalizeTargetSearch(search)}`
}

function getRouteKeyFromPath(path: string) {
  const [pathname, search = ''] = path.split('?')
  return getRouteKey(pathname || '/', search)
}

function isElementVisible(element: Element) {
  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
}

function isInsideOnboardingWindow(element: Element) {
  return !!element.closest('[aria-label="演示模式"]')
}

function elementScore(element: Element, target: OnboardingTargetConfig) {
  const text = normalizeElementText([
    element.textContent,
    element.getAttribute('title'),
    element.getAttribute('aria-label'),
  ].filter(Boolean).join(' '))
  const targetText = normalizeElementText(target.text)
  if (!text || !targetText) return -1

  let score = -1
  if (text === targetText) score = 100
  else if (text.includes(targetText)) score = 70
  else return -1

  const tagName = element.tagName.toLowerCase()
  const role = element.getAttribute('role')
  if (target.role === 'button' && (tagName === 'button' || tagName === 'a' || role === 'button')) score += 40
  if (target.role === 'heading' && (/^h[1-6]$/.test(tagName) || role === 'heading')) score += 35
  if (tagName === 'button') score += 10

  const rect = element.getBoundingClientRect()
  const area = rect.width * rect.height
  if (area > 0 && area < 60000) score += 10
  if (area > 200000) score -= 25
  return score
}

function findOnboardingTargetElement(target: OnboardingTargetConfig) {
  if (typeof document === 'undefined') return null

  const selector = target.role === 'button'
    ? 'button,a,[role="button"]'
    : target.role === 'heading'
      ? 'h1,h2,h3,h4,h5,h6,[role="heading"]'
      : 'button,a,[role="button"],h1,h2,h3,h4,h5,h6,label,th,td,p,span,div'

  const candidates = Array.from(document.querySelectorAll(selector))
    .filter(element => !isInsideOnboardingWindow(element) && isElementVisible(element))
    .map(element => ({ element, score: elementScore(element, target) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score)

  return candidates[0]?.element || null
}

function isRectMostlyVisible(rect: DOMRect) {
  return (
    rect.top >= 12 &&
    rect.left >= 12 &&
    rect.bottom <= window.innerHeight - 12 &&
    rect.right <= window.innerWidth - 12
  )
}

function rectsOverlap(a: FloatingRect, b: OnboardingTargetRect) {
  return !(a.left + a.width < b.left || b.left + b.width < a.left || a.top + a.height < b.top || b.top + b.height < a.top)
}

function placeFloatingAwayFromTarget(targetRect: OnboardingTargetRect, floatingRect: FloatingRect): FloatingPosition | null {
  if (typeof window === 'undefined' || !rectsOverlap(floatingRect, targetRect)) return null

  const width = getFloatingWindowWidth()
  const height = Math.min(floatingRect.height || 520, Math.max(360, window.innerHeight - FLOATING_WINDOW_MARGIN * 2))
  const centeredLeft = Math.round((window.innerWidth - width) / 2)
  const belowTop = targetRect.top + targetRect.height + FLOATING_WINDOW_MARGIN
  const aboveTop = targetRect.top - height - FLOATING_WINDOW_MARGIN

  if (belowTop + FLOATING_HEADER_VISIBLE_HEIGHT < window.innerHeight) {
    return constrainFloatingPosition({ left: centeredLeft, top: belowTop })
  }
  if (aboveTop > FLOATING_WINDOW_MARGIN) {
    return constrainFloatingPosition({ left: centeredLeft, top: aboveTop })
  }

  const rightLeft = targetRect.left + targetRect.width + FLOATING_WINDOW_MARGIN
  if (rightLeft + width < window.innerWidth - FLOATING_WINDOW_MARGIN) {
    return constrainFloatingPosition({ left: rightLeft, top: FLOATING_WINDOW_MARGIN })
  }
  const leftLeft = targetRect.left - width - FLOATING_WINDOW_MARGIN
  if (leftLeft > FLOATING_WINDOW_MARGIN) {
    return constrainFloatingPosition({ left: leftLeft, top: FLOATING_WINDOW_MARGIN })
  }

  return null
}

function getStepTarget(step: OnboardingStep): OnboardingTargetConfig | null {
  switch (step.id) {
    case 'core-entry':
      return { text: '内核管理', label: '左侧菜单：内核管理', role: 'button' }
    case 'proxy-entry':
      return { text: '代理池管理', label: '左侧菜单：代理池管理', role: 'button' }
    case 'list-entry':
      return { text: '实例列表', label: '左侧菜单：实例列表', role: 'button' }
    case 'organization-entry':
      return { text: '组织管理', label: '左侧菜单：组织管理', role: 'button' }
    case 'extension-entry':
      return { text: '扩展插件管理', label: '左侧菜单：扩展插件管理', role: 'button' }
    case 'settings-entry':
      return { text: '系统设置', label: '左侧菜单：系统设置', role: 'button' }
    case 'core-download':
      return { text: '下载内核', role: 'button' }
    case 'core-scan':
      return { text: '扫描内核', role: 'button' }
    case 'core-add':
      return { text: '新增内核', role: 'button' }
    case 'proxy-resource':
      return { text: '添加资源', role: 'button' }
    case 'proxy-node':
      return { text: '代理节点', role: 'button' }
    case 'proxy-maintain':
      return { text: '刷新订阅', label: '刷新订阅 / IP 健康 / 测试全部 / 删除超时节点', role: 'button' }
    case 'list-panel':
      return { text: '收起面板', label: '收起面板 / 展开面板', role: 'button' }
    case 'profile-create-entry':
      return { text: '新建配置', role: 'button' }
    case 'profile-basic':
      return { text: '基础信息', role: 'heading' }
    case 'profile-proxy':
      return { text: '代理配置', role: 'heading' }
    case 'profile-fingerprint':
      return { text: '指纹配置', role: 'heading' }
    case 'profile-launch':
      return { text: '启动参数', role: 'heading' }
    case 'profile-batch':
      return { text: '批量生成', role: 'button' }
    case 'profile-backup':
      return { text: '实例备份与恢复', role: 'heading' }
    case 'backup-export':
      return { text: '导出', label: '导出备份', role: 'button' }
    case 'backup-restore':
      return { text: '导入恢复', label: '导入恢复备份', role: 'button' }
    case 'organization-tags':
      return { text: '标签', role: 'button' }
    case 'organization-groups':
      return { text: '分组', role: 'button' }
    case 'organization-default':
      return { text: '默认内容', label: '默认功能和联动', role: 'button' }
    case 'extension-import':
      return { text: '导入目录', label: '导入目录 / 导入压缩包', role: 'button' }
    case 'extension-manage':
      return { text: '扩展列表', role: 'heading' }
    case 'sync':
      return { text: '窗口同步', role: 'button' }
    case 'settings-demo':
      return { text: '播放新手演示', role: 'button' }
    default:
      return null
  }
}

function getArrowAnchor(floatingRect: FloatingRect, targetRect: OnboardingTargetRect) {
  const targetCenterX = targetRect.left + targetRect.width / 2
  const targetCenterY = targetRect.top + targetRect.height / 2
  const floatingCenterX = floatingRect.left + floatingRect.width / 2
  const floatingCenterY = floatingRect.top + floatingRect.height / 2
  const dx = targetCenterX - floatingCenterX
  const dy = targetCenterY - floatingCenterY

  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      x: dx > 0 ? floatingRect.left + floatingRect.width : floatingRect.left,
      y: Math.min(Math.max(targetCenterY, floatingRect.top + 24), floatingRect.top + floatingRect.height - 24),
    }
  }

  return {
    x: Math.min(Math.max(targetCenterX, floatingRect.left + 24), floatingRect.left + floatingRect.width - 24),
    y: dy > 0 ? floatingRect.top + floatingRect.height : floatingRect.top,
  }
}

function OnboardingTargetOverlay({
  floatingRect,
  targetRect,
}: {
  floatingRect: FloatingRect | null
  targetRect: OnboardingTargetRect | null
}) {
  if (!floatingRect || !targetRect) return null

  const start = getArrowAnchor(floatingRect, targetRect)
  const end = {
    x: targetRect.left + targetRect.width / 2,
    y: targetRect.top + targetRect.height / 2,
  }
  const controlX = (start.x + end.x) / 2
  const controlY = Math.min(start.y, end.y) - 32
  const path = `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`
  const labelTop = Math.max(10, targetRect.top - 34)
  const labelLeft = Math.min(Math.max(10, targetRect.left), Math.max(10, window.innerWidth - 260))

  return (
    <>
      <svg className="fixed inset-0 z-[55] pointer-events-none" width="100%" height="100%" aria-hidden="true">
        <defs>
          <marker id="onboarding-arrow-head" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent)" />
          </marker>
        </defs>
        <path
          d={path}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          markerEnd="url(#onboarding-arrow-head)"
          className="onboarding-target-arrow"
        />
      </svg>
      <div
        className="fixed z-[55] pointer-events-none rounded-lg border-2 border-[var(--color-accent)] onboarding-target-highlight"
        style={{
          left: targetRect.left - 6,
          top: targetRect.top - 6,
          width: targetRect.width + 12,
          height: targetRect.height + 12,
        }}
      />
      <div
        className="fixed z-[55] pointer-events-none rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-inverse)] shadow-lg"
        style={{ left: labelLeft, top: labelTop }}
      >
        指向：{targetRect.label}
      </div>
    </>
  )
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

function getRouteSyncedStepId(pathname: string, search: string) {
  if (pathname === '/browser/cores') return 'core-entry'
  if (pathname === '/browser/proxy-pool') return 'proxy-entry'
  if (pathname === '/browser/extensions') return 'extension-entry'
  if (pathname === '/settings') return 'settings-entry'
  if (pathname === '/browser/list') return 'list-entry'
  if (pathname === '/browser/edit/new') return 'profile-basic'
  if (pathname.startsWith('/browser/edit/')) return 'profile-basic'
  if (pathname === '/browser/organization') {
    const tab = new URLSearchParams(search).get('tab')
    if (tab === 'groups') return 'organization-groups'
    if (tab === 'defaults') return 'organization-default'
    return 'organization-entry'
  }
  return ''
}

function getBackupDemoTab(stepId: string): BackupRestoreDemoTab | null {
  if (stepId === 'profile-backup' || stepId === 'backup-export') return 'export'
  if (stepId === 'backup-restore') return 'restore'
  return null
}

export function FirstRunOnboarding() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [manualReplay, setManualReplay] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition>(() => getInitialFloatingPosition())
  const [targetRect, setTargetRect] = useState<OnboardingTargetRect | null>(null)
  const [floatingRect, setFloatingRect] = useState<FloatingRect | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const routeKey = getRouteKey(location.pathname, location.search)
  const lastRouteKeyRef = useRef(routeKey)
  const demoNavigationTargetRef = useRef<string | null>(null)
  const step = FIRST_RUN_ONBOARDING_STEPS[stepIndex]
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === FIRST_RUN_ONBOARDING_STEPS.length - 1

  const navigateFromDemo = useCallback((path: string) => {
    const nextRouteKey = getRouteKeyFromPath(path)
    demoNavigationTargetRef.current = nextRouteKey === routeKey ? null : nextRouteKey
    navigate(path)
  }, [navigate, routeKey])

  const measureFloatingRect = useCallback(() => {
    const rect = dialogRef.current?.getBoundingClientRect()
    if (!rect) {
      setFloatingRect(null)
      return null
    }
    const next = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
    setFloatingRect(next)
    return next
  }, [])

  const measureTargetElement = useCallback((element: Element, target: OnboardingTargetConfig) => {
    const rect = element.getBoundingClientRect()
    const nextTarget = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      label: target.label || target.text,
    }
    setTargetRect(nextTarget)

    const currentFloatingRect = measureFloatingRect()
    if (currentFloatingRect) {
      const nextFloatingPosition = placeFloatingAwayFromTarget(nextTarget, currentFloatingRect)
      if (nextFloatingPosition) {
        setFloatingPosition(nextFloatingPosition)
      }
    }
  }, [measureFloatingRect])

  const resolveStepTarget = useCallback(() => {
    if (!open) return false
    const target = getStepTarget(step)
    if (!target) {
      setTargetRect(null)
      return true
    }

    const element = findOnboardingTargetElement(target)
    if (!element) {
      setTargetRect(null)
      return false
    }

    const rect = element.getBoundingClientRect()
    if (!isRectMostlyVisible(rect)) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      window.setTimeout(() => measureTargetElement(element, target), 260)
      return true
    }

    measureTargetElement(element, target)
    return true
  }, [measureTargetElement, open, step])

  const openAtStep = useCallback((stepId?: string, manual = false) => {
    const index = findStepIndex(stepId)
    const target = FIRST_RUN_ONBOARDING_STEPS[index]
    setManualReplay(manual)
    setStepIndex(index)
    setTargetRect(null)
    setFloatingPosition(getInitialFloatingPosition())
    setOpen(true)
    if (target.routePath) {
      navigateFromDemo(target.routePath)
    }
  }, [navigateFromDemo])

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
      navigateFromDemo(target.routePath)
    }
  }, [navigateFromDemo])

  const setStepAndNavigate = useCallback((nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(FIRST_RUN_ONBOARDING_STEPS.length - 1, nextIndex))
    const next = FIRST_RUN_ONBOARDING_STEPS[boundedIndex]
    setStepIndex(boundedIndex)
    setTargetRect(null)
    navigateForStep(next)
  }, [navigateForStep])

  const closeOnboarding = useCallback(() => {
    if (!manualReplay) {
      markFirstRunOnboardingCompleted()
    }
    setTargetRect(null)
    setOpen(false)
  }, [manualReplay])

  const skipOnboarding = useCallback(() => {
    markFirstRunOnboardingCompleted()
    setTargetRect(null)
    setOpen(false)
  }, [])

  const finishOnboarding = useCallback(() => {
    markFirstRunOnboardingCompleted()
    setTargetRect(null)
    setOpen(false)
  }, [])

  const handleStepAction = useCallback((current: OnboardingStep) => {
    if (current.actionPath) {
      navigateFromDemo(current.actionPath)
    }
    if (current.actionNextId) {
      setStepIndex(findStepIndex(current.actionNextId))
      setTargetRect(null)
    }
  }, [navigateFromDemo])

  const nextStep = useCallback(() => {
    setStepAndNavigate(stepIndex + 1)
  }, [setStepAndNavigate, stepIndex])

  const previousStep = useCallback(() => {
    setStepAndNavigate(stepIndex - 1)
  }, [setStepAndNavigate, stepIndex])

  useEffect(() => {
    if (!open) {
      requestBrowserListBackupDemo({ open: false })
      return
    }

    const backupTab = getBackupDemoTab(step.id)
    if (!backupTab) {
      requestBrowserListBackupDemo({ open: false })
      return
    }
    if (location.pathname !== '/browser/list') return

    const timers = [80, 320, 700].map(delay => window.setTimeout(() => {
      requestBrowserListBackupDemo({ open: true, tab: backupTab })
    }, delay))

    return () => {
      timers.forEach(timer => window.clearTimeout(timer))
    }
  }, [location.pathname, open, step.id])

  useEffect(() => {
    if (!open) return

    const onResize = () => {
      setFloatingPosition(current => constrainFloatingPosition(current))
      window.setTimeout(() => {
        measureFloatingRect()
        resolveStepTarget()
      }, 80)
    }

    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [measureFloatingRect, open, resolveStepTarget])

  useEffect(() => {
    if (!open) return

    const frame = window.requestAnimationFrame(() => {
      measureFloatingRect()
    })
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [floatingPosition.left, floatingPosition.top, measureFloatingRect, open, stepIndex])

  useEffect(() => {
    const previousRouteKey = lastRouteKeyRef.current
    lastRouteKeyRef.current = routeKey

    if (!open) {
      demoNavigationTargetRef.current = null
      return
    }

    if (previousRouteKey === routeKey) return

    setTargetRect(null)

    if (demoNavigationTargetRef.current) {
      if (demoNavigationTargetRef.current === routeKey) {
        demoNavigationTargetRef.current = null
        return
      }
      demoNavigationTargetRef.current = null
    }

    const syncedStepId = getRouteSyncedStepId(location.pathname, location.search)
    if (!syncedStepId) return

    const syncedIndex = findStepIndex(syncedStepId)
    if (syncedIndex !== stepIndex) {
      setStepIndex(syncedIndex)
    }
  }, [location.pathname, location.search, open, routeKey, stepIndex])

  useEffect(() => {
    if (!open) {
      setFloatingRect(null)
      setTargetRect(null)
      return
    }

    const timers: number[] = []
    const schedule = (delay: number, attempt: number) => {
      const timer = window.setTimeout(() => {
        const resolved = resolveStepTarget()
        if (!resolved && attempt < 8) {
          schedule(160, attempt + 1)
        }
      }, delay)
      timers.push(timer)
    }

    schedule(120, 0)
    schedule(420, 0)

    return () => {
      timers.forEach(timer => window.clearTimeout(timer))
    }
  }, [location.pathname, location.search, open, resolveStepTarget, stepIndex])

  useEffect(() => {
    if (!open) return

    let frame = 0
    const update = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        measureFloatingRect()
        resolveStepTarget()
      })
    }

    window.addEventListener('scroll', update, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update, true)
    }
  }, [measureFloatingRect, open, resolveStepTarget])

  const handleDragStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: floatingPosition.left,
      startTop: floatingPosition.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }, [floatingPosition.left, floatingPosition.top])

  const handleMouseDragStart = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    dragStateRef.current = {
      pointerId: -1,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: floatingPosition.left,
      startTop: floatingPosition.top,
    }
    event.preventDefault()
  }, [floatingPosition.left, floatingPosition.top])

  const handleDragMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    setFloatingPosition(constrainFloatingPosition({
      left: dragState.startLeft + event.clientX - dragState.startX,
      top: dragState.startTop + event.clientY - dragState.startY,
    }))
  }, [])

  const handleDragEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragStateRef.current = null
  }, [])

  useEffect(() => {
    if (!open) {
      dragStateRef.current = null
      return
    }

    const onMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== -1) return

      setFloatingPosition(constrainFloatingPosition({
        left: dragState.startLeft + event.clientX - dragState.startX,
        top: dragState.startTop + event.clientY - dragState.startY,
      }))
    }

    const onMouseUp = () => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== -1) return
      dragStateRef.current = null
    }

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

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
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

  if (!open) return null

  return (
    <>
      <OnboardingTargetOverlay floatingRect={floatingRect} targetRect={targetRect} />
      <div
        className="fixed z-[60] pointer-events-none"
        style={{
          left: floatingPosition.left,
          top: floatingPosition.top,
          width: 'min(960px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 32px)',
        }}
      >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="false"
        aria-label="演示模式"
        className="pointer-events-auto flex max-h-[calc(100vh-32px)] w-full flex-col overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-2xl animate-scale-in"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)]">
          <div
            className="flex min-w-0 flex-1 cursor-move items-center gap-3 px-6 py-4"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            onMouseDown={handleMouseDragStart}
          >
            <Move className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
            <h3 className="truncate text-lg font-semibold text-[var(--color-text-primary)]">演示模式</h3>
          </div>
          <button
            type="button"
            className="mr-4 rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]"
            onPointerDown={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            onClick={closeOnboarding}
            aria-label="关闭演示模式"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]">
            <OnboardingAnimation sceneKey={step.sceneKey} activeStepId={step.id} />
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
        </div>

        <div className="border-t border-[var(--color-border)] px-6 py-4">
          {footer}
        </div>
      </section>
      </div>
    </>
  )
}
