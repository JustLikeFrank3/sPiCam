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

function getStatusLabel(isRecording: boolean, isAppActive: boolean): string {
  if (isRecording) return 'Recording'
  if (isAppActive) return 'Live'
  return 'Paused'
}

type StreamViewProps = {
  isAppActive: boolean
  isRecording: boolean
  streamKey: number
  baseUrl: string
  onStreamError: (message: string) => void
}

function StreamView({ isAppActive, isRecording, streamKey, baseUrl, onStreamError }: Readonly<StreamViewProps>) {
  if (isAppActive && !isRecording) {
    return (
      <>
        <WebView
          key={`stream-${streamKey}`}
          source={{ uri: `${baseUrl}/stream` }}
          style={{ flex: 1 }}
          onError={event => onStreamError(event.nativeEvent?.description ?? 'Stream error')}
          onHttpError={event => onStreamError(`HTTP ${event.nativeEvent.statusCode}`)}
        />
        <View style={styles.streamCornerTL} />
        <View style={styles.streamCornerTR} />
        <View style={styles.streamCornerBL} />
        <View style={styles.streamCornerBR} />
        <View style={styles.streamLiveBadge}>
          <View style={styles.streamLiveDot} />
          <Text style={styles.streamLiveText}>LIVE</Text>
        </View>
      </>
    )
  }
  return (
    <View style={styles.streamOverlay}>
      <Ionicons
        name={isRecording ? 'radio-button-on' : 'pause-circle-outline'}
        size={36}
        color={isRecording ? Colors.error : Colors.dimmed}
      />
      <Text style={styles.streamOverlayTitle}>{isRecording ? 'Recording in progress' : 'Stream paused'}</Text>
      <Text style={styles.streamOverlayText}>
        {isRecording
          ? 'Live preview is paused while the camera saves the clip.'
          : 'Motion detection is active while the app is in the background.'}
      </Text>
    </View>
  )
}

type RecordingControlsProps = {
  isRecording: boolean
  recordDuration: number
  expoPushToken: string | null
  onSetRecordDuration: (d: number) => void
  onStartRecording: () => void
  onDisableAlerts: () => void
  onEnableAlerts: () => void
}

function RecordingControls({
  isRecording,
  recordDuration,
  expoPushToken,
  onSetRecordDuration,
  onStartRecording,
  onDisableAlerts,
  onEnableAlerts,
}: Readonly<RecordingControlsProps>) {
  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Video Recording</Text>
        {expoPushToken ? (
          <Pressable onPress={onDisableAlerts}><Text style={styles.link}>Disable Alerts</Text></Pressable>
        ) : (
          <Pressable onPress={onEnableAlerts}><Text style={styles.link}>Enable Alerts</Text></Pressable>
        )}
      </View>
      <View style={styles.recordingControls}>
        <Text style={styles.durationLabel}>Duration</Text>
        <View style={styles.durationRow}>
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
        <Pressable
          style={[styles.button, isRecording && styles.buttonDisabled]}
          onPress={onStartRecording}
          disabled={isRecording}
        >
          <Text style={[styles.buttonText, isRecording && styles.buttonTextDisabled]}>
            {isRecording ? 'Recording...' : 'Start Recording'}
          </Text>
        </Pressable>
      </View>
    </>
  )
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
  const statusLabel = getStatusLabel(isRecording, isAppActive)
  const isLive = !isRecording && isAppActive

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={require('../../assets/retrospicam_icons/icon_512.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>
          <Text style={{ color: Colors.primary }}>Retro</Text>
          <Text style={{ color: Colors.secondary }}>sPiCam</Text>
        </Text>
        <Pressable style={styles.notificationsButton} onPress={onOpenNotifications} hitSlop={8}>
          <Ionicons name="notifications-outline" size={22} color={Colors.dimmed} />
        </Pressable>
        <Pressable style={styles.settingsButton} onPress={onOpenSettings} hitSlop={8}>
          <Ionicons name="settings-outline" size={22} color={Colors.dimmed} />
        </Pressable>
      </View>

      {/* Status chips */}
      <View style={styles.statusBar}>
        <View style={[styles.statusChip, isLive && styles.statusChipActive]}>
          <View style={[styles.statusDot, isLive && styles.statusDotActive]} />
          <Text style={[styles.statusChipText, isLive && styles.statusChipTextActive]}>{statusLabel}</Text>
        </View>
        <View style={[styles.statusChip, !isAppActive && styles.statusChipActive]}>
          <Ionicons
            name={isAppActive ? 'shield-outline' : 'shield-checkmark-outline'}
            size={12}
            color={isAppActive ? Colors.textDimmed : Colors.success}
          />
          <Text style={[styles.statusChipText, !isAppActive && styles.statusChipTextActive]}>
            Motion {isAppActive ? 'off' : 'armed'}
          </Text>
        </View>
      </View>

      {/* Stream */}
      <View style={styles.streamContainer}>
        <StreamView
          isAppActive={isAppActive}
          isRecording={isRecording}
          streamKey={streamKey}
          baseUrl={baseUrl}
          onStreamError={onStreamError}
        />
      </View>

      {/* Stream footer */}
      <View style={styles.streamFooter}>
        <Pressable style={styles.streamReload} onPress={onReloadStream}>
          <Ionicons name="refresh-outline" size={14} color={Colors.primary} />
          <Text style={styles.streamReloadText}>Reload</Text>
        </Pressable>
        {streamError ? <Text style={styles.streamError}>{streamError}</Text> : null}
      </View>

      {/* Recent Events */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Events</Text>
        <Pressable onPress={onRefreshEvents}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      <Pressable style={styles.eventNav} onPress={onOpenRecents}>
        <Text style={styles.eventNavText}>View Recent Events ({eventsCount})</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.dimmed} />
      </Pressable>

      {/* Camera */}
      <Pressable style={styles.button} onPress={onTakePhoto}>
        <Text style={styles.buttonText}>Take Photo</Text>
      </Pressable>

      {/* Recording */}
      <RecordingControls
        isRecording={isRecording}
        recordDuration={recordDuration}
        expoPushToken={expoPushToken}
        onSetRecordDuration={onSetRecordDuration}
        onStartRecording={onStartRecording}
        onDisableAlerts={onDisableAlerts}
        onEnableAlerts={onEnableAlerts}
      />
    </ScrollView>
  )
}
