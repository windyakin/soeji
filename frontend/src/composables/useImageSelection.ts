import { ref, computed, type Ref } from "vue";
import type { SearchHit } from "../types/api";

export function useImageSelection(images: Ref<SearchHit[]>) {
  const selectedIds = ref<Set<string>>(new Set());
  const lastSelectedIndex = ref<number | null>(null);

  const selectedCount = computed(() => selectedIds.value.size);
  const isSelectionMode = computed(() => selectedIds.value.size > 0);
  const selectedImages = computed(() =>
    images.value.filter((img) => selectedIds.value.has(img.id))
  );

  /**
   * Handle image click with modifier keys
   * Returns true if selection mode interaction (don't open lightbox)
   * Returns false for normal click (should open lightbox)
   */
  function handleClick(index: number, event: MouseEvent): boolean {
    const image = images.value[index];
    if (!image) return false;

    // Cmd/Ctrl + Click: Toggle selection
    if (event.metaKey || event.ctrlKey) {
      toggleSelection(image.id);
      lastSelectedIndex.value = index;
      return true;
    }

    // Shift + Click: Range selection
    if (event.shiftKey && lastSelectedIndex.value !== null) {
      const start = Math.min(lastSelectedIndex.value, index);
      const end = Math.max(lastSelectedIndex.value, index);

      // Create new Set to trigger reactivity
      const newSelectedIds = new Set(selectedIds.value);
      for (let i = start; i <= end; i++) {
        const img = images.value[i];
        if (img) {
          newSelectedIds.add(img.id);
        }
      }
      selectedIds.value = newSelectedIds;
      return true;
    }

    // Normal click: Clear selection and return false to open lightbox
    // Only clear if not in selection mode, otherwise treat as single select
    if (isSelectionMode.value) {
      // If already in selection mode, toggle this image
      toggleSelection(image.id);
      lastSelectedIndex.value = index;
      return true;
    }

    return false;
  }

  function toggleSelection(id: string): void {
    const newSelectedIds = new Set(selectedIds.value);
    if (newSelectedIds.has(id)) {
      newSelectedIds.delete(id);
    } else {
      newSelectedIds.add(id);
    }
    selectedIds.value = newSelectedIds;
  }

  function selectAll(): void {
    selectedIds.value = new Set(images.value.map((img) => img.id));
    lastSelectedIndex.value = images.value.length - 1;
  }

  function clearSelection(): void {
    selectedIds.value = new Set();
    lastSelectedIndex.value = null;
  }

  function isSelected(id: string): boolean {
    return selectedIds.value.has(id);
  }

  return {
    selectedIds,
    selectedCount,
    isSelectionMode,
    selectedImages,
    handleClick,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
  };
}
