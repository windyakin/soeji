<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import SearchBox from "./components/SearchBox.vue";
import ImageGrid from "./components/ImageGrid.vue";
import ImageLightbox from "./components/ImageLightbox.vue";
import ImageInfoModal from "./components/ImageInfoModal.vue";
import TaggingPanel from "./components/TaggingPanel.vue";
import { useInfiniteSearch, addTagsToImages } from "./composables/useApi";
import { useSearchParams } from "./composables/useSearchParams";
import { useImageSelection } from "./composables/useImageSelection";
import type { SearchHit } from "./types/api";

// URL-synced search params
const { query: searchQuery, mode: searchMode, isInitialized } = useSearchParams();

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

// Info modal state
const infoModalVisible = ref(false);
const selectedImageForInfo = ref<SearchHit | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// Watch for search param changes and trigger search
watch([searchQuery, searchMode], ([newQuery, newMode]) => {
  if (!isInitialized.value) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    search(newQuery, newMode);
  }, 300);
});

// Initial search when params are ready
watch(isInitialized, (initialized) => {
  if (initialized) {
    search(searchQuery.value, searchMode.value);
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
</script>

<template>
  <div class="app-container">
    <!-- Sticky header with search -->
    <header class="app-header">
      <div class="header-content">
        <a href="/" class="app-title-link"><h1 class="app-title">Soeji</h1></a>
        <div class="search-wrapper">
          <SearchBox v-model="searchQuery" v-model:searchMode="searchMode" :loading="loading" />
        </div>
        <div class="results-info">
          <span>{{ totalHits }} images found</span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <section class="results-section">
        <ImageGrid
          :images="images"
          :loading="loading"
          :selected-ids="selectedIds"
          :selection-mode="isSelectionMode"
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
      v-model:visible="lightboxVisible"
      v-model:currentIndex="currentImageIndex"
      :images="images"
      :has-more="hasMore"
      :loading-more="loadingMore"
      @show-info="handleShowInfo"
      @load-more="handleLoadMoreFromLightbox"
    />

    <!-- Info Modal -->
    <ImageInfoModal
      v-model:visible="infoModalVisible"
      :image="selectedImageForInfo"
      @search-tag="handleSearchTag"
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
.app-container {
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
