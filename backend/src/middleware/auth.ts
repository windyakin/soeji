import type { Request, Response, NextFunction } from "express";
import passport from "../config/passport.js";
import type { AuthUser } from "../types/auth.js";

// Check if authentication is enabled
export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === "true";
}

// Authentication middleware that respects AUTH_ENABLED flag
export function authenticate(req: Request, res: Response, next: NextFunction) {
  // If auth is disabled, allow all requests with admin role
  if (!isAuthEnabled()) {
    req.user = { id: "system", username: "system", role: "admin", mustChangePassword: false } as AuthUser;
    return next();
  }

  // Use Passport JWT authentication
  passport.authenticate(
    "jwt",
    { session: false },
    (err: Error | null, user: AuthUser | false, _info: unknown) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      // Check if user must change password - block access to all other endpoints
      if (user.mustChangePassword) {
        return res.status(403).json({
          error: "Password change required",
          code: "MUST_CHANGE_PASSWORD",
        });
      }
      req.user = user;
      next();
    }
  )(req, res, next);
}

// Authentication middleware that allows mustChangePassword users (for password change endpoint)
export function authenticateAllowPasswordChange(req: Request, res: Response, next: NextFunction) {
  // If auth is disabled, allow all requests with admin role
  if (!isAuthEnabled()) {
    req.user = { id: "system", username: "system", role: "admin", mustChangePassword: false } as AuthUser;
    return next();
  }

  // Use Passport JWT authentication
  passport.authenticate(
    "jwt",
    { session: false },
    (err: Error | null, user: AuthUser | false, _info: unknown) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      // Don't check mustChangePassword - allow access for password change
      req.user = user;
      next();
    }
  )(req, res, next);
}

// Optional authentication - doesn't fail if not authenticated
export function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // If auth is disabled, allow all requests with admin role
  if (!isAuthEnabled()) {
    req.user = { id: "system", username: "system", role: "admin" } as AuthUser;
    return next();
  }

  // Try to authenticate, but don't fail if no token
  passport.authenticate(
    "jwt",
    { session: false },
    (err: Error | null, user: AuthUser | false) => {
      if (err) {
        return next(err);
      }
      if (user) {
        req.user = user;
      }
      next();
    }
  )(req, res, next);
}

// Local authentication for login
export function authenticateLocal(
  req: Request,
  res: Response,
  next: NextFunction
) {
  passport.authenticate(
    "local",
    { session: false },
    (err: Error | null, user: AuthUser | false, info: { message?: string }) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || "Invalid credentials" });
      }
      req.user = user;
      next();
    }
  )(req, res, next);
}

// Internal API key for watcher service (upload only)
const WATCHER_API_KEY = process.env.WATCHER_API_KEY;

/**
 * Authentication for upload endpoint only.
 * Accepts either:
 * - Watcher API key (X-Watcher-Key header) - limited to upload only
 * - Admin user via JWT
 */
export function authenticateUpload(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Check for internal API key in header (watcher service)
  const apiKey = req.headers["x-watcher-key"];
  if (WATCHER_API_KEY && apiKey === WATCHER_API_KEY) {
    // Watcher authenticated via API key - upload role for upload only
    req.user = {
      id: "upload",
      username: "upload",
      role: "upload",
      mustChangePassword: false,
    } as AuthUser;
    return next();
  }

  // Fall back to normal JWT authentication with admin check
  if (!isAuthEnabled()) {
    req.user = { id: "system", username: "system", role: "admin", mustChangePassword: false } as AuthUser;
    return next();
  }

  passport.authenticate(
    "jwt",
    { session: false },
    (err: Error | null, user: AuthUser | false, _info: unknown) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      if (user.mustChangePassword) {
        return res.status(403).json({
          error: "Password change required",
          code: "MUST_CHANGE_PASSWORD",
        });
      }
      req.user = user;
      next();
    }
  )(req, res, next);
}
