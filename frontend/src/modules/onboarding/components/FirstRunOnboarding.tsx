import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Globe2,
  Layers3,
  Monitor,
  MousePointer2,
  Play,
  Rocket,
} from 'lucide-react'
import { Button, Modal } from '../../../shared/components'
import {
  FIRST_RUN_ONBOARDING_OPEN_EVENT,
  markFirstRunOnboardingCompleted,
  shouldShowFirstRunOnboarding,
} from '../onboardingStorage'
import { OnboardingAnimation, type OnboardingStepKey } from './OnboardingAnimation'

type OnboardingStep = {
  key: OnboardingStepKey
  icon: ReactNode
  title: string
  description: string
  actionLabel?: string
  actionPath?: string
}

const FIRST_RUN_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: 'overview',
    icon: <Layers3 className="h-4 w-4" />,
    title: '统一管理多个指纹浏览器实例',
    description: '把实例、代理、内核和标签集中到一个工作台里，减少来回查找配置的成本。',
  },
  {
    key: 'core',
    icon: <Cpu className="h-4 w-4" />,
    title: '先准备可用浏览器内核',
    description: '内核是实例启动的基础。下载或导入 fingerprint-chromium 后，先在内核管理中确认默认内核。',
    actionLabel: '去内核管理',
    actionPath: '/browser/cores',
  },
  {
    key: 'proxy',
    icon: <Globe2 className="h-4 w-4" />,
    title: '把代理节点集中放进代理池',
    description: 'HTTP、SOCKS5、订阅节点都可以统一维护，创建实例时直接选择可用节点。',
    actionLabel: '去代理池',
    actionPath: '/browser/proxy-pool',
  },
  {
    key: 'profile',
    icon: <Monitor className="h-4 w-4" />,
    title: '创建实例，绑定内核、代理和指纹参数',
    description: '为每个业务场景单独建立实例，按需要绑定内核、代理、标签、启动参数和指纹配置。',
    actionLabel: '新建实例',
    actionPath: '/browser/edit/new',
  },
  {
    key: 'sync',
    icon: <MousePointer2 className="h-4 w-4" />,
    title: '启动实例后，可进行多窗口同步操作',
    description: '打开多个实例后，可以用主控窗口同步鼠标、滚轮和常用操作，适合批量重复流程。',
    actionLabel: '查看实例列表',
    actionPath: '/browser/list',
  },
  {
    key: 'finish',
    icon: <Rocket className="h-4 w-4" />,
    title: '现在可以开始创建你的第一个实例',
    description: '建议先确认内核，再配置代理池，最后创建并启动实例。详细步骤可以随时从使用教程回看。',
    actionLabel: '开始创建实例',
    actionPath: '/browser/edit/new',
  },
]

function isSpecialWindow() {
  if (typeof window === 'undefined') return true
  const params = new URLSearchParams(window.location.search)
  return params.get('toolbar') === '1' || params.get('windowSyncPrompt') === 'master-closed'
}

export function FirstRunOnboarding() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [manualReplay, setManualReplay] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const step = FIRST_RUN_ONBOARDING_STEPS[stepIndex]
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === FIRST_RUN_ONBOARDING_STEPS.length - 1

  useEffect(() => {
    if (isSpecialWindow() || !shouldShowFirstRunOnboarding()) return

    const timer = window.setTimeout(() => {
      setManualReplay(false)
      setStepIndex(0)
      setOpen(true)
    }, 3200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const onReplay = () => {
      setManualReplay(true)
      setStepIndex(0)
      setOpen(true)
    }

    window.addEventListener(FIRST_RUN_ONBOARDING_OPEN_EVENT, onReplay)
    return () => {
      window.removeEventListener(FIRST_RUN_ONBOARDING_OPEN_EVENT, onReplay)
    }
  }, [])

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

  const goToPath = useCallback((path: string) => {
    markFirstRunOnboardingCompleted()
    setOpen(false)
    navigate(path)
  }, [navigate])

  const nextStep = useCallback(() => {
    setStepIndex(current => {
      if (current >= FIRST_RUN_ONBOARDING_STEPS.length - 1) return current
      return current + 1
    })
  }, [])

  const previousStep = useCallback(() => {
    setStepIndex(current => Math.max(0, current - 1))
  }, [])

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

  const footer = useMemo(() => {
    return (
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-center gap-1.5 sm:justify-start">
          {FIRST_RUN_ONBOARDING_STEPS.map((item, index) => (
            <button
              key={item.key}
              type="button"
              className={`h-2.5 rounded-full transition-all duration-200 ${
                index === stepIndex
                  ? 'w-7 bg-[var(--color-accent)]'
                  : 'w-2.5 bg-[var(--color-border-strong)] hover:bg-[var(--color-text-muted)]'
              }`}
              aria-label={`切换到第 ${index + 1} 步`}
              onClick={() => setStepIndex(index)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
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
  }, [finishOnboarding, isFirstStep, isLastStep, nextStep, previousStep, skipOnboarding, stepIndex])

  return (
    <Modal open={open} onClose={closeOnboarding} title="首次使用引导" width="920px" footer={footer}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <OnboardingAnimation stepKey={step.key} />
        <div className="flex min-w-0 flex-col justify-between gap-5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-base)] p-4">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent-muted)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent)]">
              {step.icon}
              第 {stepIndex + 1} 步 / {FIRST_RUN_ONBOARDING_STEPS.length}
            </div>
            <h2 className="text-xl font-semibold leading-snug text-[var(--color-text-primary)]">{step.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">{step.description}</p>
          </div>

          <div className="space-y-3">
            {step.actionPath && step.actionLabel ? (
              <Button className="w-full" size="lg" onClick={() => goToPath(step.actionPath!)}>
                <Play className="h-4 w-4" />
                {step.actionLabel}
              </Button>
            ) : null}
            {step.key === 'finish' ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" onClick={() => goToPath('/system/tutorial')}>
                  打开使用教程
                </Button>
                <Button variant="secondary" onClick={() => goToPath('/browser/list')}>
                  实例列表
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  )
}
