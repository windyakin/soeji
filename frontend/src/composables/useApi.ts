import { ref, computed } from "vue";
import type { SearchResponse, SearchHit, BatchTagResponse, StatsResponse } from "../types/api";
import { useAuth } from "./useAuth";

const API_BASE = import.meta.env.VITE_API_BASE || "";

// Helper function to handle API requests with cookie-based auth and 401 retry
async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const { refreshAccessToken, authEnabled } = useAuth();

  // Always include credentials for cookie-based auth
  let response = await fetch(url, { ...options, credentials: "include" });

  // If 401 and auth is enabled, try to refresh token and retry
  if (response.status === 401 && authEnabled.value) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Retry with refreshed cookies (preserve the signal if present)
      response = await fetch(url, { ...options, credentials: "include" });
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

// Change password API function
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const response = await fetchWithAuth(`${API_BASE}/api/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to change password" }));
    return { success: false, error: error.error || "Failed to change password" };
  }

  return { success: true };
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

  // AbortController for cancelling in-flight requests
  let searchAbortController: AbortController | null = null;
  let loadMoreAbortController: AbortController | null = null;

  const hasMore = computed(() => images.value.length < totalHits.value);

  async function search(query: string, mode?: SearchMode) {
    // Cancel any existing search request
    if (searchAbortController) {
      searchAbortController.abort();
    }

    // Create new AbortController for this search
    searchAbortController = new AbortController();
    const signal = searchAbortController.signal;

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

      const response = await fetchWithAuth(`${API_BASE}/api/search?${params}`, {
        signal,
      });
      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data: SearchResponse = await response.json();
      // Update results only after successful fetch
      images.value = data.hits;
      totalHits.value = data.totalHits;
    } catch (e) {
      // Ignore abort errors (request was cancelled)
      if (e instanceof Error && e.name === "AbortError") {
        return;
      }
      error.value = e instanceof Error ? e.message : "Unknown error";
    } finally {
      // Only clear loading if this request wasn't aborted
      if (!signal.aborted) {
        loading.value = false;
      }
    }
  }

  async function loadMore(): Promise<boolean> {
    if (loadingMore.value || !hasMore.value) {
      return false;
    }

    // Cancel any existing loadMore request
    if (loadMoreAbortController) {
      loadMoreAbortController.abort();
    }

    // Create new AbortController for this loadMore
    loadMoreAbortController = new AbortController();
    const signal = loadMoreAbortController.signal;

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

      const response = await fetchWithAuth(`${API_BASE}/api/search?${params}`, {
        signal,
      });
      if (!response.ok) {
        throw new Error("Failed to load more");
      }

      const data: SearchResponse = await response.json();
      images.value = [...images.value, ...data.hits];
      totalHits.value = data.totalHits;
      return data.hits.length > 0;
    } catch (e) {
      // Ignore abort errors (request was cancelled)
      if (e instanceof Error && e.name === "AbortError") {
        return false;
      }
      error.value = e instanceof Error ? e.message : "Unknown error";
      return false;
    } finally {
      // Only clear loading if this request wasn't aborted
      if (!signal.aborted) {
        loadingMore.value = false;
      }
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
