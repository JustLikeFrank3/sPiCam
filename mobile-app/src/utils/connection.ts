import AsyncStorage from '@react-native-async-storage/async-storage'

type ConnectionStatus = 'checking' | 'connected' | 'failed'

type CheckConnectionParams = {
  baseUrl: string
  hasUserDismissedHelp: boolean
  setConnectionStatus: (status: ConnectionStatus) => void
  setShowConnectionHelp: (show: boolean) => void
}

type RetryConnectionParams = {
  baseUrl: string
  setIsRetrying: (retrying: boolean) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  setShowConnectionHelp: (show: boolean) => void
  setHasUserDismissedHelp: (dismissed: boolean) => void
}

const createTimeoutController = () => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 12000)
  return { controller, timeoutId }
}

const isAbortError = (error: unknown) => {
  return error instanceof Error && error.name === 'AbortError'
}

export const checkConnection = async ({
  baseUrl,
  hasUserDismissedHelp,
  setConnectionStatus,
  setShowConnectionHelp,
}: CheckConnectionParams) => {
  const { controller, timeoutId } = createTimeoutController()

  try {
    setConnectionStatus('checking')
    const res = await fetch(`${baseUrl}/status`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (res.ok) {
      setConnectionStatus('connected')
      setShowConnectionHelp(false)
      await AsyncStorage.removeItem('connectionHelpDismissed')
      return
    }

    setConnectionStatus('failed')
    if (!hasUserDismissedHelp) {
      setShowConnectionHelp(true)
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (!isAbortError(error)) {
      console.error('[RETROSPICAM] Connection check failed', error)
    }
    setConnectionStatus('failed')
    if (!hasUserDismissedHelp) {
      setShowConnectionHelp(true)
    }
  }
}

export const retryConnection = async ({
  baseUrl,
  setIsRetrying,
  setConnectionStatus,
  setShowConnectionHelp,
  setHasUserDismissedHelp,
}: RetryConnectionParams) => {
  setIsRetrying(true)
  const { controller, timeoutId } = createTimeoutController()

  try {
    const res = await fetch(`${baseUrl}/status`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (res.ok) {
      setConnectionStatus('connected')
      setShowConnectionHelp(false)
      await AsyncStorage.setItem('connectionHelpDismissed', 'true')
      setHasUserDismissedHelp(true)
    } else {
      setConnectionStatus('failed')
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (!isAbortError(error)) {
      console.error('[RETROSPICAM] Retry connection failed', error)
    }
    setConnectionStatus('failed')
  } finally {
    setIsRetrying(false)
  }
}
