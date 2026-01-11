<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import { useAuth } from '../composables/useAuth'
import VersionInfo from '../components/VersionInfo.vue'

const router = useRouter()
const toast = useToast()
const { verifySetupKey, setup: setupAuth } = useAuth()

// Step management
const currentStep = ref<'setupKey' | 'createAdmin'>('setupKey')

// Step 1: Setup Key
const setupKey = ref('')
const verifiedSetupKey = ref('')

// Step 2: Admin account
const username = ref('')
const password = ref('')
const confirmPassword = ref('')

// Shared state
const isLoading = ref(false)
const errorMessage = ref('')

// Step 1: Verify Setup Key
async function handleVerifySetupKey() {
  errorMessage.value = ''

  if (!setupKey.value) {
    errorMessage.value = 'Please enter the setup key'
    return
  }

  isLoading.value = true

  const result = await verifySetupKey(setupKey.value)

  isLoading.value = false

  if (result.success) {
    verifiedSetupKey.value = setupKey.value
    currentStep.value = 'createAdmin'
    errorMessage.value = ''
  } else {
    errorMessage.value = result.error || 'Invalid setup key'
  }
}

// Step 2: Create Admin Account
async function handleCreateAdmin() {
  errorMessage.value = ''

  if (!username.value || !password.value || !confirmPassword.value) {
    errorMessage.value = 'Please fill in all fields'
    return
  }

  if (username.value.length < 3) {
    errorMessage.value = 'Username must be at least 3 characters'
    return
  }

  if (password.value.length < 8) {
    errorMessage.value = 'Password must be at least 8 characters'
    return
  }

  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match'
    return
  }

  isLoading.value = true

  const result = await setupAuth(username.value, password.value, verifiedSetupKey.value)

  isLoading.value = false

  if (result.success) {
    toast.add({
      severity: 'success',
      summary: 'Setup complete',
      detail: 'Admin account created successfully',
      life: 3000,
    })
    router.replace('/')
  } else {
    errorMessage.value = result.error || 'Setup failed'
  }
}

// Go back to Step 1
function handleBack() {
  currentStep.value = 'setupKey'
  errorMessage.value = ''
}
</script>

<template>
  <div class="setup-page">
    <div class="setup-container">
      <Card class="setup-card">
        <template #title>
          <div class="setup-title">
            <h1>Soeji</h1>
            <p class="setup-subtitle">
              {{ currentStep === 'setupKey' ? 'Enter setup key to continue' : 'Create your admin account' }}
            </p>
          </div>
        </template>
        <template #content>
          <!-- Step 1: Setup Key Verification -->
          <form v-if="currentStep === 'setupKey'" @submit.prevent="handleVerifySetupKey">
            <div class="field">
              <label for="setupKey">Setup Key</label>
              <Password
                v-model="setupKey"
                inputId="setupKey"
                :feedback="false"
                toggleMask
                :disabled="isLoading"
                fluid
              />
              <small>Enter the setup key provided by your administrator</small>
            </div>

            <div v-if="errorMessage" class="error-message">
              {{ errorMessage }}
            </div>

            <Button
              type="submit"
              label="Continue"
              :loading="isLoading"
              fluid
              class="mt-4"
            />
          </form>

          <!-- Step 2: Create Admin Account -->
          <form v-else-if="currentStep === 'createAdmin'" @submit.prevent="handleCreateAdmin">
            <div class="field">
              <label for="username">Username</label>
              <InputText
                id="username"
                v-model="username"
                autocomplete="username"
                :disabled="isLoading"
                fluid
              />
            </div>

            <div class="field">
              <label for="password">Password</label>
              <Password
                v-model="password"
                inputId="password"
                toggleMask
                autocomplete="new-password"
                :disabled="isLoading"
                fluid
              />
              <small>At least 8 characters</small>
            </div>

            <div class="field">
              <label for="confirmPassword">Confirm Password</label>
              <Password
                v-model="confirmPassword"
                inputId="confirmPassword"
                :feedback="false"
                toggleMask
                autocomplete="new-password"
                :disabled="isLoading"
                fluid
              />
            </div>

            <div v-if="errorMessage" class="error-message">
              {{ errorMessage }}
            </div>

            <div class="flex gap-2 mt-4">
              <Button
                type="button"
                label="Back"
                severity="secondary"
                :disabled="isLoading"
                @click="handleBack"
              />
              <Button
                type="submit"
                label="Create Admin Account"
                :loading="isLoading"
                class="flex-1"
              />
            </div>
          </form>
        </template>
      </Card>

      <div class="version-container">
        <VersionInfo />
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--p-surface-ground);
  padding: 1rem;
}

.setup-container {
  width: 100%;
  max-width: 24rem;
}

.setup-card {
  width: 100%;
}

.setup-title {
  text-align: center;
}

.setup-title h1 {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
  color: var(--p-primary-color);
}

.setup-subtitle {
  margin: 0.5rem 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.error-message {
  color: var(--p-red-500);
  font-size: 0.875rem;
  text-align: center;
}

.version-container {
  margin-top: 1.5rem;
}
</style>
