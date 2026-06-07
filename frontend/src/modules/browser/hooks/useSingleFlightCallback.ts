import { useCallback, useEffect, useRef } from 'react'

export function useSingleFlightCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void | Promise<void>
) {
  const callbackRef = useRef(callback)
  const inFlightRef = useRef(false)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  return useCallback((...args: TArgs) => {
    if (inFlightRef.current) {
      return Promise.resolve()
    }
    inFlightRef.current = true
    try {
      return Promise.resolve(callbackRef.current(...args))
        .catch(() => undefined)
        .finally(() => {
          inFlightRef.current = false
        })
    } catch {
      inFlightRef.current = false
      return Promise.resolve()
    }
  }, [])
}
