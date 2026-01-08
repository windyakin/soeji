<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
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
        <div class="flex align-items-center gap-3 admin-header-inner">
          <Button
            icon="pi pi-arrow-left"
            text
            rounded
            @click="goBack"
            aria-label="Back"
          />
          <h1>Server Administration</h1>
        </div>
      </header>

      <div class="flex flex-column gap-4 admin-content">
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
  max-width: 48rem;
  margin: 0 auto;
  padding: 1rem 0.65rem;
}

.admin-header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 10;
  background: var(--p-surface-0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.admin-header-inner {
  max-width: 48rem;
  margin: 0 auto;
  padding: 0.5rem 0.65rem;
}

.admin-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--p-text-color);
  margin: 0;
}

@media (max-width: 768px) {
  .admin-header h1 {
    font-size: 1.25rem;
  }
}

.admin-content {
  padding-top: 4rem;
}
</style>
