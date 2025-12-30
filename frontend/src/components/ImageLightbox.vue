<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import Button from "primevue/button";
import type { SearchHit } from "../types/api";

const props = defineProps<{
  images: SearchHit[];
  currentIndex: number;
  visible: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  "update:currentIndex": [value: number];
  showInfo: [image: SearchHit];
  loadMore: [];
}>();

const overlayRef = ref<HTMLElement | null>(null);

const currentImage = computed(() => props.images[props.currentIndex]);

// Focus the overlay when it becomes visible
watch(
  () => props.visible,
  async (isVisible) => {
    if (isVisible) {
      await nextTick();
      overlayRef.value?.focus();
    }
  }
);

const hasPrev = computed(() => props.currentIndex > 0);
const hasNext = computed(() => props.currentIndex < props.images.length - 1);
const isAtEnd = computed(() => props.currentIndex === props.images.length - 1);
const canLoadMore = computed(() => isAtEnd.value && props.hasMore && !props.loadingMore);

function close() {
  emit("update:visible", false);
}

function prev() {
  if (hasPrev.value) {
    emit("update:currentIndex", props.currentIndex - 1);
  }
}

async function next() {
  if (hasNext.value) {
    emit("update:currentIndex", props.currentIndex + 1);
  } else if (canLoadMore.value) {
    // At the last image, try to load more
    emit("loadMore");
  }
}

// Watch for new images loaded and automatically advance
watch(
  () => props.images.length,
  (newLength, oldLength) => {
    // If we were at the end and new images were loaded, advance to the next one
    if (props.visible && isAtEnd.value && newLength > oldLength) {
      emit("update:currentIndex", props.currentIndex + 1);
    }
  }
);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    close();
  } else if (e.key === "ArrowLeft") {
    prev();
  } else if (e.key === "ArrowRight") {
    next();
  }
}

function handleNavClick(e: MouseEvent, area: "left" | "right") {
  e.stopPropagation();
  if (area === "left") {
    prev();
  } else {
    next();
  }
}

function showInfo() {
  if (currentImage.value) {
    emit("showInfo", currentImage.value);
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="visible && currentImage"
        class="lightbox-overlay"
        @keydown="handleKeydown"
        tabindex="0"
        ref="overlayRef"
      >
        <!-- Close button -->
        <div class="lightbox-header">
          <Button
            icon="pi pi-info-circle"
            severity="secondary"
            text
            rounded
            class="header-button"
            @click="showInfo"
            aria-label="Show image info"
          />
          <Button
            icon="pi pi-times"
            severity="secondary"
            text
            rounded
            class="header-button"
            @click="close"
            aria-label="Close lightbox"
          />
        </div>

        <!-- Navigation areas -->
        <div
          class="nav-area nav-left"
          :class="{ disabled: !hasPrev }"
          @click="(e) => handleNavClick(e, 'left')"
        >
          <i v-if="hasPrev" class="pi pi-chevron-left nav-icon"></i>
        </div>

        <div
          class="nav-area nav-right"
          :class="{ disabled: !hasNext && !canLoadMore, loading: loadingMore }"
          @click="(e) => handleNavClick(e, 'right')"
        >
          <i v-if="loadingMore" class="pi pi-spin pi-spinner nav-icon"></i>
          <i v-else-if="hasNext || canLoadMore" class="pi pi-chevron-right nav-icon"></i>
        </div>

        <!-- Image container -->
        <div class="lightbox-content">
          <img
            :src="currentImage.s3Url"
            :alt="currentImage.filename"
            class="lightbox-image"
          />
        </div>

        <!-- Image counter -->
        <div class="lightbox-footer">
          <span class="image-counter">
            {{ currentIndex + 1 }} / {{ images.length }}
            <span v-if="hasMore" class="more-indicator">+</span>
          </span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.95);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
}

.lightbox-header {
  position: absolute;
  top: 0;
  right: 0;
  padding: 1rem;
  display: flex;
  gap: 0.5rem;
  z-index: 10;
}

.header-button {
  color: white !important;
  background: rgba(255, 255, 255, 0.1) !important;
}

.header-button:hover {
  background: rgba(255, 255, 255, 0.2) !important;
}

.nav-area {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 20%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 5;
  transition: background 0.2s;
}

.nav-area:not(.disabled):hover {
  background: rgba(255, 255, 255, 0.05);
}

.nav-area.disabled {
  cursor: default;
}

.nav-area.loading {
  cursor: wait;
}

.nav-left {
  left: 0;
  padding-left: 1rem;
  justify-content: flex-start;
}

.nav-right {
  right: 0;
  padding-right: 1rem;
  justify-content: flex-end;
}

.nav-icon {
  font-size: 2rem;
  color: white;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.nav-area:not(.disabled):hover .nav-icon {
  opacity: 1;
}

.lightbox-content {
  max-width: 90%;
  max-height: 90%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lightbox-image {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.lightbox-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1rem;
  text-align: center;
}

.image-counter {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.875rem;
}

.more-indicator {
  color: rgba(255, 255, 255, 0.5);
}

/* Transitions */
.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 0.2s ease;
}

.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}
</style>
