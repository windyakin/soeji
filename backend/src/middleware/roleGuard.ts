import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@prisma/client";
import { isAuthEnabled } from "./auth.js";

type AllowedRoles = UserRole | UserRole[];

// Role guard middleware factory
export function roleGuard(allowedRoles: AllowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: Request, res: Response, next: NextFunction) => {
    // If auth is disabled, allow all requests
    if (!isAuthEnabled()) {
      return next();
    }

    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check if user has required role
    if (!roles.includes(req.user.role as UserRole)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
}

// Convenience functions for common role combinations
export const adminOnly = roleGuard("admin");
export const editorsOnly = roleGuard(["admin", "user"]);
export const allRoles = roleGuard(["admin", "user", "guest"]);
