<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useAuth } from '../composables/useAuth'

const API_BASE = import.meta.env.VITE_API_BASE || ''

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const router = useRouter()
const toast = useToast()
const { logout, getAuthHeader, clearMustChangePassword, getTemporaryPassword } = useAuth()

// Visual viewport handling for keyboard
const dialogMarginTop = ref<string | null>(null)

function updateDialogPosition() {
  if (window.visualViewport) {
    const viewportHeight = window.visualViewport.height
    const heightDiff = window.innerHeight - viewportHeight

    if (heightDiff > 100) {
      dialogMarginTop.value = `-${heightDiff}px`
    } else {
      dialogMarginTop.value = null
    }
  } else {
    dialogMarginTop.value = null
  }
}

onMounted(() => {
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateDialogPosition)
    window.visualViewport.addEventListener('scroll', updateDialogPosition)
  }
})

onUnmounted(() => {
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', updateDialogPosition)
    window.visualViewport.removeEventListener('scroll', updateDialogPosition)
  }
})

const dialogPt = computed(() => ({
  root: dialogMarginTop.value
    ? { style: { marginTop: dialogMarginTop.value } }
    : {}
}))

const newPassword = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const isLoggingOut = ref(false)
const errorMessage = ref('')

// Check if we have a temporary password from login
const hasTemporaryPassword = computed(() => getTemporaryPassword() !== null)

// Clear form when dialog opens
watch(() => props.visible, (visible) => {
  if (visible) {
    clearForm()
  }
})

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

    emit('update:visible', false)
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
    emit('update:visible', false)
    router.replace('/login')
  } finally {
    isLoggingOut.value = false
  }
}

function clearForm() {
  newPassword.value = ''
  confirmPassword.value = ''
  errorMessage.value = ''
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Password Change Required"
    modal
    :closable="false"
    :closeOnEscape="false"
    :breakpoints="{ '480px': '90vw' }"
    :pt="dialogPt"
  >
    <div class="dialog-content">
      <Message severity="warn" :closable="false" class="info-message">
        Your password must be changed before continuing.
      </Message>

      <form class="password-form" @submit.prevent="handleSubmit">
        <div class="form-field">
          <label for="force-new-password">New Password</label>
          <Password
            v-model="newPassword"
            inputId="force-new-password"
            :feedback="true"
            toggleMask
            autocomplete="new-password"
            :disabled="isLoading || isLoggingOut"
            inputClass="w-full"
            class="w-full"
          />
          <small class="hint">Must be at least 8 characters</small>
        </div>

        <div class="form-field">
          <label for="force-confirm-password">Confirm New Password</label>
          <Password
            v-model="confirmPassword"
            inputId="force-confirm-password"
            :feedback="false"
            toggleMask
            autocomplete="new-password"
            :disabled="isLoading || isLoggingOut"
            inputClass="w-full"
            class="w-full"
          />
        </div>

        <Message v-if="errorMessage" severity="error" :closable="false">
          {{ errorMessage }}
        </Message>
      </form>
    </div>

    <template #footer>
      <div class="dialog-footer">
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
          :disabled="isLoggingOut || !hasTemporaryPassword"
          @click="handleSubmit"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.info-message {
  margin: 0;
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

.dialog-footer {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.w-full {
  width: 100%;
}

:deep(.p-password) {
  width: 100%;
}

:deep(.p-password-input) {
  width: 100%;
}
</style>
