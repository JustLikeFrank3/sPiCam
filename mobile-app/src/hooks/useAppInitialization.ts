import { useEffect, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { setupNotificationListeners } from '../utils/pushNotifications'

type Params = {
  isReady: boolean
  checkConnection: () => Promise<void>
  fetchEvents: () => Promise<void>
  fetchNotifications: () => Promise<void>
  fetchMotionSettings: () => Promise<void>
  registerForPushNotifications: (options?: { silent?: boolean }) => Promise<void>
  startRecording: (durationSeconds: number) => Promise<void>
  setHasUserDismissedHelp: (dismissed: boolean) => void
  log: (...args: Array<unknown>) => void
}

export function useAppInitialization({
  isReady,
  checkConnection,
  fetchEvents,
  fetchNotifications,
  fetchMotionSettings,
  registerForPushNotifications,
  startRecording,
  setHasUserDismissedHelp,
  log,
}: Params) {
  const hasAttemptedAutoRegister = useRef(false)
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (!isReady || hasInitialized.current) return
    hasInitialized.current = true

    const initializeApp = async () => {
      const dismissed = await AsyncStorage.getItem('connectionHelpDismissed')
      if (dismissed === 'true') {
        setHasUserDismissedHelp(true)
      }

      await checkConnection()
      await fetchEvents()
      await fetchNotifications()
      await fetchMotionSettings()

      if (!hasAttemptedAutoRegister.current) {
        hasAttemptedAutoRegister.current = true
        await registerForPushNotifications({ silent: true })
      }
    }

    void initializeApp()

    return setupNotificationListeners({
      log,
      onRecord30: () => {
        void startRecording(30)
      },
      onRecord60: () => {
        void startRecording(60)
      },
    })
  }, [
    isReady,
    checkConnection,
    fetchEvents,
    fetchNotifications,
    fetchMotionSettings,
    registerForPushNotifications,
    startRecording,
    setHasUserDismissedHelp,
    log,
  ])
}
