<script setup lang="ts">
import { ref, watch } from "vue";
import InputText from "primevue/inputtext";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import SelectButton from "primevue/selectbutton";
import { useTagSuggestions, replaceLastWord } from "../composables/useTagSuggestions";

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
const { suggestions, fetchSuggestions, clearSuggestions } = useTagSuggestions();
const showSuggestions = ref(false);
const selectedIndex = ref(-1);
const skipNextFetch = ref(false);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(model, (newValue) => {
  // Skip fetch if we just selected a suggestion
  if (skipNextFetch.value) {
    skipNextFetch.value = false;
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    fetchSuggestions(newValue);
  }, 150);
});

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
    case "Enter":
      if (selectedIndex.value >= 0) {
        e.preventDefault();
        selectSuggestion(selectedIndex.value);
      }
      break;
    case "Escape":
      showSuggestions.value = false;
      selectedIndex.value = -1;
      break;
    case "Tab":
      if (selectedIndex.value >= 0) {
        e.preventDefault();
        selectSuggestion(selectedIndex.value);
      }
      break;
  }
}

function selectSuggestion(index: number) {
  const tag = suggestions.value[index];
  if (tag) {
    skipNextFetch.value = true;
    model.value = replaceLastWord(model.value, tag.name);
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
            v-model="model"
            placeholder="Search"
            class="search-input"
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
            v-for="(tag, index) in suggestions"
            :key="tag.id"
            class="suggestion-item"
            :class="{ selected: index === selectedIndex }"
            @mousedown.prevent="selectSuggestion(index)"
            @mouseenter="selectedIndex = index"
          >
            <span class="tag-name">{{ tag.name }}</span>
            <span class="tag-count">{{ tag.imageCount }}</span>
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

:deep(.p-selectbutton .p-togglebutton) {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
}
</style>
