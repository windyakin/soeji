<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import PinSettings from '../components/PinSettings.vue'
import FullscreenSettings from '../components/FullscreenSettings.vue'
import VersionInfo from '../components/VersionInfo.vue'

const router = useRouter()

function goBack() {
  router.replace('/')
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-container">
      <header class="settings-header">
        <div class="settings-header-inner">
          <Button
            icon="pi pi-arrow-left"
            text
            rounded
            @click="goBack"
            aria-label="Back"
          />
          <h1>Settings</h1>
        </div>
      </header>

      <div class="settings-content">
        <PinSettings />
        <FullscreenSettings />
        <VersionInfo />
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: var(--p-surface-0);
}

.settings-container {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1rem 0.65rem;
}

.settings-header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 10;
  background: var(--p-surface-0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.settings-header-inner {
  display: flex;
  align-items: center;
  gap: 1rem;
  max-width: 48rem;
  margin: 0 auto;
  padding: 0.5rem 0.65rem;
}

.settings-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--p-text-color);
  margin: 0;
}

@media (max-width: 768px) {
  .settings-header h1 {
    font-size: 1.25rem;
  }
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding-top: 3rem;
}
</style>
