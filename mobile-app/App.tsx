import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Alert, AppState, Linking } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import * as MediaLibrary from 'expo-media-library'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import AsyncStorage from '@react-native-async-storage/async-storage'
import SplashScreen from './SplashScreen'
import ConnectionSetupModal from './src/components/ConnectionSetupModal'
import GalleryScreen from './src/components/GalleryScreen'
import MediaPreviewScreen from './src/components/MediaPreviewScreen'
import MainDashboard from './src/components/MainDashboard'
import { styles } from './src/styles/appStyles'
import { canSaveToPhotos, formatCustomBaseUrl, getAzureMediaUrl, isRawVideoFile } from './src/utils/media'
import { checkConnection as checkConnectionRequest, retryConnection as retryConnectionRequest } from './src/utils/connection'
import { disablePushNotifications as disablePushNotificationsRequest, registerForPushNotifications as registerForPushNotificationsRequest } from './src/utils/pushNotifications'
import { useSplashReady } from './src/hooks/useSplashReady'
import { useAppStateSync } from './src/hooks/useAppStateSync'
import { useAppInitialization } from './src/hooks/useAppInitialization'

function AppContent() {
  const [isReady, setIsReady] = useState(false)
  const [hasUserDismissedHelp, setHasUserDismissedHelp] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const log = useCallback((...args: Array<unknown>) => {
    console.log('[SPICAM]', ...args)
  }, [])
  const defaultBaseUrl = (() => {
    if (Constants.isDevice) return 'http://100.86.177.103:8000'
    if (Platform.OS === 'android') return 'http://10.0.2.2:8000'
    return 'http://100.86.177.103:8000'
  })()
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl)
  const [status, setStatus] = useState('')
  const [events, setEvents] = useState<Array<{ name: string; last_modified?: string | null }>>([])
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [galleryMode, setGalleryMode] = useState<'recents' | null>(null)
  const [recentsFilter, setRecentsFilter] = useState<'all' | 'photos' | 'videos'>('all')
  const [notifications, setNotifications] = useState<Array<{ message: string; kind?: string; timestamp: string }>>([])
  const [notificationsUpdatedAt, setNotificationsUpdatedAt] = useState<Date | null>(null)
  const [motionSettingsCollapsed, setMotionSettingsCollapsed] = useState(true)
  const [motionThreshold, setMotionThreshold] = useState(4)
  const [motionMinArea, setMotionMinArea] = useState(10)
  const [notificationCooldown, setNotificationCooldown] = useState(30)
  const [isRecording, setIsRecording] = useState(false)
  const [recordDuration, setRecordDuration] = useState(30)
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null)
  const [isAppActive, setIsAppActive] = useState(true)
  const [appState, setAppState] = useState<string>(AppState.currentState)
  const [streamKey, setStreamKey] = useState(0)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'failed'>('checking')
  const [showConnectionHelp, setShowConnectionHelp] = useState(false)
  const [customIp, setCustomIp] = useState('')
  const isConnectionCheckInFlight = useRef(false)

  const bumpStreamKey = useCallback(() => {
    setStreamKey(key => key + 1)
  }, [])

  const markReady = useCallback(() => {
    setIsReady(true)
  }, [])

  useSplashReady({
    baseUrl,
    onReady: markReady,
    log,
  })

  const setMotionState = useCallback(async (enabled: boolean) => {
    try {
      const endpoint = enabled ? 'arm' : 'disarm'
      log('Setting motion state', { enabled, endpoint })
      await fetch(`${baseUrl}/${endpoint}`, { method: 'POST' })
    } catch (error) {
      log('Failed to set motion state', String(error))
    }
  }, [baseUrl])

  const stopStream = useCallback(async () => {
    try {
      await fetch(`${baseUrl}/stream/stop`, { method: 'POST' })
    } catch (error) {
      log('Failed to stop stream', String(error))
    }
  }, [baseUrl])

  useAppStateSync({
    log,
    setMotionState,
    stopStream,
    setAppState,
    setIsAppActive,
    bumpStreamKey,
  })

  const reloadStream = useCallback(() => {
    setStreamError(null)
    const bumpStreamKey = () => {
      setStreamKey(key => key + 1)
    }
    const reloadAfterStop = async () => {
      await stopStream()
      setTimeout(bumpStreamKey, 300)
    }
    void reloadAfterStop()
  }, [stopStream])

  const saveToPhotos = async (filename: string) => {
    try {
      if (!canSaveToPhotos(filename)) {
        const message = isRawVideoFile(filename)
          ? 'This recording is raw .h264. Install ffmpeg on the Pi to generate .mp4 files before saving.'
          : 'This file type cannot be saved to Photos. Use .jpg/.png for photos or .mp4 for video.'
        Alert.alert('Save Failed', message)
        return
      }
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access to save media.')
        return
      }

      const fileUri = `${FileSystem.documentDirectory!}${filename}`
      const downloadResult = await FileSystem.downloadAsync(
        getAzureMediaUrl(baseUrl, filename),
        fileUri
      )

      if (downloadResult.status !== 200) {
        throw new Error('Download failed')
      }

      await MediaLibrary.createAssetAsync(downloadResult.uri)
      Alert.alert('Success', `Saved to Photos: ${filename}`)
    } catch (error) {
      Alert.alert('Save Failed', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  const shareMedia = async (filename: string) => {
    try {
      const fileUri = `${FileSystem.cacheDirectory!}${filename}`
      const downloadResult = await FileSystem.downloadAsync(
        getAzureMediaUrl(baseUrl, filename),
        fileUri
      )

      if (downloadResult.status !== 200) {
        throw new Error('Download failed')
      }

      const canShare = await Sharing.isAvailableAsync()
      if (!canShare) {
        Alert.alert('Sharing Not Available', 'Sharing is not available on this device')
        return
      }

      await Sharing.shareAsync(downloadResult.uri)
    } catch (error) {
      Alert.alert('Share Failed', error instanceof Error ? error.message : 'Unknown error')
    }
  }



  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/azure/blobs`)
      const json = await res.json()
      if (Array.isArray(json)) {
        setEvents(json)
      }
    } catch (error) {
      setStatus('Failed to load events')
      log('Failed to load events', String(error))
    }
  }, [baseUrl])



  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/notifications`)
      const json = await res.json()
      if (Array.isArray(json)) {
        setNotifications(json)
        setNotificationsUpdatedAt(new Date())
        log('Notifications updated', { count: json.length })
      }
    } catch (error) {
      log('Failed to fetch notifications', String(error))
    }
  }, [baseUrl])

  const fetchMotionSettings = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/motion/settings`)
      const json = await res.json()
      if (json?.threshold != null) setMotionThreshold(json.threshold)
      if (json?.min_area != null) setMotionMinArea(json.min_area)
      if (json?.cooldown != null) setNotificationCooldown(json.cooldown)
    } catch (error) {
      log('Failed to fetch motion settings', String(error))
    }
  }, [baseUrl])

  const updateMotionSettings = useCallback(async () => {
    try {
      await fetch(`${baseUrl}/motion/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threshold: motionThreshold,
          min_area: motionMinArea,
          cooldown: notificationCooldown
        })
      })
      setStatus('Motion settings updated')
    } catch (error) {
      setStatus('Failed to update motion settings')
      log('Failed to update motion settings', String(error))
    }
  }, [baseUrl, motionThreshold, motionMinArea, notificationCooldown])

  const checkConnection = useCallback(async () => {
    if (isConnectionCheckInFlight.current) {
      return
    }
    isConnectionCheckInFlight.current = true
    try {
      await checkConnectionRequest({
        baseUrl,
        hasUserDismissedHelp,
        setConnectionStatus,
        setShowConnectionHelp,
      })
    } finally {
      isConnectionCheckInFlight.current = false
    }
  }, [baseUrl, hasUserDismissedHelp])

  const retryConnection = useCallback(async () => {
    await retryConnectionRequest({
      baseUrl,
      setIsRetrying,
      setConnectionStatus,
      setShowConnectionHelp,
      setHasUserDismissedHelp,
    })
  }, [baseUrl])

  const useCustomIp = useCallback(() => {
    if (customIp.trim()) {
      const formattedUrl = formatCustomBaseUrl(customIp)
      setBaseUrl(formattedUrl)
      setShowConnectionHelp(false)
      // Will trigger checkConnection via useEffect on baseUrl change
    }
  }, [customIp])

  const startRecording = useCallback(async (durationSeconds: number) => {
    log('Starting recording for', durationSeconds, 'seconds')
    try {
      setIsRecording(true)
      log('Sending request to:', `${baseUrl}/record/start`)
      const res = await fetch(`${baseUrl}/record/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: durationSeconds })
      })
      log('Response status:', res.status)
      const data = await res.json()
      log('Response data:', data)
      if (data.status === 'recording') {
        setStatus(`Recording for ${durationSeconds}s...`)
        setTimeout(() => {
          setIsRecording(false)
          setStatus('Recording complete')
          fetchEvents()
        }, durationSeconds * 1000 + 1000)
      } else if (data.error) {
        setIsRecording(false)
        setStatus(`Error: ${data.error}`)
        Alert.alert('Recording Error', data.error)
      }
    } catch (error) {
      console.error('[SPICAM] Recording error', error)
      setIsRecording(false)
      Alert.alert('Recording Failed', error instanceof Error ? error.message : 'Unknown error')
    }
  }, [baseUrl, fetchEvents])

  const registerForPushNotifications = useCallback(async (options?: { silent?: boolean }) => {
    await registerForPushNotificationsRequest({
      baseUrl,
      setExpoPushToken,
      log,
      options,
    })
  }, [baseUrl, log])

  const disablePushNotifications = useCallback(async () => {
    if (!expoPushToken) {
      return
    }
    disablePushNotificationsRequest({
      baseUrl,
      expoPushToken,
      setExpoPushToken,
      log,
    })
  }, [baseUrl, expoPushToken, log])


  useAppInitialization({
    isReady,
    checkConnection,
    fetchEvents,
    fetchNotifications,
    fetchMotionSettings,
    registerForPushNotifications,
    startRecording,
    setHasUserDismissedHelp,
    log,
  })

  useEffect(() => {
    if (!isReady) {
      return
    }
    void checkConnection()
  }, [isReady, baseUrl, checkConnection])

  const takePhoto = async () => {
    try {
      setStatus('Capturing...')
      const res = await fetch(`${baseUrl}/photo`, { method: 'POST' })
      const json = await res.json()
      setStatus(`Saved: ${json.filename ?? json.path}`)
      fetchEvents()
    } catch (error) {
      setStatus('Failed to capture photo')
      log('Failed to capture photo', String(error))
    }
  }

  if (selectedMedia) {
    return (
      <MediaPreviewScreen
        selectedMedia={selectedMedia}
        baseUrl={baseUrl}
        mediaLoading={mediaLoading}
        setMediaLoading={setMediaLoading}
        onBack={() => {
          setSelectedMedia(null)
          setMediaLoading(false)
        }}
        onSaveToPhotos={filename => {
          void saveToPhotos(filename)
        }}
        onShareMedia={filename => {
          void shareMedia(filename)
        }}
      />
    )
  }

  if (galleryMode) {
    return (
      <GalleryScreen
        baseUrl={baseUrl}
        events={events}
        recentsFilter={recentsFilter}
        onSetFilter={setRecentsFilter}
        onBack={() => setGalleryMode(null)}
        onSelectMedia={setSelectedMedia}
      />
    )
  }

  if (!isReady) {
    return <SplashScreen />
  }

  return (
    <SafeAreaView style={styles.container}>
      <ConnectionSetupModal
        visible={showConnectionHelp}
        connectionStatus={connectionStatus}
        isRetrying={isRetrying}
        customIp={customIp}
        onChangeCustomIp={setCustomIp}
        onUseCustomIp={useCustomIp}
        onRetryConnection={retryConnection}
        onOpenTailscale={() => {
          void Linking.openURL('https://tailscale.com/download')
        }}
        onDismiss={() => {
          void (async () => {
            console.log('[DEBUG] Dismiss button pressed!')
            await AsyncStorage.setItem('connectionHelpDismissed', 'true')
            console.log('[DEBUG] Saved to AsyncStorage')
            setHasUserDismissedHelp(true)
            setShowConnectionHelp(false)
            console.log('[DEBUG] Modal dismissed')
          })()
        }}
      />

      <MainDashboard
        appState={appState}
        isAppActive={isAppActive}
        isRecording={isRecording}
        streamKey={streamKey}
        baseUrl={baseUrl}
        onChangeBaseUrl={setBaseUrl}
        onStreamError={message => {
          log('Stream error', message)
          setStreamError(message)
        }}
        onReloadStream={reloadStream}
        streamError={streamError}
        motionSettingsCollapsed={motionSettingsCollapsed}
        onToggleMotionSettings={() => setMotionSettingsCollapsed(prev => !prev)}
        motionThreshold={motionThreshold}
        onChangeMotionThreshold={setMotionThreshold}
        motionMinArea={motionMinArea}
        onChangeMotionMinArea={setMotionMinArea}
        notificationCooldown={notificationCooldown}
        onChangeNotificationCooldown={setNotificationCooldown}
        onUpdateMotionSettings={() => {
          void updateMotionSettings()
        }}
        eventsCount={events.length}
        onRefreshEvents={() => {
          void fetchEvents()
        }}
        onOpenRecents={() => setGalleryMode('recents')}
        onTakePhoto={() => {
          void takePhoto()
        }}
        expoPushToken={expoPushToken}
        onDisableAlerts={() => {
          void disablePushNotifications()
        }}
        onEnableAlerts={() => {
          void registerForPushNotifications()
        }}
        recordDuration={recordDuration}
        onSetRecordDuration={setRecordDuration}
        onStartRecording={() => {
          void startRecording(recordDuration)
        }}
        notifications={notifications}
        notificationsUpdatedAt={notificationsUpdatedAt}
        onRefreshNotifications={() => {
          void fetchNotifications()
        }}
        status={status}
      />
    </SafeAreaView>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  )
}
