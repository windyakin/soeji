<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Tag from 'primevue/tag'
import SettingsCard from './SettingsCard.vue'
import ChangePassword from './ChangePassword.vue'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const toast = useToast()
const { currentUser, logout, authEnabled } = useAuth()

const changePasswordVisible = ref(false)

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
  <SettingsCard v-if="authEnabled" header="Account">
    <!-- Username -->
    <div class="settings-item">
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-user item-icon"></i>
          <div class="item-text">
            <span class="item-label">{{ currentUser?.username || '-' }}</span>
          </div>
        </div>
        <Tag
          v-if="currentUser?.role"
          :value="getRoleLabel(currentUser.role)"
          :severity="getRoleSeverity(currentUser.role)"
        />
      </div>
    </div>

    <!-- Change Password -->
    <button
      class="settings-item clickable"
      @click="changePasswordVisible = true"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-key item-icon"></i>
          <span class="item-label">Change Password</span>
        </div>
        <i class="pi pi-chevron-right item-chevron"></i>
      </div>
    </button>

    <!-- Sign out -->
    <button
      class="settings-item clickable danger"
      @click="handleLogout"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-sign-out item-icon"></i>
          <span class="item-label">Sign out</span>
        </div>
        <i class="pi pi-chevron-right item-chevron"></i>
      </div>
    </button>
  </SettingsCard>

  <ChangePassword v-model:visible="changePasswordVisible" />
</template>
