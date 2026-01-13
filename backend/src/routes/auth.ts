import { Router } from "express";
import type { UserRole } from "@prisma/client";
import { prisma } from "../services/database.js";
import { hashPassword } from "../services/password.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  verifyAccessToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  generateTotpPendingToken,
  verifyTotpPendingToken,
} from "../services/jwt.js";
import {
  verifyTotpCode,
  verifyBackupCode,
  removeBackupCode,
} from "../services/totp.js";
import { authenticate, authenticateAllowPasswordChange, authenticateLocal, isAuthEnabled } from "../middleware/auth.js";
import type { Response } from "express";
import type {
  AuthConfigResponse,
  LoginResponse,
  LoginResponseWithTotp,
  RefreshResponse,
  SetupRequest,
  VerifySetupKeyRequest,
  TotpLoginRequest,
} from "../types/auth.js";
import { totpRouter } from "./totp.js";

const SETUP_KEY = process.env.SETUP_KEY;

// Cookie names
const ACCESS_TOKEN_COOKIE = "soeji_access_token";
const REFRESH_TOKEN_COOKIE = "soeji_refresh_token";

// Helper function to set auth cookies
function setAuthCookies(
  res: Response,
  accessToken: string,
  accessTokenExpiresAt: Date,
  refreshToken: string,
  refreshTokenExpiresAt: Date
): void {
  // Access token cookie (short-lived, used for API and CDN auth)
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "strict",
    expires: accessTokenExpiresAt,
    path: "/",
  });

  // Refresh token cookie (long-lived, used only for /api/auth/refresh)
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "strict",
    expires: refreshTokenExpiresAt,
    path: "/api/auth", // Restrict to auth endpoints only
  });
}

// Helper function to clear auth cookies
function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    path: "/api/auth",
  });
}

export const authRouter = Router();

// GET /api/auth/config - Get authentication configuration
authRouter.get("/config", async (_req, res) => {
  try {
    const userCount = await prisma.user.count();
    const response: AuthConfigResponse = {
      authEnabled: isAuthEnabled(),
      hasUsers: userCount > 0,
      setupKeyRequired: !!SETUP_KEY,
    };
    res.json(response);
  } catch (error) {
    console.error("Failed to get auth config:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/verify-setup-key - Verify setup key before creating admin account
authRouter.post("/verify-setup-key", async (req, res) => {
  try {
    // Auth must be enabled for setup
    if (!isAuthEnabled()) {
      return res.status(403).json({ error: "Authentication is not enabled" });
    }

    const { setupKey } = req.body as VerifySetupKeyRequest;

    // Check if users already exist
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return res.status(403).json({ error: "Setup already completed" });
    }

    // SETUP_KEY not configured - setup is disabled
    if (!SETUP_KEY) {
      return res.status(503).json({
        error: "Setup is disabled. SETUP_KEY environment variable is not configured.",
      });
    }

    // Verify setup key
    if (setupKey !== SETUP_KEY) {
      return res.status(403).json({ error: "Invalid setup key" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to verify setup key:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/setup - Create initial admin user (only when no users exist)
authRouter.post("/setup", async (req, res) => {
  try {
    // Auth must be enabled for setup
    if (!isAuthEnabled()) {
      return res.status(403).json({ error: "Authentication is not enabled" });
    }

    const { username, password, setupKey } = req.body as SetupRequest;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Check if users already exist
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return res.status(403).json({ error: "Setup already completed" });
    }

    // SETUP_KEY not configured - setup is disabled
    if (!SETUP_KEY) {
      return res.status(503).json({
        error: "Setup is disabled. SETUP_KEY environment variable is not configured.",
      });
    }

    // Verify setup key
    if (setupKey !== SETUP_KEY) {
      return res.status(403).json({ error: "Invalid setup key" });
    }

    // Create admin user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: "admin",
      },
    });

    // Generate tokens
    const { token: accessToken, expiresAt: accessTokenExpiresAt } = generateAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });
    const { token: refreshToken, expiresAt: refreshTokenExpiresAt } = await generateRefreshToken(user.id);

    // Set auth cookies (tokens stored in httpOnly cookies only)
    setAuthCookies(res, accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt);

    const response: LoginResponse = {
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };

    res.status(201).json(response);
  } catch (error) {
    console.error("Failed to setup:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login - Login with username/password
authRouter.post("/login", authenticateLocal, async (req, res) => {
  try {
    const user = req.user!;

    // Check if user has TOTP enabled
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { totpEnabled: true },
    });

    if (dbUser?.totpEnabled) {
      // User has 2FA enabled - return pending token instead of full auth
      const { token: totpToken } = generateTotpPendingToken({
        userId: user.id,
        username: user.username,
        role: user.role as UserRole,
      });

      const response: LoginResponseWithTotp = {
        accessTokenExpiresAt: "",
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        },
        totpRequired: true,
        totpToken,
      };

      return res.json(response);
    }

    // No 2FA - proceed with normal login
    const { token: accessToken, expiresAt: accessTokenExpiresAt } = generateAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role as UserRole,
    });
    const { token: refreshToken, expiresAt: refreshTokenExpiresAt } = await generateRefreshToken(user.id);

    // Set auth cookies (tokens stored in httpOnly cookies only)
    setAuthCookies(res, accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt);

    const response: LoginResponse = {
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Failed to login:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login/totp - Verify TOTP code and complete login
authRouter.post("/login/totp", async (req, res) => {
  try {
    const { totpToken, code, isBackupCode } = req.body as TotpLoginRequest;

    if (!totpToken || !code) {
      return res.status(400).json({ error: "TOTP token and code are required" });
    }

    // Verify the pending token
    const pendingPayload = verifyTotpPendingToken(totpToken);
    if (!pendingPayload) {
      return res.status(401).json({ error: "Invalid or expired TOTP token" });
    }

    // Get user with TOTP data
    const user = await prisma.user.findUnique({
      where: { id: pendingPayload.userId },
      select: {
        id: true,
        username: true,
        role: true,
        mustChangePassword: true,
        totpEnabled: true,
        totpSecret: true,
        totpBackupCodes: true,
      },
    });

    if (!user || !user.totpEnabled || !user.totpSecret) {
      return res.status(401).json({ error: "TOTP is not enabled for this user" });
    }

    let isValid = false;

    if (isBackupCode) {
      // Verify backup code
      if (!user.totpBackupCodes) {
        return res.status(401).json({ error: "No backup codes available" });
      }

      const backupCodes = JSON.parse(user.totpBackupCodes) as string[];
      const matchedIndex = await verifyBackupCode(code, backupCodes);

      if (matchedIndex >= 0) {
        isValid = true;
        // Remove used backup code
        const updatedCodes = removeBackupCode(backupCodes, matchedIndex);
        await prisma.user.update({
          where: { id: user.id },
          data: { totpBackupCodes: JSON.stringify(updatedCodes) },
        });
        console.log(`Backup code used for user "${user.username}", ${updatedCodes.length} codes remaining`);
      }
    } else {
      // Verify TOTP code
      isValid = verifyTotpCode(user.totpSecret, code, user.username);
    }

    if (!isValid) {
      console.warn(`TOTP verification failed for user "${user.username}"`);
      return res.status(401).json({ error: "Invalid verification code" });
    }

    // TOTP verified - generate full tokens
    const { token: accessToken, expiresAt: accessTokenExpiresAt } = generateAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });
    const { token: refreshToken, expiresAt: refreshTokenExpiresAt } = await generateRefreshToken(user.id);

    // Set auth cookies
    setAuthCookies(res, accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt);

    const response: LoginResponse = {
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Failed to verify TOTP:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/refresh - Refresh access token
authRouter.post("/refresh", async (req, res) => {
  try {
    // Get refresh token from cookie
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];

    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token is required" });
    }

    // Verify refresh token
    const tokenInfo = await verifyRefreshToken(refreshToken);
    if (!tokenInfo) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: tokenInfo.userId },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Revoke old refresh token
    await revokeRefreshToken(tokenInfo.tokenId);

    // Generate new tokens
    const { token: accessToken, expiresAt: accessTokenExpiresAt } = generateAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });
    const { token: newRefreshToken, expiresAt: refreshTokenExpiresAt } = await generateRefreshToken(user.id);

    // Update auth cookies
    setAuthCookies(res, accessToken, accessTokenExpiresAt, newRefreshToken, refreshTokenExpiresAt);

    const response: RefreshResponse = {
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error("Failed to refresh token:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout - Logout (revoke refresh token, allows mustChangePassword users)
authRouter.post("/logout", authenticateAllowPasswordChange, async (req, res) => {
  try {
    // Get refresh token from cookie
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];

    if (refreshToken) {
      // Revoke specific refresh token
      const tokenInfo = await verifyRefreshToken(refreshToken);
      if (tokenInfo && tokenInfo.userId === req.user!.id) {
        await revokeRefreshToken(tokenInfo.tokenId);
      }
    } else {
      // Revoke all refresh tokens for user
      await revokeAllUserRefreshTokens(req.user!.id);
    }

    // Clear auth cookies
    clearAuthCookies(res);

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to logout:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/me - Get current user info (allows mustChangePassword users)
authRouter.get("/me", authenticateAllowPasswordChange, async (req, res) => {
  try {
    const user = req.user!;
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });
  } catch (error) {
    console.error("Failed to get user info:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/verify - Verify authentication token (for CDN auth_request)
// This endpoint is designed to be called by nginx auth_request directive
// It verifies the JWT from Cookie and returns 200 (authenticated) or 401 (not authenticated)
authRouter.get("/verify", (req, res) => {
  // If auth is not enabled, always return 200
  if (!isAuthEnabled()) {
    return res.status(200).send();
  }

  // Extract token from cookie
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!token) {
    return res.status(401).send();
  }

  // Verify the JWT token
  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).send();
  }

  // Token is valid
  res.status(200).send();
});

// POST /api/auth/change-password - Change own password (allows mustChangePassword users)
authRouter.post("/change-password", authenticateAllowPasswordChange, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Get user with password hash
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify current password
    const { verifyPassword } = await import("../services/password.js");
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Update password and clear mustChangePassword flag
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    // Revoke all refresh tokens (force re-login)
    await revokeAllUserRefreshTokens(userId);

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to change password:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mount TOTP routes under /api/auth/totp
authRouter.use("/totp", totpRouter);
