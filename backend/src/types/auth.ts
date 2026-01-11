import type { UserRole } from "@prisma/client";

export interface TokenPayload {
  userId: string;
  username: string;
  role: UserRole;
}

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

// Tokens are stored in httpOnly cookies, not returned in response body
export interface LoginResponse {
  accessTokenExpiresAt: string; // ISO 8601 timestamp
  user: AuthUser;
}

// Refresh token is read from httpOnly cookie, no request body needed
export interface RefreshResponse {
  accessTokenExpiresAt: string; // ISO 8601 timestamp
}

export interface SetupRequest {
  username: string;
  password: string;
  setupKey: string;
}

export interface VerifySetupKeyRequest {
  setupKey: string;
}

export interface AuthConfigResponse {
  authEnabled: boolean;
  hasUsers: boolean;
  setupKeyRequired: boolean;
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

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}
