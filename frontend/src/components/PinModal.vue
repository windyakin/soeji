<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import Dialog from 'primevue/dialog'
import InputOtp from 'primevue/inputotp'
import Button from 'primevue/button'
import { usePinProtection } from '../composables/usePinProtection'

const PIN_LENGTH = 4

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'unlocked'): void
}>()

const { unlock } = usePinProtection()

const pin = ref('')
const error = ref('')
const loading = ref(false)
const maskHeight = ref('100%')

const dialogPt = computed(() => ({
  mask: { style: { height: maskHeight.value } }
}))

// Update mask height based on visual viewport (for keyboard)
function updateMaskHeight() {
  if (window.visualViewport) {
    const viewportHeight = window.visualViewport.height
    const heightDiff = window.innerHeight - viewportHeight

    // Adjust mask height when keyboard is visible
    if (heightDiff > 100) {
      maskHeight.value = `${viewportHeight}px`
    } else {
      maskHeight.value = '100%'
    }
  } else {
    maskHeight.value = '100%'
  }
}

onMounted(() => {
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateMaskHeight)
    window.visualViewport.addEventListener('scroll', updateMaskHeight)
  }
})

onUnmounted(() => {
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', updateMaskHeight)
    window.visualViewport.removeEventListener('scroll', updateMaskHeight)
  }
})

// Clear PIN input when modal is shown
watch(() => props.visible, (visible) => {
  if (visible) {
    pin.value = ''
    error.value = ''
    updateMaskHeight()
  }
})

// Auto-submit when PIN is complete
watch(pin, (newPin) => {
  if (newPin && newPin.length === PIN_LENGTH) {
    handleSubmit()
  }
})

async function handleSubmit() {
  if (!pin.value || pin.value.length < PIN_LENGTH) {
    error.value = 'Please enter your PIN'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const success = await unlock(pin.value)
    if (success) {
      emit('unlocked')
      emit('update:visible', false)
    } else {
      error.value = 'Incorrect PIN'
      pin.value = ''
    }
  } catch (err) {
    error.value = 'An error occurred'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :closable="false"
    :draggable="false"
    header="Enter PIN"
    :style="{ width: '400px' }"
    :breakpoints="{ '480px': '90vw' }"
    :pt="dialogPt"
    class="pin-modal"
  >
    <div class="pin-modal-content">
      <p class="pin-description">
        Enter your PIN to unlock the app
      </p>

      <div class="pin-input-container">
        <InputOtp
          v-model="pin"
          :length="PIN_LENGTH"
          :disabled="loading"
          integer-only
          :invalid="!!error"
        />

        <small v-if="error" class="pin-error">{{ error }}</small>
      </div>

      <div class="pin-actions">
        <Button
          label="Unlock"
          icon="pi pi-lock-open"
          :loading="loading"
          @click="handleSubmit"
        />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.pin-modal-content {
  padding: 1rem 0;
  text-align: center;
}

.pin-description {
  color: var(--p-text-muted-color);
  margin-bottom: 1.5rem;
}

.pin-input-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.pin-error {
  color: var(--p-red-500);
}

.pin-actions {
  display: flex;
  justify-content: center;
  margin-top: 1.5rem;
}
</style>
