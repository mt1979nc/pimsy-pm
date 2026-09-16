import { env } from "./env";

/**
 * Staff vs customer email boundary.
 *
 * Addresses on INTERNAL_EMAIL_DOMAINS may self-register as staff (see
 * `src/auth.ts`). Customer portal users must never be provisioned on those
 * domains — they are not staff, and a staff address must not be pinned to a
 * customer account.
 */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

/** True when the address is on a configured internal staff domain. */
export function isInternalStaffDomain(
  email: string,
  domains: string[] = env.INTERNAL_EMAIL_DOMAINS,
): boolean {
  const domain = emailDomain(email.trim().toLowerCase());
  return !!domain && domains.includes(domain);
}

/**
 * True when this address must not become a CUSTOMER portal user: internal
 * staff domains, or the bootstrap owner address.
 */
export function isReservedStaffEmail(
  email: string,
  opts: { domains?: string[]; bootstrapOwnerEmail?: string } = {},
): boolean {
  const normalized = email.trim().toLowerCase();
  const bootstrap = (opts.bootstrapOwnerEmail ?? env.BOOTSTRAP_OWNER_EMAIL).toLowerCase();
  if (bootstrap && normalized === bootstrap) return true;
  return isInternalStaffDomain(normalized, opts.domains ?? env.INTERNAL_EMAIL_DOMAINS);
}
