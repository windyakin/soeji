import { ref, computed } from "vue";
import router from "../router";
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

// Token refresh check interval (every 30 seconds)
const TOKEN_CHECK_INTERVAL_MS = 30 * 1000;
// Refresh when remaining time is less than 3 minutes
const TOKEN_REFRESH_THRESHOLD_MS = 3 * 60 * 1000;

// Shared reactive state (singleton pattern like usePinProtection)
const authEnabled = ref(true);
const hasUsers = ref(true);
const setupKeyRequired = ref(false);
const isAuthenticated = ref(false);
const currentUser = ref<AuthUser | null>(null);
const accessToken = ref<string | null>(null);
const authInitialized = ref(false);
const mustChangePassword = ref(false);

// Token expiration time (cached from API response)
let accessTokenExpiresAt: Date | null = null;

// Temporary password storage for force password change flow (memory only, never persisted)
let temporaryPassword: string | null = null;

// Token refresh check timer
let refreshCheckTimer: ReturnType<typeof setInterval> | null = null;

// Check token expiration and refresh if needed
async function checkAndRefreshToken(): Promise<void> {
  if (!isAuthenticated.value || !authEnabled.value) {
    return;
  }

  if (accessTokenExpiresAt) {
    const remainingMs = accessTokenExpiresAt.getTime() - Date.now();
    if (remainingMs < TOKEN_REFRESH_THRESHOLD_MS) {
      await doRefreshAccessToken();
    }
  }
}

// Handle visibility change (tab becomes active, wake from sleep)
function handleVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    // When tab becomes visible, immediately check token expiration
    checkAndRefreshToken();
  }
}

// Start token expiration check timer
function startRefreshCheckTimer(): void {
  stopRefreshCheckTimer();

  // Periodic check every 30 seconds
  refreshCheckTimer = setInterval(checkAndRefreshToken, TOKEN_CHECK_INTERVAL_MS);

  // Also check when tab becomes visible (handles background throttling and sleep wake)
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

// Stop token refresh check timer
function stopRefreshCheckTimer(): void {
  if (refreshCheckTimer) {
    clearInterval(refreshCheckTimer);
    refreshCheckTimer = null;
  }
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

// Internal refresh function (used by timer and public refreshAccessToken)
async function doRefreshAccessToken(): Promise<boolean> {
  const storedRefreshToken = localStorage.getItem(STORAGE_KEY_REFRESH_TOKEN);
  if (!storedRefreshToken) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: storedRefreshToken }),
      credentials: "include", // Include cookies in request
    });

    if (!response.ok) {
      // 401 Unauthorized - force logout and redirect to login
      if (response.status === 401) {
        clearStoredAuth();
        router.push("/login");
      }
      return false;
    }

    const data: RefreshResponse = await response.json();
    accessToken.value = data.accessToken;
    accessTokenExpiresAt = new Date(data.accessTokenExpiresAt);
    localStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, data.refreshToken);

    return true;
  } catch (error) {
    console.error("Token refresh error:", error);
    return false;
  }
}

// Load stored user on initialization
function loadStoredAuth(): void {
  const storedUser = localStorage.getItem(STORAGE_KEY_USER);
  const storedRefreshToken = localStorage.getItem(STORAGE_KEY_REFRESH_TOKEN);

  if (storedUser && storedRefreshToken) {
    try {
      const user = JSON.parse(storedUser);
      currentUser.value = user;
      isAuthenticated.value = true;
      mustChangePassword.value = user.mustChangePassword || false;
    } catch {
      clearStoredAuth();
    }
  }
}

function clearStoredAuth(): void {
  stopRefreshCheckTimer();
  localStorage.removeItem(STORAGE_KEY_REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEY_USER);
  accessToken.value = null;
  currentUser.value = null;
  isAuthenticated.value = false;
  mustChangePassword.value = false;
  temporaryPassword = null;
}

function storeAuth(user: AuthUser, refreshToken: string): void {
  localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
  localStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, refreshToken);
  currentUser.value = user;
  isAuthenticated.value = true;
  mustChangePassword.value = user.mustChangePassword || false;
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

  // Fetch current user info from server
  async function fetchCurrentUser(): Promise<boolean> {
    if (!accessToken.value) return false;

    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken.value}` },
      });

      if (!response.ok) {
        return false;
      }

      const user: AuthUser = await response.json();
      currentUser.value = user;
      mustChangePassword.value = user.mustChangePassword || false;
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));

      return true;
    } catch (error) {
      console.error("Failed to fetch current user:", error);
      return false;
    }
  }

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
      setupKeyRequired.value = config.setupKeyRequired;

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
        } else {
          // Fetch latest user info to check mustChangePassword status
          await fetchCurrentUser();
          // Start proactive refresh timer
          startRefreshCheckTimer();
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
        credentials: "include", // Include cookies in response
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Login failed" };
      }

      const data: LoginResponse = await response.json();
      accessToken.value = data.accessToken;
      storeAuth(data.user, data.refreshToken);

      // Store password temporarily if user needs to change it
      if (data.user.mustChangePassword) {
        temporaryPassword = password;
      }

      // Store token expiration time and start proactive refresh timer
      accessTokenExpiresAt = new Date(data.accessTokenExpiresAt);
      startRefreshCheckTimer();

      return { success: true };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: "Network error" };
    }
  }

  // Verify setup key before creating admin account
  async function verifySetupKey(
    setupKey: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/verify-setup-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupKey }),
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Verification failed" };
      }

      return { success: true };
    } catch (error) {
      console.error("Verify setup key error:", error);
      return { success: false, error: "Network error" };
    }
  }

  // Setup initial admin account
  async function setup(
    username: string,
    password: string,
    setupKey: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, setupKey }),
        credentials: "include", // Include cookies in response
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Setup failed" };
      }

      const data: LoginResponse = await response.json();
      accessToken.value = data.accessToken;
      storeAuth(data.user, data.refreshToken);
      hasUsers.value = true;

      // Store token expiration time and start proactive refresh timer
      accessTokenExpiresAt = new Date(data.accessTokenExpiresAt);
      startRefreshCheckTimer();

      return { success: true };
    } catch (error) {
      console.error("Setup error:", error);
      return { success: false, error: "Network error" };
    }
  }

  // Refresh access token using stored refresh token
  async function refreshAccessToken(): Promise<boolean> {
    return doRefreshAccessToken();
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
          credentials: "include", // Include cookies to clear them
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

  // Clear mustChangePassword flag (called after successful password change)
  function clearMustChangePassword(): void {
    mustChangePassword.value = false;
    temporaryPassword = null;
    if (currentUser.value) {
      currentUser.value = { ...currentUser.value, mustChangePassword: false };
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser.value));
    }
  }

  // Get temporary password for force password change flow
  function getTemporaryPassword(): string | null {
    return temporaryPassword;
  }

  // Clear temporary password
  function clearTemporaryPassword(): void {
    temporaryPassword = null;
  }

  return {
    // State
    authEnabled,
    hasUsers,
    setupKeyRequired,
    isAuthenticated,
    currentUser,
    authInitialized,
    mustChangePassword,

    // Computed
    isLoggedIn,
    needsSetup,
    canEdit,
    canManageUsers,

    // Methods
    initialize,
    login,
    verifySetupKey,
    setup,
    logout,
    refreshAccessToken,
    getAuthHeader,
    hasRole,
    clearMustChangePassword,
    getTemporaryPassword,
    clearTemporaryPassword,
  };
}
