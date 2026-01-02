<script setup lang="ts">
import { ref, watch } from 'vue'
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

// Clear PIN input when modal is shown
watch(() => props.visible, (visible) => {
  if (visible) {
    pin.value = ''
    error.value = ''
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
          mask
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
