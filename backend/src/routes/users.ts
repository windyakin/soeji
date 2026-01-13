import { Router } from "express";
import { prisma } from "../services/database.js";
import { hashPassword } from "../services/password.js";
import { revokeAllUserRefreshTokens } from "../services/jwt.js";
import { authenticate, isAuthEnabled } from "../middleware/auth.js";
import { adminOnly } from "../middleware/roleGuard.js";
import { verifyCsrf } from "../middleware/csrf.js";
import type { CreateUserRequest, UpdateUserRequest } from "../types/auth.js";

export const usersRouter = Router();

// All routes require authentication to be enabled and admin role
usersRouter.use((_req, res, next) => {
  if (!isAuthEnabled()) {
    return res.status(403).json({ error: "Authentication is not enabled" });
  }
  next();
});
usersRouter.use(authenticate, adminOnly);

// GET /api/users - List all users
usersRouter.get("/", async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    res.json(users);
  } catch (error) {
    console.error("Failed to list users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users - Create new user
usersRouter.post("/", verifyCsrf, async (req, res) => {
  try {
    const { username, password, role } = req.body as CreateUserRequest;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    if (!["admin", "user", "guest"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return res.status(409).json({ error: "Username already exists" });
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role,
        mustChangePassword: true, // Require password change on first login
      },
      select: {
        id: true,
        username: true,
        role: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error("Failed to create user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users/:id - Get user details
usersRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Failed to get user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/users/:id - Update user
usersRouter.put("/:id", verifyCsrf, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role } = req.body as UpdateUserRequest;
    const currentUserId = req.user!.id;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prevent admin from demoting themselves
    if (id === currentUserId && role && role !== "admin") {
      return res.status(400).json({ error: "Cannot change your own role" });
    }

    // Build update data
    const updateData: {
      username?: string;
      passwordHash?: string;
      role?: "admin" | "user" | "guest";
      mustChangePassword?: boolean;
    } = {};

    if (username && username !== existingUser.username) {
      // Check if new username already exists
      const userWithSameUsername = await prisma.user.findUnique({
        where: { username },
      });
      if (userWithSameUsername) {
        return res.status(409).json({ error: "Username already exists" });
      }
      updateData.username = username;
    }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      updateData.passwordHash = await hashPassword(password);
      // When admin resets password, require password change on next login
      updateData.mustChangePassword = true;
    }

    if (role && ["admin", "user", "guest"].includes(role)) {
      updateData.role = role;
    }

    // Update user
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        role: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // If password changed, revoke all refresh tokens
    if (password) {
      await revokeAllUserRefreshTokens(id);
    }

    res.json(user);
  } catch (error) {
    console.error("Failed to update user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/users/:id - Delete user
usersRouter.delete("/:id", verifyCsrf, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user!.id;

    // Prevent admin from deleting themselves
    if (id === currentUserId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete user (cascade deletes refresh tokens)
    await prisma.user.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
