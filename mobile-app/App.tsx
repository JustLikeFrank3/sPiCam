import React, { useCallback, useEffect, useState } from 'react'
import { SafeAreaView, StyleSheet, Text, View, Pressable, TextInput, FlatList, Platform, Image } from 'react-native'
import Constants from 'expo-constants'
import { WebView } from 'react-native-webview'

export default function App() {
  const logo = require('./assets/shutterguard-logo.png')
  const defaultBaseUrl = Constants.isDevice
    ? 'http://raspberrypi.local:8000'
    : Platform.OS === 'android'
      ? 'http://10.0.2.2:8000'
      : 'http://localhost:8000'
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl)
  const [status, setStatus] = useState('')
  const [events, setEvents] = useState<Array<{ filename: string; path: string; timestamp: number }>>([])
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null)
  const [azureBlobs, setAzureBlobs] = useState<Array<{ name: string; last_modified?: string | null }>>([])
  const [selectedAzure, setSelectedAzure] = useState<string | null>(null)
  const [pan, setPan] = useState(90)
  const [tilt, setTilt] = useState(90)
  const [panTiltStep, setPanTiltStep] = useState(10)
  const [servoAvailable, setServoAvailable] = useState(false)
  const [servoEnabled, setServoEnabled] = useState(false)
  const [servoError, setServoError] = useState<string | null>(null)

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

  useEffect(() => {
    fetchEvents()
    fetchAzure()
    fetchPanTiltStatus()
  }, [fetchEvents, fetchAzure, fetchPanTiltStatus, baseUrl])

  const takePhoto = async () => {
    try {
      setStatus('Capturing...')
      const res = await fetch(`${baseUrl}/photo`, { method: 'POST' })
      const json = await res.json()
      setStatus(`Saved: ${json.filename ?? json.path}`)
      fetchEvents()
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
    return (
      <Pressable style={styles.eventItem} onPress={() => setSelectedMedia(item.filename)}>
        <Text style={styles.eventText}>{item.filename}</Text>
        <Text style={styles.eventTime}>{new Date(item.timestamp * 1000).toLocaleString()}</Text>
      </Pressable>
    )
  }

  const renderAzure = ({ item }: { item: { name: string; last_modified?: string | null } }) => {
    return (
      <Pressable style={styles.eventItem} onPress={() => setSelectedAzure(item.name)}>
        <Text style={styles.eventText}>{item.name}</Text>
        {item.last_modified ? (
          <Text style={styles.eventTime}>{new Date(item.last_modified).toLocaleString()}</Text>
        ) : null}
      </Pressable>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
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
        <Text style={styles.controlValue}>Pan {Math.round(pan)}° · Tilt {Math.round(tilt)}°</Text>
      </View>

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
          <Pressable style={styles.controlButton} onPress={() => updatePanTilt(-panTiltStep, 0)}>
            <Text style={styles.controlButtonText}>←</Text>
          </Pressable>
          <Pressable style={styles.controlButtonAccent} onPress={centerPanTilt}>
            <Text style={styles.controlButtonAccentText}>Center</Text>
          </Pressable>
          <Pressable style={styles.controlButton} onPress={() => updatePanTilt(panTiltStep, 0)}>
            <Text style={styles.controlButtonText}>→</Text>
          </Pressable>
        </View>
        <Pressable style={styles.controlButton} onPress={() => updatePanTilt(0, panTiltStep)}>
          <Text style={styles.controlButtonText}>↓</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Events</Text>
        <Pressable onPress={fetchEvents}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>

      <FlatList
        data={events}
        keyExtractor={item => item.filename}
        renderItem={renderEvent}
        style={styles.eventsList}
        contentContainerStyle={styles.eventsContent}
      />

      {selectedMedia && (
        <View style={styles.mediaContainer}>
          <Text style={styles.sectionTitle}>Preview: {selectedMedia}</Text>
          <WebView source={{ uri: `${baseUrl}/media/${selectedMedia}` }} />
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Cloud Photos</Text>
        <Pressable onPress={fetchAzure}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>

      <FlatList
        data={azureBlobs}
        keyExtractor={item => item.name}
        renderItem={renderAzure}
        style={styles.eventsList}
        contentContainerStyle={styles.eventsContent}
      />

      {selectedAzure && (
        <View style={styles.mediaContainer}>
          <Text style={styles.sectionTitle}>Cloud Preview: {selectedAzure}</Text>
          <WebView source={{ uri: `${baseUrl}/azure/media/${selectedAzure}` }} />
        </View>
      )}

      <Pressable style={styles.button} onPress={takePhoto}>
        <Text style={styles.buttonText}>Take Photo</Text>
      </Pressable>

      <Text style={styles.status}>{status}</Text>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
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
    flex: 1,
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
})
