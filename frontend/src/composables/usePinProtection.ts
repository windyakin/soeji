import { ref, computed } from 'vue'

const STORAGE_KEY_PIN_HASH = 'soeji-pin-hash'
const STORAGE_KEY_PIN_ENABLED = 'soeji-pin-enabled'
const STORAGE_KEY_LOCK_LEVEL = 'soeji-pin-lock-level'
const STORAGE_KEY_LOCK_DELAY = 'soeji-pin-lock-delay'

/**
 * Lock levels:
 * - 'immediate': Lock immediately when app goes to background (current behavior)
 * - 'delayed': Lock after N minutes of inactivity
 * - 'reload': Lock only on page reload / app restart
 */
export type LockLevel = 'immediate' | 'delayed' | 'reload'

// Default values
const DEFAULT_LOCK_LEVEL: LockLevel = 'immediate'
const DEFAULT_LOCK_DELAY = 5 // minutes

// Reactive state (synced with localStorage)
const pinEnabled = ref(localStorage.getItem(STORAGE_KEY_PIN_ENABLED) === 'true')
const pinHash = ref(localStorage.getItem(STORAGE_KEY_PIN_HASH) || '')
const isUnlocked = ref(false)
const lockLevel = ref<LockLevel>(
  (localStorage.getItem(STORAGE_KEY_LOCK_LEVEL) as LockLevel) || DEFAULT_LOCK_LEVEL
)
const lockDelay = ref(
  parseInt(localStorage.getItem(STORAGE_KEY_LOCK_DELAY) || String(DEFAULT_LOCK_DELAY), 10)
)

// Track when the app became hidden for delayed lock
let hiddenTimestamp: number | null = null
let delayCheckTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Hash a PIN code using SHA-256
 * Falls back to simple hash if crypto.subtle is not available (non-HTTPS)
 */
async function hashPin(pin: string): Promise<string> {
  // crypto.subtle is only available in secure contexts (HTTPS or localhost)
  if (crypto.subtle) {
    const encoder = new TextEncoder()
    const data = encoder.encode(pin)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Fallback: simple hash for non-secure contexts (e.g., local network HTTP)
  // This is less secure but allows the feature to work
  let hash = 0
  const str = `soeji-pin-salt-${pin}`
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `fallback-${Math.abs(hash).toString(16).padStart(8, '0')}`
}

export function usePinProtection() {
  const isPinEnabled = computed(() => pinEnabled.value)
  const hasPinSet = computed(() => !!pinHash.value)

  /**
   * Set a new PIN
   */
  async function setPin(pin: string): Promise<void> {
    if (!pin || pin.length < 4) {
      throw new Error('PIN must be at least 4 digits')
    }
    const hash = await hashPin(pin)
    localStorage.setItem(STORAGE_KEY_PIN_HASH, hash)
    localStorage.setItem(STORAGE_KEY_PIN_ENABLED, 'true')
    pinHash.value = hash
    pinEnabled.value = true
    isUnlocked.value = true
  }

  /**
   * Verify a PIN
   */
  async function verifyPin(pin: string): Promise<boolean> {
    const storedHash = pinHash.value
    if (!storedHash) {
      return false
    }
    const hash = await hashPin(pin)
    return hash === storedHash
  }

  /**
   * Unlock with PIN
   */
  async function unlock(pin: string): Promise<boolean> {
    const isValid = await verifyPin(pin)
    if (isValid) {
      isUnlocked.value = true
    }
    return isValid
  }

  /**
   * Lock the app
   */
  function lock(): void {
    isUnlocked.value = false
  }

  /**
   * Disable PIN protection
   */
  function disablePin(): void {
    localStorage.removeItem(STORAGE_KEY_PIN_HASH)
    localStorage.setItem(STORAGE_KEY_PIN_ENABLED, 'false')
    pinHash.value = ''
    pinEnabled.value = false
    isUnlocked.value = true
  }

  /**
   * Change the PIN
   */
  async function changePin(currentPin: string, newPin: string): Promise<void> {
    const isValid = await verifyPin(currentPin)
    if (!isValid) {
      throw new Error('Incorrect current PIN')
    }
    await setPin(newPin)
  }

  /**
   * Set lock level
   */
  function setLockLevel(level: LockLevel): void {
    localStorage.setItem(STORAGE_KEY_LOCK_LEVEL, level)
    lockLevel.value = level
  }

  /**
   * Set lock delay (minutes)
   */
  function setLockDelay(minutes: number): void {
    const value = Math.max(1, Math.min(60, minutes))
    localStorage.setItem(STORAGE_KEY_LOCK_DELAY, String(value))
    lockDelay.value = value
  }

  /**
   * Set up listener to lock app based on lock level
   */
  function setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      if (!isPinEnabled.value) return

      if (document.hidden) {
        // App went to background
        if (lockLevel.value === 'immediate') {
          lock()
        } else if (lockLevel.value === 'delayed') {
          // Start tracking hidden time
          hiddenTimestamp = Date.now()
        }
        // 'reload' level: do nothing on visibility change
      } else {
        // App came back to foreground
        if (lockLevel.value === 'delayed' && hiddenTimestamp !== null) {
          const elapsedMinutes = (Date.now() - hiddenTimestamp) / 1000 / 60
          if (elapsedMinutes >= lockDelay.value) {
            lock()
          }
          hiddenTimestamp = null
        }
        // Clear any pending timer
        if (delayCheckTimer) {
          clearTimeout(delayCheckTimer)
          delayCheckTimer = null
        }
      }
    })
  }

  /**
   * Check if unlock is needed
   */
  const needsUnlock = computed(() => {
    return isPinEnabled.value && !isUnlocked.value
  })

  return {
    isPinEnabled,
    hasPinSet,
    isUnlocked: computed(() => isUnlocked.value),
    needsUnlock,
    lockLevel: computed(() => lockLevel.value),
    lockDelay: computed(() => lockDelay.value),
    setPin,
    verifyPin,
    unlock,
    lock,
    disablePin,
    changePin,
    setLockLevel,
    setLockDelay,
    setupVisibilityListener,
  }
}
