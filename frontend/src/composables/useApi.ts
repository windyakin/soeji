import { ref } from "vue";
import type { SearchResponse, ImagesResponse } from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE || "";

export function useSearch() {
  const results = ref<SearchResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function search(query: string, options?: { limit?: number; offset?: number }) {
    loading.value = true;
    error.value = null;

    try {
      const params = new URLSearchParams();
      if (query) {
        params.set("q", query);
      }
      if (options?.limit) {
        params.set("limit", options.limit.toString());
      }
      if (options?.offset) {
        params.set("offset", options.offset.toString());
      }
      // Only search positive tags
      params.set("filter", "positiveTags");

      const response = await fetch(`${API_BASE}/api/search?${params}`);
      if (!response.ok) {
        throw new Error("Search failed");
      }

      results.value = await response.json();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Unknown error";
    } finally {
      loading.value = false;
    }
  }

  return { results, loading, error, search };
}

export function useImages() {
  const data = ref<ImagesResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchImages(options?: { limit?: number; offset?: number }) {
    loading.value = true;
    error.value = null;

    try {
      const params = new URLSearchParams();
      if (options?.limit) {
        params.set("limit", options.limit.toString());
      }
      if (options?.offset) {
        params.set("offset", options.offset.toString());
      }

      const response = await fetch(`${API_BASE}/api/images?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch images");
      }

      data.value = await response.json();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Unknown error";
    } finally {
      loading.value = false;
    }
  }

  return { data, loading, error, fetchImages };
}
