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

// Current cursor position for word replacement
const currentWordStart = ref<number>(0);
const currentWordEnd = ref<number>(0);

export interface UseTagSuggestionsReturn {
  suggestions: ComputedRef<SuggestionItem[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  wordStart: Ref<number>;
  wordEnd: Ref<number>;
  fetchSuggestions: (query: string, cursorPosition?: number) => Promise<void>;
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

  async function fetchSuggestions(query: string, cursorPosition?: number) {
    // Cancel previous request
    if (abortController) {
      abortController.abort();
    }

    if (!query.trim()) {
      rawSuggestions.value = [];
      currentPrefix.value = "";
      return;
    }

    // Default to end of query if cursor position not specified
    const cursor = cursorPosition ?? query.length;

    // Extract the word at cursor position
    const { word, prefix, wordStart, wordEnd } = parseWordAtCursor(query, cursor);
    currentPrefix.value = prefix;
    currentWordStart.value = wordStart;
    currentWordEnd.value = wordEnd;

    // Don't show suggestions if cursor is at a space or between words
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
    wordStart: currentWordStart,
    wordEnd: currentWordEnd,
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
 * Parse the word at cursor position
 * Returns the word, its prefix, and the word boundaries for replacement
 */
function parseWordAtCursor(
  query: string,
  cursorPosition: number
): { word: string; prefix: string; wordStart: number; wordEnd: number } {
  // Find word boundaries around cursor
  let wordStart = cursorPosition;
  let wordEnd = cursorPosition;

  // Find start of word (go backwards until space or start)
  while (wordStart > 0 && query[wordStart - 1] !== " ") {
    wordStart--;
  }

  // Find end of word (go forwards until space or end)
  while (wordEnd < query.length && query[wordEnd] !== " ") {
    wordEnd++;
  }

  // Check if cursor is at a space (between words or at end after space)
  if (wordStart === wordEnd) {
    return { word: "", prefix: "", wordStart, wordEnd };
  }

  const wordPart = query.slice(wordStart, wordEnd);

  // Check if user is only typing a prefix (p, p:, -p:, etc.)
  if (isPrefixOnly(wordPart)) {
    return { word: "", prefix: "", wordStart, wordEnd };
  }

  // Match pattern: optional minus, optional prefix (p/u/n), colon, then word
  // Examples: "cat", "p:cat", "-p:cat", "u:dog"
  const prefixMatch = wordPart.match(/^(-?)([pun]:)?(.*)$/i);

  if (prefixMatch) {
    const minus = prefixMatch[1] || "";
    const typePrefix = prefixMatch[2] || "";
    let word = prefixMatch[3] || "";

    // Remove quotes from word
    word = word.replace(/^["']|["']$/g, "");

    // Build full prefix (e.g., "-p:", "u:", "")
    const fullPrefix = minus + typePrefix;

    return { word, prefix: fullPrefix, wordStart, wordEnd };
  }

  return { word: wordPart, prefix: "", wordStart, wordEnd };
}

/**
 * Replace the word at the given position with the selected tag
 * Preserves the prefix (p:, u:, n:, -p:, etc.)
 * If no prefix was typed, defaults to "p:" (positive tag)
 */
export function replaceWordAtPosition(
  query: string,
  tagName: string,
  displayPrefix: string,
  wordStart: number,
  wordEnd: number
): { text: string; cursorPosition: number } {
  // Quote the tag if it contains spaces
  const formattedTag = tagName.includes(" ") ? `"${tagName}"` : tagName;

  // Use the prefix from the suggestion, or default to "p:" if none was typed
  const prefix = displayPrefix || "p:";
  const replacement = prefix + formattedTag + " ";

  // Build the new query
  const before = query.slice(0, wordStart);
  const after = query.slice(wordEnd);
  const newText = before + replacement + after;
  const newCursorPosition = wordStart + replacement.length;

  return { text: newText, cursorPosition: newCursorPosition };
}
