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
  infoPanelOpen?: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  "update:currentIndex": [value: number];
  showInfo: [image: SearchHit];
  loadMore: [];
  enterFullscreen: [];
}>();

const overlayRef = ref<HTMLElement | null>(null);
const isImageLoading = ref(false);
const showLoadingSpinner = ref(false);
const isFullscreen = ref(false);
const showFullscreenControls = ref(false);
let fullscreenControlsTimeout: ReturnType<typeof setTimeout> | null = null;
let loadingSpinnerTimeout: ReturnType<typeof setTimeout> | null = null;
const loadingSpinnerDelay = 50; // ms before showing spinner

// Preload状態の管理
const isNextImageLoaded = ref(false);
const isPrevImageLoaded = ref(false);
const isNextImageLoading = ref(false);
const isPrevImageLoading = ref(false);

// Swipe handling
const touchStartX = ref(0);
const touchStartY = ref(0);
const isSwiping = ref(false);
const swipeThreshold = 50; // minimum distance for swipe

const currentImage = computed(() => props.images[props.currentIndex]);
const prevImage = computed(() => props.images[props.currentIndex - 1]);
const nextImage = computed(() => props.images[props.currentIndex + 1]);

const isDownloading = ref(false);

async function downloadImage() {
  if (!currentImage.value || isDownloading.value) return;

  isDownloading.value = true;
  try {
    const downloadUrl = getDownloadUrl(currentImage.value.s3Url);
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = currentImage.value.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to download image:", error);
  } finally {
    isDownloading.value = false;
  }
}

// Reset loading state when image changes and maintain focus
watch(
  () => currentImage.value?.s3Url,
  async () => {
    isImageLoading.value = true;
    updateLoadingSpinner();

    // Re-focus overlay to maintain keyboard control
    await nextTick();
    overlayRef.value?.focus();
  }
);

// Reset preload state when next image changes
watch(
  () => nextImage.value?.s3Url,
  (newUrl) => {
    isNextImageLoaded.value = false;
    isNextImageLoading.value = !!newUrl;
    if (newUrl) {
      updateLoadingSpinner();
    }
  }
);

// Reset preload state when prev image changes
watch(
  () => prevImage.value?.s3Url,
  (newUrl) => {
    isPrevImageLoaded.value = false;
    isPrevImageLoading.value = !!newUrl;
    if (newUrl) {
      updateLoadingSpinner();
    }
  }
);

// Update loading spinner based on any loading activity
function updateLoadingSpinner() {
  showLoadingSpinner.value = false;

  // Clear existing timeout
  if (loadingSpinnerTimeout) {
    clearTimeout(loadingSpinnerTimeout);
  }

  // Check if any image is loading
  const anyImageLoading = isImageLoading.value || isNextImageLoading.value || isPrevImageLoading.value;

  if (anyImageLoading) {
    // Show spinner after delay
    loadingSpinnerTimeout = setTimeout(() => {
      if (isImageLoading.value || isNextImageLoading.value || isPrevImageLoading.value) {
        showLoadingSpinner.value = true;
      }
    }, loadingSpinnerDelay);
  }
}

function onImageLoad() {
  isImageLoading.value = false;
  updateLoadingSpinner();
}

function onImageError() {
  isImageLoading.value = false;
  updateLoadingSpinner();
}

function onNextImageLoad() {
  isNextImageLoading.value = false;
  isNextImageLoaded.value = true;
  updateLoadingSpinner();
}

function onNextImageError() {
  isNextImageLoading.value = false;
  isNextImageLoaded.value = false;
  updateLoadingSpinner();
}

function onPrevImageLoad() {
  isPrevImageLoading.value = false;
  isPrevImageLoaded.value = true;
  updateLoadingSpinner();
}

function onPrevImageError() {
  isPrevImageLoading.value = false;
  isPrevImageLoaded.value = false;
  updateLoadingSpinner();
}

// Lock body scroll and update theme-color when lightbox is visible
watch(
  () => props.visible,
  async (isVisible) => {
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (isVisible) {
      // Prevent body scroll
      document.body.style.overflow = "hidden";
      // Set status bar to black for lightbox
      if (themeColorMeta) {
        themeColorMeta.setAttribute("content", "#000000");
      }
      await nextTick();
      overlayRef.value?.focus();
    } else {
      // Restore body scroll
      document.body.style.overflow = "";
      // Restore original theme color
      if (themeColorMeta) {
        themeColorMeta.setAttribute("content", "#ffffff");
      }
    }
  }
);

// Clean up on unmount
onUnmounted(() => {
  document.body.style.overflow = "";
  // Restore theme color
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", "#ffffff");
  }
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

  // プリロード画像が読み込まれていない場合は進まない
  if (!isPrevImageLoaded.value) return;

  isNavigating.value = true;
  emit("update:currentIndex", props.currentIndex - 1);

  setTimeout(() => {
    isNavigating.value = false;
  }, navigationCooldown);
}

function next() {
  if (isNavigating.value) return;

  if (hasNext.value) {
    // プリロード画像が読み込まれていない場合は進まない
    if (!isNextImageLoaded.value) return;

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
  } else if (e.key === "i" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    showInfo();
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
  emit("enterFullscreen");
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

// Expose focus method for parent components
function focus() {
  overlayRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="visible && currentImage"
        class="lightbox-overlay"
        :class="{ fullscreen: isFullscreen, 'panel-open': infoPanelOpen && !isFullscreen }"
        @keydown="handleKeydown"
        @wheel.prevent
        @touchstart="handleTouchStart"
        @touchend="handleTouchEnd"
        tabindex="0"
        ref="overlayRef"
      >
        <!-- Normal mode header -->
        <div v-if="!isFullscreen" class="lightbox-header">
          <Button
            :icon="isDownloading ? 'pi pi-spin pi-spinner' : 'pi pi-download'"
            severity="secondary"
            text
            rounded
            class="header-button"
            :disabled="isDownloading"
            @click="downloadImage"
            aria-label="Download original"
          />
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
          <img
            :src="currentImage.s3Url"
            :alt="currentImage.filename"
            class="lightbox-image"
            :class="{ fullscreen: isFullscreen }"
            @load="onImageLoad"
            @error="onImageError"
          />
        </div>

        <!-- Top-left loading spinner (both normal and fullscreen modes) -->
        <div v-if="showLoadingSpinner" class="loading-indicator">
          <i class="pi pi-spin pi-spinner"></i>
        </div>

        <!-- Preload previous and next images -->
        <img
          v-show="prevImage"
          :src="prevImage?.s3Url"
          class="preload-image"
          aria-hidden="true"
          @load="onPrevImageLoad"
          @error="onPrevImageError"
        />
        <img
          v-show="nextImage"
          :src="nextImage?.s3Url"
          class="preload-image"
          aria-hidden="true"
          @load="onNextImageLoad"
          @error="onNextImageError"
        />

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

/* Desktop only: shift content when panel is open */
@media (min-width: 769px) {
  .lightbox-overlay.panel-open {
    padding-right: 400px;
    transition: padding-right 0.3s ease;
  }

  .lightbox-overlay.panel-open .lightbox-header {
    right: 400px;
  }

  .lightbox-overlay.panel-open .nav-right {
    right: 400px;
  }

  .lightbox-overlay.panel-open .lightbox-footer {
    right: 400px;
  }
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

.loading-indicator {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 10;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-indicator .pi-spinner {
  font-size: 1.25rem;
  color: white;
}

.preload-image {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.lightbox-image {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.lightbox-image.fullscreen {
  max-width: none;
  max-height: none;
  width: 100vw;
  height: 100vh;
  object-fit: contain;
}

.lightbox-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1rem;
  padding-bottom: calc(1rem + env(safe-area-inset-bottom));
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
