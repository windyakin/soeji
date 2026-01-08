<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Card from 'primevue/card'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useAuth } from '../composables/useAuth'
import type { UserListItem, UserRole, CreateUserRequest } from '../types/auth'

const API_BASE = import.meta.env.VITE_API_BASE || ''

const toast = useToast()
const { getAuthHeader, currentUser, canManageUsers } = useAuth()

const users = ref<UserListItem[]>([])
const loading = ref(false)
const showCreateDialog = ref(false)
const showDeleteDialog = ref(false)
const userToDelete = ref<UserListItem | null>(null)

// Form state
const newUser = ref<CreateUserRequest>({
  username: '',
  password: '',
  role: 'user',
})
const formError = ref('')
const formLoading = ref(false)

const roleOptions = [
  { label: 'Administrator', value: 'admin' },
  { label: 'User', value: 'user' },
  { label: 'Guest', value: 'guest' },
]

async function fetchUsers() {
  loading.value = true
  try {
    const response = await fetch(`${API_BASE}/api/users`, {
      headers: getAuthHeader(),
    })
    if (!response.ok) throw new Error('Failed to fetch users')
    users.value = await response.json()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to load users',
      life: 3000,
    })
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  newUser.value = { username: '', password: '', role: 'user' }
  formError.value = ''
  showCreateDialog.value = true
}

async function createUser() {
  formError.value = ''

  if (!newUser.value.username || !newUser.value.password) {
    formError.value = 'Username and password are required'
    return
  }

  if (newUser.value.password.length < 8) {
    formError.value = 'Password must be at least 8 characters'
    return
  }

  formLoading.value = true
  try {
    const response = await fetch(`${API_BASE}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(newUser.value),
    })

    if (!response.ok) {
      const data = await response.json()
      formError.value = data.error || 'Failed to create user'
      return
    }

    toast.add({
      severity: 'success',
      summary: 'User created',
      life: 3000,
    })
    showCreateDialog.value = false
    await fetchUsers()
  } catch (error) {
    formError.value = 'Network error'
  } finally {
    formLoading.value = false
  }
}

function confirmDelete(user: UserListItem) {
  userToDelete.value = user
  showDeleteDialog.value = true
}

async function deleteUser() {
  if (!userToDelete.value) return

  formLoading.value = true
  try {
    const response = await fetch(`${API_BASE}/api/users/${userToDelete.value.id}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    })

    if (!response.ok) {
      const data = await response.json()
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: data.error || 'Failed to delete user',
        life: 3000,
      })
      return
    }

    toast.add({
      severity: 'success',
      summary: 'User deleted',
      life: 3000,
    })
    showDeleteDialog.value = false
    userToDelete.value = null
    await fetchUsers()
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Network error',
      life: 3000,
    })
  } finally {
    formLoading.value = false
  }
}

function getRoleSeverity(role: UserRole): 'success' | 'info' | 'secondary' {
  switch (role) {
    case 'admin':
      return 'success'
    case 'user':
      return 'info'
    default:
      return 'secondary'
  }
}

function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Administrator'
    case 'user':
      return 'User'
    case 'guest':
      return 'Guest'
    default:
      return role
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString()
}

onMounted(() => {
  if (canManageUsers.value) {
    fetchUsers()
  }
})
</script>

<template>
  <Card v-if="canManageUsers" class="user-management-card">
    <template #title>
      <div class="flex justify-content-between align-items-center">
        <span>Users</span>
        <Button
          icon="pi pi-plus"
          label="Add User"
          size="small"
          @click="openCreateDialog"
        />
      </div>
    </template>
    <template #content>
      <DataTable
        :value="users"
        :loading="loading"
        stripedRows
        size="small"
      >
        <Column field="username" header="Username">
          <template #body="{ data }">
            <div class="flex align-items-center gap-2">
              <span>{{ data.username }}</span>
              <Tag
                v-if="data.id === currentUser?.id"
                value="You"
                severity="secondary"
                class="you-tag"
              />
            </div>
          </template>
        </Column>
        <Column field="role" header="Role">
          <template #body="{ data }">
            <Tag
              :value="getRoleLabel(data.role)"
              :severity="getRoleSeverity(data.role)"
            />
          </template>
        </Column>
        <Column field="createdAt" header="Created">
          <template #body="{ data }">
            {{ formatDate(data.createdAt) }}
          </template>
        </Column>
        <Column header="Actions" style="width: 5rem">
          <template #body="{ data }">
            <Button
              v-if="data.id !== currentUser?.id"
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              size="small"
              @click="confirmDelete(data)"
            />
          </template>
        </Column>
      </DataTable>
    </template>
  </Card>

  <!-- Create User Dialog -->
  <Dialog
    v-model:visible="showCreateDialog"
    header="Create User"
    modal
    :style="{ width: '24rem' }"
    :breakpoints="{ '480px': '90vw' }"
  >
    <form @submit.prevent="createUser">
      <div class="field">
        <label for="new-username">Username</label>
        <InputText
          id="new-username"
          v-model="newUser.username"
          :disabled="formLoading"
          fluid
        />
      </div>

      <div class="field">
        <label for="new-password">Password</label>
        <Password
          v-model="newUser.password"
          inputId="new-password"
          toggleMask
          :feedback="false"
          :disabled="formLoading"
          fluid
        />
        <small>At least 8 characters. User will be prompted to change it on first login.</small>
      </div>

      <div class="field">
        <label for="new-role">Role</label>
        <Select
          v-model="newUser.role"
          inputId="new-role"
          :options="roleOptions"
          optionLabel="label"
          optionValue="value"
          :disabled="formLoading"
          fluid
        />
      </div>

      <div v-if="formError" class="error-message">
        {{ formError }}
      </div>
    </form>

    <template #footer>
      <Button
        label="Cancel"
        severity="secondary"
        text
        @click="showCreateDialog = false"
      />
      <Button
        label="Create"
        :loading="formLoading"
        @click="createUser"
      />
    </template>
  </Dialog>

  <!-- Delete Confirmation Dialog -->
  <Dialog
    v-model:visible="showDeleteDialog"
    header="Delete User"
    modal
    :breakpoints="{ '480px': '90vw' }"
  >
    <p class="delete-message">
      Are you sure you want to delete user
      <strong>{{ userToDelete?.username }}</strong>?
    </p>

    <template #footer>
      <Button
        label="Cancel"
        severity="secondary"
        text
        @click="showDeleteDialog = false"
      />
      <Button
        label="Delete"
        severity="danger"
        :loading="formLoading"
        @click="deleteUser"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.user-management-card {
  margin-bottom: 1rem;
}

.you-tag {
  font-size: 0.7rem;
}

.error-message {
  color: var(--p-red-500);
  font-size: 0.875rem;
  text-align: center;
}

.delete-message {
  color: var(--p-text-color);
  margin: 0;
}


:deep(.p-datatable) {
  font-size: 0.875rem;
}
</style>
