<script setup lang="ts">
import { ref } from "vue";
import Button from "primevue/button";
import AutoComplete from "primevue/autocomplete";
import { useTagSuggestions } from "../composables/useTagSuggestions";
import type { SearchHit, TagListItem } from "../types/api";

const props = defineProps<{
  selectedCount: number;
  selectedImages: SearchHit[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  addTag: [tagName: string];
  clearSelection: [];
}>();

const tagInput = ref("");
const { suggestions, loading: suggestionsLoading, fetchSuggestions, clearSuggestions } = useTagSuggestions();
const filteredSuggestions = ref<TagListItem[]>([]);

async function handleComplete(event: { query: string }) {
  await fetchSuggestions(event.query);
  filteredSuggestions.value = suggestions.value;
}

function handleSelectTag(event: { value: TagListItem | string }) {
  const tagName = typeof event.value === "string" ? event.value : event.value.name;

  if (tagName.trim()) {
    emit("addTag", tagName.trim());
    tagInput.value = "";
    clearSuggestions();
  }
}

function handleAddClick() {
  if (tagInput.value.trim()) {
    emit("addTag", tagInput.value.trim());
    tagInput.value = "";
    clearSuggestions();
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && tagInput.value.trim() && filteredSuggestions.value.length === 0) {
    e.preventDefault();
    handleAddClick();
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="tagging-panel">
      <div class="panel-content">
        <div class="selection-info">
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            severity="secondary"
            @click="$emit('clearSelection')"
            aria-label="Clear selection"
          />
          <span class="count">{{ selectedCount }} images selected</span>
        </div>

        <div class="tag-input-section">
          <AutoComplete
            v-model="tagInput"
            :suggestions="filteredSuggestions"
            optionLabel="name"
            placeholder="Add tag..."
            :loading="suggestionsLoading"
            :disabled="loading"
            class="tag-input"
            @complete="handleComplete"
            @item-select="handleSelectTag"
            @keydown="handleKeydown"
          >
            <template #option="{ option }">
              <div class="suggestion-option">
                <span>{{ option.name }}</span>
                <span class="suggestion-count">{{ option.imageCount }}</span>
              </div>
            </template>
          </AutoComplete>

          <Button
            label="Add"
            icon="pi pi-plus"
            :disabled="!tagInput.trim() || loading"
            :loading="loading"
            @click="handleAddClick"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tagging-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--p-surface-0);
  border-top: 1px solid var(--p-surface-200);
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  padding: 1rem;
  padding-bottom: calc(1rem + env(safe-area-inset-bottom));
}

.panel-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.selection-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.count {
  font-weight: 600;
  color: var(--p-primary-color);
  white-space: nowrap;
}

.tag-input-section {
  display: flex;
  gap: 0.5rem;
}

.tag-input {
  flex: 1;
}

.suggestion-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.suggestion-count {
  font-size: 0.75rem;
  color: var(--p-surface-500);
  margin-left: 1rem;
}

/* Responsive */
@media (max-width: 768px) {
  .panel-content {
    flex-wrap: wrap;
  }

  .selection-info {
    width: 100%;
    justify-content: space-between;
  }

  .tag-input-section {
    width: 100%;
    max-width: none;
  }
}
</style>
