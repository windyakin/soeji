import { ref, computed } from "vue";
import type { SearchResponse, SearchHit } from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE || "";

export function useInfiniteSearch() {
  const images = ref<SearchHit[]>([]);
  const totalHits = ref(0);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);
  const currentQuery = ref("");
  const limit = 50;

  const hasMore = computed(() => images.value.length < totalHits.value);

  async function search(query: string) {
    // Reset for new search
    currentQuery.value = query;
    images.value = [];
    totalHits.value = 0;
    loading.value = true;
    error.value = null;

    try {
      const params = new URLSearchParams();
      if (query) {
        params.set("q", query);
      }
      params.set("limit", limit.toString());
      params.set("offset", "0");
      params.set("filter", "positiveTags");

      const response = await fetch(`${API_BASE}/api/search?${params}`);
      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data: SearchResponse = await response.json();
      images.value = data.hits;
      totalHits.value = data.totalHits;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Unknown error";
    } finally {
      loading.value = false;
    }
  }

  async function loadMore(): Promise<boolean> {
    if (loadingMore.value || !hasMore.value) {
      return false;
    }

    loadingMore.value = true;
    error.value = null;

    try {
      const params = new URLSearchParams();
      if (currentQuery.value) {
        params.set("q", currentQuery.value);
      }
      params.set("limit", limit.toString());
      params.set("offset", images.value.length.toString());
      params.set("filter", "positiveTags");

      const response = await fetch(`${API_BASE}/api/search?${params}`);
      if (!response.ok) {
        throw new Error("Failed to load more");
      }

      const data: SearchResponse = await response.json();
      images.value = [...images.value, ...data.hits];
      totalHits.value = data.totalHits;
      return data.hits.length > 0;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Unknown error";
      return false;
    } finally {
      loadingMore.value = false;
    }
  }

  return {
    images,
    totalHits,
    loading,
    loadingMore,
    error,
    hasMore,
    search,
    loadMore,
  };
}
