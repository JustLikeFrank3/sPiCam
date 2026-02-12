import React, { useCallback, useEffect, useState, useRef } from 'react'
import { StyleSheet, Text, View, Pressable, TextInput, FlatList, Platform, Image, ScrollView, Alert, AppState } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import { WebView } from 'react-native-webview'
import * as MediaLibrary from 'expo-media-library'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'

function AppContent() {
  const log = (...args: Array<unknown>) => {
    console.log('[SPICAM]', ...args)
  }
  const logo = require('./assets/spicam_icon_1024.png')
  const defaultBaseUrl = Constants.isDevice
    ? 'http://100.86.177.103:8000'
    : Platform.OS === 'android'
      ? 'http://10.0.2.2:8000'
      : 'http://100.86.177.103:8000'
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl)
  const [status, setStatus] = useState('')
  const [events, setEvents] = useState<Array<{ filename: string; path: string; timestamp: number }>>([])
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null)
  const [azureBlobs, setAzureBlobs] = useState<Array<{ name: string; last_modified?: string | null }>>([])
  const [selectedAzure, setSelectedAzure] = useState<string | null>(null)
  const [galleryMode, setGalleryMode] = useState<'recents' | 'cloud' | null>(null)
  const [recentsFilter, setRecentsFilter] = useState<'all' | 'photos' | 'videos'>('all')
  const [notifications, setNotifications] = useState<Array<{ message: string; kind?: string; timestamp: string }>>([])
  const [notificationsUpdatedAt, setNotificationsUpdatedAt] = useState<Date | null>(null)
  const [pan, setPan] = useState(90)
  const [tilt, setTilt] = useState(90)
  const [panTiltStep, setPanTiltStep] = useState(10)
  const [servoAvailable, setServoAvailable] = useState(false)
  const [servoEnabled, setServoEnabled] = useState(false)
  const [servoError, setServoError] = useState<string | null>(null)
  const [panTiltCollapsed, setPanTiltCollapsed] = useState(false)
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
  const notificationListener = useRef<any>(null)
  const responseListener = useRef<any>(null)
  const hasAttemptedAutoRegister = useRef(false)

  useEffect(() => {
    log('AppContent mounted', {
      platform: Platform.OS,
      isDevice: Constants.isDevice,
      baseUrl
    })
  }, [baseUrl])

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

  useEffect(() => {
    const handleAppState = (state: string) => {
      log('AppState change', state)
      setAppState(state)
      const active = state === 'active'
      setIsAppActive(active)
      if (state === 'active') {
        setMotionState(false)
        setStreamKey(key => key + 1)
        return
      }
      if (state === 'background') {
        setMotionState(true)
        void stopStream()
      }
    }
    handleAppState(AppState.currentState)
    const subscription = AppState.addEventListener('change', handleAppState)
    return () => subscription.remove()
  }, [setMotionState, stopStream])

  const reloadStream = useCallback(() => {
    setStreamError(null)
    void (async () => {
      await stopStream()
      setTimeout(() => setStreamKey(key => key + 1), 300)
    })()
  }, [stopStream])

  const isPhotoFile = (name: string) => /(\.jpe?g|\.png)$/i.test(name)
  const isVideoFile = (name: string) => /(\.avi|\.mp4)$/i.test(name)
  const isRawVideoFile = (name: string) => /\.h264$/i.test(name)
  const canSaveToPhotos = (name: string) => /(\.jpe?g|\.png|\.mp4|\.mov)$/i.test(name)
  const getVideoMimeType = (name: string) => (name.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'video/x-msvideo')
  const getLocalMediaUrl = (name: string) => `${baseUrl}/media/${encodeURIComponent(name)}`
  const getAzureMediaUrl = (name: string) => `${baseUrl}/azure/media/${encodeURIComponent(name)}`

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
        getLocalMediaUrl(filename),
        fileUri
      )

      if (downloadResult.status !== 200) {
        throw new Error('Download failed')
      }

      const asset = await MediaLibrary.createAssetAsync(downloadResult.uri)
      Alert.alert('Success', `Saved to Photos: ${filename}`)
    } catch (error) {
      Alert.alert('Save Failed', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  const shareMedia = async (filename: string) => {
    try {
      const fileUri = `${FileSystem.cacheDirectory!}${filename}`
      const downloadResult = await FileSystem.downloadAsync(
        getLocalMediaUrl(filename),
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

  const saveAzureMedia = async (blobName: string) => {
    try {
      if (!canSaveToPhotos(blobName)) {
        const message = isRawVideoFile(blobName)
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

      const fileUri = `${FileSystem.documentDirectory!}${blobName}`
      const downloadResult = await FileSystem.downloadAsync(
        getAzureMediaUrl(blobName),
        fileUri
      )

      if (downloadResult.status !== 200) {
        throw new Error('Download failed')
      }

      const asset = await MediaLibrary.createAssetAsync(downloadResult.uri)
      Alert.alert('Success', `Saved to Photos: ${blobName}`)
    } catch (error) {
      Alert.alert('Save Failed', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  const shareAzureMedia = async (blobName: string) => {
    try {
      const fileUri = `${FileSystem.cacheDirectory!}${blobName}`
      const downloadResult = await FileSystem.downloadAsync(
        getAzureMediaUrl(blobName),
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
      const res = await fetch(`${baseUrl}/events`)
      const json = await res.json()
      if (Array.isArray(json)) {
        setEvents(json)
      }
    } catch (error) {
      setStatus('Failed to load events')
    }
  }, [baseUrl])

  const fetchAzure = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/azure/blobs`)
      const json = await res.json()
      if (Array.isArray(json)) {
        setAzureBlobs(json)
      } else if (json?.error) {
        setStatus(json.error)
      }
    } catch (error) {
      setStatus('Failed to load Azure photos')
    }
  }, [baseUrl])

  const fetchPanTiltStatus = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/pan_tilt`)
      const json = await res.json()
      if (typeof json?.pan === 'number') setPan(json.pan)
      if (typeof json?.tilt === 'number') setTilt(json.tilt)
      if (typeof json?.available === 'boolean') setServoAvailable(json.available)
      if (typeof json?.enabled === 'boolean') setServoEnabled(json.enabled)
      if (json?.error) setServoError(json.error)
    } catch (error) {
      setStatus('Failed to fetch servo status')
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
      // ignore errors
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
    }
  }, [baseUrl, motionThreshold, motionMinArea, notificationCooldown])

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

  const registerForPushNotifications = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    try {
      if (!Device.isDevice) {
        if (!silent) {
          Alert.alert('Push notifications only work on physical devices')
        }
        return
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
        return
      }

      log('Getting Expo push token')
      const projectId = Constants.expoConfig?.extra?.eas?.projectId
      if (!projectId) {
        log('Missing projectId in app config')
        if (!silent) {
          Alert.alert('Notification Error', 'Missing projectId. Add expo.extra.eas.projectId in app.json.')
        }
        return
      }
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId })
      const token = tokenData.data
      log('Got push token', token)
      setExpoPushToken(token)

      // Register token with Pi server
      try {
        log('Registering token with server')
        const response = await fetch(`${baseUrl}/notifications/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
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
        console.error('[SPICAM] Failed to register push token with server', error)
        if (!silent) {
          Alert.alert('Warning', 'Notifications enabled locally, but server registration failed. Motion alerts may not work.')
        }
      }
    } catch (error) {
      console.error('[SPICAM] Push notification registration error', error)
      if (!silent) {
        Alert.alert('Error', error instanceof Error ? error.message : 'Failed to enable notifications')
      }
    }
  }

  const disablePushNotifications = async () => {
    if (!expoPushToken) {
      return
    }
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
                  body: JSON.stringify({ token: expoPushToken })
                })

                if (!response.ok) {
                  throw new Error(`Server returned ${response.status}`)
                }

                const data = await response.json()
                log('Server unregister response', data)
                setExpoPushToken(null)
              } catch (error) {
                console.error('[SPICAM] Failed to unregister push token', error)
                Alert.alert('Disable Failed', 'Could not disable alerts. Try again.')
              }
            })()
          }
        }
      ]
    )
  }


  useEffect(() => {
    fetchEvents()
    fetchAzure()
    fetchPanTiltStatus()
    fetchNotifications()
    fetchMotionSettings()

    if (!hasAttemptedAutoRegister.current) {
      hasAttemptedAutoRegister.current = true
      registerForPushNotifications({ silent: true })
    }

    // Configure notification handlers
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

    // Listen for notifications when app is in foreground
    if (typeof Notifications.addNotificationReceivedListener === 'function') {
      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        const data = notification.request.content.data
        if (data?.type === 'motion_detected') {
          Alert.alert(
            'Motion Detected',
            'Motion detected by sPiCam. Start recording?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Record 30s', onPress: () => { void startRecording(30) } },
              { text: 'Record 60s', onPress: () => { void startRecording(60) } },
            ]
          )
        }
      })
    } else {
      log('Notifications.addNotificationReceivedListener unavailable')
    }

    // Listen for notification taps when app was in background
    if (typeof Notifications.addNotificationResponseReceivedListener === 'function') {
      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data
        if (data?.type === 'motion_detected') {
          Alert.alert(
            'Motion Detected',
            'Motion detected by sPiCam. Start recording?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Record 30s', onPress: () => { void startRecording(30) } },
              { text: 'Record 60s', onPress: () => { void startRecording(60) } },
            ]
          )
        }
      })
    } else {
      log('Notifications.addNotificationResponseReceivedListener unavailable')
    }

    return () => {
      if (notificationListener.current && typeof notificationListener.current.remove === 'function') {
        notificationListener.current.remove()
      }
      if (responseListener.current && typeof responseListener.current.remove === 'function') {
        responseListener.current.remove()
      }
    }
  }, [fetchEvents, fetchAzure, fetchPanTiltStatus, fetchNotifications, baseUrl, startRecording])

  const takePhoto = async () => {
    try {
      setStatus('Capturing...')
      const res = await fetch(`${baseUrl}/photo`, { method: 'POST' })
      const json = await res.json()
      setStatus(`Saved: ${json.filename ?? json.path}`)
      fetchEvents()
      fetchAzure()
    } catch (error) {
      setStatus('Failed to capture photo')
    }
  }

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))


  const updatePanTilt = async (deltaPan: number, deltaTilt: number) => {
    const nextPan = clamp(pan + deltaPan, 0, 180)
    const nextTilt = clamp(tilt + deltaTilt, 0, 180)
    try {
      setPan(nextPan)
      setTilt(nextTilt)
      const res = await fetch(`${baseUrl}/pan_tilt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan: nextPan, tilt: nextTilt }),
      })
      const json = await res.json()
      if (json?.error) {
        setStatus(json.error)
        setServoError(json.error)
      }
    } catch (error) {
      setStatus('Failed to move pan/tilt')
    }
  }

  const centerPanTilt = async () => {
    try {
      const res = await fetch(`${baseUrl}/pan_tilt/center`, { method: 'POST' })
      const json = await res.json()
      if (json?.error) {
        setStatus(json.error)
        return
      }
      if (typeof json.pan === 'number') setPan(json.pan)
      if (typeof json.tilt === 'number') setTilt(json.tilt)
    } catch (error) {
      setStatus('Failed to center pan/tilt')
    }
  }

  const renderEvent = ({ item }: { item: { filename: string; path: string; timestamp: number } }) => {
    const isVideo = isVideoFile(item.filename)
    const isRawVideo = isRawVideoFile(item.filename)
    return (
      <Pressable style={styles.eventItem} onPress={() => setSelectedMedia(item.filename)}>
        <View style={styles.eventRow}>
          <View style={styles.eventThumb}>
            {isPhotoFile(item.filename) ? (
              <Image source={{ uri: getLocalMediaUrl(item.filename) }} style={styles.eventThumbImage} />
            ) : (
              <Text style={styles.eventThumbLabel}>{isRawVideo ? 'RAW' : isVideo ? 'VIDEO' : 'FILE'}</Text>
            )}
          </View>
          <View style={styles.eventMeta}>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {item.filename}
            </Text>
            <Text style={styles.eventTime}>{new Date(item.timestamp * 1000).toLocaleString()}</Text>
            <View style={styles.eventPillRow}>
              <View style={styles.eventPill}>
                <Text style={styles.eventPillText}>{isRawVideo ? 'Raw' : isVideo ? 'Video' : 'Photo'}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.eventChevron}>›</Text>
        </View>
      </Pressable>
    )
  }

  const renderAzure = ({ item }: { item: { name: string; last_modified?: string | null } }) => {
    const isVideo = isVideoFile(item.name)
    const isRawVideo = isRawVideoFile(item.name)
    return (
      <Pressable style={styles.eventItem} onPress={() => setSelectedAzure(item.name)}>
        <View style={styles.eventRow}>
          <View style={styles.eventThumb}>
            {isPhotoFile(item.name) ? (
              <Image source={{ uri: getAzureMediaUrl(item.name) }} style={styles.eventThumbImage} />
            ) : (
              <Text style={styles.eventThumbLabel}>{isRawVideo ? 'RAW' : isVideo ? 'VIDEO' : 'FILE'}</Text>
            )}
          </View>
          <View style={styles.eventMeta}>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {item.name}
            </Text>
            {item.last_modified ? (
              <Text style={styles.eventTime}>{new Date(item.last_modified).toLocaleString()}</Text>
            ) : null}
            <View style={styles.eventPillRow}>
              <View style={styles.eventPill}>
                <Text style={styles.eventPillText}>{isRawVideo ? 'Raw' : isVideo ? 'Video' : 'Photo'}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.eventChevron}>›</Text>
        </View>
      </Pressable>
    )
  }

  if (selectedMedia) {
    const isVideo = isVideoFile(selectedMedia)
    const isRawVideo = isRawVideoFile(selectedMedia)
    const videoHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
          <style>
            body { margin: 0; padding: 0; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; }
            video { max-width: 100%; max-height: 100%; }
          </style>
        </head>
        <body>
          <video controls autoplay style="width: 100%;">
            <source src="${getLocalMediaUrl(selectedMedia)}" type="${getVideoMimeType(selectedMedia)}">
            Your browser does not support video playback.
          </video>
        </body>
      </html>
    `

    return (
      <SafeAreaView style={[styles.container, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }]}>
        <View style={styles.previewScreen}>
          <View style={styles.sectionHeader}>
            <Pressable onPress={() => setSelectedMedia(null)}>
              <Text style={styles.link}>Back</Text>
            </Pressable>
            <Text style={styles.sectionTitle}>{isVideo ? 'Video' : 'Preview'}</Text>
            <View style={{ width: 48 }} />
          </View>
          <View style={styles.previewContainer}>
            {isRawVideo ? (
              <Text style={styles.eventThumbLabel}>Raw .h264 not playable</Text>
            ) : isVideo ? (
              <WebView
                source={{ html: videoHtml }}
                style={{ flex: 1, backgroundColor: '#000' }}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
              />
            ) : (
              <Image 
                source={{ uri: getLocalMediaUrl(selectedMedia) }} 
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}
          </View>
          <View style={styles.mediaActions}>
            <Pressable style={styles.actionButton} onPress={() => saveToPhotos(selectedMedia)}>
              <Text style={styles.actionButtonText}>Save to Photos</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.actionButtonSecondary]} onPress={() => shareMedia(selectedMedia)}>
              <Text style={styles.actionButtonSecondaryText}>Share</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  if (selectedAzure) {
    const isVideo = isVideoFile(selectedAzure)
    const isRawVideo = isRawVideoFile(selectedAzure)
    const cloudVideoHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
          <style>
            body { margin: 0; padding: 0; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; }
            video { max-width: 100%; max-height: 100%; }
          </style>
        </head>
        <body>
          <video controls autoplay style="width: 100%;">
            <source src="${getAzureMediaUrl(selectedAzure)}" type="${getVideoMimeType(selectedAzure)}">
            Your browser does not support video playback.
          </video>
        </body>
      </html>
    `

    return (
      <SafeAreaView style={[styles.container, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }]}>
        <View style={styles.previewScreen}>
          <View style={styles.sectionHeader}>
            <Pressable onPress={() => setSelectedAzure(null)}>
              <Text style={styles.link}>Back</Text>
            </Pressable>
            <Text style={styles.sectionTitle}>Cloud Preview</Text>
            <View style={{ width: 48 }} />
          </View>
          <View style={styles.previewContainer}>
            {isRawVideo ? (
              <Text style={styles.eventThumbLabel}>Raw .h264 not playable</Text>
            ) : isVideo ? (
              <WebView
                source={{ html: cloudVideoHtml }}
                style={{ flex: 1, backgroundColor: '#000' }}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
              />
            ) : (
              <Image 
                source={{ uri: getAzureMediaUrl(selectedAzure) }} 
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}
          </View>
          <View style={styles.mediaActions}>
            <Pressable style={styles.actionButton} onPress={() => saveAzureMedia(selectedAzure)}>
              <Text style={styles.actionButtonText}>Save to Photos</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.actionButtonSecondary]} onPress={() => shareAzureMedia(selectedAzure)}>
              <Text style={styles.actionButtonSecondaryText}>Share</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  if (galleryMode) {
    const isRecents = galleryMode === 'recents'
    const filteredEvents = events.filter(item => {
      if (recentsFilter === 'all') return true
      if (recentsFilter === 'photos') return isPhotoFile(item.filename)
      return isVideoFile(item.filename)
    })
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.sectionHeader}>
          <Pressable onPress={() => setGalleryMode(null)}>
            <Text style={styles.link}>Back</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>
            {isRecents ? `Recent Events (${filteredEvents.length})` : `Cloud Photos (${azureBlobs.length})`}
          </Text>
          <View style={{ width: 48 }} />
        </View>

        {isRecents && (
          <View style={styles.filterRow}>
            {(['all', 'photos', 'videos'] as const).map(filter => (
              <Pressable
                key={filter}
                onPress={() => setRecentsFilter(filter)}
                style={recentsFilter === filter ? styles.filterChipActive : styles.filterChip}
              >
                <Text style={recentsFilter === filter ? styles.filterChipActiveText : styles.filterChipText}>
                  {filter === 'all' ? 'All' : filter === 'photos' ? 'Photos' : 'Videos'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {isRecents ? (
          <FlatList
            data={filteredEvents}
            keyExtractor={item => item.filename}
            renderItem={renderEvent}
            style={styles.eventsListFull}
            contentContainerStyle={styles.eventsContent}
            ListEmptyComponent={<Text style={styles.emptyText}>No items yet.</Text>}
          />
        ) : (
          <FlatList
            data={azureBlobs}
            keyExtractor={item => item.name}
            renderItem={renderAzure}
            style={styles.eventsListFull}
            contentContainerStyle={styles.eventsContent}
            ListEmptyComponent={<Text style={styles.emptyText}>No items yet.</Text>}
          />
        )}
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>sPiCam</Text>
        </View>

      <View style={styles.inputRow}>
        <Text style={styles.label}>Base URL</Text>
        <TextInput
          style={styles.input}
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <Text style={styles.status}>
        App state: {appState} · Motion {isAppActive ? 'disarmed' : 'armed'}
      </Text>

      <View style={styles.streamContainer}>
        {isAppActive && !isRecording ? (
          <WebView
            key={`stream-${streamKey}`}
            source={{ uri: `${baseUrl}/stream` }}
            style={{ flex: 1 }}
            onError={event => {
              const message = event.nativeEvent?.description ?? 'Stream error'
              log('Stream error', message)
              setStreamError(message)
            }}
            onHttpError={event => {
              const message = `HTTP ${event.nativeEvent.statusCode}`
              log('Stream HTTP error', message)
              setStreamError(message)
            }}
          />
        ) : (
          <View style={styles.streamOverlay}>
            <Text style={styles.streamOverlayTitle}>
              {isRecording ? 'Recording in progress' : 'Stream paused'}
            </Text>
            <Text style={styles.streamOverlayText}>
              {isRecording
                ? 'Live preview is paused while the camera saves the clip.'
                : 'Motion detection is active while the app is in the background.'}
            </Text>
          </View>
        )}
      </View>
      <Pressable style={styles.streamReload} onPress={reloadStream}>
        <Text style={styles.streamReloadText}>Reload stream</Text>
      </Pressable>
      {streamError ? <Text style={styles.streamError}>{streamError}</Text> : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Motion Settings</Text>
        <Pressable onPress={() => setMotionSettingsCollapsed(prev => !prev)}>
          <Text style={styles.link}>{motionSettingsCollapsed ? 'Show' : 'Hide'}</Text>
        </Pressable>
      </View>

      {!motionSettingsCollapsed && (
        <>
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Threshold (1-50):</Text>
            <TextInput
              style={styles.input}
              value={String(motionThreshold)}
              onChangeText={text => setMotionThreshold(Number(text) || 1)}
              keyboardType="numeric"
              placeholder="4"
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Min Area (5-1000):</Text>
            <TextInput
              style={styles.input}
              value={String(motionMinArea)}
              onChangeText={text => setMotionMinArea(Number(text) || 5)}
              keyboardType="numeric"
              placeholder="10"
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Cooldown (5-300s):</Text>
            <TextInput
              style={styles.input}
              value={String(notificationCooldown)}
              onChangeText={text => setNotificationCooldown(Number(text) || 5)}
              keyboardType="numeric"
              placeholder="60"
            />
          </View>

          <Pressable style={styles.updateButton} onPress={updateMotionSettings}>
            <Text style={styles.updateButtonText}>Update Settings</Text>
          </Pressable>
        </>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Pan / Tilt</Text>
        <Pressable onPress={() => setPanTiltCollapsed(prev => !prev)}>
          <Text style={styles.link}>{panTiltCollapsed ? 'Show' : 'Hide'}</Text>
        </Pressable>
      </View>

      {!panTiltCollapsed && (
        <>
          <Text style={styles.controlValue}>Pan {Math.round(pan)}° · Tilt {Math.round(tilt)}°</Text>
          <View style={styles.controlStatusRow}>
            <Text style={styles.controlStatusText}>
              {servoEnabled ? 'Servo enabled' : 'Servo disabled'} · {servoAvailable ? 'Available' : 'Unavailable'}
            </Text>
            {servoError ? <Text style={styles.controlStatusError}>{servoError}</Text> : null}
          </View>

          <View style={styles.stepRow}>
            <Text style={styles.controlValue}>Step</Text>
            {[5, 10, 20].map(step => (
              <Pressable
                key={step}
                style={step === panTiltStep ? styles.stepButtonActive : styles.stepButton}
                onPress={() => setPanTiltStep(step)}
              >
                <Text style={step === panTiltStep ? styles.stepButtonActiveText : styles.stepButtonText}>
                  {step}°
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.controlPad}>
            <Pressable style={styles.controlButton} onPress={() => updatePanTilt(0, -panTiltStep)}>
              <Text style={styles.controlButtonText}>↑</Text>
            </Pressable>
            <View style={styles.controlRow}>
              <Pressable style={styles.controlButton} onPress={() => updatePanTilt(panTiltStep, 0)}>
                <Text style={styles.controlButtonText}>←</Text>
              </Pressable>
              <Pressable style={styles.controlButtonAccent} onPress={centerPanTilt}>
                <Text style={styles.controlButtonAccentText}>Center</Text>
              </Pressable>
              <Pressable style={styles.controlButton} onPress={() => updatePanTilt(-panTiltStep, 0)}>
                <Text style={styles.controlButtonText}>→</Text>
              </Pressable>
            </View>
            <Pressable style={styles.controlButton} onPress={() => updatePanTilt(0, panTiltStep)}>
              <Text style={styles.controlButtonText}>↓</Text>
            </Pressable>
          </View>
        </>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Events</Text>
        <Pressable onPress={fetchEvents}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      <Pressable style={styles.eventNav} onPress={() => setGalleryMode('recents')}>
        <Text style={styles.eventNavText}>Open Recent Events ({events.length})</Text>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Cloud Photos</Text>
        <Pressable onPress={fetchAzure}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      <Pressable style={styles.eventNav} onPress={() => setGalleryMode('cloud')}>
        <Text style={styles.eventNavText}>Open Cloud Photos ({azureBlobs.length})</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={takePhoto}>
        <Text style={styles.buttonText}>Take Photo</Text>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Video Recording</Text>
        {expoPushToken ? (
          <Pressable onPress={disablePushNotifications}>
            <Text style={styles.link}>Disable Alerts</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => { void registerForPushNotifications() }}>
            <Text style={styles.link}>Enable Alerts</Text>
          </Pressable>
        )}
      </View>
      
      <View style={styles.recordingControls}>
        <View style={styles.durationRow}>
          <Text style={styles.controlValue}>Duration:</Text>
          {[10, 30, 60].map(duration => (
            <Pressable
              key={duration}
              style={duration === recordDuration ? styles.stepButtonActive : styles.stepButton}
              onPress={() => setRecordDuration(duration)}
              disabled={isRecording}
            >
              <Text style={duration === recordDuration ? styles.stepButtonActiveText : styles.stepButtonText}>
                {duration}s
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable 
          style={[styles.button, isRecording && styles.buttonDisabled]} 
          onPress={() => { void startRecording(recordDuration) }}
          disabled={isRecording}
        >
          <Text style={styles.buttonText}>
            {isRecording ? 'Recording...' : 'Start Recording'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <Pressable onPress={fetchNotifications}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      <View style={styles.notificationsContainer}>
        <Text style={styles.notificationsMeta}>
          {notificationsUpdatedAt
            ? `Last updated ${notificationsUpdatedAt.toLocaleString()}`
            : 'Not loaded yet'}
        </Text>
        {notifications.length > 0 ? (
          notifications.slice(0, 5).map(item => (
            <Text key={`${item.timestamp}-${item.message}`} style={styles.notificationText}>
              {new Date(item.timestamp).toLocaleString()} · {item.message}
            </Text>
          ))
        ) : (
          <Text style={styles.emptyText}>No notifications yet.</Text>
        )}
      </View>

      <Text style={styles.status}>{status}</Text>
      </ScrollView>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0b',
  },
  scrollContent: {
    padding: 16,
  },
  previewScreen: {
    flex: 1,
    backgroundColor: '#0b0b0b',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1b06b',
  },
  title: {
    color: '#f5f0e6',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  inputRow: {
    marginBottom: 12,
  },
  label: {
    color: '#bfae8a',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: '#141414',
    color: '#f5f0e6',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2b2b2b',
  },
  streamContainer: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2b2b2b',
  },
  streamOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  streamOverlayTitle: {
    color: '#f5f0e6',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  streamOverlayText: {
    color: '#bfae8a',
    textAlign: 'center',
  },
  streamReload: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2b2b2b',
    backgroundColor: '#141414',
    marginBottom: 12,
  },
  streamReloadText: {
    color: '#d1b06b',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  streamError: {
    color: '#d18b6b',
    fontSize: 12,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#f5f0e6',
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  link: {
    color: '#d1b06b',
    letterSpacing: 0.3,
  },
  eventsList: {
    maxHeight: 180,
    marginBottom: 12,
  },
  eventsListFull: {
    flex: 1,
  },
  eventsContent: {
    gap: 8,
  },
  eventItem: {
    backgroundColor: '#141414',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2b2b2b',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eventThumb: {
    width: 56,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: '#2b2b2b',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  eventThumbImage: {
    width: '100%',
    height: '100%',
  },
  eventThumbLabel: {
    color: '#d1b06b',
    fontSize: 11,
    fontWeight: '700',
  },
  eventMeta: {
    flex: 1,
  },
  eventTitle: {
    color: '#f5f0e6',
    fontSize: 12,
    marginBottom: 4,
  },
  eventChevron: {
    color: '#bfae8a',
    fontSize: 22,
    marginLeft: 8,
  },
  eventPillRow: {
    marginTop: 6,
  },
  eventPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#2a2216',
    borderWidth: 1,
    borderColor: '#3b2d1a',
  },
  eventPillText: {
    color: '#d1b06b',
    fontSize: 10,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2b2b2b',
    backgroundColor: '#141414',
  },
  filterChipActive: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1b06b',
    backgroundColor: '#d1b06b',
  },
  filterChipText: {
    color: '#f5f0e6',
    fontSize: 12,
  },
  filterChipActiveText: {
    color: '#1b1b1b',
    fontSize: 12,
    fontWeight: '700',
  },
  eventNav: {
    backgroundColor: '#141414',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2b2b2b',
    marginBottom: 12,
  },
  eventNavText: {
    color: '#f5f0e6',
    fontSize: 13,
  },
  eventText: {
    color: '#f5f0e6',
    fontSize: 12,
  },
  eventTime: {
    color: '#bfae8a',
    fontSize: 11,
    marginTop: 4,
  },
  mediaContainer: {
    height: 200,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2b2b2b',
  },
  previewContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2b2b2b',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  notificationsContainer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2b2b2b',
    backgroundColor: '#121212',
  },
  notificationsMeta: {
    color: '#9c8a63',
    fontSize: 11,
    marginBottom: 8,
  },
  notificationText: {
    color: '#bfae8a',
    fontSize: 12,
    marginBottom: 6,
  },
  emptyText: {
    color: '#bfae8a',
    textAlign: 'center',
    marginTop: 24,
  },
  button: {
    backgroundColor: '#d1b06b',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#1b1b1b',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  status: {
    color: '#bfae8a',
    marginTop: 12,
  },
  controlPad: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlButton: {
    backgroundColor: '#141414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2b2b2b',
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 52,
    alignItems: 'center',
  },
  controlButtonText: {
    color: '#f5f0e6',
    fontSize: 18,
    fontWeight: '600',
  },
  controlButtonAccent: {
    backgroundColor: '#d1b06b',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  controlButtonAccentText: {
    color: '#1b1b1b',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  controlValue: {
    color: '#bfae8a',
    fontSize: 12,
  },
  controlStatusRow: {
    gap: 4,
    marginBottom: 8,
  },
  controlStatusText: {
    color: '#f5f0e6',
    fontSize: 12,
  },
  controlStatusError: {
    color: '#d18b6b',
    fontSize: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  stepButton: {
    borderWidth: 1,
    borderColor: '#2b2b2b',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#141414',
  },
  stepButtonActive: {
    borderWidth: 1,
    borderColor: '#d1b06b',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#d1b06b',
  },
  stepButtonText: {
    color: '#f5f0e6',
    fontSize: 12,
  },
  stepButtonActiveText: {
    color: '#1b1b1b',
    fontSize: 12,
    fontWeight: '700',
  },
  mediaActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    gap: 12,
    backgroundColor: '#0d0d0d',
    borderTopWidth: 1,
    borderTopColor: '#2b2b2b',
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#d1b06b',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#d1b06b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    color: '#0d0d0d',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#d1b06b',
    shadowOpacity: 0,
    elevation: 0,
  },
  actionButtonSecondaryText: {
    color: '#d1b06b',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  recordingControls: {
    gap: 12,
    marginBottom: 16,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: '#5a5040',
    opacity: 0.6,
  },
  linkDisabled: {
    fontSize: 14,
    color: '#6a8a6a',
    fontWeight: '600',
  },
  inputLabel: {
    color: '#bfae8a',
    marginBottom: 6,
    letterSpacing: 0.4,
    fontSize: 14,
  },
  updateButton: {
    backgroundColor: '#d1b06b',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  updateButtonText: {
    color: '#0b0b0b',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
})
