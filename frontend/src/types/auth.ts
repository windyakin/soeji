export type UserRole = "admin" | "user" | "guest";

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface AuthConfigResponse {
  authEnabled: boolean;
  hasUsers: boolean;
}

export interface SetupRequest {
  username: string;
  password: string;
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
  createdAt: string;
  updatedAt: string;
}
