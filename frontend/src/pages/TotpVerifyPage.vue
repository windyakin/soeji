<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const toast = useToast()
const { totpRequired, pendingTotpUser, verifyTotp, cancelTotp } = useAuth()

const code = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const useBackupCode = ref(false)

onMounted(() => {
  // If no TOTP session, redirect to login
  if (!totpRequired.value) {
    router.replace('/login')
  }
})

function toggleBackupCodeMode() {
  useBackupCode.value = !useBackupCode.value
  code.value = ''
  errorMessage.value = ''
}

function handleCancel() {
  cancelTotp()
  router.replace('/login')
}

async function handleSubmit() {
  const trimmedCode = code.value.trim()
  if (!trimmedCode) {
    errorMessage.value = useBackupCode.value
      ? 'Please enter a backup code'
      : 'Please enter the 6-digit code'
    return
  }

  // Validate TOTP code format (6 digits)
  if (!useBackupCode.value && !/^\d{6}$/.test(trimmedCode)) {
    errorMessage.value = 'Please enter a valid 6-digit code'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  const result = await verifyTotp(trimmedCode, useBackupCode.value)

  isLoading.value = false

  if (result.success) {
    toast.add({
      severity: 'success',
      summary: 'Verification successful',
      life: 3000,
    })
    // Navigate to the redirect URL or home
    const redirect = router.currentRoute.value.query.redirect as string
    router.replace(redirect || '/')
  } else {
    errorMessage.value = result.error || 'Verification failed'
  }
}
</script>

<template>
  <div class="totp-page">
    <div class="totp-container">
      <Card class="totp-card">
        <template #title>
          <div class="totp-title">
            <h1>Two-Factor Authentication</h1>
            <p class="totp-subtitle">
              <template v-if="pendingTotpUser">
                Signing in as <strong>{{ pendingTotpUser.username }}</strong>
              </template>
            </p>
          </div>
        </template>
        <template #content>
          <form @submit.prevent="handleSubmit">
            <div class="field">
              <label for="code">
                {{ useBackupCode ? 'Backup Code' : 'Authentication Code' }}
              </label>
              <InputText
                id="code"
                v-model="code"
                :placeholder="useBackupCode ? 'XXXX-XXXX' : '000000'"
                autocomplete="one-time-code"
                :disabled="isLoading"
                fluid
                autofocus
              />
              <small class="field-hint">
                {{ useBackupCode
                  ? 'Enter one of your backup codes'
                  : 'Enter the 6-digit code from your authenticator app'
                }}
              </small>
            </div>

            <div v-if="errorMessage" class="error-message">
              {{ errorMessage }}
            </div>

            <Button
              type="submit"
              label="Verify"
              :loading="isLoading"
              fluid
              class="mt-4"
            />

            <div class="action-links">
              <Button
                type="button"
                :label="useBackupCode ? 'Use authenticator app' : 'Use backup code'"
                variant="link"
                size="small"
                @click="toggleBackupCodeMode"
              />
              <Button
                type="button"
                label="Cancel"
                variant="link"
                size="small"
                severity="secondary"
                @click="handleCancel"
              />
            </div>
          </form>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.totp-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--p-surface-ground);
  padding: 1rem;
}

.totp-container {
  width: 100%;
  max-width: 24rem;
}

.totp-card {
  width: 100%;
}

.totp-title {
  text-align: center;
}

.totp-title h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--p-primary-color);
}

.totp-subtitle {
  margin: 0.5rem 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.field-hint {
  display: block;
  margin-top: 0.25rem;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.error-message {
  color: var(--p-red-500);
  font-size: 0.875rem;
  text-align: center;
  margin-top: 0.5rem;
}

.action-links {
  display: flex;
  justify-content: space-between;
  margin-top: 1rem;
}
</style>
