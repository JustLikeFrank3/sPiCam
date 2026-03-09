import React from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'
import { styles } from '../styles/appStyles'
import { Colors } from '../styles/colors'

type Props = {
  appState: string
  isAppActive: boolean
  isRecording: boolean
  streamKey: number
  baseUrl: string
  onChangeBaseUrl: (url: string) => void
  onOpenSettings: () => void
  onOpenNotifications: () => void
  onStreamError: (message: string) => void
  onReloadStream: () => void
  streamError: string | null
  eventsCount: number
  onRefreshEvents: () => void
  onOpenRecents: () => void
  onTakePhoto: () => void
  expoPushToken: string | null
  onDisableAlerts: () => void
  onEnableAlerts: () => void
  recordDuration: number
  onSetRecordDuration: (duration: number) => void
  onStartRecording: () => void
}

export default function MainDashboard({
  appState,
  isAppActive,
  isRecording,
  streamKey,
  baseUrl,
  onChangeBaseUrl,
  onOpenSettings,
  onOpenNotifications,
  onStreamError,
  onReloadStream,
  streamError,
  eventsCount,
  onRefreshEvents,
  onOpenRecents,
  onTakePhoto,
  expoPushToken,
  onDisableAlerts,
  onEnableAlerts,
  recordDuration,
  onSetRecordDuration,
  onStartRecording,
}: Readonly<Props>) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Image source={require('../../assets/retrospicam_icons/icon_512.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>RetrosPiCam</Text>
        <Pressable style={styles.notificationsButton} onPress={onOpenNotifications} hitSlop={8}>
          <Ionicons name="notifications-outline" size={24} color={Colors.dimmed} />
        </Pressable>
        <Pressable style={styles.settingsButton} onPress={onOpenSettings} hitSlop={8}>
          <Ionicons name="settings-outline" size={24} color={Colors.dimmed} />
        </Pressable>
      </View>

      <Text style={styles.status}>App state: {appState} · Motion {isAppActive ? 'disarmed' : 'armed'}</Text>

      <View style={styles.streamContainer}>
        {isAppActive && !isRecording ? (
          <WebView
            key={`stream-${streamKey}`}
            source={{ uri: `${baseUrl}/stream` }}
            style={{ flex: 1 }}
            onError={event => {
              const message = event.nativeEvent?.description ?? 'Stream error'
              onStreamError(message)
            }}
            onHttpError={event => {
              const message = `HTTP ${event.nativeEvent.statusCode}`
              onStreamError(message)
            }}
          />
        ) : (
          <View style={styles.streamOverlay}>
            <Text style={styles.streamOverlayTitle}>{isRecording ? 'Recording in progress' : 'Stream paused'}</Text>
            <Text style={styles.streamOverlayText}>
              {isRecording
                ? 'Live preview is paused while the camera saves the clip.'
                : 'Motion detection is active while the app is in the background.'}
            </Text>
          </View>
        )}
      </View>
      <Pressable style={styles.streamReload} onPress={onReloadStream}>
        <Text style={styles.streamReloadText}>Reload stream</Text>
      </Pressable>
      {streamError ? <Text style={styles.streamError}>{streamError}</Text> : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Events</Text>
        <Pressable onPress={onRefreshEvents}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      <Pressable style={styles.eventNav} onPress={onOpenRecents}>
        <Text style={styles.eventNavText}>Open Recent Events ({eventsCount})</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={onTakePhoto}>
        <Text style={styles.buttonText}>Take Photo</Text>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Video Recording</Text>
        {expoPushToken ? (
          <Pressable onPress={onDisableAlerts}>
            <Text style={styles.link}>Disable Alerts</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onEnableAlerts}>
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
              onPress={() => onSetRecordDuration(duration)}
              disabled={isRecording}
            >
              <Text style={duration === recordDuration ? styles.stepButtonActiveText : styles.stepButtonText}>{duration}s</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={[styles.button, isRecording && styles.buttonDisabled]} onPress={onStartRecording} disabled={isRecording}>
          <Text style={styles.buttonText}>{isRecording ? 'Recording...' : 'Start Recording'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}
