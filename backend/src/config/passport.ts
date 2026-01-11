import type { Request } from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as JwtStrategy } from "passport-jwt";
import { prisma } from "../services/database.js";
import { verifyPassword } from "../services/password.js";
import type { TokenPayload } from "../types/auth.js";

const JWT_SECRET = process.env.JWT_SECRET || "development-secret-change-me";
const ACCESS_TOKEN_COOKIE = "soeji_access_token";

// Extract JWT from httpOnly cookie
function extractJwtFromCookie(req: Request): string | null {
  return req.cookies?.[ACCESS_TOKEN_COOKIE] || null;
}

// Local Strategy: Username/password authentication (used for login)
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        return done(null, false, { message: "Invalid credentials" });
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return done(null, false, { message: "Invalid credentials" });
      }

      return done(null, {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      });
    } catch (error) {
      return done(error);
    }
  })
);

// JWT Strategy: Token verification from httpOnly cookie (used for API calls)
passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: extractJwtFromCookie,
      secretOrKey: JWT_SECRET,
    },
    async (payload: TokenPayload, done) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
        });
        if (!user) {
          return done(null, false);
        }
        return done(null, {
          id: user.id,
          username: user.username,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        });
      } catch (error) {
        return done(error);
      }
    }
  )
);

export default passport;
