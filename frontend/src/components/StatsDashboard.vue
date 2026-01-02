<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { fetchStats } from "../composables/useApi";
import type { StatsResponse } from "../types/api";

const emit = defineEmits<{
  (e: "search-tag", tag: string): void;
}>();

const stats = ref<StatsResponse | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    stats.value = await fetchStats();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load stats";
  } finally {
    loading.value = false;
  }
});

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const lastUpdated = computed(() => {
  if (!stats.value) return "-";
  return formatDate(stats.value.newestImageDate);
});

function handleTagClick(tagName: string) {
  emit("search-tag", tagName);
}
</script>

<template>
  <div class="stats-dashboard">
    <div v-if="loading" class="stats-loading">
      <i class="pi pi-spin pi-spinner"></i>
    </div>
    <div v-else-if="error" class="stats-error">
      <i class="pi pi-exclamation-triangle"></i>
      <span>{{ error }}</span>
    </div>
    <div v-else-if="stats" class="stats-content">
      <!-- Main stats row -->
      <div class="stats-grid">
        <div class="stat-item">
          <i class="pi pi-images stat-icon"></i>
          <div class="stat-content">
            <span class="stat-value">{{ stats.totalImages.toLocaleString() }}</span>
            <span class="stat-label">Images</span>
          </div>
        </div>
        <div class="stat-item">
          <i class="pi pi-tags stat-icon"></i>
          <div class="stat-content">
            <span class="stat-value">{{ stats.totalTags.toLocaleString() }}</span>
            <span class="stat-label">Tags</span>
          </div>
        </div>
        <div class="stat-item">
          <i class="pi pi-clock stat-icon"></i>
          <div class="stat-content">
            <span class="stat-value">
              <span class="recent-count">{{ stats.recentImages24h }}</span>
              <span class="recent-separator">/</span>
              <span class="recent-count">{{ stats.recentImages7d }}</span>
            </span>
            <span class="stat-label">24h / 7d</span>
          </div>
        </div>
        <div class="stat-item">
          <i class="pi pi-calendar stat-icon"></i>
          <div class="stat-content">
            <span class="stat-value stat-date">{{ lastUpdated }}</span>
            <span class="stat-label">Last Updated</span>
          </div>
        </div>
      </div>

      <!-- Recent tags row -->
      <div v-if="stats.recentTags.length > 0" class="recent-tags-section">
        <span class="recent-tags-label">Hot <i class="pi pi-arrow-up-right" style="font-size: 0.6rem"></i></span>
        <div class="recent-tags-list">
          <button
            v-for="tag in stats.recentTags"
            :key="tag.name"
            class="recent-tag-chip"
            @click="handleTagClick(tag.name)"
          >
            <span class="tag-name">{{ tag.name }}</span>
            <span class="tag-count">+{{ tag.count.toLocaleString() }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-dashboard {
  background: var(--p-surface-50);
  border: 1px solid var(--p-surface-200);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.stats-loading,
.stats-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--p-surface-500);
  padding: 0.5rem;
}

.stats-error {
  color: var(--p-red-500);
}

.stats-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  background: var(--p-surface-0);
  border-radius: 6px;
}

.stat-icon {
  font-size: 1.25rem;
  color: var(--p-primary-color);
  opacity: 0.8;
  margin: auto 0.5rem;
}

.stat-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--p-surface-900);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-date {
  font-size: 0.875rem;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--p-surface-500);
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.recent-count {
  font-variant-numeric: tabular-nums;
}

.recent-separator {
  color: var(--p-surface-400);
  margin: 0 0.125rem;
}

/* Recent tags section */
.recent-tags-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.recent-tags-label {
  font-size: 0.75rem;
  color: var(--p-surface-500);
  text-transform: uppercase;
  letter-spacing: 0.025em;
  white-space: nowrap;
}

.recent-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.recent-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 999px;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.recent-tag-chip:hover {
  background: var(--p-primary-50);
  border-color: var(--p-primary-200);
}

.tag-name {
  color: var(--p-surface-700);
}

.tag-count {
  color: var(--p-surface-400);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .recent-tags-section {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .stats-dashboard {
    padding: 0.75rem;
  }

  .stats-grid {
    gap: 0.75rem;
  }

  .stat-item {
    padding: 0.375rem;
  }

  .stat-icon {
    font-size: 1rem;
  }

  .stat-value {
    font-size: 1rem;
  }

  .stat-date {
    font-size: 0.75rem;
  }
}
</style>
