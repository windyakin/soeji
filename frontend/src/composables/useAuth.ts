import { ref, computed } from "vue";
import router from "../router";
import type {
  AuthUser,
  AuthConfigResponse,
  LoginResponse,
  RefreshResponse,
  UserRole,
  TotpLoginRequest,
  TotpSetupResponse,
  TotpVerifySetupResponse,
  TotpStatusResponse,
  TotpRegenerateBackupCodesResponse,
} from "../types/auth";

const API_BASE = import.meta.env.VITE_API_BASE || "";

// Storage keys (tokens are in httpOnly cookies, only metadata stored locally)
const STORAGE_KEY_USER = "soeji-auth-user";
const STORAGE_KEY_TOKEN_EXPIRES = "soeji-auth-token-expires";

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
const authInitialized = ref(false);
const mustChangePassword = ref(false);

// TOTP 2FA state
const totpRequired = ref(false);
const totpToken = ref<string | null>(null);
const pendingTotpUser = ref<AuthUser | null>(null);

// Token expiration time (cached from API response)
let accessTokenExpiresAt: Date | null = null;

// Temporary password storage for force password change flow (memory only, never persisted)
let temporaryPassword: string | null = null;

// Token refresh check timer
let refreshCheckTimer: ReturnType<typeof setInterval> | null = null;

// Refresh in progress promise (for deduplication)
let refreshPromise: Promise<boolean> | null = null;

// Check token expiration and refresh if needed
async function checkAndRefreshToken(): Promise<void> {
  if (!isAuthenticated.value || !authEnabled.value) {
    return;
  }

  // If accessTokenExpiresAt is not available (e.g., after process restart),
  // attempt refresh to ensure we have a valid token
  if (!accessTokenExpiresAt) {
    await doRefreshAccessToken();
    return;
  }

  const remainingMs = accessTokenExpiresAt.getTime() - Date.now();
  if (remainingMs < TOKEN_REFRESH_THRESHOLD_MS) {
    await doRefreshAccessToken();
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
// Uses deduplication to prevent race conditions when multiple callers request refresh simultaneously
async function doRefreshAccessToken(): Promise<boolean> {
  // If refresh is already in progress, return the existing promise
  // This prevents race conditions when visibility change and API 401 both trigger refresh
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      // Refresh token is read from httpOnly cookie by the server
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include", // Send cookies
      });

      if (!response.ok) {
        // 401 Unauthorized - force logout and redirect to login
        if (response.status === 401) {
          clearAuthState();
          router.push("/login");
        }
        return false;
      }

      const data: RefreshResponse = await response.json();
      accessTokenExpiresAt = new Date(data.accessTokenExpiresAt);
      // Persist to localStorage for recovery after process restart
      localStorage.setItem(STORAGE_KEY_TOKEN_EXPIRES, data.accessTokenExpiresAt);

      return true;
    } catch (error) {
      console.error("Token refresh error:", error);
      return false;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    // Clear the promise after completion so future calls can refresh again
    refreshPromise = null;
  }
}

// Load stored user on initialization
function loadStoredUser(): void {
  const storedUser = localStorage.getItem(STORAGE_KEY_USER);
  const storedExpires = localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRES);

  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      currentUser.value = user;
      isAuthenticated.value = true;
      mustChangePassword.value = user.mustChangePassword || false;

      // Restore token expiration time if available
      if (storedExpires) {
        accessTokenExpiresAt = new Date(storedExpires);
      }
    } catch {
      clearAuthState();
    }
  }
}

function clearAuthState(): void {
  stopRefreshCheckTimer();
  localStorage.removeItem(STORAGE_KEY_USER);
  localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRES);
  currentUser.value = null;
  isAuthenticated.value = false;
  mustChangePassword.value = false;
  temporaryPassword = null;
  accessTokenExpiresAt = null;
}

function setAuthState(user: AuthUser, expiresAt: Date): void {
  localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
  localStorage.setItem(STORAGE_KEY_TOKEN_EXPIRES, expiresAt.toISOString());
  currentUser.value = user;
  isAuthenticated.value = true;
  mustChangePassword.value = user.mustChangePassword || false;
  accessTokenExpiresAt = expiresAt;
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
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: "include", // Send cookies
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

      // Load stored user info (for optimistic UI)
      loadStoredUser();

      // Try to refresh the access token to verify session is still valid
      // This will fail if cookies are expired/invalid
      if (isAuthenticated.value) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          clearAuthState();
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
  ): Promise<{ success: boolean; error?: string; totpRequired?: boolean }> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include", // Receive and store cookies
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Login failed" };
      }

      const data: LoginResponse = await response.json();

      // Check if 2FA is required
      if (data.totpRequired && data.totpToken) {
        totpRequired.value = true;
        totpToken.value = data.totpToken;
        pendingTotpUser.value = data.user;
        // Store password temporarily for potential password change flow
        temporaryPassword = password;
        return { success: true, totpRequired: true };
      }

      const expiresAt = new Date(data.accessTokenExpiresAt);
      setAuthState(data.user, expiresAt);

      // Store password temporarily if user needs to change it
      if (data.user.mustChangePassword) {
        temporaryPassword = password;
      }

      // Start proactive refresh timer
      startRefreshCheckTimer();

      return { success: true };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: "Network error" };
    }
  }

  // Verify TOTP code and complete login
  async function verifyTotp(
    code: string,
    isBackupCode: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    if (!totpToken.value) {
      return { success: false, error: "No TOTP session" };
    }

    try {
      const request: TotpLoginRequest = {
        totpToken: totpToken.value,
        code,
        isBackupCode,
      };

      const response = await fetch(`${API_BASE}/api/auth/login/totp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Verification failed" };
      }

      const data: LoginResponse = await response.json();
      const expiresAt = new Date(data.accessTokenExpiresAt);
      setAuthState(data.user, expiresAt);

      // Clear TOTP state
      totpRequired.value = false;
      totpToken.value = null;
      pendingTotpUser.value = null;

      // Start proactive refresh timer
      startRefreshCheckTimer();

      return { success: true };
    } catch (error) {
      console.error("TOTP verification error:", error);
      return { success: false, error: "Network error" };
    }
  }

  // Cancel TOTP verification (go back to login)
  function cancelTotp(): void {
    totpRequired.value = false;
    totpToken.value = null;
    pendingTotpUser.value = null;
    temporaryPassword = null;
  }

  // Get TOTP status for current user
  async function getTotpStatus(): Promise<TotpStatusResponse | null> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/totp/status`, {
        credentials: "include",
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to get TOTP status:", error);
      return null;
    }
  }

  // Start TOTP setup
  async function setupTotp(): Promise<{ success: boolean; data?: TotpSetupResponse; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/totp/setup`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Setup failed" };
      }

      const data: TotpSetupResponse = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error("TOTP setup error:", error);
      return { success: false, error: "Network error" };
    }
  }

  // Verify TOTP setup and enable 2FA
  async function verifyTotpSetup(
    code: string
  ): Promise<{ success: boolean; backupCodes?: string[]; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/totp/verify-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Verification failed" };
      }

      const data: TotpVerifySetupResponse = await response.json();
      return { success: true, backupCodes: data.backupCodes };
    } catch (error) {
      console.error("TOTP verify setup error:", error);
      return { success: false, error: "Network error" };
    }
  }

  // Disable TOTP
  async function disableTotp(
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/totp/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Disable failed" };
      }

      return { success: true };
    } catch (error) {
      console.error("TOTP disable error:", error);
      return { success: false, error: "Network error" };
    }
  }

  // Regenerate backup codes
  async function regenerateBackupCodes(
    password: string
  ): Promise<{ success: boolean; backupCodes?: string[]; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/totp/regenerate-backup-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Regenerate failed" };
      }

      const data: TotpRegenerateBackupCodesResponse = await response.json();
      return { success: true, backupCodes: data.backupCodes };
    } catch (error) {
      console.error("Regenerate backup codes error:", error);
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
        credentials: "include", // Receive and store cookies
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Setup failed" };
      }

      const data: LoginResponse = await response.json();
      const expiresAt = new Date(data.accessTokenExpiresAt);
      setAuthState(data.user, expiresAt);
      hasUsers.value = true;

      // Start proactive refresh timer
      startRefreshCheckTimer();

      return { success: true };
    } catch (error) {
      console.error("Setup error:", error);
      return { success: false, error: "Network error" };
    }
  }

  // Refresh access token using cookie-based refresh token
  async function refreshAccessToken(): Promise<boolean> {
    return doRefreshAccessToken();
  }

  // Logout
  async function logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include", // Send cookies (server will clear them)
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearAuthState();
    }
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

    // TOTP state
    totpRequired,
    pendingTotpUser,

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
    hasRole,
    clearMustChangePassword,
    getTemporaryPassword,
    clearTemporaryPassword,

    // TOTP methods
    verifyTotp,
    cancelTotp,
    getTotpStatus,
    setupTotp,
    verifyTotpSetup,
    disableTotp,
    regenerateBackupCodes,
  };
}
