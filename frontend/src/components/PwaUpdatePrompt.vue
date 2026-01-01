<script setup lang="ts">
import { usePwaUpdate } from "../composables/usePwaUpdate";
import Button from "primevue/button";

const {
  needRefresh,
  offlineReady,
  updateServiceWorker,
  dismissUpdate,
  dismissOfflineReady,
} = usePwaUpdate();
</script>

<template>
  <Teleport to="body">
    <!-- Update available notification -->
    <Transition name="slide-up">
      <div v-if="needRefresh" class="pwa-prompt">
        <div class="pwa-prompt-content">
          <i class="pi pi-refresh pwa-prompt-icon"></i>
          <div class="pwa-prompt-text">
            <span class="pwa-prompt-title">新しいバージョンが利用可能です</span>
            <span class="pwa-prompt-description">更新して最新版をお使いください</span>
          </div>
        </div>
        <div class="pwa-prompt-actions">
          <Button
            label="後で"
            severity="secondary"
            text
            size="small"
            @click="dismissUpdate"
          />
          <Button
            label="更新する"
            severity="primary"
            size="small"
            @click="updateServiceWorker"
          />
        </div>
      </div>
    </Transition>

    <!-- Offline ready notification -->
    <Transition name="slide-up">
      <div v-if="offlineReady && !needRefresh" class="pwa-prompt pwa-prompt-offline">
        <div class="pwa-prompt-content">
          <i class="pi pi-check-circle pwa-prompt-icon"></i>
          <div class="pwa-prompt-text">
            <span class="pwa-prompt-title">オフライン対応完了</span>
            <span class="pwa-prompt-description">オフラインでも使用できます</span>
          </div>
        </div>
        <div class="pwa-prompt-actions">
          <Button
            label="OK"
            severity="secondary"
            text
            size="small"
            @click="dismissOfflineReady"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pwa-prompt {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 0.75rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  max-width: calc(100vw - 2rem);
}

.pwa-prompt-offline {
  background: var(--p-green-50);
  border-color: var(--p-green-200);
}

.pwa-prompt-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.pwa-prompt-icon {
  font-size: 1.5rem;
  color: var(--p-primary-color);
}

.pwa-prompt-offline .pwa-prompt-icon {
  color: var(--p-green-500);
}

.pwa-prompt-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.pwa-prompt-title {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--p-surface-900);
}

.pwa-prompt-description {
  font-size: 0.75rem;
  color: var(--p-surface-500);
}

.pwa-prompt-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

/* Slide up animation */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(1rem);
}

/* Responsive */
@media (max-width: 480px) {
  .pwa-prompt {
    flex-direction: column;
    align-items: stretch;
    left: 1rem;
    right: 1rem;
    transform: none;
    max-width: none;
  }

  .pwa-prompt-actions {
    justify-content: flex-end;
  }

  .slide-up-enter-from,
  .slide-up-leave-to {
    transform: translateY(1rem);
  }
}
</style>
