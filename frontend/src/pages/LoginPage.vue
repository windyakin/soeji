<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import { useAuth } from '../composables/useAuth'
import VersionInfo from '../components/VersionInfo.vue'

const router = useRouter()
const toast = useToast()
const { login } = useAuth()

const infoPopoverRef = ref<InstanceType<typeof Popover> | null>(null)

function toggleInfoPopover(event: Event) {
  infoPopoverRef.value?.toggle(event)
}

const username = ref('')
const password = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

async function handleSubmit() {
  if (!username.value || !password.value) {
    errorMessage.value = 'Please enter username and password'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  const result = await login(username.value, password.value)

  isLoading.value = false

  if (result.success) {
    // Check if 2FA is required
    if (result.totpRequired) {
      // Redirect to TOTP verification page, preserving the original redirect
      const redirect = router.currentRoute.value.query.redirect as string
      router.push({
        name: 'totp-verify',
        query: redirect ? { redirect } : undefined,
      })
      return
    }

    toast.add({
      severity: 'success',
      summary: 'Login successful',
      life: 3000,
    })
    // Navigate to the redirect URL or home
    const redirect = router.currentRoute.value.query.redirect as string
    router.replace(redirect || '/')
  } else {
    errorMessage.value = result.error || 'Login failed'
  }
}
</script>

<template>
  <div class="login-page">
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

    <div class="login-container">
      <Card class="login-card">
        <template #title>
          <div class="login-title">
            <h1>Soeji</h1>
            <p class="login-subtitle">Sign in to continue</p>
          </div>
        </template>
        <template #content>
          <form @submit.prevent="handleSubmit">
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
                :feedback="false"
                toggleMask
                autocomplete="current-password"
                :disabled="isLoading"
                fluid
              />
            </div>

            <div v-if="errorMessage" class="error-message">
              {{ errorMessage }}
            </div>

            <Button
              type="submit"
              label="Sign in"
              :loading="isLoading"
              fluid
              class="mt-4"
            />
          </form>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.login-page {
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

.login-container {
  width: 100%;
  max-width: 24rem;
}

.login-card {
  width: 100%;
}

.login-title {
  text-align: center;
}

.login-title h1 {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
  color: var(--p-primary-color);
}

.login-subtitle {
  margin: 0.5rem 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.error-message {
  color: var(--p-red-500);
  font-size: 0.875rem;
  text-align: center;
}

</style>
