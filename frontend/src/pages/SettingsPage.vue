<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import PinSettings from '../components/PinSettings.vue'

const router = useRouter()

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="settings-page min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="container mx-auto px-4 py-6 max-w-4xl">
      <div class="flex items-center gap-4 mb-6">
        <Button
          icon="pi pi-arrow-left"
          text
          rounded
          @click="goBack"
          aria-label="戻る"
        />
        <h1 class="text-3xl font-bold text-gray-800 dark:text-white">
          設定
        </h1>
      </div>

      <div class="flex flex-col gap-6">
        <PinSettings />
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  min-height: 100vh;
}
</style>
