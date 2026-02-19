import { Alert } from 'react-native'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'

type LogFn = (...args: Array<unknown>) => void

type RegisterParams = {
  baseUrl: string
  setExpoPushToken: (token: string | null) => void
  log: LogFn
  options?: { silent?: boolean }
}

type UnregisterParams = {
  baseUrl: string
  expoPushToken: string
  setExpoPushToken: (token: string | null) => void
  log: LogFn
}

type SetupListenersParams = {
  log: LogFn
  onRecord30: () => void
  onRecord60: () => void
}

const promptMotionDetected = (onRecord30: () => void, onRecord60: () => void) => {
  Alert.alert(
    'Motion Detected',
    'Motion detected by retrosPiCam. Start recording?',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Record 30s', onPress: onRecord30 },
      { text: 'Record 60s', onPress: onRecord60 },
    ]
  )
}

const ensurePushPermission = async (silent: boolean, log: LogFn) => {
  if (!Device.isDevice) {
    if (!silent) {
      Alert.alert('Push notifications only work on physical devices')
    }
    return false
  }

  log('Checking notification permissions')
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    log('Notification permission denied')
    if (!silent) {
      Alert.alert('Notification Permission', 'Push notification permissions are required for motion alerts')
    }
    return false
  }

  return true
}

const resolveProjectId = (silent: boolean, log: LogFn) => {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  if (!projectId) {
    log('Missing projectId in app config')
    if (!silent) {
      Alert.alert('Notification Error', 'Missing projectId. Add expo.extra.eas.projectId in app.json.')
    }
    return null
  }
  return projectId
}

const registerTokenWithServer = async (baseUrl: string, token: string, log: LogFn, silent: boolean) => {
  try {
    log('Registering token with server')
    const response = await fetch(`${baseUrl}/notifications/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`)
    }

    const data = await response.json()
    log('Server registration response', data)
    if (!silent) {
      Alert.alert('Success', 'Push notifications enabled! You\'ll receive alerts when motion is detected.')
    }
  } catch (error) {
    console.error('[RETROSPICAM] Failed to register push token with server', error)
    if (!silent) {
      Alert.alert('Warning', 'Notifications enabled locally, but server registration failed. Motion alerts may not work.')
    }
  }
}

export const registerForPushNotifications = async ({ baseUrl, setExpoPushToken, log, options }: RegisterParams) => {
  const silent = options?.silent === true

  try {
    const hasPermission = await ensurePushPermission(silent, log)
    if (!hasPermission) {
      return
    }

    log('Getting Expo push token')
    const projectId = resolveProjectId(silent, log)
    if (!projectId) {
      return
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId })
    const token = tokenData.data
    log('Got push token', token)
    setExpoPushToken(token)

    await registerTokenWithServer(baseUrl, token, log, silent)
  } catch (error) {
    console.error('[RETROSPICAM] Push notification registration error', error)
    if (!silent) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to enable notifications')
    }
  }
}

export const disablePushNotifications = ({ baseUrl, expoPushToken, setExpoPushToken, log }: UnregisterParams) => {
  Alert.alert(
    'Disable Alerts',
    'This will stop motion notifications for this device. You can re-enable later.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disable',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              log('Unregistering token with server')
              const response = await fetch(`${baseUrl}/notifications/unregister`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: expoPushToken }),
              })

              if (!response.ok) {
                throw new Error(`Server returned ${response.status}`)
              }

              const data = await response.json()
              log('Server unregister response', data)
              setExpoPushToken(null)
            } catch (error) {
              console.error('[RETROSPICAM] Failed to unregister push token', error)
              Alert.alert('Disable Failed', 'Could not disable alerts. Try again.')
            }
          })()
        },
      },
    ]
  )
}

export const setupNotificationListeners = ({ log, onRecord30, onRecord60 }: SetupListenersParams) => {
  if (typeof Notifications.setNotificationHandler === 'function') {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    })
  } else {
    log('Notifications.setNotificationHandler unavailable')
  }

  const notificationListener =
    typeof Notifications.addNotificationReceivedListener === 'function'
      ? Notifications.addNotificationReceivedListener(notification => {
          const data = notification.request.content.data
          if (data?.type === 'motion_detected') {
            promptMotionDetected(onRecord30, onRecord60)
          }
        })
      : null

  if (!notificationListener) {
    log('Notifications.addNotificationReceivedListener unavailable')
  }

  const responseListener =
    typeof Notifications.addNotificationResponseReceivedListener === 'function'
      ? Notifications.addNotificationResponseReceivedListener(response => {
          const data = response.notification.request.content.data
          if (data?.type === 'motion_detected') {
            promptMotionDetected(onRecord30, onRecord60)
          }
        })
      : null

  if (!responseListener) {
    log('Notifications.addNotificationResponseReceivedListener unavailable')
  }

  return () => {
    if (notificationListener && typeof notificationListener.remove === 'function') {
      notificationListener.remove()
    }
    if (responseListener && typeof responseListener.remove === 'function') {
      responseListener.remove()
    }
  }
}
