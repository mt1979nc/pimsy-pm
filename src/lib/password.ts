import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Password hashing and reset-token helpers.
 *
 * Passwords are optional throughout this app — magic-link email and Google
 * are still there and unaffected. This exists so someone who wants a
 * password (instead of waiting on an email link every time) can have one.
 */

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Minimum bar for a new password. Deliberately simple — length over rules. */
export function passwordIssue(plain: string): string | null {
  if (plain.length < 8) return "Password must be at least 8 characters.";
  if (plain.length > 200) return "That password is too long.";
  return null;
}

/**
 * A password-reset (or set-a-password) token.
 *
 * The raw token goes in the emailed URL and is never stored. Only its sha256
 * lives in the database (password_reset_token.tokenHash) — a leaked database
 * row can't be replayed into a working reset link.
 */
export function generateResetToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
