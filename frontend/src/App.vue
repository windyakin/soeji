<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import SearchBox from "./components/SearchBox.vue";
import ImageGrid from "./components/ImageGrid.vue";
import ImageLightbox from "./components/ImageLightbox.vue";
import ImageInfoModal from "./components/ImageInfoModal.vue";
import { useSearch } from "./composables/useApi";
import type { SearchHit } from "./types/api";

const searchQuery = ref("");
const { results, loading, search } = useSearch();

const images = ref<SearchHit[]>([]);

// Lightbox state
const lightboxVisible = ref(false);
const currentImageIndex = ref(0);

// Info modal state
const infoModalVisible = ref(false);
const selectedImageForInfo = ref<SearchHit | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(searchQuery, (newQuery) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    search(newQuery, { limit: 50 });
  }, 300);
});

watch(results, (newResults) => {
  if (newResults) {
    images.value = newResults.hits;
  }
});

onMounted(() => {
  search("", { limit: 50 });
});

function handleImageSelect(index: number) {
  currentImageIndex.value = index;
  lightboxVisible.value = true;
}

function handleShowInfo(image: SearchHit) {
  selectedImageForInfo.value = image;
  infoModalVisible.value = true;
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1 class="app-title">Soeji</h1>
      <p class="app-subtitle">Image Search</p>
    </header>

    <main class="app-main">
      <section class="search-section">
        <SearchBox v-model="searchQuery" :loading="loading" />
      </section>

      <section class="results-section">
        <div v-if="results" class="results-info">
          <span>{{ results.totalHits }} images found</span>
        </div>
        <ImageGrid :images="images" :loading="loading" @select="handleImageSelect" />
      </section>
    </main>

    <!-- Lightbox -->
    <ImageLightbox
      v-model:visible="lightboxVisible"
      v-model:currentIndex="currentImageIndex"
      :images="images"
      @show-info="handleShowInfo"
    />

    <!-- Info Modal -->
    <ImageInfoModal
      v-model:visible="infoModalVisible"
      :image="selectedImageForInfo"
    />
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  background: var(--p-surface-ground);
}

.app-header {
  text-align: center;
  padding: 2rem 1rem 1rem;
  background: var(--p-surface-card);
  border-bottom: 1px solid var(--p-surface-border);
}

.app-title {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
  color: var(--p-primary-color);
}

.app-subtitle {
  margin: 0.25rem 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
}

.app-main {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem;
}

.search-section {
  padding: 1.5rem 0;
}

.results-section {
  margin-top: 1rem;
}

.results-info {
  padding: 0.5rem 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}
</style>
