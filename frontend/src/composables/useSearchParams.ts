import { ref, watch, onMounted } from "vue";
import type { SearchMode } from "./useApi";

export function useSearchParams() {
  const query = ref("");
  const mode = ref<SearchMode>("and");
  const isInitialized = ref(false);

  // Read URL params on mount
  function initFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlQuery = urlParams.get("q") || "";
    const urlMode = urlParams.get("mode") as SearchMode | null;

    query.value = urlQuery;
    if (urlMode === "or" || urlMode === "and") {
      mode.value = urlMode;
    }
    isInitialized.value = true;
  }

  // Update URL without page reload
  function updateUrl(newQuery: string, newMode: SearchMode) {
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

    // Use replaceState to update URL without adding to history
    window.history.replaceState({}, "", url.toString());
  }

  // Watch for changes and update URL
  watch([query, mode], ([newQuery, newMode]) => {
    if (isInitialized.value) {
      updateUrl(newQuery, newMode);
    }
  });

  onMounted(() => {
    initFromUrl();
  });

  return {
    query,
    mode,
    isInitialized,
  };
}
