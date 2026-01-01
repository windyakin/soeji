<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useConfirm } from "primevue/useconfirm";
import Drawer from "primevue/drawer";
import ConfirmDialog from "primevue/confirmdialog";
import Button from "primevue/button";
import Tag from "primevue/tag";
import type { SearchHit } from "../types/api";
import { deleteImage } from "../composables/useApi";

const props = defineProps<{
  image: SearchHit | null;
  visible: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  searchTag: [tag: string];
  deleted: [imageId: string];
  shown: [];
}>();

// Emit shown event after drawer opens to allow parent to restore focus
watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      await nextTick();
      // Small delay to let drawer animation start
      setTimeout(() => {
        emit("shown");
      }, 50);
    }
  }
);

const confirm = useConfirm();
const deleting = ref(false);
const isMobile = ref(false);

const drawerVisible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

const drawerPosition = computed(() => (isMobile.value ? "bottom" : "right"));

const drawerStyle = computed(() => {
  if (isMobile.value) {
    return { height: "90vh", width: "100%" };
  }
  return { width: "400px" };
});

function checkMobile() {
  isMobile.value = window.innerWidth <= 768;
}

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
});

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function close() {
  emit("update:visible", false);
}

function handleTagClick(tag: string, prefix?: string) {
  const prefixedTag = prefix ? `${prefix}:${tag}` : tag;
  emit("searchTag", prefixedTag);
  close();
}

function handleDelete() {
  if (!props.image) return;

  confirm.require({
    message: "Are you sure you want to delete this image?",
    header: "Delete Image",
    icon: "pi pi-exclamation-triangle",
    rejectProps: {
      label: "Cancel",
      severity: "secondary",
      outlined: true,
    },
    acceptProps: {
      label: "Delete",
      severity: "danger",
    },
    accept: async () => {
      if (!props.image) return;
      deleting.value = true;
      try {
        await deleteImage(props.image.id);
        emit("deleted", props.image.id);
        close();
      } catch (error) {
        console.error("Failed to delete image:", error);
      } finally {
        deleting.value = false;
      }
    },
  });
}
</script>

<template>
  <Drawer
    v-model:visible="drawerVisible"
    :position="drawerPosition"
    :style="drawerStyle"
    header="Image Details"
    :modal="isMobile"
    :dismissable="isMobile"
    :closeOnEscape="false"
    :blockScroll="false"
  >
    <div v-if="image" class="info-content">
      <!-- Basic info -->
      <div class="info-section">
        <h4>File Information</h4>
        <div class="info-grid">
          <div class="info-label">Filename</div>
          <div class="info-value">{{ image.filename }}</div>

          <div class="info-label">Dimensions</div>
          <div class="info-value">
            {{ image.width || "?" }} x {{ image.height || "?" }}
          </div>

          <div class="info-label">Seed</div>
          <div class="info-value">{{ image.seed ?? "N/A" }}</div>

          <div class="info-label">Created</div>
          <div class="info-value">{{ formatDate(image.createdAt) }}</div>
        </div>
      </div>

      <!-- Prompt -->
      <div v-if="image.prompt" class="info-section">
        <h4>Prompt</h4>
        <div class="prompt-text">{{ image.prompt }}</div>
      </div>

      <!-- V4 Base Caption -->
      <div v-if="image.v4BaseCaption" class="info-section">
        <h4>V4 Base Caption</h4>
        <div class="prompt-text">{{ image.v4BaseCaption }}</div>
      </div>

      <!-- V4 Character Captions -->
      <div v-if="image.v4CharCaptions" class="info-section">
        <h4>V4 Character Captions</h4>
        <div class="prompt-text">{{ image.v4CharCaptions }}</div>
      </div>

      <!-- Positive Tags -->
      <div v-if="image.positiveTags?.length" class="info-section">
        <h4>Positive Tags</h4>
        <div class="tags-container">
          <Tag
            v-for="tag in image.positiveTags"
            :key="tag"
            :value="tag"
            severity="success"
            class="tag-item clickable"
            @click="handleTagClick(tag, 'p')"
          />
        </div>
      </div>

      <!-- User Tags -->
      <div v-if="image.userTags?.length" class="info-section">
        <h4>User Tags</h4>
        <div class="tags-container">
          <Tag
            v-for="tag in image.userTags"
            :key="tag"
            :value="tag"
            severity="info"
            class="tag-item clickable"
            @click="handleTagClick(tag, 'u')"
          />
        </div>
      </div>

      <!-- Negative Tags -->
      <div v-if="image.negativeTags?.length" class="info-section">
        <h4>Negative Tags</h4>
        <div class="tags-container">
          <Tag
            v-for="tag in image.negativeTags"
            :key="tag"
            :value="tag"
            severity="danger"
            class="tag-item"
          />
        </div>
      </div>

      <!-- S3 URL -->
      <div class="info-section">
        <h4>Image URL</h4>
        <a :href="image.s3Url" target="_blank" class="url-link">
          {{ image.s3Url }}
        </a>
      </div>

      <!-- Delete button -->
      <div class="info-section delete-section">
        <Button
          label="Delete Image"
          icon="pi pi-trash"
          severity="danger"
          :loading="deleting"
          @click="handleDelete"
        />
      </div>
    </div>
  </Drawer>
  <ConfirmDialog />
</template>

<style scoped>
.info-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.info-section h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-surface-500);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 1rem;
}

.info-label {
  font-weight: 500;
  color: var(--p-surface-500);
}

.info-value {
  word-break: break-word;
}

.prompt-text {
  background: var(--p-surface-100);
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tag-item {
  font-size: 0.75rem;
}

.tag-item.clickable {
  cursor: pointer;
  transition: transform 0.1s, opacity 0.1s;
}

.tag-item.clickable:hover {
  transform: scale(1.05);
  opacity: 0.9;
}

.url-link {
  color: var(--p-primary-color);
  font-size: 0.875rem;
  word-break: break-all;
}

.delete-section {
  border-top: 1px solid var(--p-surface-200);
  padding-top: 1rem;
  margin-top: 0.5rem;
}
</style>
