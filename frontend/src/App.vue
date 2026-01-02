<script setup lang="ts">
import { onMounted } from 'vue'
import PwaUpdatePrompt from "./components/PwaUpdatePrompt.vue"
import PinModal from "./components/PinModal.vue"
import { usePinProtection } from "./composables/usePinProtection"

const { needsUnlock, setupVisibilityListener } = usePinProtection()

onMounted(() => {
  // アプリがバックグラウンドに行った時にロックするリスナーを設定
  setupVisibilityListener()
})
</script>

<template>
  <router-view v-if="!needsUnlock" />
  <PinModal :visible="needsUnlock" />
  <PwaUpdatePrompt />
</template>

<style scoped>
</style>
