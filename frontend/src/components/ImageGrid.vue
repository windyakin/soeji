<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import type { SearchHit } from "../types/api";
import { getThumbnailUrl } from "../utils/image";

const props = defineProps<{
  images: SearchHit[];
  loading?: boolean;
  selectedIds?: Set<string>;
  selectionMode?: boolean;
}>();

const emit = defineEmits<{
  select: [index: number, event: MouseEvent];
  longpress: [index: number];
}>();

// Long press handling for touch devices
const LONG_PRESS_DURATION = 500; // ms
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressTriggered = false;
let touchStartPos = { x: 0, y: 0 };
const TOUCH_MOVE_THRESHOLD = 10; // px - cancel if moved more than this

// Virtual scroll state
const containerRef = ref<HTMLElement | null>(null);
const visibleRange = ref({ start: 0, end: 50 });
const tileSize = ref(200); // Approximate tile size
const columnsCount = ref(5);
const bufferRows = 3; // Extra rows to render above/below viewport

// サムネイルサイズ（固定値でキャッシュ効率を上げる）
const THUMBNAIL_SIZE = 400; // minTileWidth(200) * 2 for Retina

// 画像読み込み状態を管理（読み込み完了した画像のIDを保持）
const loadedImages = ref<Set<string>>(new Set());

function handleImageLoaded(imageId: string) {
  loadedImages.value.add(imageId);
}

function isImageLoading(imageId: string): boolean {
  return !loadedImages.value.has(imageId);
}

// Calculate which items should be visible based on scroll position
function updateVisibleRange() {
  if (!containerRef.value) return;

  const container = containerRef.value;
  const rect = container.getBoundingClientRect();
  const viewportTop = -rect.top;
  const viewportBottom = viewportTop + window.innerHeight;

  // Calculate row height (tile size + gap)
  const gap = 10; // 0.6rem ≈ 10px
  const rowHeight = tileSize.value + gap;

  // Calculate visible rows
  const startRow = Math.max(0, Math.floor(viewportTop / rowHeight) - bufferRows);
  const endRow = Math.ceil(viewportBottom / rowHeight) + bufferRows;

  // Convert to item indices
  const start = startRow * columnsCount.value;
  const end = Math.min((endRow + 1) * columnsCount.value, props.images.length);

  visibleRange.value = { start, end };
}

// Calculate number of columns based on container width
function updateColumnsCount() {
  if (!containerRef.value) return;

  const containerWidth = containerRef.value.clientWidth;
  const gap = 10;
  // スマホ（幅480px以下）では150px、それ以外では200pxを使用
  const minTileWidth = containerWidth <= 480 ? 150 : 200;

  // Match the CSS grid calculation
  columnsCount.value = Math.max(1, Math.floor((containerWidth + gap) / (minTileWidth + gap)));
  tileSize.value = (containerWidth - (columnsCount.value - 1) * gap) / columnsCount.value;

  updateVisibleRange();
}

// Check if an item should be rendered
function isItemVisible(index: number): boolean {
  return index >= visibleRange.value.start && index < visibleRange.value.end;
}

// Computed total grid height for proper scrollbar
const totalRows = computed(() => Math.ceil(props.images.length / columnsCount.value));
const totalHeight = computed(() => {
  const gap = 10;
  return totalRows.value * (tileSize.value + gap) - gap;
});

// Get item position
function getItemStyle(index: number) {
  const gap = 10;
  const row = Math.floor(index / columnsCount.value);
  const col = index % columnsCount.value;
  const top = row * (tileSize.value + gap);
  const left = col * (tileSize.value + gap);

  return {
    position: "absolute" as const,
    top: `${top}px`,
    left: `${left}px`,
    width: `${tileSize.value}px`,
    height: `${tileSize.value}px`,
  };
}

function handleImageClick(index: number, event: MouseEvent) {
  emit("select", index, event);
}

function isSelected(imageId: string): boolean {
  return props.selectedIds?.has(imageId) ?? false;
}

// Track if we're currently in a long press to block context menu
let isLongPressing = false;

// Touch event handlers for long press
function handleTouchStart(index: number, event: TouchEvent) {
  longPressTriggered = false;
  isLongPressing = true;
  const touch = event.touches[0];
  if (!touch) return;
  touchStartPos = { x: touch.clientX, y: touch.clientY };

  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    // Vibrate if supported (haptic feedback)
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    emit("longpress", index);
  }, LONG_PRESS_DURATION);
}

function handleTouchMove(event: TouchEvent) {
  if (!longPressTimer) return;

  const touch = event.touches[0];
  if (!touch) return;
  const dx = Math.abs(touch.clientX - touchStartPos.x);
  const dy = Math.abs(touch.clientY - touchStartPos.y);

  // Cancel long press if finger moved too much
  if (dx > TOUCH_MOVE_THRESHOLD || dy > TOUCH_MOVE_THRESHOLD) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function handleTouchEnd(event: TouchEvent) {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  isLongPressing = false;

  // If long press was triggered, prevent the click
  if (longPressTriggered) {
    event.preventDefault();
    longPressTriggered = false;
  }
}

// Prevent context menu during long press (blocks browser's "save image" menu)
function handleContextMenu(event: Event) {
  if (isLongPressing || longPressTriggered) {
    event.preventDefault();
  }
}

let scrollHandler: () => void;
let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  scrollHandler = () => {
    requestAnimationFrame(updateVisibleRange);
  };

  window.addEventListener("scroll", scrollHandler, { passive: true });

  // Wait for next tick to ensure container has proper dimensions
  await nextTick();

  // Use ResizeObserver to handle container resize
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateColumnsCount();
    });
    resizeObserver.observe(containerRef.value);
    updateColumnsCount();
  }
});

// Re-calculate when images change
watch(() => props.images.length, () => {
  nextTick(() => {
    updateColumnsCount();
  });
});

onUnmounted(() => {
  window.removeEventListener("scroll", scrollHandler);
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});
</script>

<template>
  <!-- Show empty state only when not loading and no images -->
  <div v-if="!loading && images.length === 0" class="empty-container">
    <i class="pi pi-images" style="font-size: 3rem; opacity: 0.5"></i>
    <p>No images found</p>
  </div>

  <!-- Show virtual grid with optional loading overlay -->
  <div v-else class="image-grid-container">
    <div
      ref="containerRef"
      class="image-grid"
      :class="{ 'is-loading': loading }"
      :style="{ height: `${totalHeight}px` }"
    >
      <template v-for="(image, index) in images" :key="image.id">
        <div
          v-if="isItemVisible(index)"
          class="image-tile"
          :class="{ 'is-selected': isSelected(image.id), 'selection-mode': selectionMode }"
          :style="getItemStyle(index)"
          @click="handleImageClick(index, $event)"
          @touchstart="handleTouchStart(index, $event)"
          @touchmove.passive="handleTouchMove($event)"
          @touchend="handleTouchEnd"
          @touchcancel="handleTouchEnd"
          @contextmenu="handleContextMenu($event)"
        >
          <div v-if="selectionMode" class="selection-indicator">
            <i :class="isSelected(image.id) ? 'pi pi-check-circle' : 'pi pi-circle'" />
          </div>
          <div class="image-wrapper">
            <div v-if="isImageLoading(image.id)" class="loading-spinner">
              <i class="pi pi-spin pi-spinner"></i>
            </div>
            <img
              :src="getThumbnailUrl(image.s3Url, { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: 'cover' })"
              :alt="image.filename"
              loading="lazy"
              :class="{ 'is-loading': isImageLoading(image.id) }"
              @load="handleImageLoaded(image.id)"
              @error="handleImageLoaded(image.id)"
            />
          </div>
        </div>
      </template>
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
  width: 100%;
}

.image-grid {
  position: relative;
  width: 100%;
  transition: opacity 0.15s ease;
}

.image-grid.is-loading {
  opacity: 0.6;
  pointer-events: none;
}

.image-tile {
  overflow: hidden;
  border-radius: 8px;
  background: var(--p-surface-100);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.image-tile:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1;
}

.image-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.2s ease;
}

.image-wrapper img.is-loading {
  opacity: 0;
}

.loading-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 2rem;
  color: var(--p-surface-500);
  z-index: 1;
}

/* Selection styles */
.image-tile.is-selected {
  outline: 3px solid var(--p-primary-color);
  outline-offset: -3px;
}

.image-tile.is-selected .image-wrapper img {
  opacity: 0.85;
}

.selection-indicator {
  position: absolute;
  top: calc(15px - (1.25rem / 2));
  left: 15px;
  z-index: 2;
  font-size: 1.25rem;
  color: white;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

.image-tile.is-selected .selection-indicator {
  color: var(--p-primary-color);
}

.image-tile.selection-mode {
  cursor: pointer;
}
</style>
