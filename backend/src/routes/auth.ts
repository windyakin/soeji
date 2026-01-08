import { Router } from "express";
import { prisma } from "../services/database.js";
import { hashPassword } from "../services/password.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} from "../services/jwt.js";
import { authenticate, authenticateAllowPasswordChange, authenticateLocal, isAuthEnabled } from "../middleware/auth.js";
import type {
  AuthConfigResponse,
  LoginResponse,
  RefreshResponse,
  SetupRequest,
  VerifySetupKeyRequest,
} from "../types/auth.js";

const SETUP_KEY = process.env.SETUP_KEY;

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
    const accessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });
    const { token: refreshToken } = await generateRefreshToken(user.id);

    const response: LoginResponse = {
      accessToken,
      refreshToken,
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

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });
    const { token: refreshToken } = await generateRefreshToken(user.id);

    const response: LoginResponse = {
      accessToken,
      refreshToken,
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

// POST /api/auth/refresh - Refresh access token
authRouter.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
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
    const accessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });
    const { token: newRefreshToken } = await generateRefreshToken(user.id);

    const response: RefreshResponse = {
      accessToken,
      refreshToken: newRefreshToken,
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
    const { refreshToken } = req.body;

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
