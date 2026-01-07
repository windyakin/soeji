import { ref, computed, watch } from "vue";
import type { BackendConfig } from "../types/backend";

const DB_NAME = "soeji-settings";
const DB_VERSION = 1;
const STORE_NAME = "backends";
const SELECTED_KEY = "soeji-backend-selected";

const DEFAULT_BACKEND: BackendConfig = {
  id: "local",
  name: "Local",
  url: "",
  isDefault: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// Singleton state
const backends = ref<BackendConfig[]>([]);
const selectedId = ref<string | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
const isInitialized = ref(false);

let dbInstance: IDBDatabase | null = null;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open database"));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

function getAllBackends(db: IDBDatabase): Promise<BackendConfig[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(new Error("Failed to get backends"));
    };
  });
}

function putBackend(db: IDBDatabase, backend: BackendConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(backend);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error("Failed to save backend"));
    };
  });
}

function removeBackend(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error("Failed to delete backend"));
    };
  });
}

function generateId(): string {
  return crypto.randomUUID();
}

export function useBackendSettings() {
  const selectedBackend = computed(() =>
    backends.value.find((b) => b.id === selectedId.value) || backends.value[0] || null
  );

  const selectedUrl = computed(() => selectedBackend.value?.url || "");

  const sortedBackends = computed(() =>
    [...backends.value].sort((a, b) => {
      // Default backend first, then sort by name
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    })
  );

  async function loadBackends(): Promise<void> {
    if (isInitialized.value) return;

    isLoading.value = true;
    error.value = null;

    try {
      const db = await openDatabase();
      const stored = await getAllBackends(db);

      if (stored.length === 0) {
        // Create default backend
        await putBackend(db, DEFAULT_BACKEND);
        backends.value = [DEFAULT_BACKEND];
      } else {
        backends.value = stored;
      }

      // Restore selected ID from localStorage
      const savedSelectedId = localStorage.getItem(SELECTED_KEY);
      if (savedSelectedId && backends.value.some((b) => b.id === savedSelectedId)) {
        selectedId.value = savedSelectedId;
      } else {
        // Select default backend
        const defaultBackend = backends.value.find((b) => b.isDefault);
        selectedId.value = defaultBackend?.id || backends.value[0]?.id || null;
      }

      isInitialized.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load backends";
    } finally {
      isLoading.value = false;
    }
  }

  async function addBackend(name: string, url: string): Promise<BackendConfig> {
    const db = await openDatabase();
    const newBackend: BackendConfig = {
      id: generateId(),
      name: name.trim(),
      url: url.trim(),
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await putBackend(db, newBackend);
    backends.value = [...backends.value, newBackend];

    return newBackend;
  }

  async function updateBackend(
    id: string,
    updates: Partial<Pick<BackendConfig, "name" | "url">>
  ): Promise<void> {
    const backend = backends.value.find((b) => b.id === id);
    if (!backend) {
      throw new Error("Backend not found");
    }

    const db = await openDatabase();
    const updatedBackend: BackendConfig = {
      ...backend,
      ...(updates.name !== undefined && { name: updates.name.trim() }),
      ...(updates.url !== undefined && { url: updates.url.trim() }),
      updatedAt: Date.now(),
    };

    await putBackend(db, updatedBackend);
    backends.value = backends.value.map((b) =>
      b.id === id ? updatedBackend : b
    );
  }

  async function deleteBackend(id: string): Promise<void> {
    const backend = backends.value.find((b) => b.id === id);
    if (!backend) {
      throw new Error("Backend not found");
    }

    if (backend.isDefault) {
      throw new Error("Cannot delete default backend");
    }

    const db = await openDatabase();
    await removeBackend(db, id);
    backends.value = backends.value.filter((b) => b.id !== id);

    // If deleted backend was selected, switch to default
    if (selectedId.value === id) {
      const defaultBackend = backends.value.find((b) => b.isDefault);
      selectedId.value = defaultBackend?.id || backends.value[0]?.id || null;
    }
  }

  function selectBackend(id: string): void {
    if (backends.value.some((b) => b.id === id)) {
      selectedId.value = id;
    }
  }

  function validateUrl(url: string): { valid: boolean; message?: string } {
    const trimmed = url.trim();

    // Empty URL is allowed (relative path)
    if (!trimmed) {
      return { valid: true };
    }

    try {
      const parsed = new URL(trimmed);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { valid: false, message: "URL must use http or https protocol" };
      }
      return { valid: true };
    } catch {
      return { valid: false, message: "Invalid URL format" };
    }
  }

  // Persist selected ID to localStorage
  watch(selectedId, (newId) => {
    if (newId) {
      localStorage.setItem(SELECTED_KEY, newId);
    } else {
      localStorage.removeItem(SELECTED_KEY);
    }
  });

  return {
    backends,
    selectedId,
    selectedBackend,
    selectedUrl,
    sortedBackends,
    isLoading,
    error,
    isInitialized,
    loadBackends,
    addBackend,
    updateBackend,
    deleteBackend,
    selectBackend,
    validateUrl,
  };
}
