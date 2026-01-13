import { TOTP, Secret } from "otpauth";
import * as QRCode from "qrcode";
import crypto from "crypto";
import bcrypt from "bcrypt";

const APP_NAME = process.env.TOTP_APP_NAME || "soeji";
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;
const SALT_ROUNDS = 10;

/**
 * Generate a new TOTP secret
 */
export function generateTotpSecret(): string {
  const secret = new Secret({ size: 20 });
  return secret.base32;
}

/**
 * Create a TOTP instance for verification
 */
function createTotp(secret: string, username: string): TOTP {
  return new TOTP({
    issuer: APP_NAME,
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

/**
 * Verify a TOTP code
 * Returns true if valid, false otherwise
 * Allows 1 period window for clock drift
 */
export function verifyTotpCode(secret: string, code: string, username: string): boolean {
  const totp = createTotp(secret, username);
  // delta returns the difference in periods, null if invalid
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

/**
 * Generate the otpauth URI for QR code generation
 */
export function generateTotpUri(secret: string, username: string): string {
  const totp = createTotp(secret, username);
  return totp.toString();
}

/**
 * Generate QR code as data URL for the TOTP secret
 */
export async function generateTotpQrCode(secret: string, username: string): Promise<string> {
  const uri = generateTotpUri(secret, username);
  return QRCode.toDataURL(uri, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 256,
  });
}

/**
 * Generate backup codes
 * Returns both plain text codes (to show user) and hashed codes (to store)
 */
export async function generateBackupCodes(): Promise<{
  plainCodes: string[];
  hashedCodes: string[];
}> {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    // Generate random alphanumeric code
    const code = crypto
      .randomBytes(BACKUP_CODE_LENGTH)
      .toString("hex")
      .slice(0, BACKUP_CODE_LENGTH)
      .toUpperCase();
    plainCodes.push(code);

    // Hash the code for storage
    const hashedCode = await bcrypt.hash(code, SALT_ROUNDS);
    hashedCodes.push(hashedCode);
  }

  return { plainCodes, hashedCodes };
}

/**
 * Verify a backup code against stored hashed codes
 * Returns the index of the matched code if valid, -1 otherwise
 */
export async function verifyBackupCode(
  code: string,
  hashedCodes: string[]
): Promise<number> {
  // Remove spaces, hyphens, and convert to uppercase for comparison
  const normalizedCode = code.toUpperCase().replace(/[\s-]/g, "");

  for (let i = 0; i < hashedCodes.length; i++) {
    const isValid = await bcrypt.compare(normalizedCode, hashedCodes[i]);
    if (isValid) {
      return i;
    }
  }

  return -1;
}

/**
 * Remove a used backup code from the list
 */
export function removeBackupCode(hashedCodes: string[], index: number): string[] {
  return hashedCodes.filter((_, i) => i !== index);
}

/**
 * Format backup codes for display (group of 4 characters)
 */
export function formatBackupCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") || code;
}
