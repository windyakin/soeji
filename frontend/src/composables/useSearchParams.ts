import { ref, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { SearchMode } from "./useApi";

export function useSearchParams() {
  const route = useRoute();
  const router = useRouter();

  const query = ref("");
  const mode = ref<SearchMode>("and");
  const isInitialized = ref(false);

  // Read URL params on mount
  function initFromUrl() {
    const urlQuery = (route.query.q as string) || "";
    const urlMode = route.query.mode as SearchMode | null;

    query.value = urlQuery;
    if (urlMode === "or" || urlMode === "and") {
      mode.value = urlMode;
    }
    isInitialized.value = true;
  }

  // Update URL without page reload using router.replace
  function updateUrl(newQuery: string, newMode: SearchMode) {
    const newQueryParams: Record<string, string> = {};

    if (newQuery) {
      newQueryParams.q = newQuery;
    }

    if (newMode !== "and") {
      newQueryParams.mode = newMode;
    }

    // Use router.replace to update URL without adding to history
    router.replace({
      name: route.name ?? undefined,
      params: route.params,
      query: newQueryParams,
    });
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
