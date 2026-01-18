import { watch, onUnmounted, type Ref, type ComputedRef } from 'vue'

/**
 * Composable to close a modal/dialog when the browser back button is pressed.
 *
 * When the modal opens, it pushes a history entry with the given hash.
 * When the user presses back, the hash is removed and the onClose callback is called.
 * When the modal is closed programmatically, it calls history.back() to remove the hash.
 *
 * @param isOpen - Ref or computed that returns true when modal is open
 * @param hash - Hash to add to the URL when modal is open (e.g., 'pin-dialog')
 * @param onClose - Callback to close the modal
 */
export function useBackButtonClose(
  isOpen: Ref<boolean> | ComputedRef<boolean>,
  hash: string,
  onClose: () => void
) {
  const fullHash = `#${hash}`

  // Flag to prevent recursive updates
  let isClosingFromBack = false
  let isClosingFromCode = false

  // Handle popstate (back button)
  function handlePopState() {
    if (isOpen.value && window.location.hash !== fullHash) {
      isClosingFromBack = true
      onClose()
      isClosingFromBack = false
    }
  }

  // Watch visibility changes
  watch(isOpen, (visible) => {
    if (isClosingFromBack) return

    if (visible) {
      // Modal opened - add hash to history
      history.pushState({ modal: hash }, '', `${window.location.pathname}${window.location.search}${fullHash}`)
    } else if (window.location.hash === fullHash && !isClosingFromCode) {
      // Modal closed programmatically - go back to remove hash
      isClosingFromCode = true
      history.back()
      // Reset flag after a tick to allow popstate to be ignored
      setTimeout(() => {
        isClosingFromCode = false
      }, 0)
    }
  })

  // Listen for popstate events
  window.addEventListener('popstate', handlePopState)

  // Cleanup
  onUnmounted(() => {
    window.removeEventListener('popstate', handlePopState)

    // Clean up hash if modal was open when unmounting
    if (isOpen.value && window.location.hash === fullHash) {
      history.back()
    }
  })
}
