import React from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { styles } from '../styles/appStyles'

type ConnectionStatus = 'checking' | 'connected' | 'failed'

type Props = {
  visible: boolean
  connectionStatus: ConnectionStatus
  isRetrying: boolean
  customIp: string
  onChangeCustomIp: (value: string) => void
  onUseCustomIp: () => void
  onRetryConnection: () => void
  onDismiss: () => void
  onOpenTailscale: () => void
}

export default function ConnectionSetupModal({
  visible,
  connectionStatus,
  isRetrying,
  customIp,
  onChangeCustomIp,
  onUseCustomIp,
  onRetryConnection,
  onDismiss,
  onOpenTailscale,
}: Readonly<Props>) {
  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>Connection Setup Required</Text>

            <Text style={styles.modalText}>
              sPiCam couldn't reach your Raspberry Pi. To use this app remotely, you need to set up Tailscale VPN.
            </Text>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Why Tailscale?</Text>
              <Text style={styles.modalText}>
                Tailscale creates a secure private network so you can access your Pi from anywhere (home WiFi, cellular, anywhere).
              </Text>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Setup Steps:</Text>
              <Text style={styles.modalText}>
                1. Install Tailscale on your Raspberry Pi{'\n'}
                2. Install Tailscale app on your iPhone{'\n'}
                3. Sign in to same account on both devices{'\n'}
                4. Connect to Tailscale network
              </Text>
            </View>

            <Pressable style={styles.modalButton} onPress={onOpenTailscale}>
              <Text style={styles.modalButtonText}>Download Tailscale</Text>
            </Pressable>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Or Enter Custom IP:</Text>
              <TextInput
                style={styles.input}
                value={customIp}
                onChangeText={onChangeCustomIp}
                placeholder="192.168.1.100:8000"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable style={styles.modalButton} onPress={onUseCustomIp}>
                <Text style={styles.modalButtonText}>Use This IP</Text>
              </Pressable>
            </View>

            {connectionStatus === 'checking' && (
              <Text style={[styles.modalText, { textAlign: 'center', color: '#d1b06b' }]}>Checking connection...</Text>
            )}
            {connectionStatus === 'failed' && !isRetrying && (
              <Text style={[styles.modalText, { textAlign: 'center', color: '#ff6b6b' }]}>Connection failed. Try again or enter custom IP.</Text>
            )}
            {connectionStatus === 'connected' && (
              <Text style={[styles.modalText, { textAlign: 'center', color: '#51cf66' }]}>✓ Connected!</Text>
            )}

            <Pressable style={[styles.modalButtonSecondary, isRetrying && { opacity: 0.5 }]} onPress={onRetryConnection} disabled={isRetrying}>
              {isRetrying ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator color="#d1b06b" size="small" />
                  <Text style={[styles.modalButtonSecondaryText, { marginLeft: 8 }]}>Connecting...</Text>
                </View>
              ) : (
                <Text style={styles.modalButtonSecondaryText}>Retry Connection</Text>
              )}
            </Pressable>

            <Pressable style={styles.modalButtonSecondary} onPress={onDismiss}>
              <Text style={styles.modalButtonSecondaryText}>Dismiss (Don't Show Again)</Text>
            </Pressable>
          </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}
