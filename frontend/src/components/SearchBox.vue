<script setup lang="ts">
import InputText from "primevue/inputtext";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import SelectButton from "primevue/selectbutton";

type SearchMode = "or" | "and";

const model = defineModel<string>({ default: "" });
const searchMode = defineModel<SearchMode>("searchMode", { default: "or" });

defineProps<{
  loading?: boolean;
}>();

const modeOptions = [
  { label: "OR", value: "or" },
  { label: "AND", value: "and" },
];
</script>

<template>
  <div class="search-box">
    <div class="search-row">
      <IconField class="search-field">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="model"
          placeholder="Search... (use -word to exclude)"
          class="search-input"
        />
        <InputIcon v-show="loading" class="pi pi-spin pi-spinner loading-icon" />
      </IconField>
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

.search-field {
  flex: 1;
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

:deep(.p-inputtext) {
  width: 100%;
}

:deep(.p-selectbutton .p-togglebutton) {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
}
</style>
