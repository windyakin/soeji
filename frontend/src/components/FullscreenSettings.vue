<script setup lang="ts">
import SelectButton from 'primevue/selectbutton'
import { useFullscreenSettings, type FullscreenMode } from '../composables/useFullscreenSettings'
import SettingsCard from './SettingsCard.vue'

const { fullscreenMode, setFullscreenMode } = useFullscreenSettings()

const fullscreenModeOptions = [
  { label: 'Monitor', value: 'api' as FullscreenMode },
  { label: 'Browser', value: 'css' as FullscreenMode },
]

function handleChange(value: FullscreenMode) {
  setFullscreenMode(value)
}
</script>

<template>
  <SettingsCard header="Display">
    <div class="settings-item">
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-expand item-icon"></i>
          <div class="item-text">
            <span class="item-label">Default Fullscreen Mode</span>
            <span class="item-description">
              Hold Shift while clicking to use the alternate mode
            </span>
          </div>
        </div>
      </div>
    </div>
    <div class="settings-item">
      <div class="item-content fullscreen-select-content">
        <SelectButton
          :modelValue="fullscreenMode"
          :options="fullscreenModeOptions"
          optionLabel="label"
          optionValue="value"
          class="fullscreen-select-button"
          @update:modelValue="handleChange"
        />
      </div>
    </div>
  </SettingsCard>
</template>

<style scoped>
.fullscreen-select-content {
  justify-content: center;
}

.fullscreen-select-button {
  width: 100%;
  display: flex;
}

.fullscreen-select-button :deep(.p-togglebutton) {
  flex: 1;
}
</style>
