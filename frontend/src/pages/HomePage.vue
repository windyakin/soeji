<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import SearchBox from "../components/SearchBox.vue";
import ImageGrid from "../components/ImageGrid.vue";
import ImageLightbox from "../components/ImageLightbox.vue";
import ImageInfoModal from "../components/ImageInfoModal.vue";
import TaggingPanel from "../components/TaggingPanel.vue";
import StatsDashboard from "../components/StatsDashboard.vue";
import { useInfiniteSearch, addTagsToImages } from "../composables/useApi";
import { useSearchParams } from "../composables/useSearchParams";
import { useImageSelection } from "../composables/useImageSelection";
import type { SearchHit } from "../types/api";

const route = useRoute();
const router = useRouter();

// URL-synced search params
const { query: searchQuery, mode: searchMode, isInitialized } = useSearchParams();

// Show dashboard only when not searching
const showDashboard = computed(() => !searchQuery.value.trim());

const {
  images,
  totalHits,
  loading,
  loadingMore,
  hasMore,
  search,
  loadMore,
} = useInfiniteSearch();

// Image selection state
const {
  selectedIds,
  selectedCount,
  isSelectionMode,
  selectedImages,
  handleClick: handleSelectionClick,
  clearSelection,
} = useImageSelection(images);

// Tagging state
const taggingLoading = ref(false);
const taggingPanelVisible = computed(() => isSelectionMode.value);

// Lightbox state
const lightboxVisible = ref(false);
const currentImageIndex = ref(0);
const lightboxRef = ref<InstanceType<typeof ImageLightbox> | null>(null);

// Info modal state
const infoModalVisible = ref(false);
const selectedImageForInfo = ref<SearchHit | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isFirstSearch = ref(true);

/**
 * Check if query ends with an incomplete prefix pattern
 * These patterns indicate user is still typing a prefix and search should be skipped:
 * - "p", "u", "n" (single letter that could be start of prefix)
 * - "p:", "u:", "n:" (prefix with colon, waiting for search term)
 * - "-p", "-u", "-n" (negative prefix start)
 * - "-p:", "-u:", "-n:" (negative prefix with colon)
 * Also handles multi-word queries like "cat p:" or "cat -u:"
 */
function isIncompletePrefix(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;

  // Get the last "word" (space-separated)
  const lastSpaceIndex = trimmed.lastIndexOf(" ");
  const lastPart = lastSpaceIndex === -1 ? trimmed : trimmed.slice(lastSpaceIndex + 1);

  // Check if last part is an incomplete prefix pattern
  // Matches: p, u, n, p:, u:, n:, -p, -u, -n, -p:, -u:, -n:
  return /^-?[pun]:?$/i.test(lastPart);
}

// Handle gallery route - open lightbox for specific image
watch(
  () => route.params.id,
  async (id) => {
    if (id && typeof id === "string") {
      // Wait for images to be loaded
      if (images.value.length === 0) {
        // Wait for initial search to complete
        await new Promise<void>((resolve) => {
          const unwatch = watch(
            () => images.value.length,
            (len) => {
              if (len > 0) {
                unwatch();
                resolve();
              }
            },
            { immediate: true }
          );
        });
      }

      // Find the image index
      const index = images.value.findIndex((img) => img.id === id);
      if (index !== -1) {
        currentImageIndex.value = index;
        lightboxVisible.value = true;
      } else {
        // Image not found, redirect to home
        router.replace({ name: "home", query: route.query });
      }
    }
  },
  { immediate: true }
);

// Update URL when lightbox opens/closes
watch(lightboxVisible, (visible) => {
  const currentImage = images.value[currentImageIndex.value];
  if (visible && currentImage) {
    // Open lightbox - update URL with replace (no history)
    router.replace({
      name: "gallery",
      params: { id: currentImage.id },
      query: route.query,
    });
  } else if (!visible && route.name === "gallery") {
    // Close lightbox - go back to home
    // Build query from current searchQuery/searchMode to avoid race condition
    const newQuery: Record<string, string> = {};
    if (searchQuery.value) {
      newQuery.q = searchQuery.value;
    }
    if (searchMode.value !== "and") {
      newQuery.mode = searchMode.value;
    }
    router.replace({ name: "home", query: newQuery });
  }

  // Close info panel when lightbox is closed
  if (!visible) {
    infoModalVisible.value = false;
  }
});

// Update URL when navigating images in lightbox
watch(currentImageIndex, (newIndex) => {
  const currentImage = images.value[newIndex];
  if (lightboxVisible.value && currentImage && route.name === "gallery") {
    router.replace({
      name: "gallery",
      params: { id: currentImage.id },
      query: route.query,
    });
  }

  // Update info panel when navigating images while panel is open
  if (infoModalVisible.value && images.value[newIndex]) {
    selectedImageForInfo.value = images.value[newIndex];
  }
});

// Initial search when params are ready
watch(isInitialized, (initialized) => {
  if (initialized && isFirstSearch.value) {
    isFirstSearch.value = false;
    search(searchQuery.value, searchMode.value);
  }
});

// Watch for search param changes and trigger search
watch([searchQuery, searchMode], ([newQuery, newMode]) => {
  if (!isInitialized.value) return;

  // Skip the first change triggered by URL initialization
  if (isFirstSearch.value) {
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Skip search if user is typing a prefix
  if (isIncompletePrefix(newQuery)) {
    return;
  }

  debounceTimer = setTimeout(() => {
    search(newQuery, newMode);
  }, 300);
});

// Scroll to top when search results change (but not when loading more)
watch([images, totalHits], ([newImages, newTotal], [oldImages, oldTotal]) => {
  // Check if this is a new search (first image changed or total count changed)
  const newFirstId = newImages[0]?.id ?? null;
  const oldFirstId = oldImages?.[0]?.id ?? null;

  // Scroll to top if:
  // - There are new images AND
  // - Either the first image ID changed OR the total count changed
  //   (meaning it's a new search, not loadMore)
  if (newFirstId !== null && (newFirstId !== oldFirstId || newTotal !== oldTotal)) {
    window.scrollTo(0, 0);
  }
});

onMounted(() => {
  window.addEventListener("scroll", handleScroll);
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleScroll);
});

function handleScroll() {
  if (loadingMore.value || !hasMore.value) return;

  const scrollTop = window.scrollY;
  const windowHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight;

  // Load more when user scrolls to bottom (with 200px threshold)
  if (scrollTop + windowHeight >= documentHeight - 200) {
    loadMore();
  }
}

function handleImageSelect(index: number, event: MouseEvent) {
  // Check if selection mode interaction
  if (handleSelectionClick(index, event)) {
    return; // Don't open lightbox
  }

  // Normal click - open lightbox
  currentImageIndex.value = index;
  lightboxVisible.value = true;
}

async function handleAddTag(tagName: string) {
  if (selectedIds.value.size === 0) return;

  taggingLoading.value = true;
  try {
    const imageIds = Array.from(selectedIds.value);
    await addTagsToImages(imageIds, [tagName]);
    // Refresh search results to show updated tags
    await search(searchQuery.value, searchMode.value);
    // Clear selection after successful tagging
    clearSelection();
  } catch (error) {
    console.error("Failed to add tag:", error);
  } finally {
    taggingLoading.value = false;
  }
}

function handleShowInfo(image: SearchHit) {
  selectedImageForInfo.value = image;
  infoModalVisible.value = true;
}

async function handleLoadMoreFromLightbox() {
  if (hasMore.value) {
    await loadMore();
  }
}

function handleSearchTag(tag: string) {
  // Quote tag if it contains spaces
  const formattedTag = tag.includes(" ") ? `"${tag}"` : tag;
  searchQuery.value = formattedTag;
  // Close lightbox if open
  lightboxVisible.value = false;
}

function handleImageLongPress(index: number) {
  // Long press on mobile triggers selection mode
  const image = images.value[index];
  if (image) {
    // Use the toggleSelection from useImageSelection
    const newSelectedIds = new Set(selectedIds.value);
    if (newSelectedIds.has(image.id)) {
      newSelectedIds.delete(image.id);
    } else {
      newSelectedIds.add(image.id);
    }
    selectedIds.value = newSelectedIds;
  }
}

function handleImageDeleted(imageId: string) {
  // Remove the deleted image from the list
  images.value = images.value.filter((img) => img.id !== imageId);
  // Also update totalHits
  totalHits.value = Math.max(0, totalHits.value - 1);
}

function handleInfoPanelShown() {
  // Restore focus to lightbox after info panel opens
  lightboxRef.value?.focus();
}

function handleEnterFullscreen() {
  // Close info panel when entering fullscreen
  infoModalVisible.value = false;
}

function goHome() {
  searchQuery.value = "";
}
</script>

<template>
  <div class="page-container">
    <!-- Sticky header with search -->
    <header class="app-header">
      <div class="header-content">
        <a href="/" class="app-title-link" @click.prevent="goHome">
          <h1 class="app-title">Soeji</h1>
        </a>
        <div class="search-wrapper">
          <SearchBox v-model="searchQuery" v-model:searchMode="searchMode" :loading="loading" />
        </div>
        <div class="results-info">
          <span>{{ totalHits }} images found</span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <!-- Stats Dashboard (shown only when not searching) -->
      <StatsDashboard v-if="showDashboard" @search-tag="handleSearchTag" />

      <section class="results-section">
        <ImageGrid
          :images="images"
          :loading="loading"
          :selected-ids="selectedIds"
          :selection-mode="isSelectionMode"
          :disabled="taggingLoading"
          @select="handleImageSelect"
          @longpress="handleImageLongPress"
        />

        <!-- Loading more indicator -->
        <div v-if="loadingMore" class="loading-more">
          <i class="pi pi-spin pi-spinner"></i>
          <span>Loading more...</span>
        </div>

        <!-- End of results -->
        <div v-else-if="!hasMore && images.length > 0" class="end-of-results">
          <span>No more images</span>
        </div>
      </section>
    </main>

    <!-- Lightbox -->
    <ImageLightbox
      ref="lightboxRef"
      v-model:visible="lightboxVisible"
      v-model:currentIndex="currentImageIndex"
      :images="images"
      :has-more="hasMore"
      :loading-more="loadingMore"
      :info-panel-open="infoModalVisible"
      @show-info="handleShowInfo"
      @load-more="handleLoadMoreFromLightbox"
      @enter-fullscreen="handleEnterFullscreen"
    />

    <!-- Info Panel -->
    <ImageInfoModal
      v-model:visible="infoModalVisible"
      :image="selectedImageForInfo"
      @search-tag="handleSearchTag"
      @deleted="handleImageDeleted"
      @shown="handleInfoPanelShown"
    />

    <!-- Tagging Panel -->
    <TaggingPanel
      v-if="taggingPanelVisible"
      :selected-count="selectedCount"
      :selected-images="selectedImages"
      :loading="taggingLoading"
      @add-tag="handleAddTag"
      @clear-selection="clearSelection"
    />
  </div>
</template>

<style scoped>
.page-container {
  min-height: 100vh;
  background: var(--p-surface-0);
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--p-surface-0);
  border-bottom: 1px solid var(--p-surface-200);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem 0.65rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.app-title-link {
  text-decoration: none;
}

.app-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--p-primary-color);
  white-space: nowrap;
}

.search-wrapper {
  flex: 1;
  max-width: 600px;
}

.results-info {
  color: var(--p-surface-500);
  font-size: 0.875rem;
  white-space: nowrap;
}

.app-main {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem 0.65rem;
}

.results-section {
  margin-top: 0;
}

.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--p-surface-500);
}

.end-of-results {
  text-align: center;
  padding: 2rem;
  color: var(--p-surface-500);
  font-size: 0.875rem;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .header-content {
    flex-wrap: wrap;
  }

  .app-title {
    font-size: 1.25rem;
  }

  .search-wrapper {
    order: 3;
    flex-basis: 100%;
    max-width: 100%;
  }

  .results-info {
    margin-left: auto;
  }
}
</style>
