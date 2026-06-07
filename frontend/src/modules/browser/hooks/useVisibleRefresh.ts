import { useEffect, useRef } from 'react'

export function useVisibleRefresh(refresh: () => void | Promise<void>, intervalMs = 2000, enabled = true) {
  const refreshRef = useRef(refresh)
  const inFlightRef = useRef(false)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled) return

    const run = () => {
      if (document.visibilityState !== 'visible' || inFlightRef.current) {
        return
      }
      inFlightRef.current = true
      try {
        void Promise.resolve(refreshRef.current())
          .catch(() => undefined)
          .finally(() => {
            inFlightRef.current = false
          })
      } catch {
        inFlightRef.current = false
      }
    }

    const timer = window.setInterval(run, intervalMs)
    const handleVisibilityChange = () => run()
    const handleFocus = () => run()

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [enabled, intervalMs])
}
