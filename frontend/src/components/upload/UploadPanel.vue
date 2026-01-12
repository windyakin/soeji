<script setup lang="ts">
import { ref, computed } from "vue";
import Button from "primevue/button";
import ProgressBar from "primevue/progressbar";
import UploadQueueItem from "./UploadQueueItem.vue";
import { useUpload } from "../../composables/useUpload";
import type { UploadItem } from "../../types/upload";

const {
  queue,
  isUploading,
  totalProgress,
  hasItems,
  addFiles,
  clearCompleted,
  completedCount,
} = useUpload();

// Sort queue: uploading first, then pending, then completed (success/duplicate/error)
// Within completed items, sort by completedAt descending (newest first)
const sortedQueue = computed<UploadItem[]>(() => {
  const statusOrder: Record<string, number> = {
    uploading: 0,
    duplicate: 2,
    error: 2,
    pending: 3,
    success: 4,
  };
  return [...queue.value].sort((a, b) => {
    const orderDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    // For completed items (success/duplicate), sort by completedAt descending
    if (a.completedAt && b.completedAt) {
      return b.completedAt - a.completedAt;
    }
    return 0;
  });
});

const hasCompleted = computed(() => completedCount.value > 0);

const isDragOver = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

function handleDragOver(event: DragEvent) {
  event.preventDefault();
  isDragOver.value = true;
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault();
  isDragOver.value = false;
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  isDragOver.value = false;

  if (event.dataTransfer?.files) {
    addFiles(event.dataTransfer.files);
  }
}

function handleClick() {
  fileInputRef.value?.click();
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    addFiles(input.files);
    input.value = ""; // Reset for re-selection
  }
}
</script>

<template>
  <div class="flex flex-column gap-3 p-3" style="max-height: 80vh">
    <div
      class="upload-drop-zone w-full"
      :class="{ 'drag-over': isDragOver }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      @click="handleClick"
    >
      <input
        ref="fileInputRef"
        type="file"
        accept="image/png"
        multiple
        hidden
        @change="handleFileSelect"
      />

      <div class="text-center">
        <i class="pi pi-cloud-upload text-5xl mb-3" style="color: var(--p-surface-400)"></i>
        <p class="m-0 drop-zone-text">Drag and drop PNG files here</p>
        <p class="mt-2 mb-0 text-sm" style="color: var(--p-surface-500)">or click to browse</p>
      </div>
    </div>

    <div v-if="hasItems">
      <div class="flex justify-content-between align-items-center text-sm queue-header">
        <span>{{ queue.length }} file{{ queue.length !== 1 ? 's' : '' }}</span>
        <div class="flex align-items-center gap-2">
          <span v-if="isUploading">Uploading... {{ totalProgress }}%</span>
          <Button
            v-if="hasCompleted && !isUploading"
            label="Clear"
            icon="pi pi-trash"
            size="small"
            severity="secondary"
            text
            @click="clearCompleted"
          />
        </div>
      </div>
      <ProgressBar v-if="isUploading" :value="totalProgress" :showValue="false" class="mt-2" />
    </div>

    <div v-if="hasItems" class="overflow-y-auto" style="max-height: 300px">
      <UploadQueueItem v-for="item in sortedQueue" :key="item.id" :item="item" />
    </div>
  </div>
</template>

<style scoped>
.upload-drop-zone {
  border: 2px dashed var(--p-surface-300);
  border-radius: 8px;
  padding: 2rem;
  cursor: pointer;
  transition: all 0.2s;
}

.dark-mode .upload-drop-zone {
  border-color: var(--p-surface-600);
}

.upload-drop-zone:hover,
.upload-drop-zone.drag-over {
  border-color: var(--p-primary-color);
  background: var(--p-primary-50);
}

.dark-mode .upload-drop-zone:hover,
.dark-mode .upload-drop-zone.drag-over {
  background: var(--p-surface-800);
}

.drop-zone-text {
  color: var(--p-surface-700);
}

.dark-mode .drop-zone-text {
  color: var(--p-surface-300);
}

.queue-header {
  color: var(--p-surface-600);
}

.dark-mode .queue-header {
  color: var(--p-surface-400);
}
</style>
