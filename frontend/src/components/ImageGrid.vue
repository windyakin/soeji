<script setup lang="ts">
import type { SearchHit } from "../types/api";

defineProps<{
  images: SearchHit[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  select: [index: number];
}>();

function handleImageClick(index: number) {
  emit("select", index);
}
</script>

<template>
  <!-- Show empty state only when not loading and no images -->
  <div v-if="!loading && images.length === 0" class="empty-container">
    <i class="pi pi-images" style="font-size: 3rem; opacity: 0.5"></i>
    <p>No images found</p>
  </div>

  <!-- Show grid with optional loading overlay -->
  <div v-else class="image-grid-container">
    <div class="image-grid" :class="{ 'is-loading': loading }">
      <div
        v-for="(image, index) in images"
        :key="image.id"
        class="image-tile"
        @click="handleImageClick(index)"
      >
        <div class="image-wrapper">
          <img :src="image.s3Url" :alt="image.filename" loading="lazy" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--p-surface-500);
  gap: 1rem;
}

.image-grid-container {
  position: relative;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(200px, calc(50% - 0.5rem)), 1fr));
  gap: 0.6rem;
  transition: opacity 0.15s ease;
}

.image-grid.is-loading {
  opacity: 0.6;
  pointer-events: none;
}

.image-tile {
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 8px;
  background: var(--p-surface-100);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.image-tile:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.image-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
