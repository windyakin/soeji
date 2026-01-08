<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Popover from 'primevue/popover'
import { useAuth } from '../composables/useAuth'
import VersionInfo from '../components/VersionInfo.vue'

const API_BASE = import.meta.env.VITE_API_BASE || ''

const router = useRouter()
const toast = useToast()
const { logout, getAuthHeader, clearMustChangePassword, getTemporaryPassword } = useAuth()

const infoPopoverRef = ref<InstanceType<typeof Popover> | null>(null)

function toggleInfoPopover(event: Event) {
  infoPopoverRef.value?.toggle(event)
}

const newPassword = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const isLoggingOut = ref(false)
const errorMessage = ref('')

// Check if we have a temporary password from login (evaluated once at setup)
const hasTemporaryPassword = getTemporaryPassword() !== null

// If no temporary password, redirect to login immediately
if (!hasTemporaryPassword) {
  router.replace('/login')
}

async function handleSubmit() {
  errorMessage.value = ''

  if (!newPassword.value || !confirmPassword.value) {
    errorMessage.value = 'All fields are required'
    return
  }

  if (newPassword.value.length < 8) {
    errorMessage.value = 'New password must be at least 8 characters'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'New passwords do not match'
    return
  }

  // Get the current password from temporary storage
  const currentPassword = getTemporaryPassword()
  if (!currentPassword) {
    errorMessage.value = 'Session expired. Please log in again.'
    return
  }

  isLoading.value = true

  try {
    const response = await fetch(`${API_BASE}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({
        currentPassword,
        newPassword: newPassword.value,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to change password' }))
      errorMessage.value = error.error || 'Failed to change password'
      isLoading.value = false
      return
    }

    // Clear the mustChangePassword flag
    clearMustChangePassword()

    toast.add({
      severity: 'success',
      summary: 'Password changed',
      detail: 'Please log in again with your new password',
      life: 5000,
    })

    // Logout and redirect to login
    await logout()
    router.replace('/login')
  } catch (err) {
    errorMessage.value = 'Network error. Please try again.'
  } finally {
    isLoading.value = false
  }
}

async function handleLogout() {
  isLoggingOut.value = true
  try {
    await logout()
    router.replace('/login')
  } finally {
    isLoggingOut.value = false
  }
}
</script>

<template>
  <div class="force-change-password-page">
    <!-- Info button in top-right corner -->
    <div class="info-button-wrapper">
      <Button
        icon="pi pi-info-circle"
        variant="text"
        severity="secondary"
        rounded
        @click="toggleInfoPopover"
        aria-label="Version Info"
      />
      <Popover ref="infoPopoverRef">
        <div class="info-popover-content">
          <VersionInfo />
        </div>
      </Popover>
    </div>

    <div class="page-container">
      <Card class="change-password-card">
        <template #title>
          <div class="card-title">
            <h1>Password Change Required</h1>
            <p class="card-subtitle">Please set a new password to continue</p>
          </div>
        </template>
        <template #content>
          <Message severity="warn" :closable="false" class="info-message">
            Your password must be changed before continuing.
          </Message>

          <form class="password-form" @submit.prevent="handleSubmit">
            <div class="form-field">
              <label for="new-password">New Password</label>
              <Password
                v-model="newPassword"
                inputId="new-password"
                :feedback="true"
                toggleMask
                autocomplete="new-password"
                :disabled="isLoading || isLoggingOut"
                fluid
              />
              <small class="hint">Must be at least 8 characters</small>
            </div>

            <div class="form-field">
              <label for="confirm-password">Confirm New Password</label>
              <Password
                v-model="confirmPassword"
                inputId="confirm-password"
                :feedback="false"
                toggleMask
                autocomplete="new-password"
                :disabled="isLoading || isLoggingOut"
                fluid
              />
            </div>

            <Message v-if="errorMessage" severity="error" :closable="false">
              {{ errorMessage }}
            </Message>

            <div class="button-row">
              <Button
                type="button"
                label="Sign out"
                severity="secondary"
                variant="text"
                icon="pi pi-sign-out"
                :loading="isLoggingOut"
                :disabled="isLoading"
                @click="handleLogout"
              />
              <Button
                type="submit"
                label="Change Password"
                :loading="isLoading"
                :disabled="isLoggingOut"
              />
            </div>
          </form>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.force-change-password-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--p-surface-ground);
  padding: 1rem;
}

.info-button-wrapper {
  position: absolute;
  top: 1rem;
  right: 1rem;
}

.info-popover-content {
  min-width: 16rem;
}

.page-container {
  width: 100%;
  max-width: 24rem;
}

.change-password-card {
  width: 100%;
}

.card-title {
  text-align: center;
}

.card-title h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--p-text-color);
}

.card-subtitle {
  margin: 0.5rem 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.info-message {
  margin-bottom: 1rem;
}

.password-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-field label {
  font-weight: 500;
  color: var(--p-text-color);
}

.hint {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.button-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

</style>
