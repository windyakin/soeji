<script setup lang="ts">
import InputText from "primevue/inputtext";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";

const model = defineModel<string>({ default: "" });

defineProps<{
  loading?: boolean;
}>();
</script>

<template>
  <div class="search-box">
    <IconField>
      <InputIcon class="pi pi-search" />
      <InputText
        v-model="model"
        placeholder="Search images by tags or prompt..."
        class="search-input"
      />
      <InputIcon v-show="loading" class="pi pi-spin pi-spinner loading-icon" />
    </IconField>
  </div>
</template>

<style scoped>
.search-box {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
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

:deep(.p-inputtext) {
  width: 100%;
}
</style>
