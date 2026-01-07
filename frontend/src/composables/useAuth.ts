import { ref, computed } from "vue";
import type {
  AuthUser,
  AuthConfigResponse,
  LoginResponse,
  RefreshResponse,
  UserRole,
} from "../types/auth";

const API_BASE = import.meta.env.VITE_API_BASE || "";

// Storage keys
const STORAGE_KEY_REFRESH_TOKEN = "soeji-refresh-token";
const STORAGE_KEY_USER = "soeji-auth-user";

// Shared reactive state (singleton pattern like usePinProtection)
const authEnabled = ref(true);
const hasUsers = ref(true);
const isAuthenticated = ref(false);
const currentUser = ref<AuthUser | null>(null);
const accessToken = ref<string | null>(null);
const authInitialized = ref(false);

// Load stored user on initialization
function loadStoredAuth(): void {
  const storedUser = localStorage.getItem(STORAGE_KEY_USER);
  const storedRefreshToken = localStorage.getItem(STORAGE_KEY_REFRESH_TOKEN);

  if (storedUser && storedRefreshToken) {
    try {
      currentUser.value = JSON.parse(storedUser);
      isAuthenticated.value = true;
    } catch {
      clearStoredAuth();
    }
  }
}

function clearStoredAuth(): void {
  localStorage.removeItem(STORAGE_KEY_REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEY_USER);
  accessToken.value = null;
  currentUser.value = null;
  isAuthenticated.value = false;
}

function storeAuth(user: AuthUser, refreshToken: string): void {
  localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
  localStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, refreshToken);
  currentUser.value = user;
  isAuthenticated.value = true;
}

export function useAuth() {
  // Computed properties
  const isLoggedIn = computed(
    () => !authEnabled.value || isAuthenticated.value
  );

  const needsSetup = computed(
    () => authEnabled.value && !hasUsers.value
  );

  const canEdit = computed(() => {
    if (!authEnabled.value) return true;
    const role = currentUser.value?.role;
    return role === "admin" || role === "user";
  });

  const canManageUsers = computed(() => {
    if (!authEnabled.value) return true;
    return currentUser.value?.role === "admin";
  });

  // Initialize auth state
  async function initialize(): Promise<void> {
    if (authInitialized.value) return;

    try {
      // Fetch auth config from server
      const response = await fetch(`${API_BASE}/api/auth/config`);
      if (!response.ok) {
        throw new Error("Failed to fetch auth config");
      }

      const config: AuthConfigResponse = await response.json();
      authEnabled.value = config.authEnabled;
      hasUsers.value = config.hasUsers;

      // If auth is disabled, no need to check tokens
      if (!config.authEnabled) {
        authInitialized.value = true;
        return;
      }

      // Load stored auth
      loadStoredAuth();

      // If we have a refresh token, try to refresh the access token
      if (isAuthenticated.value) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          clearStoredAuth();
        }
      }
    } catch (error) {
      console.error("Failed to initialize auth:", error);
      // On error, assume auth is disabled (for backward compatibility)
      authEnabled.value = false;
    } finally {
      authInitialized.value = true;
    }
  }

  // Login with username/password
  async function login(
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Login failed" };
      }

      const data: LoginResponse = await response.json();
      accessToken.value = data.accessToken;
      storeAuth(data.user, data.refreshToken);

      return { success: true };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: "Network error" };
    }
  }

  // Setup initial admin account
  async function setup(
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Setup failed" };
      }

      const data: LoginResponse = await response.json();
      accessToken.value = data.accessToken;
      storeAuth(data.user, data.refreshToken);
      hasUsers.value = true;

      return { success: true };
    } catch (error) {
      console.error("Setup error:", error);
      return { success: false, error: "Network error" };
    }
  }

  // Refresh access token using stored refresh token
  async function refreshAccessToken(): Promise<boolean> {
    const storedRefreshToken = localStorage.getItem(STORAGE_KEY_REFRESH_TOKEN);
    if (!storedRefreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      if (!response.ok) {
        return false;
      }

      const data: RefreshResponse = await response.json();
      accessToken.value = data.accessToken;
      localStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, data.refreshToken);

      return true;
    } catch (error) {
      console.error("Token refresh error:", error);
      return false;
    }
  }

  // Logout
  async function logout(): Promise<void> {
    const storedRefreshToken = localStorage.getItem(STORAGE_KEY_REFRESH_TOKEN);

    try {
      if (accessToken.value) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken.value}`,
          },
          body: JSON.stringify({ refreshToken: storedRefreshToken }),
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearStoredAuth();
    }
  }

  // Get auth header for API requests
  function getAuthHeader(): Record<string, string> {
    if (!authEnabled.value || !accessToken.value) {
      return {};
    }
    return { Authorization: `Bearer ${accessToken.value}` };
  }

  // Check if current user has required role
  function hasRole(requiredRoles: UserRole | UserRole[]): boolean {
    if (!authEnabled.value) return true;
    if (!currentUser.value) return false;

    const roles = Array.isArray(requiredRoles)
      ? requiredRoles
      : [requiredRoles];
    return roles.includes(currentUser.value.role);
  }

  return {
    // State
    authEnabled,
    hasUsers,
    isAuthenticated,
    currentUser,
    authInitialized,

    // Computed
    isLoggedIn,
    needsSetup,
    canEdit,
    canManageUsers,

    // Methods
    initialize,
    login,
    setup,
    logout,
    refreshAccessToken,
    getAuthHeader,
    hasRole,
  };
}
