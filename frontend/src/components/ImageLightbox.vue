<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from "vue";
import Button from "primevue/button";
import type { SearchHit } from "../types/api";
import { getDownloadUrl } from "../utils/image";

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
const isImageLoading = ref(false);
const showLoadingSpinner = ref(false);
const isFullscreen = ref(false);
const showFullscreenControls = ref(false);
let fullscreenControlsTimeout: ReturnType<typeof setTimeout> | null = null;
let loadingSpinnerTimeout: ReturnType<typeof setTimeout> | null = null;
const loadingSpinnerDelay = 50; // ms before showing spinner

// Swipe handling
const touchStartX = ref(0);
const touchStartY = ref(0);
const isSwiping = ref(false);
const swipeThreshold = 50; // minimum distance for swipe

const currentImage = computed(() => props.images[props.currentIndex]);

const downloadUrl = computed(() => {
  if (!currentImage.value) return "";
  return getDownloadUrl(currentImage.value.s3Url);
});

// Reset loading state when image changes
watch(
  () => currentImage.value?.s3Url,
  () => {
    isImageLoading.value = true;
    showLoadingSpinner.value = false;

    // Clear existing timeout
    if (loadingSpinnerTimeout) {
      clearTimeout(loadingSpinnerTimeout);
    }

    // Show spinner after delay
    loadingSpinnerTimeout = setTimeout(() => {
      if (isImageLoading.value) {
        showLoadingSpinner.value = true;
      }
    }, loadingSpinnerDelay);
  }
);

function onImageLoad() {
  isImageLoading.value = false;
  showLoadingSpinner.value = false;
  if (loadingSpinnerTimeout) {
    clearTimeout(loadingSpinnerTimeout);
    loadingSpinnerTimeout = null;
  }
}

function onImageError() {
  isImageLoading.value = false;
  showLoadingSpinner.value = false;
  if (loadingSpinnerTimeout) {
    clearTimeout(loadingSpinnerTimeout);
    loadingSpinnerTimeout = null;
  }
}

// Lock body scroll when lightbox is visible
watch(
  () => props.visible,
  async (isVisible) => {
    if (isVisible) {
      // Prevent body scroll
      document.body.style.overflow = "hidden";
      await nextTick();
      overlayRef.value?.focus();
    } else {
      // Restore body scroll
      document.body.style.overflow = "";
    }
  }
);

// Clean up on unmount
onUnmounted(() => {
  document.body.style.overflow = "";
});

const hasPrev = computed(() => props.currentIndex > 0);
const hasNext = computed(() => props.currentIndex < props.images.length - 1);
const isAtEnd = computed(() => props.currentIndex === props.images.length - 1);
const canLoadMore = computed(() => isAtEnd.value && props.hasMore && !props.loadingMore);

// Throttle navigation to prevent double-click issues
const isNavigating = ref(false);
const navigationCooldown = 200; // ms

function close() {
  emit("update:visible", false);
}

function prev() {
  if (isNavigating.value || !hasPrev.value) return;

  isNavigating.value = true;
  emit("update:currentIndex", props.currentIndex - 1);

  setTimeout(() => {
    isNavigating.value = false;
  }, navigationCooldown);
}

function next() {
  if (isNavigating.value) return;

  if (hasNext.value) {
    isNavigating.value = true;
    emit("update:currentIndex", props.currentIndex + 1);

    setTimeout(() => {
      isNavigating.value = false;
    }, navigationCooldown);
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
    if (isFullscreen.value) {
      exitFullscreen();
    } else {
      close();
    }
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

async function enterFullscreen() {
  isFullscreen.value = true;
  showFullscreenControls.value = false;
  // フルスクリーン移行後にフォーカスを再設定
  await nextTick();
  overlayRef.value?.focus();
}

function exitFullscreen() {
  isFullscreen.value = false;
  showFullscreenControls.value = false;
  if (fullscreenControlsTimeout) {
    clearTimeout(fullscreenControlsTimeout);
    fullscreenControlsTimeout = null;
  }
}

function handleFullscreenCenterTap() {
  if (!isFullscreen.value) return;

  showFullscreenControls.value = true;

  if (fullscreenControlsTimeout) {
    clearTimeout(fullscreenControlsTimeout);
  }

  fullscreenControlsTimeout = setTimeout(() => {
    showFullscreenControls.value = false;
    fullscreenControlsTimeout = null;
  }, 3000);
}

function handleTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  if (e.touches.length !== 1 || !touch) return;
  touchStartX.value = touch.clientX;
  touchStartY.value = touch.clientY;
  isSwiping.value = true;
}

function handleTouchEnd(e: TouchEvent) {
  const touch = e.changedTouches[0];
  if (!isSwiping.value || e.changedTouches.length !== 1 || !touch) {
    isSwiping.value = false;
    return;
  }

  const touchEndX = touch.clientX;
  const touchEndY = touch.clientY;
  const deltaX = touchEndX - touchStartX.value;
  const deltaY = touchEndY - touchStartY.value;

  // Only trigger swipe if horizontal movement is greater than vertical
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > swipeThreshold) {
    if (deltaX > 0) {
      // Swipe right -> go to previous
      prev();
    } else {
      // Swipe left -> go to next
      next();
    }
  }

  isSwiping.value = false;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="visible && currentImage"
        class="lightbox-overlay"
        :class="{ fullscreen: isFullscreen }"
        @keydown="handleKeydown"
        @wheel.prevent
        @touchstart="handleTouchStart"
        @touchend="handleTouchEnd"
        tabindex="0"
        ref="overlayRef"
      >
        <!-- Normal mode header -->
        <div v-if="!isFullscreen" class="lightbox-header">
          <a :href="downloadUrl" class="download-link">
            <Button
              icon="pi pi-download"
              severity="secondary"
              text
              rounded
              class="header-button"
              aria-label="Download original"
            />
          </a>
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
            icon="pi pi-expand"
            severity="secondary"
            text
            rounded
            class="header-button"
            @click="enterFullscreen"
            aria-label="Enter fullscreen"
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

        <!-- Fullscreen mode exit button -->
        <Transition name="fade">
          <div v-if="isFullscreen && showFullscreenControls" class="fullscreen-header">
            <Button
              icon="pi pi-window-minimize"
              severity="secondary"
              text
              rounded
              class="header-button"
              @click="exitFullscreen"
              aria-label="Exit fullscreen"
            />
          </div>
        </Transition>

        <!-- Navigation areas -->
        <div
          class="nav-area nav-left"
          :class="{ disabled: !hasPrev, fullscreen: isFullscreen }"
          @click="(e) => handleNavClick(e, 'left')"
        >
          <i v-if="hasPrev && !isFullscreen" class="pi pi-chevron-left nav-icon"></i>
        </div>

        <div
          class="nav-area nav-right"
          :class="{ disabled: !hasNext && !canLoadMore, loading: loadingMore, fullscreen: isFullscreen }"
          @click="(e) => handleNavClick(e, 'right')"
        >
          <template v-if="!isFullscreen">
            <i v-if="loadingMore" class="pi pi-spin pi-spinner nav-icon"></i>
            <i v-else-if="hasNext || canLoadMore" class="pi pi-chevron-right nav-icon"></i>
          </template>
        </div>

        <!-- Image container -->
        <div
          class="lightbox-content"
          :class="{ fullscreen: isFullscreen }"
          @click="handleFullscreenCenterTap"
        >
          <!-- Center spinner for normal mode -->
          <div v-if="showLoadingSpinner && !isFullscreen" class="loading-spinner">
            <i class="pi pi-spin pi-spinner"></i>
          </div>
          <img
            :src="currentImage.s3Url"
            :alt="currentImage.filename"
            class="lightbox-image"
            :class="{ loading: showLoadingSpinner && !isFullscreen, fullscreen: isFullscreen }"
            @load="onImageLoad"
            @error="onImageError"
          />
        </div>

        <!-- Top-right spinner for fullscreen mode -->
        <div v-if="showLoadingSpinner && isFullscreen" class="fullscreen-loading">
          <i class="pi pi-spin pi-spinner"></i>
        </div>

        <!-- Image counter (hidden in fullscreen) -->
        <div v-if="!isFullscreen" class="lightbox-footer">
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

.lightbox-overlay.fullscreen {
  background: black;
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

.download-link {
  text-decoration: none;
  display: flex;
}

.header-button {
  color: white !important;
  background: rgba(255, 255, 255, 0.1) !important;
}

.header-button:hover {
  background: rgba(255, 255, 255, 0.2) !important;
}

.fullscreen-header {
  position: absolute;
  top: 0;
  right: 0;
  padding: 1rem;
  z-index: 10;
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

.nav-area:not(.disabled):active {
  background: rgba(255, 255, 255, 0.05);
}

.nav-area.disabled {
  cursor: default;
}

.nav-area.loading {
  cursor: wait;
}

.nav-area.fullscreen {
  background: transparent;
}

.nav-area.fullscreen:not(.disabled):active {
  background: transparent;
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
  position: relative;
}

.lightbox-content.fullscreen {
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: 100%;
}

.loading-spinner {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.loading-spinner .pi-spinner {
  font-size: 3rem;
  color: white;
  opacity: 0.8;
}

.fullscreen-loading {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fullscreen-loading .pi-spinner {
  font-size: 1.25rem;
  color: white;
}

.lightbox-image {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
  transition: opacity 0.2s;
}

.lightbox-image.loading {
  opacity: 0;
}

.lightbox-image.fullscreen {
  max-width: 100vw;
  max-height: 100vh;
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

/* Fade transition for fullscreen controls */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
