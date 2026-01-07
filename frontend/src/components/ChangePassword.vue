<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { changePassword } from '../composables/useApi'
import { useAuth } from '../composables/useAuth'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const router = useRouter()
const toast = useToast()
const { logout } = useAuth()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

// Clear form when dialog opens/closes
watch(() => props.visible, (visible) => {
  if (!visible) {
    clearForm()
  }
})

async function handleSubmit() {
  errorMessage.value = ''

  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
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

  isLoading.value = true

  const result = await changePassword(currentPassword.value, newPassword.value)

  isLoading.value = false

  if (result.success) {
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
  } else {
    errorMessage.value = result.error || 'Failed to change password'
  }
}

function clearForm() {
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  errorMessage.value = ''
}

function handleCancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    header="Change Password"
    modal
    :closable="!isLoading"
    :closeOnEscape="!isLoading"
    :style="{ width: '24rem' }"
  >
    <form class="password-form" @submit.prevent="handleSubmit">
      <div class="form-field">
        <label for="current-password">Current Password</label>
        <Password
          v-model="currentPassword"
          inputId="current-password"
          :feedback="false"
          toggleMask
          autocomplete="current-password"
          :disabled="isLoading"
          inputClass="w-full"
          class="w-full"
        />
      </div>

      <div class="form-field">
        <label for="new-password">New Password</label>
        <Password
          v-model="newPassword"
          inputId="new-password"
          :feedback="true"
          toggleMask
          autocomplete="new-password"
          :disabled="isLoading"
          inputClass="w-full"
          class="w-full"
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
          :disabled="isLoading"
          inputClass="w-full"
          class="w-full"
        />
      </div>

      <Message v-if="errorMessage" severity="error" :closable="false">
        {{ errorMessage }}
      </Message>
    </form>

    <template #footer>
      <div class="dialog-footer">
        <Button
          type="button"
          label="Cancel"
          severity="secondary"
          variant="outlined"
          :disabled="isLoading"
          @click="handleCancel"
        />
        <Button
          type="submit"
          label="Change Password"
          :loading="isLoading"
          @click="handleSubmit"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
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
  justify-content: flex-end;
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
