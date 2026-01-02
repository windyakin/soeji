import { ref } from "vue";
import { registerSW } from "virtual:pwa-register";

const STORAGE_KEY = "soeji-version-commit";

const needRefresh = ref(false);
const offlineReady = ref(false);

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

interface VersionInfo {
  commit: string;
  buildTime: string;
}

async function fetchVersion(): Promise<VersionInfo | null> {
  try {
    const response = await fetch("/version.json", {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function getStoredCommit(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

function storeCommit(commit: string): void {
  localStorage.setItem(STORAGE_KEY, commit);
}

export function usePwaUpdate() {
  // Initialize only once
  if (!updateSW) {
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        needRefresh.value = true;
      },
      onOfflineReady() {
        offlineReady.value = true;
      },
    });
  }

  async function checkForUpdates(): Promise<boolean> {
    const version = await fetchVersion();
    if (!version || version.commit === "unknown") return false;

    const storedCommit = getStoredCommit();

    // First visit - store the commit
    if (!storedCommit) {
      storeCommit(version.commit);
      return false;
    }

    // Check if there's a new version
    if (storedCommit !== version.commit) {
      needRefresh.value = true;
      return true;
    }

    return false;
  }

  async function updateServiceWorker() {
    // Unregister all service workers and clear caches
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }

    // Clear all caches
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }

    // Update stored commit before reload
    const version = await fetchVersion();
    if (version && version.commit !== "unknown") {
      storeCommit(version.commit);
    }

    // Force hard reload (bypass cache)
    window.location.reload();
  }

  function dismissUpdate() {
    needRefresh.value = false;
  }

  function dismissOfflineReady() {
    offlineReady.value = false;
  }

  return {
    needRefresh,
    offlineReady,
    checkForUpdates,
    updateServiceWorker,
    dismissUpdate,
    dismissOfflineReady,
  };
}
