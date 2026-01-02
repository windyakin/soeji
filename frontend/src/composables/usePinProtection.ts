import { ref, computed } from 'vue'

const STORAGE_KEY_PIN_HASH = 'soeji-pin-hash'
const STORAGE_KEY_PIN_ENABLED = 'soeji-pin-enabled'

// Reactive state (synced with localStorage)
const pinEnabled = ref(localStorage.getItem(STORAGE_KEY_PIN_ENABLED) === 'true')
const pinHash = ref(localStorage.getItem(STORAGE_KEY_PIN_HASH) || '')
const isUnlocked = ref(false)

/**
 * Hash a PIN code using SHA-256
 */
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
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
   * Set up listener to lock app when it goes to background
   */
  function setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && isPinEnabled.value) {
        lock()
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
    setPin,
    verifyPin,
    unlock,
    lock,
    disablePin,
    changePin,
    setupVisibilityListener,
  }
}
