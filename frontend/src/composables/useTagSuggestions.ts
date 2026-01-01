import { ref, computed, type ComputedRef, type Ref } from "vue";
import type { TagListItem, TagsResponse } from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE || "";

/**
 * Tag prefix types and their display labels
 */
export type TagPrefix = "p" | "u" | "n" | null;

export interface PrefixInfo {
  prefix: TagPrefix;
  label: string;
  severity: "success" | "info" | "danger" | "secondary";
}

const prefixMap: Record<string, PrefixInfo> = {
  p: { prefix: "p", label: "positive", severity: "success" },
  u: { prefix: "u", label: "user", severity: "info" },
  n: { prefix: "n", label: "negative", severity: "danger" },
};

export interface SuggestionItem extends TagListItem {
  prefixInfo: PrefixInfo;
  displayPrefix: string; // For inserting into input (e.g., "p:", "u:", "-p:")
}

// Current prefix state for suggestions
const currentPrefix = ref<string>("");

export interface UseTagSuggestionsReturn {
  suggestions: ComputedRef<SuggestionItem[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  fetchSuggestions: (query: string) => Promise<void>;
  clearSuggestions: () => void;
}

export function useTagSuggestions(): UseTagSuggestionsReturn {
  const rawSuggestions = ref<TagListItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Transform suggestions with prefix info
  const suggestions = computed<SuggestionItem[]>(() => {
    const prefixInfo = getPrefixInfo(currentPrefix.value);
    return rawSuggestions.value.map((tag) => ({
      ...tag,
      prefixInfo,
      displayPrefix: currentPrefix.value,
    }));
  });

  let abortController: AbortController | null = null;

  async function fetchSuggestions(query: string) {
    // Cancel previous request
    if (abortController) {
      abortController.abort();
    }

    if (!query.trim()) {
      rawSuggestions.value = [];
      currentPrefix.value = "";
      return;
    }

    // Extract the last word being typed for suggestion
    const { word, prefix } = parseLastWord(query);
    currentPrefix.value = prefix;

    if (!word || word.length < 2) {
      rawSuggestions.value = [];
      return;
    }

    loading.value = true;
    error.value = null;
    abortController = new AbortController();

    try {
      const params = new URLSearchParams();
      params.set("q", word);
      params.set("limit", "10");

      const response = await fetch(`${API_BASE}/api/tags/suggest?${params}`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to fetch suggestions");
      }

      const data: TagsResponse = await response.json();
      rawSuggestions.value = data.tags;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        // Request was cancelled, ignore
        return;
      }
      error.value = e instanceof Error ? e.message : "Unknown error";
      rawSuggestions.value = [];
    } finally {
      loading.value = false;
    }
  }

  function clearSuggestions() {
    rawSuggestions.value = [];
    currentPrefix.value = "";
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
 * Get prefix info from prefix string
 */
function getPrefixInfo(prefix: string): PrefixInfo {
  // Extract base prefix (remove leading -)
  const isNegative = prefix.startsWith("-");
  const basePrefix = isNegative ? prefix.slice(1).replace(":", "") : prefix.replace(":", "");

  const info = prefixMap[basePrefix];
  if (info) {
    return info;
  }

  // Default: positive (no prefix)
  return { prefix: "p", label: "positive", severity: "success" };
}

/**
 * Check if input is just a prefix pattern (p, p:, -p, -p:, etc.)
 * These should not trigger search
 */
function isPrefixOnly(input: string): boolean {
  // Matches: p, u, n, p:, u:, n:, -p, -u, -n, -p:, -u:, -n:
  return /^-?[pun]:?$/i.test(input);
}

/**
 * Parse the last word being typed from the query
 * Returns the word and its prefix (e.g., "p:", "u:", "-p:")
 * Returns empty word if only typing a prefix
 */
function parseLastWord(query: string): { word: string; prefix: string } {
  const trimmed = query.trimEnd();

  // Find the last space
  const lastSpaceIndex = trimmed.lastIndexOf(" ");
  const lastPart = lastSpaceIndex === -1 ? trimmed : trimmed.slice(lastSpaceIndex + 1);

  // Check if user is only typing a prefix (p, p:, -p:, etc.)
  if (isPrefixOnly(lastPart)) {
    return { word: "", prefix: "" };
  }

  // Match pattern: optional minus, optional prefix (p/u/n), colon, then word
  // Examples: "cat", "p:cat", "-p:cat", "u:dog"
  const prefixMatch = lastPart.match(/^(-?)([pun]:)?(.*)$/i);

  if (prefixMatch) {
    const minus = prefixMatch[1] || "";
    const typePrefix = prefixMatch[2] || "";
    let word = prefixMatch[3] || "";

    // Remove quotes from word
    word = word.replace(/^["']|["']$/g, "");

    // Build full prefix (e.g., "-p:", "u:", "")
    const fullPrefix = minus + typePrefix;

    return { word, prefix: fullPrefix };
  }

  return { word: lastPart, prefix: "" };
}

/**
 * Replace the last word in query with the selected tag
 * Preserves the prefix (p:, u:, n:, -p:, etc.)
 */
export function replaceLastWord(query: string, tagName: string, displayPrefix: string): string {
  const trimmed = query.trimEnd();
  const lastSpaceIndex = trimmed.lastIndexOf(" ");

  // Build the new query
  const basePart = lastSpaceIndex === -1 ? "" : trimmed.slice(0, lastSpaceIndex + 1);

  // Quote the tag if it contains spaces
  const formattedTag = tagName.includes(" ") ? `"${tagName}"` : tagName;

  // Use the prefix from the suggestion (preserves p:, u:, -p:, etc.)
  return basePart + displayPrefix + formattedTag + " ";
}
