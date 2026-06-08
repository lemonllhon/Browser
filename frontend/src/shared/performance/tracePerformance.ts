export type TracePerformanceMetricFields = Record<string, string | number | boolean>

export type TracePerformanceMetric = {
  name: string
  timestampMs: number
  durationMs?: number
  fields?: TracePerformanceMetricFields
}

type TracePerformanceGlobal = {
  recentMetrics: TracePerformanceMetric[]
  counters: Record<string, number>
  snapshot: () => {
    recentMetrics: TracePerformanceMetric[]
    counters: Record<string, number>
  }
  clear: () => void
}

type TracePerformanceWindow = Window & {
  __TRACE_PERF__?: TracePerformanceGlobal
}

const RECENT_METRIC_LIMIT = 200
const recentMetrics: TracePerformanceMetric[] = []
const counters: Record<string, number> = {}

export function beginTracePerformanceMetric(name: string, fields?: TracePerformanceMetricFields) {
  const startMs = nowMs()
  return (extraFields?: TracePerformanceMetricFields) => {
    recordTracePerformanceMetric(name, {
      durationMs: Math.max(0, nowMs() - startMs),
      fields: {
        ...(fields || {}),
        ...(extraFields || {}),
      },
    })
  }
}

export function recordTracePerformanceMetric(
  name: string,
  options: {
    durationMs?: number
    fields?: TracePerformanceMetricFields
  } = {}
) {
  ensureTracePerformanceGlobal()
  recentMetrics.push({
    name,
    timestampMs: Date.now(),
    durationMs: options.durationMs,
    fields: options.fields,
  })
  while (recentMetrics.length > RECENT_METRIC_LIMIT) {
    recentMetrics.shift()
  }
}

export function incrementTracePerformanceCounter(name: string, amount = 1) {
  ensureTracePerformanceGlobal()
  counters[name] = (counters[name] || 0) + amount
}

function ensureTracePerformanceGlobal(): TracePerformanceGlobal | null {
  if (typeof window === 'undefined') {
    return null
  }
  const perfWindow = window as TracePerformanceWindow
  if (!perfWindow.__TRACE_PERF__) {
    perfWindow.__TRACE_PERF__ = {
      recentMetrics,
      counters,
      snapshot: () => ({
        recentMetrics: [...recentMetrics],
        counters: { ...counters },
      }),
      clear: () => {
        recentMetrics.splice(0, recentMetrics.length)
        Object.keys(counters).forEach(key => {
          delete counters[key]
        })
      },
    }
  }
  return perfWindow.__TRACE_PERF__
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}
