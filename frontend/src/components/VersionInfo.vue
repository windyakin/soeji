<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Tag from 'primevue/tag'
import ProgressSpinner from 'primevue/progressspinner'
import { useToast } from 'primevue/usetoast'
import { usePwaUpdate } from '../composables/usePwaUpdate'
import SettingsCard from './SettingsCard.vue'

const toast = useToast()
const {
  needRefresh,
  checkForUpdates,
  updateServiceWorker,
  getVersionInfo,
  forceUpdateNotification
} = usePwaUpdate()

const version = ref<{ commit: string; buildTime: string } | null>(null)
const checking = ref(false)
const updating = ref(false)

// Hidden feature: click build number 5 times to force update notification
const buildClickCount = ref(0)
const buildClickTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

function handleBuildClick() {
  buildClickCount.value++

  if (buildClickTimeout.value) {
    clearTimeout(buildClickTimeout.value)
  }

  if (buildClickCount.value >= 5) {
    forceUpdateNotification()
    buildClickCount.value = 0
  } else {
    // Reset count after 2 seconds of inactivity
    buildClickTimeout.value = setTimeout(() => {
      buildClickCount.value = 0
    }, 2000)
  }
}

onMounted(async () => {
  version.value = await getVersionInfo()
})

async function handleCheckForUpdates() {
  checking.value = true
  try {
    await checkForUpdates()
    if (!needRefresh.value) {
      toast.add({
        severity: 'info',
        summary: 'Up to date',
        detail: 'You have the latest version',
        life: 3000
      })
    }
  } finally {
    checking.value = false
  }
}

async function handleUpdate() {
  updating.value = true
  await updateServiceWorker()
}

function formatBuildTime(buildTime: string): string {
  try {
    const date = new Date(buildTime)
    return date.toLocaleString()
  } catch {
    return buildTime
  }
}
</script>

<template>
  <SettingsCard header="Version">
    <div class="settings-item" @click="handleBuildClick" style="cursor: pointer;">
      <div class="item-content">
        <span class="item-label">Build</span>
        <code class="item-value mono">{{ version?.commit?.slice(0, 7) || '---' }}</code>
      </div>
    </div>
    <div class="settings-item">
      <div class="item-content">
        <span class="item-label">Date</span>
        <span class="item-value">{{ version?.buildTime ? formatBuildTime(version.buildTime) : '---' }}</span>
      </div>
    </div>
    <button
      v-if="needRefresh"
      class="settings-item clickable"
      :disabled="updating"
      @click="handleUpdate"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-refresh item-icon"></i>
          <span class="item-label">Update Now</span>
        </div>
        <div class="item-right">
          <Tag severity="info" value="Available" />
          <ProgressSpinner v-if="updating" class="item-spinner" />
          <i v-else class="pi pi-chevron-right item-chevron"></i>
        </div>
      </div>
    </button>
    <button
      v-else
      class="settings-item clickable"
      :disabled="checking"
      @click="handleCheckForUpdates"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-sync item-icon"></i>
          <span class="item-label">Check for Updates</span>
        </div>
        <div class="item-right">
          <ProgressSpinner v-if="checking" class="item-spinner" />
          <i v-else class="pi pi-chevron-right item-chevron"></i>
        </div>
      </div>
    </button>
    <button
      class="settings-item clickable"
      :disabled="updating"
      @click="handleUpdate"
    >
      <div class="item-content">
        <div class="item-left">
          <i class="pi pi-trash item-icon"></i>
          <span class="item-label">Clear Cache & Reload</span>
        </div>
        <div class="item-right">
          <ProgressSpinner v-if="updating" class="item-spinner" />
          <i v-else class="pi pi-chevron-right item-chevron"></i>
        </div>
      </div>
    </button>
  </SettingsCard>
</template>
