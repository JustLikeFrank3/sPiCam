import React from 'react'
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { styles } from '../styles/appStyles'
import { Colors } from '../styles/colors'

type Props = {
  visible: boolean
  baseUrl: string
  onChangeBaseUrl: (url: string) => void
  motionThreshold: number
  onChangeMotionThreshold: (value: number) => void
  motionMinArea: number
  onChangeMotionMinArea: (value: number) => void
  notificationCooldown: number
  onChangeNotificationCooldown: (value: number) => void
  onUpdateMotionSettings: () => void
  onClose: () => void
}

export default function SettingsModal({
  visible,
  baseUrl,
  onChangeBaseUrl,
  motionThreshold,
  onChangeMotionThreshold,
  motionMinArea,
  onChangeMotionMinArea,
  notificationCooldown,
  onChangeNotificationCooldown,
  onUpdateMotionSettings,
  onClose,
}: Readonly<Props>) {
  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.modalContainer}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={[styles.sectionHeader, { marginBottom: 24 }]}>
            <Text style={styles.modalTitle}>Settings</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.link}>Done</Text>
            </Pressable>
          </View>

          <Text style={styles.modalSectionTitle}>Connection</Text>
          <Text style={styles.modalText}>
            The base URL of your Raspberry Pi server. Use a Tailscale IP for remote access.
          </Text>
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Base URL</Text>
            <TextInput
              style={styles.input}
              value={baseUrl}
              onChangeText={onChangeBaseUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://100.x.x.x:8000"
              placeholderTextColor={Colors.dimmed}
            />
          </View>

          <Text style={[styles.modalSectionTitle, { marginTop: 24 }]}>Motion Detection</Text>
          <Text style={styles.modalText}>
            Tune how sensitive motion detection is and how often alerts are sent.
          </Text>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Threshold (1–50)</Text>
            <TextInput
              style={styles.input}
              value={String(motionThreshold)}
              onChangeText={text => onChangeMotionThreshold(Number(text) || 1)}
              keyboardType="numeric"
              placeholder="4"
              placeholderTextColor={Colors.dimmed}
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Min Area (5–1000)</Text>
            <TextInput
              style={styles.input}
              value={String(motionMinArea)}
              onChangeText={text => onChangeMotionMinArea(Number(text) || 5)}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor={Colors.dimmed}
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Alert Cooldown (5–300s)</Text>
            <TextInput
              style={styles.input}
              value={String(notificationCooldown)}
              onChangeText={text => onChangeNotificationCooldown(Number(text) || 5)}
              keyboardType="numeric"
              placeholder="60"
              placeholderTextColor={Colors.dimmed}
            />
          </View>

          <Pressable style={styles.updateButton} onPress={onUpdateMotionSettings}>
            <Text style={styles.updateButtonText}>Save Motion Settings</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}
