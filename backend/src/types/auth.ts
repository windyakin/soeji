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

export interface LoginResponse {
  accessToken: string;
  accessTokenExpiresAt: string; // ISO 8601 timestamp
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  accessTokenExpiresAt: string; // ISO 8601 timestamp
  refreshToken: string;
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
