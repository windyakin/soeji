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
    req.user = { id: "system", username: "system", role: "admin" } as AuthUser;
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
