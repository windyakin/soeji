<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import AccountInfo from '../components/AccountInfo.vue'
import UserManagement from '../components/UserManagement.vue'

const router = useRouter()

function goBack() {
  router.replace('/')
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-container">
      <header class="admin-header">
        <div class="header-row">
          <Button
            icon="pi pi-arrow-left"
            variant="text"
            @click="goBack"
            aria-label="Back"
          />
          <h1>Server Administration</h1>
        </div>
      </header>

      <div class="admin-content">
        <AccountInfo />
        <UserManagement />
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  min-height: 100vh;
  background: var(--p-surface-0);
}

.admin-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}

.admin-header {
  margin-bottom: 1.5rem;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-row h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.admin-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
</style>
