import React from 'react'
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { styles } from '../styles/appStyles'
import { Colors } from '../styles/colors'

type Props = {
  visible: boolean
  baseUrl: string
  onChangeBaseUrl: (url: string) => void
  onClose: () => void
}

export default function SettingsModal({ visible, baseUrl, onChangeBaseUrl, onClose }: Readonly<Props>) {
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
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}
