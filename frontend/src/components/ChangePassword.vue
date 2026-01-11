<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
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
    :breakpoints="{ '480px': '90vw' }"
    :pt="dialogPt"
  >
    <form @submit.prevent="handleSubmit">
      <div class="field">
        <label for="current-password">Current Password</label>
        <Password
          v-model="currentPassword"
          inputId="current-password"
          :feedback="false"
          toggleMask
          autocomplete="current-password"
          :disabled="isLoading"
          fluid
        />
      </div>

      <div class="field">
        <label for="new-password">New Password</label>
        <Password
          v-model="newPassword"
          inputId="new-password"
          :feedback="true"
          toggleMask
          autocomplete="new-password"
          :disabled="isLoading"
          fluid
        />
        <small>Must be at least 8 characters</small>
      </div>

      <div class="field">
        <label for="confirm-password">Confirm New Password</label>
        <Password
          v-model="confirmPassword"
          inputId="confirm-password"
          :feedback="false"
          toggleMask
          autocomplete="new-password"
          :disabled="isLoading"
          fluid
        />
      </div>

      <Message v-if="errorMessage" severity="error" :closable="false">
        {{ errorMessage }}
      </Message>
    </form>

    <template #footer>
      <div class="flex justify-content-end gap-2">
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
</style>
