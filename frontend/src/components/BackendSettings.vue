<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { useBackendSettings } from '../composables/useBackendSettings'
import type { BackendConfig } from '../types/backend'
import SettingsCard from './SettingsCard.vue'

const toast = useToast()
const {
  sortedBackends,
  selectedBackend,
  isLoading,
  loadBackends,
  addBackend,
  updateBackend,
  deleteBackend,
  selectBackend,
  validateUrl,
} = useBackendSettings()

// Dialog state
type DialogMode = 'none' | 'add' | 'edit'
const dialogMode = ref<DialogMode>('none')
const editingBackend = ref<BackendConfig | null>(null)

// Form state
const formName = ref('')
const formUrl = ref('')
const formError = ref('')
const formLoading = ref(false)

const dialogTitle = computed(() => {
  return dialogMode.value === 'add' ? 'Add Backend' : 'Edit Backend'
})

const dialogVisible = computed({
  get: () => dialogMode.value !== 'none',
  set: (value) => {
    if (!value) {
      closeDialog()
    }
  }
})

const canDelete = computed(() => {
  return editingBackend.value && !editingBackend.value.isDefault
})

onMounted(() => {
  loadBackends()
})

function openAddDialog() {
  dialogMode.value = 'add'
  editingBackend.value = null
  formName.value = ''
  formUrl.value = ''
  formError.value = ''
}

function openEditDialog(backend: BackendConfig) {
  dialogMode.value = 'edit'
  editingBackend.value = backend
  formName.value = backend.name
  formUrl.value = backend.url
  formError.value = ''
}

function closeDialog() {
  dialogMode.value = 'none'
  editingBackend.value = null
  formName.value = ''
  formUrl.value = ''
  formError.value = ''
  formLoading.value = false
}

async function handleSave() {
  formError.value = ''

  // Validate name
  if (!formName.value.trim()) {
    formError.value = 'Name is required'
    return
  }

  // Validate URL
  const urlValidation = validateUrl(formUrl.value)
  if (!urlValidation.valid) {
    formError.value = urlValidation.message || 'Invalid URL'
    return
  }

  formLoading.value = true

  try {
    if (dialogMode.value === 'add') {
      const newBackend = await addBackend(formName.value, formUrl.value)
      selectBackend(newBackend.id)
      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Backend added',
        life: 3000
      })
    } else if (editingBackend.value) {
      await updateBackend(editingBackend.value.id, {
        name: formName.value,
        url: formUrl.value,
      })
      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Backend updated',
        life: 3000
      })
    }
    closeDialog()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'An error occurred'
  } finally {
    formLoading.value = false
  }
}

async function handleDelete() {
  if (!editingBackend.value || editingBackend.value.isDefault) {
    return
  }

  formLoading.value = true

  try {
    await deleteBackend(editingBackend.value.id)
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Backend deleted',
      life: 3000
    })
    closeDialog()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'An error occurred'
  } finally {
    formLoading.value = false
  }
}

function getUrlDisplay(url: string): string {
  return url || '(Relative Path)'
}
</script>

<template>
  <SettingsCard header="Backend">
    <!-- Selected backend info -->
    <div class="settings-item">
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-server item-icon"></i>
          <div class="item-text">
            <span class="item-label">Current Backend</span>
            <span class="item-description">{{ selectedBackend?.name || 'Not selected' }}</span>
          </div>
        </div>
        <Tag
          v-if="selectedBackend"
          severity="success"
          :value="selectedBackend.isDefault ? 'Default' : 'Custom'"
        />
      </div>
    </div>

    <!-- Backend list -->
    <button
      v-for="backend in sortedBackends"
      :key="backend.id"
      class="settings-item clickable"
      :disabled="isLoading"
      @click="openEditDialog(backend)"
    >
      <div class="item-content">
        <div class="item-left">
          <i
            class="pi item-icon"
            :class="backend.id === selectedBackend?.id ? 'pi-check-circle' : 'pi-circle'"
          ></i>
          <div class="item-text">
            <span class="item-label">{{ backend.name }}</span>
            <span class="item-description">{{ getUrlDisplay(backend.url) }}</span>
          </div>
        </div>
        <i class="pi pi-chevron-right item-chevron"></i>
      </div>
    </button>

    <!-- Add button -->
    <button
      class="settings-item clickable"
      :disabled="isLoading"
      @click="openAddDialog"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-plus item-icon"></i>
          <span class="item-label">Add Backend</span>
        </div>
        <i class="pi pi-chevron-right item-chevron"></i>
      </div>
    </button>
  </SettingsCard>

  <!-- Add/Edit Dialog -->
  <Dialog
    v-model:visible="dialogVisible"
    modal
    :header="dialogTitle"
    :style="{ width: '400px' }"
    :breakpoints="{ '480px': '90vw' }"
    :closable="!formLoading"
  >
    <div class="dialog-content">
      <Message v-if="formError" severity="error" :closable="false">
        {{ formError }}
      </Message>

      <div class="form-group">
        <label for="backend-name">Name</label>
        <InputText
          id="backend-name"
          v-model="formName"
          :disabled="formLoading"
          placeholder="e.g., Home Server"
          class="form-input"
        />
      </div>

      <div class="form-group">
        <label for="backend-url">URL</label>
        <InputText
          id="backend-url"
          v-model="formUrl"
          :disabled="formLoading"
          placeholder="e.g., http://192.168.1.100:3000"
          class="form-input"
        />
        <small class="form-hint">Leave empty for relative path (same origin)</small>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div class="footer-left">
          <Button
            v-if="dialogMode === 'edit' && canDelete"
            label="Delete"
            icon="pi pi-trash"
            severity="danger"
            text
            :loading="formLoading"
            @click="handleDelete"
          />
        </div>
        <div class="footer-right">
          <Button
            label="Cancel"
            text
            :disabled="formLoading"
            @click="closeDialog"
          />
          <Button
            label="Save"
            icon="pi pi-check"
            :loading="formLoading"
            :disabled="!formName.trim()"
            @click="handleSave"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.form-input {
  width: 100%;
}

.form-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.footer-left {
  flex-shrink: 0;
}

.footer-right {
  display: flex;
  gap: 0.5rem;
}
</style>
