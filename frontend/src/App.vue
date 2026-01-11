<script setup lang="ts">
import { onMounted } from 'vue'
import Toast from 'primevue/toast'
import PwaUpdatePrompt from "./components/PwaUpdatePrompt.vue"
import PinModal from "./components/PinModal.vue"
import { usePinProtection } from "./composables/usePinProtection"

const { needsUnlock, setupVisibilityListener } = usePinProtection()

onMounted(() => {
  // Set up listener to lock app when it goes to background
  setupVisibilityListener()
})
</script>

<template>
  <Toast
    position="bottom-center"
    :breakpoints="{ '480px': { width: '90vw' } }"
    :pt="{ messageIcon: { style: 'margin-top: 0.2rem' } }"
  />
  <router-view v-if="!needsUnlock" />
  <PinModal :visible="needsUnlock" />
  <PwaUpdatePrompt />
</template>

