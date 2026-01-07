<script setup lang="ts">
import { onMounted, computed } from 'vue'
import Toast from 'primevue/toast'
import PwaUpdatePrompt from "./components/PwaUpdatePrompt.vue"
import PinModal from "./components/PinModal.vue"
import ForceChangePassword from "./components/ForceChangePassword.vue"
import { usePinProtection } from "./composables/usePinProtection"
import { useAuth } from "./composables/useAuth"

const { needsUnlock, setupVisibilityListener } = usePinProtection()
const { mustChangePassword, isAuthenticated, authEnabled } = useAuth()

// Show force change password modal when user is authenticated and needs to change password
const showForceChangePassword = computed(() => {
  return authEnabled.value && isAuthenticated.value && mustChangePassword.value
})

onMounted(() => {
  // Set up listener to lock app when it goes to background
  setupVisibilityListener()
})
</script>

<template>
  <Toast position="bottom-center" :breakpoints="{ '480px': { width: '90vw' } }" />
  <router-view v-if="!needsUnlock" />
  <PinModal :visible="needsUnlock" />
  <ForceChangePassword :visible="showForceChangePassword" />
  <PwaUpdatePrompt />
</template>

