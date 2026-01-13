import { Router } from "express";
import { prisma } from "../services/database.js";
import { verifyPassword } from "../services/password.js";
import {
  generateTotpSecret,
  generateTotpQrCode,
  generateTotpUri,
  verifyTotpCode,
  generateBackupCodes,
  formatBackupCode,
} from "../services/totp.js";
import { authenticate } from "../middleware/auth.js";
import type {
  TotpSetupResponse,
  TotpVerifySetupRequest,
  TotpVerifySetupResponse,
  TotpDisableRequest,
  TotpStatusResponse,
} from "../types/auth.js";

export const totpRouter = Router();

// All TOTP routes require authentication
totpRouter.use(authenticate);

// GET /api/auth/totp/status - Get TOTP status for current user
totpRouter.get("/status", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { totpEnabled: true, totpBackupCodes: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const response: TotpStatusResponse = {
      enabled: user.totpEnabled,
    };

    if (user.totpEnabled && user.totpBackupCodes) {
      const backupCodes = JSON.parse(user.totpBackupCodes) as string[];
      response.backupCodesRemaining = backupCodes.length;
    }

    res.json(response);
  } catch (error) {
    console.error("Failed to get TOTP status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/totp/setup - Start TOTP setup (generate secret and QR code)
totpRouter.post("/setup", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { username: true, totpEnabled: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.totpEnabled) {
      return res.status(400).json({ error: "TOTP is already enabled" });
    }

    // Generate new secret
    const secret = generateTotpSecret();

    // Store secret temporarily (not enabled yet)
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpSecret: secret },
    });

    // Generate QR code
    const qrCode = await generateTotpQrCode(secret, user.username);
    const otpauthUri = generateTotpUri(secret, user.username);

    const response: TotpSetupResponse = {
      secret,
      qrCode,
      otpauthUri,
    };

    res.json(response);
  } catch (error) {
    console.error("Failed to setup TOTP:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/totp/verify-setup - Verify TOTP code and enable 2FA
totpRouter.post("/verify-setup", async (req, res) => {
  try {
    const { code } = req.body as TotpVerifySetupRequest;

    if (!code) {
      return res.status(400).json({ error: "Verification code is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { username: true, totpSecret: true, totpEnabled: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.totpEnabled) {
      return res.status(400).json({ error: "TOTP is already enabled" });
    }

    if (!user.totpSecret) {
      return res.status(400).json({ error: "TOTP setup not started. Call /setup first" });
    }

    // Verify the code
    const isValid = verifyTotpCode(user.totpSecret, code, user.username);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid verification code" });
    }

    // Generate backup codes
    const { plainCodes, hashedCodes } = await generateBackupCodes();

    // Enable TOTP
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        totpEnabled: true,
        totpBackupCodes: JSON.stringify(hashedCodes),
      },
    });

    // Format backup codes for display
    const formattedCodes = plainCodes.map(formatBackupCode);

    const response: TotpVerifySetupResponse = {
      backupCodes: formattedCodes,
    };

    console.log(`TOTP enabled for user "${user.username}"`);
    res.json(response);
  } catch (error) {
    console.error("Failed to verify TOTP setup:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/totp/disable - Disable TOTP (requires password)
totpRouter.post("/disable", async (req, res) => {
  try {
    const { password } = req.body as TotpDisableRequest;

    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { username: true, passwordHash: true, totpEnabled: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.totpEnabled) {
      return res.status(400).json({ error: "TOTP is not enabled" });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Disable TOTP
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        totpEnabled: false,
        totpSecret: null,
        totpBackupCodes: null,
      },
    });

    console.log(`TOTP disabled for user "${user.username}"`);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to disable TOTP:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/totp/regenerate-backup-codes - Generate new backup codes
totpRouter.post("/regenerate-backup-codes", async (req, res) => {
  try {
    const { password } = req.body as TotpDisableRequest;

    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { username: true, passwordHash: true, totpEnabled: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.totpEnabled) {
      return res.status(400).json({ error: "TOTP is not enabled" });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Generate new backup codes
    const { plainCodes, hashedCodes } = await generateBackupCodes();

    // Update backup codes
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        totpBackupCodes: JSON.stringify(hashedCodes),
      },
    });

    // Format backup codes for display
    const formattedCodes = plainCodes.map(formatBackupCode);

    console.log(`Backup codes regenerated for user "${user.username}"`);
    res.json({ backupCodes: formattedCodes });
  } catch (error) {
    console.error("Failed to regenerate backup codes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
