<script setup lang="ts">
import { ref } from 'vue'
import Card from 'primevue/card'
import InputOtp from 'primevue/inputotp'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { usePinProtection } from '../composables/usePinProtection'

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
  <Card>
    <template #title>
      <i class="pi pi-lock" style="margin-right: 0.5rem;"></i>
      PIN Protection
    </template>
    <template #subtitle>
      Require PIN authentication when opening the app. The PIN is stored only on this device.
    </template>
    <template #content>
      <!-- Status display -->
      <div class="status-row">
        <Tag
          v-if="isPinEnabled && hasPinSet"
          severity="success"
          icon="pi pi-check-circle"
          value="Enabled"
        />
        <Tag
          v-else
          severity="secondary"
          icon="pi pi-info-circle"
          value="Not set"
        />

        <div class="action-buttons">
          <Button
            v-if="isPinEnabled && hasPinSet"
            label="Change"
            icon="pi pi-pencil"
            text
            size="small"
            @click="startChangePin"
          />
          <Button
            v-if="isPinEnabled && hasPinSet"
            label="Disable"
            icon="pi pi-times"
            text
            size="small"
            severity="danger"
            @click="startDisablePin"
          />
          <Button
            v-if="!isPinEnabled || !hasPinSet"
            label="Set PIN"
            icon="pi pi-lock"
            text
            size="small"
            @click="startSetPin"
          />
        </div>
      </div>

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
  </Card>
</template>

<style scoped>
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.action-buttons {
  display: flex;
  gap: 0.25rem;
}

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
