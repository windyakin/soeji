<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const toast = useToast()
const { currentUser, logout, authEnabled } = useAuth()

async function handleLogout() {
  await logout()
  toast.add({
    severity: 'info',
    summary: 'Logged out',
    life: 3000,
  })
  router.replace('/login')
}

function getRoleSeverity(role: string): 'success' | 'info' | 'secondary' {
  switch (role) {
    case 'admin':
      return 'success'
    case 'user':
      return 'info'
    default:
      return 'secondary'
  }
}

function getRoleLabel(role: string): string {
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
</script>

<template>
  <Card v-if="authEnabled" class="account-card">
    <template #title>Account</template>
    <template #content>
      <div class="account-info">
        <div class="account-row">
          <span class="account-label">Username</span>
          <span class="account-value">{{ currentUser?.username || '-' }}</span>
        </div>
        <div class="account-row">
          <span class="account-label">Role</span>
          <Tag
            v-if="currentUser?.role"
            :value="getRoleLabel(currentUser.role)"
            :severity="getRoleSeverity(currentUser.role)"
          />
        </div>
      </div>
      <div class="account-actions">
        <Button
          label="Sign out"
          icon="pi pi-sign-out"
          severity="secondary"
          outlined
          @click="handleLogout"
        />
      </div>
    </template>
  </Card>
</template>

<style scoped>
.account-card {
  margin-bottom: 1rem;
}

.account-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.account-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.account-label {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.account-value {
  font-weight: 500;
}

.account-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
