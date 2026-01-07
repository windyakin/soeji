import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import type { TokenPayload } from "../types/auth.js";
import { prisma } from "./database.js";

const JWT_SECRET = process.env.JWT_SECRET || "development-secret-change-me";
const ACCESS_TOKEN_EXPIRES = process.env.JWT_ACCESS_TOKEN_EXPIRES || "15m";
const REFRESH_TOKEN_EXPIRES_DAYS = parseInt(
  process.env.JWT_REFRESH_TOKEN_EXPIRES_DAYS || "7",
  10
);

export function generateAccessToken(payload: TokenPayload): string {
  // expiresIn accepts string like "15m" or number (seconds)
  return jwt.sign(payload as object, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export async function generateRefreshToken(
  userId: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(64).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function verifyRefreshToken(token: string): Promise<{
  userId: string;
  tokenId: string;
} | null> {
  const refreshToken = await prisma.refreshToken.findUnique({
    where: { token },
  });

  if (!refreshToken) {
    return null;
  }

  // Check if token is expired or revoked
  if (refreshToken.expiresAt < new Date() || refreshToken.revokedAt) {
    return null;
  }

  return { userId: refreshToken.userId, tokenId: refreshToken.id };
}

export async function revokeRefreshToken(tokenId: string): Promise<void> {
  await prisma.refreshToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
    },
  });

  return result.count;
}
