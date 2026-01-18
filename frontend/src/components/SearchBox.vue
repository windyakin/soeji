<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from "vue";
import InputText from "primevue/inputtext";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import SelectButton from "primevue/selectbutton";
import Tag from "primevue/tag";
import { useTagSuggestions, replaceWordAtPosition } from "../composables/useTagSuggestions";

type SearchMode = "or" | "and";

const model = defineModel<string>({ default: "" });
const searchMode = defineModel<SearchMode>("searchMode", { default: "and" });

defineProps<{
  loading?: boolean;
}>();

const modeOptions = [
  { label: "AND", value: "and" },
  { label: "OR", value: "or" },
];

// Tag suggestions
const { suggestions, wordStart, wordEnd, fetchSuggestions, clearSuggestions } = useTagSuggestions();
const showSuggestions = ref(false);
const selectedIndex = ref(-1);
const skipNextFetch = ref(false);
// Skip initial value from URL params - wait until component is mounted
const isInitialized = ref(false);
// Input element reference for cursor position
const inputRef = ref<{ $el: HTMLInputElement } | null>(null);

onMounted(() => {
  // Delay initialization to skip any initial URL param values
  setTimeout(() => {
    isInitialized.value = true;
  }, 100);
});

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function getInputElement(): HTMLInputElement | null {
  return inputRef.value?.$el ?? null;
}

function getCursorPosition(): number {
  const input = getInputElement();
  return input?.selectionStart ?? model.value.length;
}

function handleInput() {
  // Skip fetch if component is not initialized (initial URL param load)
  if (!isInitialized.value) {
    return;
  }

  // Skip fetch if we just selected a suggestion
  if (skipNextFetch.value) {
    skipNextFetch.value = false;
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    const cursorPosition = getCursorPosition();
    fetchSuggestions(model.value, cursorPosition);
  }, 150);
}

watch(suggestions, (newSuggestions) => {
  // Only show if not skipping
  if (!skipNextFetch.value) {
    showSuggestions.value = newSuggestions.length > 0;
    selectedIndex.value = -1;
  }
});

function handleFocus() {
  // Only show suggestions if there are any and we didn't just select one
  if (suggestions.value.length > 0 && !skipNextFetch.value) {
    showSuggestions.value = true;
  }
}

function handleBlur() {
  // Delay to allow click on suggestion
  setTimeout(() => {
    showSuggestions.value = false;
  }, 200);
}

function handleKeydown(e: KeyboardEvent) {
  // Close suggestions on space or enter (tag confirmation)
  if (e.key === " " || e.key === "Enter") {
    // If a suggestion is selected, use it
    if (showSuggestions.value && selectedIndex.value >= 0) {
      e.preventDefault();
      selectSuggestion(selectedIndex.value);
      return;
    }
    // Otherwise, close suggestions (user confirmed input without selection)
    closeSuggestions();
    return;
  }

  if (!showSuggestions.value || suggestions.value.length === 0) {
    return;
  }

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      selectedIndex.value = Math.min(selectedIndex.value + 1, suggestions.value.length - 1);
      break;
    case "ArrowUp":
      e.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, -1);
      break;
    case "Escape":
      closeSuggestions();
      break;
    case "Tab":
      if (selectedIndex.value >= 0) {
        e.preventDefault();
        selectSuggestion(selectedIndex.value);
      }
      break;
  }
}

function closeSuggestions() {
  showSuggestions.value = false;
  selectedIndex.value = -1;
  clearSuggestions();
}

function selectSuggestion(index: number) {
  const suggestion = suggestions.value[index];
  if (suggestion) {
    skipNextFetch.value = true;
    const { text, cursorPosition } = replaceWordAtPosition(
      model.value,
      suggestion.name,
      suggestion.displayPrefix,
      wordStart.value,
      wordEnd.value
    );
    model.value = text;
    // Set cursor position after Vue updates the DOM
    nextTick(() => {
      const input = getInputElement();
      if (input) {
        input.setSelectionRange(cursorPosition, cursorPosition);
      }
    });
    clearSuggestions();
    showSuggestions.value = false;
    selectedIndex.value = -1;
  }
}
</script>

<template>
  <div class="search-box">
    <div class="search-row">
      <div class="search-field-wrapper">
        <IconField class="search-field">
          <InputIcon class="pi pi-search" />
          <InputText
            ref="inputRef"
            v-model="model"
            placeholder="Search"
            class="search-input"
            @input="handleInput"
            @focus="handleFocus"
            @blur="handleBlur"
            @keydown="handleKeydown"
            autocomplete="off"
          />
          <InputIcon v-show="loading" class="pi pi-spin pi-spinner loading-icon" />
        </IconField>

        <!-- Suggestions dropdown -->
        <div v-if="showSuggestions && suggestions.length > 0" class="suggestions-dropdown">
          <div
            v-for="(suggestion, index) in suggestions"
            :key="suggestion.id"
            class="suggestion-item"
            :class="{ selected: index === selectedIndex }"
            @mousedown.prevent="selectSuggestion(index)"
            @mouseenter="selectedIndex = index"
          >
            <div class="suggestion-left">
              <Tag
                :value="suggestion.prefixInfo.label"
                :severity="suggestion.prefixInfo.severity"
                class="prefix-badge"
              />
              <span class="tag-name">{{ suggestion.name }}</span>
            </div>
            <span class="tag-count">{{ suggestion.imageCount }}</span>
          </div>
        </div>
      </div>

      <SelectButton
        v-model="searchMode"
        :options="modeOptions"
        optionLabel="label"
        optionValue="value"
        :allowEmpty="false"
        class="mode-toggle"
        size="small"
      />
    </div>
  </div>
</template>

<style scoped>
.search-box {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.search-field-wrapper {
  flex: 1;
  position: relative;
}

.search-field {
  width: 100%;
}

.search-input {
  width: 100%;
  padding-left: 2.5rem;
  padding-right: 2.5rem;
}

.loading-icon {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
}

.mode-toggle {
  flex-shrink: 0;
}

.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 0.25rem;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 300px;
  overflow-y: auto;
  z-index: 1000;
}

.suggestion-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: background 0.1s;
}

.suggestion-item:hover,
.suggestion-item.selected {
  background: var(--p-surface-100);
}

.suggestion-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.prefix-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
}

.tag-name {
  font-size: 0.875rem;
}

.tag-count {
  font-size: 0.75rem;
  color: var(--p-surface-500);
  background: var(--p-surface-100);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

.suggestion-item.selected .tag-count {
  background: var(--p-surface-200);
}

:deep(.p-inputtext) {
  width: 100%;
}
</style>
