/**
 * PIMSY Zendesk **agent search** deep-links for org / email setup checks.
 *
 * Public help center: https://pimsyemr.zendesk.com/hc/en-us
 * Staff already signed into Zendesk land on agent search with the practice
 * name and/or support-email domain filled in. There is no Zendesk API, no
 * token, and no invented credentials.
 */
import { parseHttpUrl } from "@/lib/http-url";

/** Documented PIMSY Help Desk subdomain (not a guessed pimsyehr.zendesk.com). */
export const ZENDESK_SUBDOMAIN = "pimsyemr";
export const ZENDESK_ORIGIN = `https://${ZENDESK_SUBDOMAIN}.zendesk.com`;
export const ZENDESK_AGENT_SEARCH = `${ZENDESK_ORIGIN}/agent/search/1`;
export const ZENDESK_HELP_CENTER = `${ZENDESK_ORIGIN}/hc/en-us`;

const STAFF_EMAIL_DOMAINS = ["pimsyehr.com"];

export function isZendeskAgentUrl(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const parsed = parseHttpUrl(raw);
  if (!parsed.ok) return false;
  const host = parsed.url.hostname.toLowerCase();
  return host === `${ZENDESK_SUBDOMAIN}.zendesk.com` || host.endsWith(".zendesk.com");
}

export function zendeskAgentSearchUrl(query?: string | null): string {
  const q = query?.trim();
  if (!q) return ZENDESK_AGENT_SEARCH;
  return `${ZENDESK_AGENT_SEARCH}?q=${encodeURIComponent(q)}`;
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase() || null;
}

export function isPimsyStaffEmail(email: string, extraDomains: readonly string[] = []): boolean {
  const domain = emailDomain(email);
  if (!domain) return true;
  const blocked = new Set(
    [...STAFF_EMAIL_DOMAINS, ...extraDomains].map((d) => d.trim().toLowerCase()).filter(Boolean),
  );
  return blocked.has(domain);
}

export function practiceEmailDomains(
  emails: readonly string[],
  extraStaffDomains: readonly string[] = [],
): string[] {
  const out = new Set<string>();
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email || isPimsyStaffEmail(email, extraStaffDomains)) continue;
    const domain = emailDomain(email);
    if (domain) out.add(domain);
  }
  return [...out].sort();
}

export function practiceContactEmails(
  emails: readonly string[],
  extraStaffDomains: readonly string[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email) || isPimsyStaffEmail(email, extraStaffDomains)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** Zendesk Company Setup — search the org by name and email domain. */
export function zendeskOrgSetupSearchUrl(opts: {
  orgName?: string | null;
  emailDomains?: readonly string[];
}): string {
  const parts: string[] = [];
  const name = opts.orgName?.trim();
  if (name) parts.push(`type:organization "${name.replaceAll('"', "")}"`);
  for (const domain of opts.emailDomains ?? []) {
    const d = domain.trim().toLowerCase();
    if (d) parts.push(`domain:${d}`);
  }
  return zendeskAgentSearchUrl(parts.join(" OR "));
}

/** Add Zendesk Users to Org — search users by email, else domain. */
export function zendeskUserEmailSearchUrl(opts: {
  emails?: readonly string[];
  emailDomains?: readonly string[];
}): string {
  const emails = (opts.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean).slice(0, 5);
  if (emails.length > 0) {
    return zendeskAgentSearchUrl(emails.map((e) => `email:${e}`).join(" OR "));
  }
  const domains = (opts.emailDomains ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (domains.length > 0) {
    return zendeskAgentSearchUrl(domains.map((d) => `type:user ${d}`).join(" OR "));
  }
  return zendeskAgentSearchUrl();
}

export type ZendeskSetupLinks = {
  orgSetupUrl: string;
  userEmailUrl: string;
  hasOrgQuery: boolean;
  hasEmailQuery: boolean;
};

export function zendeskSetupLinks(opts: {
  orgName?: string | null;
  emails?: readonly string[];
  extraStaffDomains?: readonly string[];
}): ZendeskSetupLinks {
  const emails = practiceContactEmails(opts.emails ?? [], opts.extraStaffDomains);
  const emailDomains = practiceEmailDomains(emails, opts.extraStaffDomains);
  const orgSetupUrl = zendeskOrgSetupSearchUrl({ orgName: opts.orgName, emailDomains });
  const userEmailUrl = zendeskUserEmailSearchUrl({ emails, emailDomains });
  return {
    orgSetupUrl,
    userEmailUrl,
    hasOrgQuery: Boolean(opts.orgName?.trim()) || emailDomains.length > 0,
    hasEmailQuery: emails.length > 0 || emailDomains.length > 0,
  };
}
