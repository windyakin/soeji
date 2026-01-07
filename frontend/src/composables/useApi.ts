import { ref, computed } from "vue";
import type { SearchResponse, SearchHit, BatchTagResponse, StatsResponse } from "../types/api";
import { useAuth } from "./useAuth";

const API_BASE = import.meta.env.VITE_API_BASE || "";

// Helper function to get auth headers and handle 401 responses
async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const { getAuthHeader, refreshAccessToken, authEnabled } = useAuth();

  const headers = {
    ...options.headers,
    ...getAuthHeader(),
  };

  let response = await fetch(url, { ...options, headers });

  // If 401 and auth is enabled, try to refresh token and retry
  if (response.status === 401 && authEnabled.value) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Retry with new token
      const newHeaders = {
        ...options.headers,
        ...getAuthHeader(),
      };
      response = await fetch(url, { ...options, headers: newHeaders });
    }
  }

  return response;
}

// Batch tagging API functions
export async function addTagsToImages(
  imageIds: string[],
  tags: string[]
): Promise<BatchTagResponse> {
  const response = await fetchWithAuth(`${API_BASE}/api/images/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageIds, tags }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to add tags" }));
    throw new Error(error.error || "Failed to add tags");
  }

  return response.json();
}

export async function removeTagFromImage(
  imageId: string,
  tagId: string
): Promise<void> {
  const response = await fetchWithAuth(
    `${API_BASE}/api/images/${imageId}/tags/${tagId}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to remove tag" }));
    throw new Error(error.error || "Failed to remove tag");
  }
}

export async function deleteImage(imageId: string): Promise<void> {
  const response = await fetchWithAuth(`${API_BASE}/api/images/${imageId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to delete image" }));
    throw new Error(error.error || "Failed to delete image");
  }
}

// Stats API function
export async function fetchStats(): Promise<StatsResponse> {
  const response = await fetchWithAuth(`${API_BASE}/api/stats`);

  if (!response.ok) {
    throw new Error("Failed to fetch stats");
  }

  return response.json();
}

export type SearchMode = "or" | "and";

export function useInfiniteSearch() {
  const images = ref<SearchHit[]>([]);
  const totalHits = ref(0);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);
  const currentQuery = ref("");
  const searchMode = ref<SearchMode>("and");
  const limit = 50;

  const hasMore = computed(() => images.value.length < totalHits.value);

  async function search(query: string, mode?: SearchMode) {
    // Update query and mode
    currentQuery.value = query;
    if (mode !== undefined) {
      searchMode.value = mode;
    }
    // Keep previous results while loading (don't reset images/totalHits)
    loading.value = true;
    error.value = null;

    try {
      const params = new URLSearchParams();
      if (query) {
        params.set("q", query);
      }
      params.set("limit", limit.toString());
      params.set("offset", "0");
      params.set("mode", searchMode.value);

      const response = await fetchWithAuth(`${API_BASE}/api/search?${params}`);
      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data: SearchResponse = await response.json();
      // Update results only after successful fetch
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
      params.set("mode", searchMode.value);

      const response = await fetchWithAuth(`${API_BASE}/api/search?${params}`);
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

  function setSearchMode(mode: SearchMode) {
    searchMode.value = mode;
  }

  return {
    images,
    totalHits,
    loading,
    loadingMore,
    error,
    hasMore,
    searchMode,
    search,
    loadMore,
    setSearchMode,
  };
}
