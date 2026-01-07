import { ref, computed } from 'vue'

const STORAGE_KEY_FULLSCREEN_MODE = 'soeji-fullscreen-mode'

/**
 * Fullscreen modes:
 * - 'api': Use browser Fullscreen API (true fullscreen, hides browser UI)
 * - 'css': CSS-only fullscreen (fills viewport but browser UI remains visible)
 */
export type FullscreenMode = 'api' | 'css'

// Default: API fullscreen (current behavior)
const DEFAULT_FULLSCREEN_MODE: FullscreenMode = 'api'

// Reactive state (synced with localStorage)
const fullscreenMode = ref<FullscreenMode>(
  (localStorage.getItem(STORAGE_KEY_FULLSCREEN_MODE) as FullscreenMode) || DEFAULT_FULLSCREEN_MODE
)

export function useFullscreenSettings() {
  /**
   * Set fullscreen mode preference
   */
  function setFullscreenMode(mode: FullscreenMode): void {
    localStorage.setItem(STORAGE_KEY_FULLSCREEN_MODE, mode)
    fullscreenMode.value = mode
  }

  return {
    fullscreenMode: computed(() => fullscreenMode.value),
    setFullscreenMode,
  }
}
