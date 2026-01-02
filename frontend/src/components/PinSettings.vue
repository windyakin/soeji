<script setup lang="ts">
import { ref } from 'vue'
import InputOtp from 'primevue/inputotp'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { usePinProtection } from '../composables/usePinProtection'
import SettingsCard from './SettingsCard.vue'

const PIN_LENGTH = 4

const toast = useToast()
const { isPinEnabled, hasPinSet, setPin, changePin, verifyPin, disablePin } = usePinProtection()

// UI state
type EditMode = 'none' | 'set' | 'change' | 'disable'
const editMode = ref<EditMode>('none')

// Form state
const currentPin = ref('')
const newPin = ref('')
const confirmPin = ref('')
const error = ref('')
const loading = ref(false)

function resetForm() {
  currentPin.value = ''
  newPin.value = ''
  confirmPin.value = ''
  error.value = ''
  loading.value = false
}

function startSetPin() {
  resetForm()
  editMode.value = 'set'
}

function startChangePin() {
  resetForm()
  editMode.value = 'change'
}

function startDisablePin() {
  resetForm()
  editMode.value = 'disable'
}

function cancelEdit() {
  resetForm()
  editMode.value = 'none'
}

async function handleSetPin() {
  error.value = ''

  if (!newPin.value || newPin.value.length < PIN_LENGTH) {
    error.value = `PIN must be ${PIN_LENGTH} digits`
    return
  }

  if (newPin.value !== confirmPin.value) {
    error.value = 'PINs do not match'
    return
  }

  loading.value = true

  try {
    await setPin(newPin.value)
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'PIN has been set',
      life: 3000
    })
    cancelEdit()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'An error occurred'
  } finally {
    loading.value = false
  }
}

async function handleChangePin() {
  error.value = ''

  if (!currentPin.value || currentPin.value.length < PIN_LENGTH) {
    error.value = 'Please enter your current PIN'
    return
  }

  if (!newPin.value || newPin.value.length < PIN_LENGTH) {
    error.value = `New PIN must be ${PIN_LENGTH} digits`
    return
  }

  if (newPin.value !== confirmPin.value) {
    error.value = 'New PINs do not match'
    return
  }

  loading.value = true

  try {
    await changePin(currentPin.value, newPin.value)
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'PIN has been changed',
      life: 3000
    })
    cancelEdit()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'An error occurred'
  } finally {
    loading.value = false
  }
}

async function handleDisablePin() {
  error.value = ''

  if (!currentPin.value || currentPin.value.length < PIN_LENGTH) {
    error.value = 'Please enter your current PIN'
    return
  }

  loading.value = true

  try {
    const isValid = await verifyPin(currentPin.value)
    if (!isValid) {
      error.value = 'Incorrect PIN'
      currentPin.value = ''
      loading.value = false
      return
    }

    disablePin()
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'PIN protection has been disabled',
      life: 3000
    })
    cancelEdit()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'An error occurred'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <SettingsCard header="Security">
    <!-- PIN Status -->
    <div class="settings-item">
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-lock item-icon"></i>
          <div class="item-text">
            <span class="item-label">PIN Protection</span>
            <span class="item-description">Require PIN when opening the app</span>
          </div>
        </div>
        <Tag
          v-if="isPinEnabled && hasPinSet"
          severity="success"
          value="On"
        />
        <Tag
          v-else
          severity="secondary"
          value="Off"
        />
      </div>
    </div>

    <!-- Set PIN (when not set) -->
    <button
      v-if="!isPinEnabled || !hasPinSet"
      class="settings-item clickable"
      @click="startSetPin"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-plus item-icon"></i>
          <span class="item-label">Set PIN</span>
        </div>
        <i class="pi pi-chevron-right item-chevron"></i>
      </div>
    </button>

    <!-- Change PIN (when set) -->
    <button
      v-if="isPinEnabled && hasPinSet"
      class="settings-item clickable"
      @click="startChangePin"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-pencil item-icon"></i>
          <span class="item-label">Change PIN</span>
        </div>
        <i class="pi pi-chevron-right item-chevron"></i>
      </div>
    </button>

    <!-- Disable PIN (when set) -->
    <button
      v-if="isPinEnabled && hasPinSet"
      class="settings-item clickable danger"
      @click="startDisablePin"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-times item-icon"></i>
          <span class="item-label">Disable PIN</span>
        </div>
        <i class="pi pi-chevron-right item-chevron"></i>
      </div>
    </button>
  </SettingsCard>

  <!-- Set PIN Dialog -->
  <Dialog
    :visible="editMode === 'set'"
    modal
    header="Set PIN"
    :style="{ width: '400px' }"
    :breakpoints="{ '480px': '90vw' }"
    :closable="!loading"
    @update:visible="cancelEdit"
  >
    <div class="dialog-content">
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div class="pin-input-group">
        <label>PIN ({{ PIN_LENGTH }} digits)</label>
        <InputOtp
          v-model="newPin"
          :length="PIN_LENGTH"
          :disabled="loading"
          mask
          integer-only
        />
      </div>

      <div class="pin-input-group">
        <label>Confirm PIN</label>
        <InputOtp
          v-model="confirmPin"
          :length="PIN_LENGTH"
          :disabled="loading"
          mask
          integer-only
        />
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        :disabled="loading"
        @click="cancelEdit"
      />
      <Button
        label="Set PIN"
        icon="pi pi-lock"
        :loading="loading"
        @click="handleSetPin"
      />
    </template>
  </Dialog>

  <!-- Change PIN Dialog -->
  <Dialog
    :visible="editMode === 'change'"
    modal
    header="Change PIN"
    :style="{ width: '400px' }"
    :breakpoints="{ '480px': '90vw' }"
    :closable="!loading"
    @update:visible="cancelEdit"
  >
    <div class="dialog-content">
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div class="pin-input-group">
        <label>Current PIN</label>
        <InputOtp
          v-model="currentPin"
          :length="PIN_LENGTH"
          :disabled="loading"
          mask
          integer-only
        />
      </div>

      <div class="pin-input-group">
        <label>New PIN</label>
        <InputOtp
          v-model="newPin"
          :length="PIN_LENGTH"
          :disabled="loading"
          mask
          integer-only
        />
      </div>

      <div class="pin-input-group">
        <label>Confirm New PIN</label>
        <InputOtp
          v-model="confirmPin"
          :length="PIN_LENGTH"
          :disabled="loading"
          mask
          integer-only
        />
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        :disabled="loading"
        @click="cancelEdit"
      />
      <Button
        label="Change"
        icon="pi pi-check"
        :loading="loading"
        @click="handleChangePin"
      />
    </template>
  </Dialog>

  <!-- Disable PIN Dialog -->
  <Dialog
    :visible="editMode === 'disable'"
    modal
    header="Disable PIN Protection"
    :style="{ width: '400px' }"
    :breakpoints="{ '480px': '90vw' }"
    :closable="!loading"
    @update:visible="cancelEdit"
  >
    <div class="dialog-content">
      <p class="warning-text">
        Enter your current PIN to disable PIN protection.
      </p>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div class="pin-input-group">
        <label>Current PIN</label>
        <InputOtp
          v-model="currentPin"
          :length="PIN_LENGTH"
          :disabled="loading"
          mask
          integer-only
        />
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        :disabled="loading"
        @click="cancelEdit"
      />
      <Button
        label="Disable"
        icon="pi pi-times"
        severity="danger"
        :loading="loading"
        @click="handleDisablePin"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.pin-input-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.pin-input-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.warning-text {
  color: var(--p-text-muted-color);
  margin: 0 0 1rem 0;
  text-align: center;
}
</style>
