import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Collision-resistant, sortable-ish, URL-safe id.
 * Time prefix (base36 ms) + 12 random base36 chars.
 */
export function createId(): string {
  const time = Date.now().toString(36);
  const bytes = randomBytes(12);
  let random = "";
  for (let i = 0; i < bytes.length; i++) {
    random += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${time}${random}`;
}

/** Short, human-quotable token, e.g. for project codes. */
export function shortCode(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}
