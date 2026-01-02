<script setup lang="ts">
import { ref, computed } from 'vue'
import InputOtp from 'primevue/inputotp'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import { useToast } from 'primevue/usetoast'
import { usePinProtection, type LockLevel } from '../composables/usePinProtection'
import SettingsCard from './SettingsCard.vue'

const PIN_LENGTH = 4

const toast = useToast()
const {
  isPinEnabled,
  hasPinSet,
  lockLevel,
  lockDelay,
  setPin,
  verifyPin,
  disablePin,
  setLockLevel,
  setLockDelay
} = usePinProtection()

// Lock level options
const lockLevelOptions = [
  { label: 'On app reload', value: 'reload' as LockLevel },
  { label: 'After delay', value: 'delayed' as LockLevel },
  { label: 'Immediately', value: 'immediate' as LockLevel }
]

// Lock delay options (minutes)
const lockDelayOptions = [
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '60 min', value: 60 }
]

// Auth target: what action requires PIN verification
type AuthTarget = 'change' | 'disable' | 'lock-settings'

// UI state
type EditMode = 'none' | 'set' | 'auth' | 'change' | 'disable' | 'lock-settings'
const editMode = ref<EditMode>('none')
const authTarget = ref<AuthTarget | null>(null)

// Form state
const currentPin = ref('')
const newPin = ref('')
const confirmPin = ref('')
const error = ref('')
const loading = ref(false)

// Lock settings form state
const editLockLevel = ref<LockLevel>(lockLevel.value)
const editLockDelay = ref(lockDelay.value)

function resetForm() {
  currentPin.value = ''
  newPin.value = ''
  confirmPin.value = ''
  error.value = ''
  loading.value = false
}

function resetLockSettingsForm() {
  editLockLevel.value = lockLevel.value
  editLockDelay.value = lockDelay.value
}

function startSetPin() {
  resetForm()
  editMode.value = 'set'
}

function startAuth(target: AuthTarget) {
  resetForm()
  if (target === 'lock-settings') {
    resetLockSettingsForm()
  }
  authTarget.value = target
  editMode.value = 'auth'
}

function cancelEdit() {
  resetForm()
  authTarget.value = null
  editMode.value = 'none'
}

// Get dialog title based on auth target
const authDialogTitle = computed(() => {
  switch (authTarget.value) {
    case 'change':
      return 'Change PIN'
    case 'disable':
      return 'Disable PIN'
    case 'lock-settings':
      return 'Lock Settings'
    default:
      return 'Enter PIN'
  }
})

// Get auth dialog description
const authDialogDescription = computed(() => {
  switch (authTarget.value) {
    case 'change':
      return 'Enter your current PIN to change it.'
    case 'disable':
      return 'Enter your PIN to disable PIN protection.'
    case 'lock-settings':
      return 'Enter your PIN to change lock settings.'
    default:
      return 'Enter your PIN to continue.'
  }
})

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

async function handleAuth() {
  error.value = ''

  if (!currentPin.value || currentPin.value.length < PIN_LENGTH) {
    error.value = 'Please enter your PIN'
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

    // Move to target screen
    if (authTarget.value) {
      editMode.value = authTarget.value
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'An error occurred'
  } finally {
    loading.value = false
  }
}

async function handleChangePin() {
  error.value = ''

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
    await setPin(newPin.value)
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

function handleDisablePin() {
  disablePin()
  toast.add({
    severity: 'success',
    summary: 'Success',
    detail: 'PIN protection has been disabled',
    life: 3000
  })
  cancelEdit()
}

function handleSaveLockSettings() {
  setLockLevel(editLockLevel.value)
  setLockDelay(editLockDelay.value)
  toast.add({
    severity: 'success',
    summary: 'Success',
    detail: 'Lock settings have been updated',
    life: 3000
  })
  cancelEdit()
}

// Get current lock level label for display
function getLockLevelLabel(level: LockLevel): string {
  const option = lockLevelOptions.find(o => o.value === level)
  return option?.label || level
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
      @click="startAuth('change')"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-pencil item-icon"></i>
          <span class="item-label">Change PIN</span>
        </div>
        <i class="pi pi-chevron-right item-chevron"></i>
      </div>
    </button>

    <!-- Lock Settings (when PIN is set) -->
    <button
      v-if="isPinEnabled && hasPinSet"
      class="settings-item clickable"
      @click="startAuth('lock-settings')"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-clock item-icon"></i>
          <div class="item-text">
            <span class="item-label">Lock Settings</span>
            <span class="item-description">{{ getLockLevelLabel(lockLevel) }}{{ lockLevel === 'delayed' ? ` (${lockDelay} min)` : '' }}</span>
          </div>
        </div>
        <i class="pi pi-chevron-right item-chevron"></i>
      </div>
    </button>

    <!-- Disable PIN (when set) -->
    <button
      v-if="isPinEnabled && hasPinSet"
      class="settings-item clickable danger"
      @click="startAuth('disable')"
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

  <!-- Common Auth Dialog -->
  <Dialog
    :visible="editMode === 'auth'"
    modal
    :header="authDialogTitle"
    :style="{ width: '400px' }"
    :breakpoints="{ '480px': '90vw' }"
    :closable="!loading"
    @update:visible="cancelEdit"
  >
    <div class="dialog-content">
      <p class="info-text">{{ authDialogDescription }}</p>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div class="pin-input-group">
        <label>PIN</label>
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
        label="Continue"
        icon="pi pi-arrow-right"
        :loading="loading"
        @click="handleAuth"
      />
    </template>
  </Dialog>

  <!-- Change PIN Dialog (after auth) -->
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

  <!-- Disable PIN Confirmation Dialog (after auth) -->
  <Dialog
    :visible="editMode === 'disable'"
    modal
    header="Disable PIN Protection"
    :style="{ width: '400px' }"
    :breakpoints="{ '480px': '90vw' }"
    @update:visible="cancelEdit"
  >
    <div class="dialog-content">
      <p class="warning-text">
        Are you sure you want to disable PIN protection?
        Anyone with access to this device will be able to open the app.
      </p>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        @click="cancelEdit"
      />
      <Button
        label="Disable"
        icon="pi pi-times"
        severity="danger"
        @click="handleDisablePin"
      />
    </template>
  </Dialog>

  <!-- Lock Settings Dialog (after auth) -->
  <Dialog
    :visible="editMode === 'lock-settings'"
    modal
    header="Lock Settings"
    :style="{ width: '400px' }"
    :breakpoints="{ '480px': '90vw' }"
    @update:visible="cancelEdit"
  >
    <div class="dialog-content">
      <div class="setting-group">
        <label class="setting-label">Lock Timing</label>
        <p class="setting-description">When to require PIN</p>
        <Select
          v-model="editLockLevel"
          :options="lockLevelOptions"
          option-label="label"
          option-value="value"
          class="setting-select"
        />
      </div>

      <div v-if="editLockLevel === 'delayed'" class="setting-group">
        <label class="setting-label">Lock Delay</label>
        <p class="setting-description">Minutes before locking</p>
        <SelectButton
          v-model="editLockDelay"
          :options="lockDelayOptions"
          option-label="label"
          option-value="value"
          class="setting-select-button"
        />
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        @click="cancelEdit"
      />
      <Button
        label="Save"
        icon="pi pi-check"
        @click="handleSaveLockSettings"
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

.warning-text,
.info-text {
  color: var(--p-text-muted-color);
  margin: 0 0 1rem 0;
  text-align: center;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.setting-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.setting-description {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin: 0;
}

.setting-select {
  width: 100%;
}

.setting-select-button {
  width: 100%;
  display: flex;
}

.setting-select-button :deep(.p-togglebutton) {
  flex: 1;
}
</style>
