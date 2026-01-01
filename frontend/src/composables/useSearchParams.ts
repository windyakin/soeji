import { ref, watch, onMounted } from "vue";
import type { SearchMode } from "./useApi";

export function useSearchParams() {
  const query = ref("");
  const mode = ref<SearchMode>("and");
  const imageId = ref<string | null>(null);
  const isInitialized = ref(false);

  // Read URL params on mount
  function initFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlQuery = urlParams.get("q") || "";
    const urlMode = urlParams.get("mode") as SearchMode | null;
    const urlImageId = urlParams.get("imageId");

    query.value = urlQuery;
    if (urlMode === "or" || urlMode === "and") {
      mode.value = urlMode;
    }
    imageId.value = urlImageId;
    isInitialized.value = true;
  }

  // Update URL without page reload
  function updateUrl(newQuery: string, newMode: SearchMode, newImageId?: string | null) {
    const url = new URL(window.location.href);

    if (newQuery) {
      url.searchParams.set("q", newQuery);
    } else {
      url.searchParams.delete("q");
    }

    if (newMode !== "and") {
      url.searchParams.set("mode", newMode);
    } else {
      url.searchParams.delete("mode");
    }

    if (newImageId !== undefined) {
      if (newImageId) {
        url.searchParams.set("imageId", newImageId);
      } else {
        url.searchParams.delete("imageId");
      }
    }

    // Use replaceState to update URL without adding to history
    window.history.replaceState({}, "", url.toString());
  }

  // Update only the imageId parameter
  function updateImageId(newImageId: string | null) {
    imageId.value = newImageId;
    updateUrl(query.value, mode.value, newImageId);
  }

  // Watch for changes and update URL
  watch([query, mode], ([newQuery, newMode]) => {
    if (isInitialized.value) {
      updateUrl(newQuery, newMode, imageId.value);
    }
  });

  onMounted(() => {
    initFromUrl();
  });

  return {
    query,
    mode,
    imageId,
    isInitialized,
    updateImageId,
  };
}
