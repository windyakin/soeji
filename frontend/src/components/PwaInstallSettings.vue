<script setup lang="ts">
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { usePwaInstall } from '../composables/usePwaInstall'
import { useBackButtonClose } from '../composables/useBackButtonClose'
import SettingsCard from './SettingsCard.vue'

const {
  canInstall,
  isInstalled,
  isIos,
  isStandalone,
  showIosInstallGuide,
  promptInstall,
  dismissIosGuide
} = usePwaInstall()

// Close dialog on browser back button
useBackButtonClose(showIosInstallGuide, 'ios-install-guide', () => {
  dismissIosGuide()
})

async function handleInstall() {
  await promptInstall()
}
</script>

<template>
  <SettingsCard header="App">
    <!-- 既にインストール済み（スタンドアロンモード） -->
    <div v-if="isStandalone" class="settings-item">
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-check-circle item-icon" style="color: var(--p-green-500);"></i>
          <span class="item-label">Installed as App</span>
        </div>
        <Tag severity="success" value="Active" />
      </div>
    </div>

    <!-- インストール可能（非iOS） -->
    <button
      v-else-if="canInstall && !isIos"
      class="settings-item clickable"
      @click="handleInstall"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-download item-icon"></i>
          <span class="item-label">Install App</span>
        </div>
        <div class="item-right">
          <Tag severity="info" value="Available" />
          <i class="pi pi-chevron-right item-chevron"></i>
        </div>
      </div>
    </button>

    <!-- iOS用インストールガイド -->
    <button
      v-else-if="canInstall && isIos"
      class="settings-item clickable"
      @click="handleInstall"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-apple item-icon"></i>
          <span class="item-label">Add to Home Screen</span>
        </div>
        <div class="item-right">
          <i class="pi pi-chevron-right item-chevron"></i>
        </div>
      </div>
    </button>

    <!-- インストール不可（ブラウザが非対応など） -->
    <div v-else-if="!isInstalled && !canInstall" class="settings-item">
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-info-circle item-icon" style="color: var(--p-text-muted-color);"></i>
          <div class="item-text">
            <span class="item-label">Install App</span>
            <span class="item-description">Not supported in this browser</span>
          </div>
        </div>
      </div>
    </div>

    <!-- iOS インストールガイドダイアログ -->
    <Dialog
      v-model:visible="showIosInstallGuide"
      modal
      header="Add to Home Screen"
      :style="{ width: '90vw', maxWidth: '400px' }"
    >
      <div class="ios-guide">
        <ol class="ios-guide-steps">
          <li>
            <div class="step-content">
              <span>Tap the</span>
              <i class="pi pi-ellipsis-h menu-icon"></i>
              <span>menu button at bottom right</span>
            </div>
          </li>
          <li>
            <div class="step-content">
              <span>Select "Share" then tap "More"</span>
            </div>
          </li>
          <li>
            <div class="step-content">
              <span>Select "Add to Home Screen"</span>
            </div>
          </li>
          <li>
            <div class="step-content">
              <span>Tap "Add" to complete</span>
            </div>
          </li>
        </ol>
      </div>
      <template #footer>
        <Button label="Close" @click="dismissIosGuide" />
      </template>
    </Dialog>
  </SettingsCard>
</template>

<style scoped>
.ios-guide {
  padding: 0.5rem 0;
}

.ios-guide-steps {
  margin: 0;
  padding: 0 0 0 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ios-guide-steps li {
  font-size: 0.9375rem;
  line-height: 1.5;
}

.step-content {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  background: var(--p-surface-200);
  color: var(--p-text-color);
  border-radius: 0.375rem;
  font-size: 0.875rem;
}
</style>
