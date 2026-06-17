import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { isAuthEnabled } from "./auth.js";

// CSRF token cookie and header names
export const CSRF_COOKIE_NAME = "soeji_csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

// Cookie security: use secure cookies in production (HTTPS required)
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Set CSRF token cookie (non-httpOnly so JavaScript can read it)
 */
export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // JavaScript needs to read this
    secure: COOKIE_SECURE,
    sameSite: "strict",
    path: "/",
    // No expires = session cookie (cleared when browser closes)
    // Token is regenerated on each login/refresh anyway
  });
}

/**
 * Clear CSRF token cookie
 */
export function clearCsrfCookie(res: Response): void {
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: "strict",
    path: "/",
  });
}

/**
 * CSRF protection middleware using Double Submit Cookie pattern.
 *
 * Compares the token from the cookie with the token from the request header.
 * Both must be present and match for the request to be valid.
 *
 * This middleware should be applied to state-changing endpoints (POST, PUT, DELETE, PATCH).
 */
export function verifyCsrf(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF check if auth is disabled
  if (!isAuthEnabled()) {
    return next();
  }

  // Skip for GET, HEAD, OPTIONS (safe methods)
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  // Both tokens must be present
  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: "CSRF token missing" });
  }

  // Tokens must match (use timing-safe comparison)
  if (!timingSafeEqual(cookieToken, headerToken as string)) {
    return res.status(403).json({ error: "CSRF token mismatch" });
  }

  next();
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  return crypto.timingSafeEqual(bufA, bufB);
}
