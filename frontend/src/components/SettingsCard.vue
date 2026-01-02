<script setup lang="ts">
import Card from 'primevue/card'

defineProps<{
  header?: string
}>()
</script>

<template>
  <div class="settings-section">
    <div v-if="header" class="section-header">{{ header }}</div>
    <Card class="settings-card">
      <template #content>
        <div class="settings-list">
          <slot />
        </div>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-header {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  padding: 0.5rem 1rem 0.25rem;
}

.settings-card {
  overflow: hidden;
}

.settings-card :deep(.p-card-body) {
  padding: 0;
}

.settings-card :deep(.p-card-content) {
  padding: 0;
}

.settings-list {
  overflow: hidden;
}

.settings-list :deep(.settings-item) {
  width: 100%;
  border: none;
  background: none;
  text-align: left;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--p-surface-200);
  font-family: inherit;
  font-size: inherit;
}

.settings-list :deep(.settings-item:last-child) {
  border-bottom: none;
}

.settings-list :deep(.settings-item.clickable) {
  cursor: pointer;
  transition: background-color 0.15s;
}

.settings-list :deep(.settings-item.clickable:hover:not(:disabled)) {
  background: var(--p-surface-100);
}

.settings-list :deep(.settings-item.clickable:active:not(:disabled)) {
  background: var(--p-surface-200);
}

.settings-list :deep(.settings-item:disabled) {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-list :deep(.settings-item.danger .item-icon),
.settings-list :deep(.settings-item.danger .item-label) {
  color: var(--p-red-500);
}

.settings-list :deep(.item-content) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.settings-list :deep(.item-left) {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.settings-list :deep(.item-right) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.settings-list :deep(.item-text) {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.settings-list :deep(.item-icon) {
  font-size: 1.125rem;
  color: var(--p-primary-color);
  width: 1.5rem;
  text-align: center;
}

.settings-list :deep(.item-label) {
  font-size: 0.9375rem;
  color: var(--p-text-color);
}

.settings-list :deep(.item-description) {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.settings-list :deep(.item-value) {
  font-size: 0.9375rem;
  color: var(--p-text-muted-color);
}

.settings-list :deep(.item-value.mono) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: var(--p-surface-100);
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.8125rem;
}

.settings-list :deep(.item-chevron) {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.settings-list :deep(.item-spinner) {
  width: 1.25rem !important;
  height: 1.25rem !important;
}

.settings-list :deep(.item-spinner svg) {
  width: 1.25rem;
  height: 1.25rem;
}
</style>
