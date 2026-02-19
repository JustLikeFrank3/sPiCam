import React from 'react'
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { styles } from '../styles/appStyles'

type NotificationItem = {
  message: string
  kind?: string
  timestamp: string
}

type Props = {
  appState: string
  isAppActive: boolean
  isRecording: boolean
  streamKey: number
  baseUrl: string
  onChangeBaseUrl: (url: string) => void
  onStreamError: (message: string) => void
  onReloadStream: () => void
  streamError: string | null
  motionSettingsCollapsed: boolean
  onToggleMotionSettings: () => void
  motionThreshold: number
  onChangeMotionThreshold: (value: number) => void
  motionMinArea: number
  onChangeMotionMinArea: (value: number) => void
  notificationCooldown: number
  onChangeNotificationCooldown: (value: number) => void
  onUpdateMotionSettings: () => void
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
  notifications: NotificationItem[]
  notificationsUpdatedAt: Date | null
  onRefreshNotifications: () => void
  status: string
}

export default function MainDashboard({
  appState,
  isAppActive,
  isRecording,
  streamKey,
  baseUrl,
  onChangeBaseUrl,
  onStreamError,
  onReloadStream,
  streamError,
  motionSettingsCollapsed,
  onToggleMotionSettings,
  motionThreshold,
  onChangeMotionThreshold,
  motionMinArea,
  onChangeMotionMinArea,
  notificationCooldown,
  onChangeNotificationCooldown,
  onUpdateMotionSettings,
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
  notifications,
  notificationsUpdatedAt,
  onRefreshNotifications,
  status,
}: Readonly<Props>) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Image source={require('../../assets/retrospicam_icons/icon_512.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>retrosPiCam</Text>
      </View>

      <View style={styles.inputRow}>
        <Text style={styles.label}>Base URL</Text>
        <TextInput
          style={styles.input}
          value={baseUrl}
          onChangeText={onChangeBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
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
        <Text style={styles.sectionTitle}>Motion Settings</Text>
        <Pressable onPress={onToggleMotionSettings}>
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
              onChangeText={text => onChangeMotionThreshold(Number(text) || 1)}
              keyboardType="numeric"
              placeholder="4"
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Min Area (5-1000):</Text>
            <TextInput
              style={styles.input}
              value={String(motionMinArea)}
              onChangeText={text => onChangeMotionMinArea(Number(text) || 5)}
              keyboardType="numeric"
              placeholder="10"
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Cooldown (5-300s):</Text>
            <TextInput
              style={styles.input}
              value={String(notificationCooldown)}
              onChangeText={text => onChangeNotificationCooldown(Number(text) || 5)}
              keyboardType="numeric"
              placeholder="60"
            />
          </View>

          <Pressable style={styles.updateButton} onPress={onUpdateMotionSettings}>
            <Text style={styles.updateButtonText}>Update Settings</Text>
          </Pressable>
        </>
      )}

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

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <Pressable onPress={onRefreshNotifications}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      <View style={styles.notificationsContainer}>
        <Text style={styles.notificationsMeta}>
          {notificationsUpdatedAt ? `Last updated ${notificationsUpdatedAt.toLocaleString()}` : 'Not loaded yet'}
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
  )
}
