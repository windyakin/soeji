export type UserRole = "admin" | "user" | "guest";

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  mustChangePassword?: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

// Tokens are stored in httpOnly cookies, not returned in response body
export interface LoginResponse {
  accessTokenExpiresAt: string;
  user: AuthUser;
  // 2FA fields (only present when totpRequired is true)
  totpRequired?: boolean;
  totpToken?: string;
}

// Refresh token is read from httpOnly cookie, no request body needed
export interface RefreshResponse {
  accessTokenExpiresAt: string;
}

export interface AuthConfigResponse {
  authEnabled: boolean;
  hasUsers: boolean;
  setupKeyRequired: boolean;
}

export interface SetupRequest {
  username: string;
  password: string;
  setupKey: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserRequest {
  username?: string;
  password?: string;
  role?: UserRole;
}

export interface UserListItem {
  id: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

// TOTP 2FA types
export interface TotpLoginRequest {
  totpToken: string;
  code: string;
  isBackupCode?: boolean;
}

export interface TotpSetupResponse {
  secret: string;
  qrCode: string;
  otpauthUri: string;
}

export interface TotpVerifySetupRequest {
  code: string;
}

export interface TotpVerifySetupResponse {
  backupCodes: string[];
}

export interface TotpStatusResponse {
  enabled: boolean;
  backupCodesRemaining?: number;
}

export interface TotpDisableRequest {
  password: string;
}

export interface TotpRegenerateBackupCodesResponse {
  backupCodes: string[];
}
