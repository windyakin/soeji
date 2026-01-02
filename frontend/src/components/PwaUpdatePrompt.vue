<script setup lang="ts">
import { onMounted, watch } from "vue";
import Toast from "primevue/toast";
import Button from "primevue/button";
import { useToast } from "primevue/usetoast";
import { usePwaUpdate } from "../composables/usePwaUpdate";

const toast = useToast();

const {
  needRefresh,
  offlineReady,
  checkForUpdates,
  updateServiceWorker,
  dismissUpdate,
  dismissOfflineReady,
} = usePwaUpdate();

function showUpdateToast() {
  toast.add({
    severity: "info",
    summary: "Update Available",
    detail: "A new version is available. Refresh to update.",
    group: "pwa-update",
    closable: false,
  });
}

function showOfflineReadyToast() {
  toast.add({
    severity: "success",
    summary: "Offline Ready",
    detail: "The app is ready to work offline.",
    life: 5000,
  });
  dismissOfflineReady();
}

function handleUpdate() {
  toast.removeGroup("pwa-update");
  updateServiceWorker();
}

function handleDismiss() {
  toast.removeGroup("pwa-update");
  dismissUpdate();
}

// Watch for update availability
watch(needRefresh, (value) => {
  if (value) {
    showUpdateToast();
  }
});

// Watch for offline ready
watch(offlineReady, (value) => {
  if (value && !needRefresh.value) {
    showOfflineReadyToast();
  }
});

// Check for updates on mount
onMounted(() => {
  checkForUpdates();
});

// Expose handlers for template
defineExpose({
  handleUpdate,
  handleDismiss,
});
</script>

<template>
  <Toast position="bottom-center" group="pwa-update" :breakpoints="{ '480px': { width: '90vw' } }">
    <template #message="slotProps">
      <div class="pwa-toast-content">
        <div class="pwa-toast-text">
          <i class="pi pi-sync pwa-toast-icon"></i>
          <div>
            <div class="pwa-toast-summary">{{ slotProps.message.summary }}</div>
            <div class="pwa-toast-detail">{{ slotProps.message.detail }}</div>
          </div>
        </div>
        <div class="pwa-toast-actions">
          <Button
            label="Later"
            severity="secondary"
            text
            size="small"
            @click="handleDismiss"
          />
          <Button
            label="Update"
            size="small"
            @click="handleUpdate"
          />
        </div>
      </div>
    </template>
  </Toast>
</template>

<style scoped>
.pwa-toast-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
}

.pwa-toast-text {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.pwa-toast-icon {
  font-size: 1.25rem;
  color: var(--p-primary-color);
  margin-top: 0.125rem;
}

.pwa-toast-summary {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.pwa-toast-detail {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-top: 0.125rem;
}

.pwa-toast-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
