<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import Select from 'primevue/select'
import { useBackendSettings } from '../composables/useBackendSettings'

const emit = defineEmits<{
  change: [backendId: string]
}>()

const {
  sortedBackends,
  selectedId,
  isInitialized,
  loadBackends,
  selectBackend,
} = useBackendSettings()

const showSelector = computed(() => sortedBackends.value.length > 1)

const selectedValue = computed({
  get: () => selectedId.value,
  set: (value) => {
    if (value && value !== selectedId.value) {
      selectBackend(value)
      emit('change', value)
    }
  }
})

onMounted(() => {
  loadBackends()
})

// Re-emit change when selectedId changes externally (e.g., from settings)
watch(selectedId, (newId, oldId) => {
  if (newId && oldId && newId !== oldId) {
    emit('change', newId)
  }
})
</script>

<template>
  <Select
    v-if="showSelector && isInitialized"
    v-model="selectedValue"
    :options="sortedBackends"
    option-label="name"
    option-value="id"
    placeholder="Backend"
    class="backend-selector"
  />
</template>

<style scoped>
.backend-selector {
  min-width: 120px;
  max-width: 180px;
}

.backend-selector :deep(.p-select-label) {
  padding: 0.5rem 0.75rem;
}

@media (max-width: 768px) {
  .backend-selector {
    min-width: 100px;
    max-width: 140px;
  }

  .backend-selector :deep(.p-select-label) {
    padding: 0.375rem 0.5rem;
    font-size: 0.875rem;
  }
}
</style>
