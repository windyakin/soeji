import { ref, computed } from 'vue'

const STORAGE_KEY_PIN_HASH = 'soeji-pin-hash'
const STORAGE_KEY_PIN_ENABLED = 'soeji-pin-enabled'

// セッション状態（アプリがアクティブな間はロック解除状態を維持）
const isUnlocked = ref(false)

/**
 * PINコードのハッシュ化
 */
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function usePinProtection() {
  const isPinEnabled = computed(() => {
    return localStorage.getItem(STORAGE_KEY_PIN_ENABLED) === 'true'
  })

  const hasPinSet = computed(() => {
    return !!localStorage.getItem(STORAGE_KEY_PIN_HASH)
  })

  /**
   * PINを設定する
   */
  async function setPin(pin: string): Promise<void> {
    if (!pin || pin.length < 4) {
      throw new Error('PINは4桁以上で設定してください')
    }
    const hash = await hashPin(pin)
    localStorage.setItem(STORAGE_KEY_PIN_HASH, hash)
    localStorage.setItem(STORAGE_KEY_PIN_ENABLED, 'true')
    isUnlocked.value = true
  }

  /**
   * PINを検証する
   */
  async function verifyPin(pin: string): Promise<boolean> {
    const storedHash = localStorage.getItem(STORAGE_KEY_PIN_HASH)
    if (!storedHash) {
      return false
    }
    const hash = await hashPin(pin)
    return hash === storedHash
  }

  /**
   * PINでロック解除
   */
  async function unlock(pin: string): Promise<boolean> {
    const isValid = await verifyPin(pin)
    if (isValid) {
      isUnlocked.value = true
    }
    return isValid
  }

  /**
   * ロックする
   */
  function lock(): void {
    isUnlocked.value = false
  }

  /**
   * PIN保護を無効化
   */
  function disablePin(): void {
    localStorage.removeItem(STORAGE_KEY_PIN_HASH)
    localStorage.setItem(STORAGE_KEY_PIN_ENABLED, 'false')
    isUnlocked.value = true
  }

  /**
   * PINを変更
   */
  async function changePin(currentPin: string, newPin: string): Promise<void> {
    const isValid = await verifyPin(currentPin)
    if (!isValid) {
      throw new Error('現在のPINが正しくありません')
    }
    await setPin(newPin)
  }

  /**
   * アプリがバックグラウンドに行った時にロック
   */
  function setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && isPinEnabled.value) {
        lock()
      }
    })
  }

  /**
   * ロックが必要かチェック
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
