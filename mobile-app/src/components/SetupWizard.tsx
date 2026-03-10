import React, { useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { styles } from '../styles/appStyles'
import { Colors, Spacing } from '../styles/colors'

type Step = 'welcome' | 'power' | 'tailscale_install' | 'tailscale_join' | 'connect' | 'done'

const STEPS: Step[] = ['welcome', 'power', 'tailscale_install', 'tailscale_join', 'connect', 'done']

function formatUrl(raw: string): string {
  const trimmed = raw.replace(/^https?:\/\//, '').replace(/:8000$/, '')
  return `http://${trimmed}:8000`
}

type Props = {
  visible: boolean
  onComplete: (baseUrl: string) => void
  onSkip: () => void
}

export default function SetupWizard({ visible, onComplete, onSkip }: Readonly<Props>) {
  const [stepIndex, setStepIndex] = useState(0)
  const [piAddress, setPiAddress] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle')

  const step = STEPS[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = step === 'done'

  function next() {
    if (stepIndex < STEPS.length - 1) setStepIndex(i => i + 1)
  }

  function back() {
    if (stepIndex > 0) setStepIndex(i => i - 1)
    setTestStatus('idle')
  }

  async function tryConnect() {
    // First try mDNS on local WiFi
    const candidates: string[] = [
      piAddress.trim() ? formatUrl(piAddress.trim()) : '',
      'http://retrospicam.local:8000',
    ].filter(Boolean)

    setTestStatus('testing')
    for (const url of candidates) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 8000)
        const res = await fetch(`${url}/status`, { signal: controller.signal })
        clearTimeout(timeoutId)
        if (res.ok) {
          setPiAddress(url.replace('http://', '').replace(':8000', ''))
          setTestStatus('success')
          return
        }
      } catch {
        // try next
      }
    }
    setTestStatus('failed')
  }

  function handleDone() {
    const url = formatUrl(piAddress.trim() || 'retrospicam.local')
    onComplete(url)
  }

  function renderNextButton() {
    if (isLast) {
      return (
        <Pressable
          style={[styles.button, { flex: 0, paddingHorizontal: 32 }]}
          onPress={handleDone}
        >
          <Text style={styles.buttonText}>Go to App</Text>
        </Pressable>
      )
    }
    if (step === 'connect') {
      return (
        <Pressable
          style={[styles.button, { flex: 0, paddingHorizontal: 32 }, testStatus !== 'success' && styles.buttonDisabled]}
          onPress={next}
          disabled={testStatus !== 'success'}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
      )
    }
    return (
      <Pressable
        style={[styles.button, { flex: 0, paddingHorizontal: 32 }]}
        onPress={next}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    )
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.modalContainer}>
        {/* Progress dots */}
        <View style={wizardStyles.dots}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={[wizardStyles.dot, i === stepIndex && wizardStyles.dotActive]}
            />
          ))}
        </View>

        <ScrollView contentContainerStyle={wizardStyles.content}>
          {step === 'welcome' && <StepWelcome />}
          {step === 'power' && <StepPower />}
          {step === 'tailscale_install' && <StepInstallTailscale />}
          {step === 'tailscale_join' && <StepJoinTailscale />}
          {step === 'connect' && (
            <StepConnect
              piAddress={piAddress}
              onChangePiAddress={setPiAddress}
              testStatus={testStatus}
              onTest={tryConnect}
            />
          )}
          {step === 'done' && <StepDone />}
        </ScrollView>

        {/* Navigation */}
        <View style={wizardStyles.nav}>
          {isFirst ? (
            <Pressable onPress={onSkip}>
              <Text style={wizardStyles.skipText}>Skip</Text>
            </Pressable>
          ) : (
            <Pressable onPress={back} style={wizardStyles.backButton}>
              <Ionicons name="chevron-back" size={20} color={Colors.dimmed} />
              <Text style={wizardStyles.backText}>Back</Text>
            </Pressable>
          )}
          {renderNextButton()}
        </View>
      </SafeAreaView>
    </Modal>
  )
}

// ─── Step screens ────────────────────────────────────────────────────────────

function StepWelcome() {
  return (
    <View style={wizardStyles.stepContainer}>
      <Ionicons name="camera-outline" size={72} color={Colors.primary} style={wizardStyles.icon} />
      <Text style={wizardStyles.title}>Welcome to RetrosPiCam</Text>
      <Text style={wizardStyles.body}>
        This wizard will walk you through connecting your iPhone to your Raspberry Pi camera.
      </Text>
      <Text style={wizardStyles.body}>
        It takes about 5 minutes and you only need to do it once.
      </Text>
    </View>
  )
}

function StepPower() {
  return (
    <View style={wizardStyles.stepContainer}>
      <Ionicons name="power-outline" size={72} color={Colors.primary} style={wizardStyles.icon} />
      <Text style={wizardStyles.title}>Power on your Pi</Text>
      <Text style={wizardStyles.body}>
        Plug in your Raspberry Pi and wait about 30 seconds for it to finish starting up.
      </Text>
      <Text style={wizardStyles.body}>
        Make sure it's connected to the same WiFi network as your iPhone right now.
      </Text>
    </View>
  )
}

function StepInstallTailscale() {
  return (
    <View style={wizardStyles.stepContainer}>
      <Ionicons name="shield-checkmark-outline" size={72} color={Colors.primary} style={wizardStyles.icon} />
      <Text style={wizardStyles.title}>Install Tailscale</Text>
      <Text style={wizardStyles.body}>
        Tailscale creates a secure private network between your iPhone and your Pi — even when you're away from home.
      </Text>
      <Pressable
        style={[styles.button, wizardStyles.actionButton]}
        onPress={() => Linking.openURL('https://apps.apple.com/app/tailscale/id1470499037')}
      >
        <Ionicons name="download-outline" size={18} color={Colors.text} style={{ marginRight: 8 }} />
        <Text style={styles.buttonText}>Install Tailscale on this iPhone</Text>
      </Pressable>
      <Text style={wizardStyles.hint}>Already installed? Tap Continue.</Text>
    </View>
  )
}

function StepJoinTailscale() {
  return (
    <View style={wizardStyles.stepContainer}>
      <Ionicons name="link-outline" size={72} color={Colors.primary} style={wizardStyles.icon} />
      <Text style={wizardStyles.title}>Join the network</Text>
      <Text style={wizardStyles.body}>
        Open Tailscale and sign in with the same account that's set up on your Pi.
      </Text>
      <Text style={wizardStyles.body}>
        Once connected, you should see <Text style={wizardStyles.em}>retrospicam</Text> appear in the device list.
      </Text>
      <Pressable
        style={[styles.button, wizardStyles.actionButton]}
        onPress={() => Linking.openURL('tailscale://')}
      >
        <Ionicons name="open-outline" size={18} color={Colors.text} style={{ marginRight: 8 }} />
        <Text style={styles.buttonText}>Open Tailscale</Text>
      </Pressable>
      <Text style={wizardStyles.hint}>Come back here when you can see "retrospicam" in Tailscale.</Text>
    </View>
  )
}

type StepConnectProps = {
  piAddress: string
  onChangePiAddress: (v: string) => void
  testStatus: 'idle' | 'testing' | 'success' | 'failed'
  onTest: () => void
}

function StepConnect({ piAddress, onChangePiAddress, testStatus, onTest }: Readonly<StepConnectProps>) {
  return (
    <View style={wizardStyles.stepContainer}>
      <Ionicons name="wifi-outline" size={72} color={Colors.primary} style={wizardStyles.icon} />
      <Text style={wizardStyles.title}>Find your Pi</Text>
      <Text style={wizardStyles.body}>
        We'll try to find your Pi automatically. If that doesn't work, open the Tailscale app, tap "retrospicam", and copy the IP address shown (starts with 100.).
      </Text>

      <View style={[styles.inputRow, { marginTop: Spacing.md }]}>
        <Text style={styles.inputLabel}>Pi address (optional)</Text>
        <TextInput
          style={styles.input}
          value={piAddress}
          onChangeText={onChangePiAddress}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="100.x.x.x  or leave blank to auto-detect"
          placeholderTextColor={Colors.dimmed}
        />
      </View>

      <Pressable
        style={[styles.button, wizardStyles.actionButton, testStatus === 'testing' && styles.buttonDisabled]}
        onPress={onTest}
        disabled={testStatus === 'testing'}
      >
        {testStatus === 'testing' ? (
          <ActivityIndicator color={Colors.text} style={{ marginRight: 8 }} />
        ) : (
          <Ionicons name="search-outline" size={18} color={Colors.text} style={{ marginRight: 8 }} />
        )}
        <Text style={styles.buttonText}>
          {testStatus === 'testing' ? 'Searching…' : 'Find Pi'}
        </Text>
      </Pressable>

      {testStatus === 'success' && (
        <View style={wizardStyles.statusRow}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.raspberryGreen} />
          <Text style={[wizardStyles.statusText, { color: Colors.raspberryGreen }]}>
            Connected! Pi found.
          </Text>
        </View>
      )}
      {testStatus === 'failed' && (
        <View style={wizardStyles.statusRow}>
          <Ionicons name="alert-circle" size={20} color={Colors.raspberryRed} />
          <Text style={[wizardStyles.statusText, { color: Colors.raspberryRed }]}>
            Couldn't find the Pi. Check Tailscale is connected and try entering the IP manually.
          </Text>
        </View>
      )}
    </View>
  )
}

function StepDone() {
  return (
    <View style={wizardStyles.stepContainer}>
      <Ionicons name="checkmark-circle-outline" size={72} color={Colors.raspberryGreen} style={wizardStyles.icon} />
      <Text style={wizardStyles.title}>You're all set!</Text>
      <Text style={wizardStyles.body}>
        Your iPhone is connected to your Pi. You can view the live stream, capture photos, and get motion alerts.
      </Text>
      <Text style={wizardStyles.body}>
        Tap "Go to App" to start using RetrosPiCam.
      </Text>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const wizardStyles = {
  dots: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.borderColor,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 20,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    padding: Spacing.lg,
  },
  stepContainer: {
    alignItems: 'center' as const,
  },
  icon: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: Colors.text,
    textAlign: 'center' as const,
    marginBottom: Spacing.md,
  },
  body: {
    fontSize: 16,
    color: Colors.dimmed,
    textAlign: 'center' as const,
    lineHeight: 24,
    marginBottom: Spacing.md,
  },
  em: {
    color: Colors.secondary,
    fontWeight: '600' as const,
  },
  hint: {
    fontSize: 13,
    color: Colors.dimmed,
    textAlign: 'center' as const,
    marginTop: Spacing.sm,
    opacity: 0.7,
  },
  actionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: Spacing.md,
    flex: 0,
    paddingHorizontal: 24,
  },
  nav: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  backButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  backText: {
    color: Colors.dimmed,
    fontSize: 16,
  },
  skipText: {
    color: Colors.dimmed,
    fontSize: 16,
  },
  statusRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
    marginTop: Spacing.md,
  },
  statusText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
}
