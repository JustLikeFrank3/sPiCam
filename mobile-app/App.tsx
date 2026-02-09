import React, { useCallback, useEffect, useState } from 'react'
import { SafeAreaView, StyleSheet, Text, View, Pressable, TextInput, FlatList, Platform, Image, ScrollView, Alert } from 'react-native'
import Constants from 'expo-constants'
import { WebView } from 'react-native-webview'
import * as MediaLibrary from 'expo-media-library'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'

export default function App() {
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
  const [pan, setPan] = useState(90)
  const [tilt, setTilt] = useState(90)
  const [panTiltStep, setPanTiltStep] = useState(10)
  const [servoAvailable, setServoAvailable] = useState(false)
  const [servoEnabled, setServoEnabled] = useState(false)
  const [servoError, setServoError] = useState<string | null>(null)
  const [panTiltCollapsed, setPanTiltCollapsed] = useState(false)

  const saveToPhotos = async (filename: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access to save media.')
        return
      }

      const fileUri = `${FileSystem.documentDirectory!}${filename}`
      const downloadResult = await FileSystem.downloadAsync(
        `${baseUrl}/media/${filename}`,
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
        `${baseUrl}/media/${filename}`,
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
      }
    } catch (error) {
      // ignore notification errors
    }
  }, [baseUrl])

  useEffect(() => {
    fetchEvents()
    fetchAzure()
    fetchPanTiltStatus()
    fetchNotifications()
  }, [fetchEvents, fetchAzure, fetchPanTiltStatus, fetchNotifications, baseUrl])

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

  const isVideoFile = (name: string) => /(\\.avi|\\.mp4)$/i.test(name)
  const isPhotoFile = (name: string) => /(\.jpe?g|\.png)$/i.test(name)

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
    return (
      <Pressable style={styles.eventItem} onPress={() => setSelectedMedia(item.filename)}>
        <View style={styles.eventRow}>
          <View style={styles.eventThumb}>
            {isPhotoFile(item.filename) ? (
              <Image source={{ uri: `${baseUrl}/media/${item.filename}` }} style={styles.eventThumbImage} />
            ) : (
              <Text style={styles.eventThumbLabel}>{isVideo ? 'VIDEO' : 'FILE'}</Text>
            )}
          </View>
          <View style={styles.eventMeta}>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {item.filename}
            </Text>
            <Text style={styles.eventTime}>{new Date(item.timestamp * 1000).toLocaleString()}</Text>
            <View style={styles.eventPillRow}>
              <View style={styles.eventPill}>
                <Text style={styles.eventPillText}>{isVideo ? 'Video' : 'Photo'}</Text>
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
    return (
      <Pressable style={styles.eventItem} onPress={() => setSelectedAzure(item.name)}>
        <View style={styles.eventRow}>
          <View style={styles.eventThumb}>
            {isPhotoFile(item.name) ? (
              <Image source={{ uri: `${baseUrl}/azure/media/${item.name}` }} style={styles.eventThumbImage} />
            ) : (
              <Text style={styles.eventThumbLabel}>{isVideo ? 'VIDEO' : 'FILE'}</Text>
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
                <Text style={styles.eventPillText}>{isVideo ? 'Video' : 'Photo'}</Text>
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
            <source src="${baseUrl}/media/${selectedMedia}" type="video/x-msvideo">
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
            {isVideo ? (
              <WebView
                source={{ html: videoHtml }}
                style={{ flex: 1, backgroundColor: '#000' }}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
              />
            ) : (
              <Image 
                source={{ uri: `${baseUrl}/media/${selectedMedia}` }} 
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}
          </View>
          <View style={styles.mediaActions}>
            <Pressable style={styles.actionButton} onPress={() => saveToPhotos(selectedMedia)}>
              <Text style={styles.actionButtonText}>💾 Save to Photos</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => shareMedia(selectedMedia)}>
              <Text style={styles.actionButtonText}>📤 Share</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  if (selectedAzure) {
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
            <Image 
              source={{ uri: `${baseUrl}/azure/media/${selectedAzure}` }} 
              style={styles.previewImage}
              resizeMode="contain"
            />
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
    const items = isRecents ? filteredEvents : azureBlobs
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.sectionHeader}>
          <Pressable onPress={() => setGalleryMode(null)}>
            <Text style={styles.link}>Back</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>{isRecents ? `Recent Events (${items.length})` : `Cloud Photos (${items.length})`}</Text>
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

        <FlatList
          data={items}
          keyExtractor={item => (isRecents ? (item as any).filename : (item as any).name)}
          renderItem={isRecents ? renderEvent : renderAzure}
          style={styles.eventsListFull}
          contentContainerStyle={styles.eventsContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No items yet.</Text>}
        />
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

      <View style={styles.streamContainer}>
        <WebView source={{ uri: `${baseUrl}/stream` }} />
      </View>

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

      {notifications.length > 0 && (
        <View style={styles.notificationsContainer}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          {notifications.slice(0, 5).map(item => (
            <Text key={`${item.timestamp}-${item.message}`} style={styles.notificationText}>
              {new Date(item.timestamp).toLocaleString()} · {item.message}
            </Text>
          ))}
        </View>
      )}

      <Text style={styles.status}>{status}</Text>
      </ScrollView>
    </SafeAreaView>
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
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#1b1b1b',
    fontSize: 16,
    fontWeight: '600',
  },
})
