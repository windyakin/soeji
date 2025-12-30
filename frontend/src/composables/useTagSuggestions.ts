import { ref } from "vue";
import type { TagListItem, TagsResponse } from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE || "";

export function useTagSuggestions() {
  const suggestions = ref<TagListItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  let abortController: AbortController | null = null;

  async function fetchSuggestions(query: string) {
    // Cancel previous request
    if (abortController) {
      abortController.abort();
    }

    if (!query.trim()) {
      suggestions.value = [];
      return;
    }

    // Extract the last word being typed for suggestion
    const lastWord = getLastWord(query);
    if (!lastWord || lastWord.length < 2) {
      suggestions.value = [];
      return;
    }

    loading.value = true;
    error.value = null;
    abortController = new AbortController();

    try {
      const params = new URLSearchParams();
      params.set("q", lastWord);
      params.set("limit", "10");

      const response = await fetch(`${API_BASE}/api/tags/suggest?${params}`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to fetch suggestions");
      }

      const data: TagsResponse = await response.json();
      suggestions.value = data.tags;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        // Request was cancelled, ignore
        return;
      }
      error.value = e instanceof Error ? e.message : "Unknown error";
      suggestions.value = [];
    } finally {
      loading.value = false;
    }
  }

  function clearSuggestions() {
    suggestions.value = [];
  }

  return {
    suggestions,
    loading,
    error,
    fetchSuggestions,
    clearSuggestions,
  };
}

/**
 * Extract the last word being typed from the query
 * Handles prefixes like +, -, and quoted strings
 */
function getLastWord(query: string): string {
  const trimmed = query.trimEnd();

  // Find the last space
  const lastSpaceIndex = trimmed.lastIndexOf(" ");
  const lastPart = lastSpaceIndex === -1 ? trimmed : trimmed.slice(lastSpaceIndex + 1);

  // Remove prefix operators (+, -)
  let word = lastPart;
  if (word.startsWith("+") || word.startsWith("-")) {
    word = word.slice(1);
  }

  // Remove quotes
  word = word.replace(/^["']|["']$/g, "");

  return word;
}

/**
 * Replace the last word in query with the selected tag
 */
export function replaceLastWord(query: string, tagName: string): string {
  const trimmed = query.trimEnd();
  const lastSpaceIndex = trimmed.lastIndexOf(" ");

  // Check if the last word has a prefix
  const lastPart = lastSpaceIndex === -1 ? trimmed : trimmed.slice(lastSpaceIndex + 1);
  let prefix = "";
  if (lastPart.startsWith("+")) {
    prefix = "+";
  } else if (lastPart.startsWith("-")) {
    prefix = "-";
  }

  // Build the new query
  const basePart = lastSpaceIndex === -1 ? "" : trimmed.slice(0, lastSpaceIndex + 1);

  // Quote the tag if it contains spaces
  const formattedTag = tagName.includes(" ") ? `"${tagName}"` : tagName;

  return basePart + prefix + formattedTag + " ";
}
