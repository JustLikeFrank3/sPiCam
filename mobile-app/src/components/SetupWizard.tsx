import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
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

// Pi AP address while in setup mode
const AP_BASE = 'http://192.168.4.1:8000'
// mDNS address after Pi joins home network
const MDNS_BASE = 'http://retrospicam.local:8000'
// How long to poll for Pi after reboot (ms)
const REBOOT_TIMEOUT_MS = 3 * 60 * 1000

type NewStep =
  | 'welcome'
  | 'connect_to_ap'
  | 'scanning'
  | 'pick_network'
  | 'enter_password'
  | 'configuring'
  | 'reconnect_home'
  | 'waiting_for_pi'
  | 'done'

type Network = { ssid: string; signal: number }

type Props = {
  visible: boolean
  onComplete: (baseUrl: string) => void
  onSkip: () => void
}

export default function SetupWizard({ visible, onComplete, onSkip }: Readonly<Props>) {
  const [step, setStep] = useState<NewStep>('welcome')
  const [networks, setNetworks] = useState<Network[]>([])
  const [selectedSsid, setSelectedSsid] = useState('')
  const [password, setPassword] = useState('')
  const [scanError, setScanError] = useState('')
  const [configError, setConfigError] = useState('')
  const [waitError, setWaitError] = useState('')
  const [connectedUrl, setConnectedUrl] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-run on step transitions
  useEffect(() => {
    if (step === 'scanning') void runScan()
    if (step === 'waiting_for_pi') void pollForPi()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function runScan() {
    setScanError('')
    try {
      const controller = new AbortController()
      const tid = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(`${AP_BASE}/setup/networks`, { signal: controller.signal })
      clearTimeout(tid)
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = (await res.json()) as { networks: Network[] }
      setNetworks(data.networks)
      setStep('pick_network')
    } catch {
      setScanError(
        "Couldn't reach the Pi at 192.168.4.1. Make sure your phone is connected to the 'RetrosPiCam-Setup' WiFi network."
      )
    }
  }

  async function submitWifi() {
    setConfigError('')
    setStep('configuring')
    try {
      const controller = new AbortController()
      const tid = setTimeout(() => controller.abort(), 12000)
      const res = await fetch(`${AP_BASE}/setup/wifi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid: selectedSsid, password }),
        signal: controller.signal,
      })
      clearTimeout(tid)
      if (!res.ok) throw new Error(`status ${res.status}`)
      setStep('reconnect_home')
    } catch {
      setConfigError("Couldn't send credentials to the Pi. Try again.")
      setStep('enter_password')
    }
  }

  async function pollForPi() {
    setWaitError('')
    const deadline = Date.now() + REBOOT_TIMEOUT_MS
    const candidates = [MDNS_BASE, connectedUrl].filter(Boolean)

    const check = async () => {
      if (Date.now() > deadline) {
        if (pollRef.current) clearInterval(pollRef.current)
        setWaitError(
          "Pi didn't come online within 3 minutes. Try entering its local IP address manually."
        )
        return
      }
      for (const url of candidates) {
        try {
          const controller = new AbortController()
          const tid = setTimeout(() => controller.abort(), 5000)
          const res = await fetch(`${url}/status`, { signal: controller.signal })
          clearTimeout(tid)
          if (res.ok) {
            if (pollRef.current) clearInterval(pollRef.current)
            setConnectedUrl(url)
            setStep('done')
            return
          }
        } catch {
          // try next
        }
      }
    }

    pollRef.current = setInterval(check, 4000)
    void check()
  }

  function reset() {
    setStep('welcome')
    setNetworks([])
    setSelectedSsid('')
    setPassword('')
    setScanError('')
    setConfigError('')
    setWaitError('')
    setConnectedUrl('')
    if (pollRef.current) clearInterval(pollRef.current)
  }

  function handleSkip() { reset(); onSkip() }
  function handleDone() { const url = connectedUrl || MDNS_BASE; reset(); onComplete(url) }

  function goBack() {
    if (step === 'connect_to_ap') setStep('welcome')
    else if (step === 'pick_network') setStep('connect_to_ap')
    else if (step === 'enter_password') { setStep('pick_network'); setPassword('') }
  }

  const VISIBLE_STEPS: NewStep[] = [
    'welcome', 'connect_to_ap', 'pick_network', 'enter_password', 'reconnect_home', 'done',
  ]
  const canGoBack = step === 'connect_to_ap' || step === 'pick_network' || step === 'enter_password'
  const showNav = step !== 'welcome' && step !== 'scanning' && step !== 'configuring' && step !== 'waiting_for_pi'

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleSkip}>
      <SafeAreaView style={styles.modalContainer}>
        {/* Progress dots */}
        {VISIBLE_STEPS.includes(step) && (
          <View style={wiz.dots}>
            {VISIBLE_STEPS.map((s) => (
              <View key={s} style={[wiz.dot, s === step && wiz.dotActive]} />
            ))}
          </View>
        )}

        <ScrollView contentContainerStyle={wiz.content} keyboardShouldPersistTaps="handled">
          {step === 'welcome' && (
            <StepWelcome onStartNew={() => setStep('connect_to_ap')} onSkip={handleSkip} />
          )}
          {step === 'connect_to_ap' && <StepConnectToAP />}
          {step === 'scanning' && (
            <StepScanning error={scanError} onRetry={() => { setScanError(''); setStep('scanning') }} />
          )}
          {step === 'pick_network' && (
            <StepPickNetwork
              networks={networks}
              onSelect={(ssid) => { setSelectedSsid(ssid); setStep('enter_password') }}
            />
          )}
          {step === 'enter_password' && (
            <StepEnterPassword
              ssid={selectedSsid}
              password={password}
              onChangePassword={setPassword}
              error={configError}
              onSubmit={submitWifi}
            />
          )}
          {step === 'configuring' && <StepConfiguring />}
          {step === 'reconnect_home' && (
            <StepReconnectHome ssid={selectedSsid} />
          )}
          {step === 'waiting_for_pi' && (
            <StepWaitingForPi
              ssid={selectedSsid}
              error={waitError}
              onManualUrl={(url) => { setConnectedUrl(url); setStep('done') }}
            />
          )}
          {step === 'done' && <StepDone url={connectedUrl || MDNS_BASE} />}
        </ScrollView>

        {/* Nav bar */}
        {showNav && (
          <View style={wiz.nav}>
            {canGoBack ? (
              <Pressable onPress={goBack} style={wiz.backButton}>
                <Ionicons name="chevron-back" size={20} color={Colors.dimmed} />
                <Text style={wiz.backText}>Back</Text>
              </Pressable>
            ) : (
              <View />
            )}
            {step === 'connect_to_ap' && (
              <Pressable style={wiz.primaryButton} onPress={() => setStep('scanning')}>
                <Text style={wiz.primaryButtonText}>I'm Connected</Text>
              </Pressable>
            )}
            {step === 'reconnect_home' && (
              <Pressable style={wiz.primaryButton} onPress={() => setStep('waiting_for_pi')}>
                <Text style={wiz.primaryButtonText}>I'm Back on Home WiFi</Text>
              </Pressable>
            )}
            {step === 'done' && (
              <Pressable style={wiz.primaryButton} onPress={handleDone}>
                <Text style={wiz.primaryButtonText}>Go to App</Text>
              </Pressable>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  )
}

// ─── Step screens ────────────────────────────────────────────────────────────

function StepWelcome({ onStartNew, onSkip }: Readonly<{ onStartNew: () => void; onSkip: () => void }>) {
  return (
    <View style={wiz.stepContainer}>
      <Ionicons name="camera-outline" size={72} color={Colors.primary} style={wiz.icon} />
      <Text style={wiz.title}>Set Up Your RetrosPiCam</Text>
      <Text style={wiz.body}>
        This wizard connects your iPhone to your Raspberry Pi camera.{'\n'}Takes about 5 minutes.
      </Text>
      <Pressable style={wiz.primaryButton} onPress={onStartNew}>
        <Text style={wiz.primaryButtonText}>Set Up New Device</Text>
      </Pressable>
      <Pressable style={{ marginTop: Spacing.md }} onPress={onSkip}>
        <Text style={wiz.linkText}>I already have it set up</Text>
      </Pressable>
    </View>
  )
}

function StepConnectToAP() {
  return (
    <View style={wiz.stepContainer}>
      <Ionicons name="wifi-outline" size={72} color={Colors.primary} style={wiz.icon} />
      <Text style={wiz.title}>Connect to Your Pi</Text>
      <Text style={wiz.body}>
        Your Pi is broadcasting a setup WiFi network. Open iPhone WiFi settings and connect to:
      </Text>
      <View style={wiz.codeBlock}>
        <Text style={wiz.code}>RetrosPiCam-Setup</Text>
        <Text style={wiz.codeLabel}>Password: retrospicam1234</Text>
      </View>
      <Pressable
        style={[wiz.secondaryButton, { marginTop: Spacing.lg }]}
        onPress={() => Linking.openURL('App-Prefs:root=WIFI')}
      >
        <Ionicons name="settings-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
        <Text style={wiz.secondaryButtonText}>Open WiFi Settings</Text>
      </Pressable>
      <Text style={wiz.hint}>Come back and tap "I'm Connected" once your phone is on that network.</Text>
    </View>
  )
}

function StepScanning({ error, onRetry }: Readonly<{ error: string; onRetry: () => void }>) {
  if (error) {
    return (
      <View style={wiz.stepContainer}>
        <Ionicons name="alert-circle-outline" size={72} color={Colors.raspberryRed} style={wiz.icon} />
        <Text style={wiz.title}>Couldn't Connect</Text>
        <Text style={wiz.body}>{error}</Text>
        <Pressable style={wiz.primaryButton} onPress={onRetry}>
          <Text style={wiz.primaryButtonText}>Try Again</Text>
        </Pressable>
      </View>
    )
  }
  return (
    <View style={wiz.stepContainer}>
      <ActivityIndicator size="large" color={Colors.primary} style={wiz.icon} />
      <Text style={wiz.title}>Connecting to Pi…</Text>
      <Text style={wiz.body}>Scanning for nearby WiFi networks. This takes a few seconds.</Text>
    </View>
  )
}

function StepPickNetwork({ networks, onSelect }: Readonly<{ networks: Network[]; onSelect: (ssid: string) => void }>) {
  return (
    <View style={wiz.stepContainer}>
      <Ionicons name="list-outline" size={72} color={Colors.primary} style={wiz.icon} />
      <Text style={wiz.title}>Choose Your Home WiFi</Text>
      <Text style={wiz.body}>Select the network you want your Pi to join.</Text>
      <FlatList
        data={networks}
        keyExtractor={(item) => item.ssid}
        scrollEnabled={false}
        style={{ width: '100%', marginTop: Spacing.md }}
        renderItem={({ item }) => (
          <Pressable style={wiz.networkRow} onPress={() => onSelect(item.ssid)}>
            <Ionicons name="wifi-outline" size={20} color={Colors.secondary} />
            <Text style={wiz.networkName}>{item.ssid}</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.dimmed} />
          </Pressable>
        )}
      />
    </View>
  )
}

function StepEnterPassword({
  ssid, password, onChangePassword, error, onSubmit,
}: Readonly<{
  ssid: string; password: string; onChangePassword: (v: string) => void; error: string; onSubmit: () => void
}>) {
  return (
    <View style={wiz.stepContainer}>
      <Ionicons name="lock-closed-outline" size={72} color={Colors.primary} style={wiz.icon} />
      <Text style={wiz.title}>Enter WiFi Password</Text>
      <Text style={wiz.body}>
        Password for <Text style={wiz.em}>{ssid}</Text>
      </Text>
      <View style={{ width: '100%' }}>
        <Text style={styles.inputLabel}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={onChangePassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="WiFi password"
          placeholderTextColor={Colors.dimmed}
          onSubmitEditing={onSubmit}
        />
      </View>
      {error ? <Text style={[wiz.hint, { color: Colors.raspberryRed }]}>{error}</Text> : null}
      <Pressable
        style={[wiz.primaryButton, !password && wiz.buttonDisabled]}
        onPress={onSubmit}
        disabled={!password}
      >
        <Text style={wiz.primaryButtonText}>Connect Pi to This Network</Text>
      </Pressable>
    </View>
  )
}

function StepConfiguring() {
  return (
    <View style={wiz.stepContainer}>
      <ActivityIndicator size="large" color={Colors.primary} style={wiz.icon} />
      <Text style={wiz.title}>Configuring…</Text>
      <Text style={wiz.body}>
        Sending WiFi credentials to your Pi. It will restart and join your home network.
      </Text>
    </View>
  )
}

function StepReconnectHome({ ssid }: Readonly<{ ssid: string }>) {
  return (
    <View style={wiz.stepContainer}>
      <Ionicons name="phone-portrait-outline" size={72} color={Colors.primary} style={wiz.icon} />
      <Text style={wiz.title}>Switch Back to Home WiFi</Text>
      <Text style={wiz.body}>
        Your Pi is restarting and joining <Text style={wiz.em}>{ssid || 'your home WiFi'}</Text>.
      </Text>
      <Text style={wiz.body}>Open iPhone WiFi settings and reconnect to your home network.</Text>
      <Pressable
        style={[wiz.secondaryButton, { marginTop: Spacing.md }]}
        onPress={() => Linking.openURL('App-Prefs:root=WIFI')}
      >
        <Ionicons name="settings-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
        <Text style={wiz.secondaryButtonText}>Open WiFi Settings</Text>
      </Pressable>
      <Text style={wiz.hint}>Tap "I'm Back on Home WiFi" when done.</Text>
    </View>
  )
}

function StepWaitingForPi({
  ssid, error, onManualUrl,
}: Readonly<{ ssid: string; error: string; onManualUrl: (url: string) => void }>) {
  const [manualIp, setManualIp] = useState('')

  if (error) {
    return (
      <View style={wiz.stepContainer}>
        <Ionicons name="time-outline" size={72} color={Colors.raspberryRed} style={wiz.icon} />
        <Text style={wiz.title}>Pi Not Found</Text>
        <Text style={wiz.body}>{error}</Text>
        <View style={{ width: '100%', marginTop: Spacing.md }}>
          <Text style={styles.inputLabel}>Pi IP address</Text>
          <TextInput
            style={styles.input}
            value={manualIp}
            onChangeText={setManualIp}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numeric"
            placeholder="e.g. 192.168.1.42"
            placeholderTextColor={Colors.dimmed}
          />
        </View>
        <Pressable
          style={[wiz.primaryButton, !manualIp && wiz.buttonDisabled]}
          onPress={() => onManualUrl(`http://${manualIp.trim()}:8000`)}
          disabled={!manualIp}
        >
          <Text style={wiz.primaryButtonText}>Connect Manually</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={wiz.stepContainer}>
      <ActivityIndicator size="large" color={Colors.primary} style={wiz.icon} />
      <Text style={wiz.title}>Waiting for Pi…</Text>
      <Text style={wiz.body}>
        Looking for your Pi on <Text style={wiz.em}>{ssid || 'your home network'}</Text>.{'\n'}
        This can take up to a minute while it restarts.
      </Text>
      <Text style={wiz.hint}>Don't close this screen.</Text>
    </View>
  )
}

function StepDone({ url }: Readonly<{ url: string }>) {
  const display = url.replace('http://', '').replace(':8000', '')
  return (
    <View style={wiz.stepContainer}>
      <Ionicons name="checkmark-circle-outline" size={72} color={Colors.raspberryGreen} style={wiz.icon} />
      <Text style={wiz.title}>You're All Set!</Text>
      <Text style={wiz.body}>
        Connected to your Pi at <Text style={wiz.em}>{display}</Text>.
      </Text>
      <Text style={wiz.body}>
        You can now view the live stream, capture photos, and receive motion alerts.
      </Text>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const wiz = {
  dots: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.borderColor },
  dotActive: { backgroundColor: Colors.primary, width: 20 },
  content: { flexGrow: 1, justifyContent: 'center' as const, padding: Spacing.lg },
  stepContainer: { alignItems: 'center' as const },
  icon: { marginBottom: Spacing.lg },
  title: {
    fontSize: 26, fontWeight: '700' as const, color: Colors.text,
    textAlign: 'center' as const, marginBottom: Spacing.md,
  },
  body: {
    fontSize: 16, color: Colors.dimmed, textAlign: 'center' as const,
    lineHeight: 24, marginBottom: Spacing.md,
  },
  em: { color: Colors.secondary, fontWeight: '600' as const },
  hint: { fontSize: 13, color: Colors.dimmed, textAlign: 'center' as const, marginTop: Spacing.sm, opacity: 0.7 },
  codeBlock: {
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10,
    padding: Spacing.md, alignItems: 'center' as const, alignSelf: 'stretch' as const,
  },
  code: { fontSize: 20, fontWeight: '700' as const, color: Colors.text, letterSpacing: 0.5 },
  codeLabel: { fontSize: 14, color: Colors.dimmed, marginTop: 4 },
  primaryButton: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 28,
    alignItems: 'center' as const, marginTop: Spacing.md, alignSelf: 'stretch' as const,
  },
  primaryButtonText: { color: Colors.text, fontSize: 16, fontWeight: '600' as const },
  secondaryButton: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 20,
  },
  secondaryButtonText: { color: Colors.primary, fontSize: 15, fontWeight: '500' as const },
  buttonDisabled: { opacity: 0.4 },
  linkText: { color: Colors.dimmed, fontSize: 15, textDecorationLine: 'underline' as const },
  nav: {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const,
    alignItems: 'center' as const, padding: Spacing.lg, paddingBottom: Spacing.xl,
  },
  backButton: { flexDirection: 'row' as const, alignItems: 'center' as const },
  backText: { color: Colors.dimmed, fontSize: 16 },
  networkRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.borderColor,
  },
  networkName: { flex: 1, color: Colors.text, fontSize: 16 },
}
