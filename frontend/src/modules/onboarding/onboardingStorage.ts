export const FIRST_RUN_ONBOARDING_VERSION = 1
export const FIRST_RUN_ONBOARDING_KEY = 'trace:onboarding:firstRun:v1'
export const FIRST_RUN_ONBOARDING_OPEN_EVENT = 'trace:onboarding:open'

type FirstRunOnboardingStatus = {
  status?: 'completed'
  version?: number
  completedAt?: string
}

function hasWindowStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function readFirstRunOnboardingStatus(): FirstRunOnboardingStatus | null {
  if (!hasWindowStorage()) return null

  try {
    const raw = window.localStorage.getItem(FIRST_RUN_ONBOARDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as FirstRunOnboardingStatus
  } catch {
    return null
  }
}

export function shouldShowFirstRunOnboarding(): boolean {
  const status = readFirstRunOnboardingStatus()
  if (!status) return true
  if (status.status !== 'completed') return true
  return Number(status.version || 0) < FIRST_RUN_ONBOARDING_VERSION
}

export function markFirstRunOnboardingCompleted() {
  if (!hasWindowStorage()) return

  try {
    const status: FirstRunOnboardingStatus = {
      status: 'completed',
      version: FIRST_RUN_ONBOARDING_VERSION,
      completedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(FIRST_RUN_ONBOARDING_KEY, JSON.stringify(status))
  } catch {
    // localStorage 不可用时不阻断引导关闭。
  }
}

export function resetFirstRunOnboarding() {
  if (!hasWindowStorage()) return

  try {
    window.localStorage.removeItem(FIRST_RUN_ONBOARDING_KEY)
  } catch {
    // localStorage 不可用时忽略。
  }
}

export function requestFirstRunOnboardingReplay(options?: { startStepId?: string }) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FIRST_RUN_ONBOARDING_OPEN_EVENT, {
    detail: {
      manual: true,
      startStepId: options?.startStepId,
    },
  }))
}
