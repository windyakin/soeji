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
const { setup: setupAuth } = useAuth()

const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

async function handleSubmit() {
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

  const result = await setupAuth(username.value, password.value)

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
</script>

<template>
  <div class="setup-page">
    <div class="setup-container">
      <Card class="setup-card">
        <template #title>
          <div class="setup-title">
            <h1>Soeji</h1>
            <p class="setup-subtitle">Create your admin account</p>
          </div>
        </template>
        <template #content>
          <form class="setup-form" @submit.prevent="handleSubmit">
            <div class="form-field">
              <label for="username">Username</label>
              <InputText
                id="username"
                v-model="username"
                autocomplete="username"
                :disabled="isLoading"
                fluid
              />
            </div>

            <div class="form-field">
              <label for="password">Password</label>
              <Password
                v-model="password"
                inputId="password"
                toggleMask
                autocomplete="new-password"
                :disabled="isLoading"
                fluid
              />
              <small class="field-hint">At least 8 characters</small>
            </div>

            <div class="form-field">
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

            <Button
              type="submit"
              label="Create Admin Account"
              :loading="isLoading"
              fluid
            />
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

.setup-form {
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

.field-hint {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
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
