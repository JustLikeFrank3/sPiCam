import { AppState } from 'react-native'
import { useEffect } from 'react'

export function useAppStateSync({
  log,
  setMotionState,
  stopStream,
  setAppState,
  setIsAppActive,
  bumpStreamKey,
}: {
  log: (...args: Array<unknown>) => void
  setMotionState: (enabled: boolean) => Promise<void>
  stopStream: () => Promise<void>
  setAppState: (state: string) => void
  setIsAppActive: (active: boolean) => void
  bumpStreamKey: () => void
}) {
  useEffect(() => {
    const handleAppState = (state: string) => {
      log('AppState change', state)
      setAppState(state)
      const active = state === 'active'
      setIsAppActive(active)
      if (state === 'active') {
        void setMotionState(false)
        bumpStreamKey()
        return
      }
      if (state === 'background') {
        void setMotionState(true)
        void stopStream()
      }
    }

    handleAppState(AppState.currentState)
    const subscription = AppState.addEventListener('change', handleAppState)
    return () => subscription.remove()
  }, [log, setMotionState, stopStream, setAppState, setIsAppActive, bumpStreamKey])
}
