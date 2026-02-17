import { useEffect } from 'react'

export function useSplashReady({
  baseUrl,
  onReady,
  log,
}: {
  baseUrl: string
  onReady: () => void
  log: (...args: Array<unknown>) => void
}) {
  useEffect(() => {
    log('AppContent mounted', { baseUrl })

    const splashTimer = setTimeout(() => {
      onReady()
    }, 5000)

    return () => clearTimeout(splashTimer)
  }, [baseUrl, onReady, log])
}
