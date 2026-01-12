<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import Button from "primevue/button";
import ProgressBar from "primevue/progressbar";
import type { UploadItem } from "../../types/upload";
import { useUpload } from "../../composables/useUpload";

const props = defineProps<{
  item: UploadItem;
}>();

const { removeItem } = useUpload();

const canCancel = computed(() => props.item.status === "pending" || props.item.status === "uploading");

function handleCancel() {
  removeItem(props.item.id);
}

// Generate preview URL from file
const previewUrl = ref<string | null>(null);

onMounted(() => {
  previewUrl.value = URL.createObjectURL(props.item.file);
});

onUnmounted(() => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
  }
});

const statusIcon = computed(() => {
  switch (props.item.status) {
    case "pending":
      return "pi-clock";
    case "uploading":
      return "pi-spin pi-spinner";
    case "success":
      return "pi-check-circle";
    case "duplicate":
      return "pi-copy";
    case "error":
      return "pi-times-circle";
    default:
      return "pi-file";
  }
});

const statusClass = computed(() => `status-${props.item.status}`);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <div class="flex align-items-center gap-3 p-3 border-round mb-2" :class="[statusClass, 'queue-item']">
    <div class="item-preview flex-shrink-0">
      <img v-if="previewUrl" :src="previewUrl" alt="" class="preview-image" />
      <div class="item-status-icon">
        <i :class="['pi', statusIcon]"></i>
      </div>
    </div>
    <div class="flex-grow-1 min-w-0">
      <div class="item-header">
        <div class="item-name text-overflow-ellipsis white-space-nowrap overflow-hidden font-medium text-sm">{{ item.file.name }}</div>
        <div class="item-size text-xs">{{ formatFileSize(item.file.size) }}</div>
      </div>
      <div v-if="item.status === 'uploading'" class="mt-1">
        <ProgressBar :value="item.progress" :showValue="false" style="height: 4px" />
      </div>
      <div v-if="item.error" class="item-error text-xs mt-1">{{ item.error }}</div>
      <div v-if="item.status === 'duplicate'" class="item-duplicate text-xs mt-1">
        Duplicate - already exists
      </div>
    </div>
    <Button
      v-if="canCancel"
      icon="pi pi-times"
      size="small"
      severity="secondary"
      text
      rounded
      aria-label="Cancel"
      class="flex-shrink-0"
      @click="handleCancel"
    />
  </div>
</template>

<style scoped>
.queue-item {
  background: var(--p-surface-100);
}

.dark-mode .queue-item {
  background: var(--p-surface-800);
}

.item-preview {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--p-surface-200);
}

.dark-mode .item-preview {
  background: var(--p-surface-700);
}

.item-status-icon {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--p-surface-0);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.dark-mode .item-status-icon {
  background: var(--p-surface-800);
}

.status-pending .item-status-icon {
  color: var(--p-surface-400);
}
.status-uploading .item-status-icon {
  color: var(--p-primary-color);
}
.status-success .item-status-icon {
  color: var(--p-green-500);
}
.status-duplicate .item-status-icon {
  color: var(--p-yellow-500);
}
.status-error .item-status-icon {
  color: var(--p-red-500);
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

@media (min-width: 640px) {
  .item-header {
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
  }
}

.item-name {
  color: var(--p-surface-700);
}

.dark-mode .item-name {
  color: var(--p-surface-200);
}

.item-size {
  color: var(--p-surface-500);
  flex-shrink: 0;
}

.dark-mode .item-size {
  color: var(--p-surface-400);
}

.item-error {
  color: var(--p-red-500);
}

.item-duplicate {
  color: var(--p-yellow-600);
}

.dark-mode .item-duplicate {
  color: var(--p-yellow-400);
}
</style>
