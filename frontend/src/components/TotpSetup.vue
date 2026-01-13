<script setup lang="ts">
import { ref, computed } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import SettingsCard from './SettingsCard.vue'
import { useAuth } from '../composables/useAuth'
import type { TotpSetupResponse, TotpStatusResponse } from '../types/auth'

const toast = useToast()
const {
  getTotpStatus,
  setupTotp,
  verifyTotpSetup,
  disableTotp,
  regenerateBackupCodes,
} = useAuth()

const isLoading = ref(false)
const totpStatus = ref<TotpStatusResponse | null>(null)

// Setup flow state
const setupDialogVisible = ref(false)
const setupData = ref<TotpSetupResponse | null>(null)
const verificationCode = ref('')
const setupError = ref('')

// Backup codes display state
const backupCodesDialogVisible = ref(false)
const backupCodes = ref<string[]>([])

// Disable flow state
const disableDialogVisible = ref(false)
const disablePassword = ref('')
const disableError = ref('')

// Regenerate backup codes state
const regenerateDialogVisible = ref(false)
const regeneratePassword = ref('')
const regenerateError = ref('')

const isTotpEnabled = computed(() => totpStatus.value?.enabled ?? false)

async function loadStatus() {
  isLoading.value = true
  totpStatus.value = await getTotpStatus()
  isLoading.value = false
}

async function handleStartSetup() {
  setupError.value = ''
  isLoading.value = true

  const result = await setupTotp()

  isLoading.value = false

  if (result.success && result.data) {
    setupData.value = result.data
    setupDialogVisible.value = true
  } else {
    toast.add({
      severity: 'error',
      summary: 'Setup failed',
      detail: result.error,
      life: 5000,
    })
  }
}

async function handleVerifySetup() {
  if (!verificationCode.value.trim()) {
    setupError.value = 'Please enter the verification code'
    return
  }

  if (!/^\d{6}$/.test(verificationCode.value.trim())) {
    setupError.value = 'Please enter a valid 6-digit code'
    return
  }

  setupError.value = ''
  isLoading.value = true

  const result = await verifyTotpSetup(verificationCode.value.trim())

  isLoading.value = false

  if (result.success && result.backupCodes) {
    setupDialogVisible.value = false
    setupData.value = null
    verificationCode.value = ''

    // Show backup codes
    backupCodes.value = result.backupCodes
    backupCodesDialogVisible.value = true

    // Reload status
    await loadStatus()

    toast.add({
      severity: 'success',
      summary: '2FA enabled',
      detail: 'Two-factor authentication has been enabled',
      life: 3000,
    })
  } else {
    setupError.value = result.error || 'Verification failed'
  }
}

function handleCancelSetup() {
  setupDialogVisible.value = false
  setupData.value = null
  verificationCode.value = ''
  setupError.value = ''
}

function handleCloseBackupCodes() {
  backupCodesDialogVisible.value = false
  backupCodes.value = []
}

async function handleDisable() {
  if (!disablePassword.value) {
    disableError.value = 'Please enter your password'
    return
  }

  disableError.value = ''
  isLoading.value = true

  const result = await disableTotp(disablePassword.value)

  isLoading.value = false

  if (result.success) {
    disableDialogVisible.value = false
    disablePassword.value = ''

    await loadStatus()

    toast.add({
      severity: 'success',
      summary: '2FA disabled',
      detail: 'Two-factor authentication has been disabled',
      life: 3000,
    })
  } else {
    disableError.value = result.error || 'Failed to disable'
  }
}

function handleCancelDisable() {
  disableDialogVisible.value = false
  disablePassword.value = ''
  disableError.value = ''
}

async function handleRegenerateBackupCodes() {
  if (!regeneratePassword.value) {
    regenerateError.value = 'Please enter your password'
    return
  }

  regenerateError.value = ''
  isLoading.value = true

  const result = await regenerateBackupCodes(regeneratePassword.value)

  isLoading.value = false

  if (result.success && result.backupCodes) {
    regenerateDialogVisible.value = false
    regeneratePassword.value = ''

    // Show new backup codes
    backupCodes.value = result.backupCodes
    backupCodesDialogVisible.value = true

    await loadStatus()
  } else {
    regenerateError.value = result.error || 'Failed to regenerate'
  }
}

function handleCancelRegenerate() {
  regenerateDialogVisible.value = false
  regeneratePassword.value = ''
  regenerateError.value = ''
}

function copyBackupCodes() {
  const text = backupCodes.value.join('\n')
  navigator.clipboard.writeText(text)
  toast.add({
    severity: 'success',
    summary: 'Copied',
    detail: 'Backup codes copied to clipboard',
    life: 2000,
  })
}

// Load status on mount
loadStatus()
</script>

<template>
  <SettingsCard header="Two-Factor Authentication">
    <!-- 2FA Status -->
    <div class="settings-item">
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-shield item-icon"></i>
          <div class="item-text">
            <span class="item-label">2FA Protection</span>
            <span class="item-description">Require code from authenticator app</span>
          </div>
        </div>
        <Tag
          v-if="isTotpEnabled"
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

    <!-- Enable 2FA (when not enabled) -->
    <button
      v-if="!isTotpEnabled"
      class="settings-item clickable"
      :disabled="isLoading"
      @click="handleStartSetup"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-plus item-icon"></i>
          <span class="item-label">Enable 2FA</span>
        </div>
        <i class="pi pi-chevron-right item-chevron"></i>
      </div>
    </button>

    <!-- Backup codes remaining (when enabled) -->
    <button
      v-if="isTotpEnabled"
      class="settings-item clickable"
      @click="regenerateDialogVisible = true"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-key item-icon"></i>
          <div class="item-text">
            <span class="item-label">Backup Codes</span>
            <span class="item-description">{{ totpStatus?.backupCodesRemaining ?? 0 }} codes remaining</span>
          </div>
        </div>
        <i class="pi pi-chevron-right item-chevron"></i>
      </div>
    </button>

    <!-- Disable 2FA (when enabled) -->
    <button
      v-if="isTotpEnabled"
      class="settings-item clickable danger"
      @click="disableDialogVisible = true"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-times item-icon"></i>
          <span class="item-label">Disable 2FA</span>
        </div>
        <i class="pi pi-chevron-right item-chevron"></i>
      </div>
    </button>
  </SettingsCard>

  <!-- Setup Dialog -->
  <Dialog
    v-model:visible="setupDialogVisible"
    modal
    header="Set up 2FA"
    :style="{ width: '400px' }"
    :breakpoints="{ '480px': '90vw' }"
    :closable="!isLoading"
    @update:visible="handleCancelSetup"
  >
    <div v-if="setupData" class="dialog-content">
      <p class="info-text">
        Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
      </p>

      <div class="qr-code-container">
        <img :src="setupData.qrCode" alt="QR Code" class="qr-code" />
      </div>

      <details class="manual-entry">
        <summary>Can't scan? Enter manually</summary>
        <div class="manual-entry-content">
          <code class="secret-code">{{ setupData.secret }}</code>
        </div>
      </details>

      <Message v-if="setupError" severity="error" :closable="false">{{ setupError }}</Message>

      <div class="input-group">
        <label for="verification-code">Enter the 6-digit code from your app</label>
        <InputText
          id="verification-code"
          v-model="verificationCode"
          placeholder="000000"
          :disabled="isLoading"
          fluid
        />
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        :disabled="isLoading"
        @click="handleCancelSetup"
      />
      <Button
        label="Verify and Enable"
        icon="pi pi-check"
        :loading="isLoading"
        @click="handleVerifySetup"
      />
    </template>
  </Dialog>

  <!-- Backup Codes Dialog -->
  <Dialog
    v-model:visible="backupCodesDialogVisible"
    modal
    header="Backup Codes"
    :style="{ width: '400px' }"
    :breakpoints="{ '480px': '90vw' }"
    :closable="false"
  >
    <div class="dialog-content">
      <Message severity="warn" :closable="false">
        Save these codes in a safe place. Each code can only be used once.
      </Message>

      <div class="backup-codes-list">
        <code v-for="code in backupCodes" :key="code" class="backup-code">
          {{ code }}
        </code>
      </div>

      <Button
        label="Copy all codes"
        icon="pi pi-copy"
        text
        @click="copyBackupCodes"
        class="copy-button"
      />
    </div>

    <template #footer>
      <Button
        label="I've saved these codes"
        @click="handleCloseBackupCodes"
      />
    </template>
  </Dialog>

  <!-- Disable Dialog -->
  <Dialog
    v-model:visible="disableDialogVisible"
    modal
    header="Disable 2FA"
    :style="{ width: '400px' }"
    :breakpoints="{ '480px': '90vw' }"
    :closable="!isLoading"
    @update:visible="handleCancelDisable"
  >
    <div class="dialog-content">
      <p class="warning-text">
        Enter your password to disable two-factor authentication.
      </p>

      <Message v-if="disableError" severity="error" :closable="false">{{ disableError }}</Message>

      <div class="input-group">
        <label for="disable-password">Password</label>
        <Password
          id="disable-password"
          v-model="disablePassword"
          :feedback="false"
          toggleMask
          :disabled="isLoading"
          fluid
        />
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        :disabled="isLoading"
        @click="handleCancelDisable"
      />
      <Button
        label="Disable"
        icon="pi pi-times"
        severity="danger"
        :loading="isLoading"
        @click="handleDisable"
      />
    </template>
  </Dialog>

  <!-- Regenerate Backup Codes Dialog -->
  <Dialog
    v-model:visible="regenerateDialogVisible"
    modal
    header="Regenerate Backup Codes"
    :style="{ width: '400px' }"
    :breakpoints="{ '480px': '90vw' }"
    :closable="!isLoading"
    @update:visible="handleCancelRegenerate"
  >
    <div class="dialog-content">
      <Message severity="warn" :closable="false">
        This will invalidate all existing backup codes.
      </Message>

      <Message v-if="regenerateError" severity="error" :closable="false">{{ regenerateError }}</Message>

      <div class="input-group">
        <label for="regenerate-password">Password</label>
        <Password
          id="regenerate-password"
          v-model="regeneratePassword"
          :feedback="false"
          toggleMask
          :disabled="isLoading"
          fluid
        />
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        :disabled="isLoading"
        @click="handleCancelRegenerate"
      />
      <Button
        label="Regenerate"
        icon="pi pi-refresh"
        :loading="isLoading"
        @click="handleRegenerateBackupCodes"
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

.info-text,
.warning-text {
  color: var(--p-text-muted-color);
  margin: 0;
  text-align: center;
}

.qr-code-container {
  display: flex;
  justify-content: center;
}

.qr-code {
  width: 200px;
  height: 200px;
  border-radius: 8px;
}

.manual-entry {
  font-size: 0.875rem;
}

.manual-entry summary {
  cursor: pointer;
  color: var(--p-primary-color);
}

.manual-entry-content {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: var(--p-surface-100);
  border-radius: 4px;
}

.secret-code {
  display: block;
  word-break: break-all;
  font-size: 0.8rem;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.input-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.backup-codes-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  padding: 1rem;
  background: var(--p-surface-100);
  border-radius: 8px;
}

.backup-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875rem;
  padding: 0.25rem 0.5rem;
  background: var(--p-surface-0);
  border-radius: 4px;
  text-align: center;
}

.copy-button {
  align-self: center;
}
</style>
