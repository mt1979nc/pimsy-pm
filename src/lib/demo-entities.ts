/**
 * Known seed / fixture entities that must not stay on the live book.
 *
 * Cleanup (`npm run db:cleanup:demo`) deletes these. Playbooks, real Prism
 * acronyms, and named staff (alexander@, jeremy@, …) are never touched.
 *
 * Cedar Hollow (slug `cedar-hollow`, code IMP-9003) is a Nathan demo customer.
 * CEDAR (CEDAR Health) is a real imported WIP site — different entity.
 */
import dockWipAllowlist from "../../content/dock-wip-allowlist.json";

export const DEMO_USER_EMAILS = [
  "demo.manager@pimsyehr.com",
  "demo.specialist@pimsyehr.com",
  "contact@riverbend-counseling.example.com",
  "contact@northgate-recovery.example.com",
  "contact@cedar-hollow.example.com",
] as const;

export const DEMO_CUSTOMERS = [
  {
    name: "Riverbend Counseling Group",
    slug: "riverbend-counseling",
    practiceType: "Outpatient Behavioral Health",
    seatCount: 28,
    priorSystem: "TherapyNotes",
    city: "Asheville",
    state: "NC",
    status: "ONBOARDING" as const,
  },
  {
    name: "Northgate Recovery Services",
    slug: "northgate-recovery",
    practiceType: "SUD Treatment / MAT",
    seatCount: 64,
    priorSystem: "Kipu",
    city: "Columbus",
    state: "OH",
    status: "ONBOARDING" as const,
  },
  {
    name: "Cedar Hollow Family Health",
    slug: "cedar-hollow",
    practiceType: "Integrated Primary + Behavioral",
    seatCount: 15,
    priorSystem: "Spreadsheets / paper",
    city: "Bangor",
    state: "ME",
    status: "LIVE" as const,
  },
] as const;

export const DEMO_CUSTOMER_SLUGS: readonly string[] = DEMO_CUSTOMERS.map((c) => c.slug);

export const DEMO_PROJECT_CODES = ["IMP-9001", "IMP-9002", "IMP-9003", "IMP-0004"] as const;

/** Local-parts of real staff Outlook accounts — never delete / deactivate. */
export const PROTECTED_STAFF_LOCAL_PARTS = [
  "alexander",
  "jeremy",
  "danielle",
  "morgan",
  "mindy",
  "david",
  "dave",
  "anna",
  "kori",
] as const;

/**
 * Historical Prism/PATH acronyms not on the 2026-09-14 Dock WIP scrape as
 * canonical codes. Demo cleanup still protects them so Forecast/Analysis
 * history (and leftover RAC rows before the TANC rename) are not wiped.
 */
export const LEGACY_PROTECTED_WIP_ACRONYMS = ["RAC", "LBH"] as const;

const allowlistAliasKeys = (
  "aliases" in dockWipAllowlist && Array.isArray(dockWipAllowlist.aliases)
    ? dockWipAllowlist.aliases.flatMap((a: { from?: string; to?: string }) => [a.from, a.to])
    : []
).filter((s): s is string => typeof s === "string" && s.trim().length > 0);

/**
 * Live imported Prism / Dock WIP (and Analysis history) that cleanup must not
 * touch — even if a demo slug or IMP-900x code is somehow attached.
 * Starts from `content/dock-wip-allowlist.json` plus alias from/to keys and
 * legacy extras.
 */
export const PROTECTED_WIP_ACRONYMS: readonly string[] = [
  ...new Set(
    [
      ...(dockWipAllowlist.acronyms as readonly string[]),
      ...allowlistAliasKeys,
      ...LEGACY_PROTECTED_WIP_ACRONYMS,
    ].map((s) => s.trim().toUpperCase()),
  ),
].sort();

export type DemoProjectRef = {
  id: string;
  code: string | null;
  name: string | null;
  crmAcronym?: string | null;
  prismClientId?: string | null;
  customerSlug?: string | null;
  customerName?: string | null;
};

export type DemoUserRef = {
  id: string;
  email: string | null;
  name: string | null;
  role?: string | null;
};

export type DemoCustomerRef = {
  id: string;
  slug: string | null;
  name: string | null;
};

export function normalizeKey(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isProtectedStaffEmail(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  if (!e) return false;
  const local = e.split("@")[0] ?? "";
  return (PROTECTED_STAFF_LOCAL_PARTS as readonly string[]).includes(local);
}

export function projectAcronyms(p: DemoProjectRef): string[] {
  return [p.code, p.crmAcronym, p.prismClientId]
    .map(normalizeKey)
    .filter((k) => k.length > 0);
}

export function isProtectedWipAcronym(code: string | null | undefined): boolean {
  const k = normalizeKey(code);
  if (!k) return false;
  if ((PROTECTED_WIP_ACRONYMS as readonly string[]).includes(k)) return true;
  return false;
}

export function projectTouchesProtectedWip(p: DemoProjectRef): boolean {
  return projectAcronyms(p).some(isProtectedWipAcronym);
}

export function isGrokFixture(p: Pick<DemoProjectRef, "code" | "name" | "crmAcronym" | "prismClientId" | "customerName">): boolean {
  const blob = [p.name, p.customerName, p.code, p.crmAcronym, p.prismClientId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (blob.includes("groktest")) return true;
  if (/\bgrok\b/.test(blob) && (/\be2e\b/.test(blob) || /\btest\b/.test(blob) || /\bllc\b/.test(blob))) {
    return true;
  }
  return projectAcronyms(p as DemoProjectRef).some((k) => k === "GROK" || k.startsWith("GROK"));
}

export function isDemoProjectCode(code: string | null | undefined): boolean {
  return (DEMO_PROJECT_CODES as readonly string[]).includes(normalizeKey(code));
}

export function isDemoCustomerSlug(slug: string | null | undefined): boolean {
  return DEMO_CUSTOMER_SLUGS.includes((slug ?? "").trim().toLowerCase());
}

export function isDemoCustomerName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return false;
  return DEMO_CUSTOMERS.some((c) => c.name.toLowerCase() === n);
}

export function isKnownDemoEmail(email: string | null | undefined): boolean {
  return (DEMO_USER_EMAILS as readonly string[]).includes(normalizeEmail(email));
}

export function isFixtureExampleEmail(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  if (!e || !e.includes("@")) return false;
  const domain = e.split("@")[1] ?? "";
  return domain === "example.com" || domain.endsWith(".example.com");
}

export type ClassifyResult = "delete" | "protect" | "keep";

export function classifyProject(p: DemoProjectRef): ClassifyResult {
  if (projectTouchesProtectedWip(p)) return "protect";
  if (isGrokFixture(p)) return "delete";
  if (isDemoProjectCode(p.code)) return "delete";
  if (isDemoCustomerSlug(p.customerSlug) || isDemoCustomerName(p.customerName) || isDemoCustomerName(p.name)) {
    return "delete";
  }
  return "keep";
}

export function classifyUser(u: DemoUserRef): ClassifyResult {
  if (isProtectedStaffEmail(u.email)) return "protect";
  if (isKnownDemoEmail(u.email)) return "delete";
  if (isFixtureExampleEmail(u.email)) return "delete";
  const blob = `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase();
  if (blob.includes("groktest") || (/\bgrok\b/.test(blob) && /\b(e2e|test)\b/.test(blob))) {
    return "delete";
  }
  return "keep";
}

export function classifyCustomer(c: DemoCustomerRef, customerProjectClasses: ClassifyResult[]): ClassifyResult {
  if (customerProjectClasses.includes("protect")) return "protect";
  if (customerProjectClasses.includes("keep")) return "keep";
  if (isDemoCustomerSlug(c.slug) || isDemoCustomerName(c.name)) return "delete";
  const blob = `${c.name ?? ""} ${c.slug ?? ""}`.toLowerCase();
  if (blob.includes("groktest") || (/\bgrok\b/.test(blob) && (/\be2e\b/.test(blob) || /\btest\b/.test(blob)))) {
    return "delete";
  }
  if (customerProjectClasses.includes("delete")) return "delete";
  return "keep";
}

export function redactDatabaseUrl(url: string): string {
  try {
    const u = new URL(url.replace(/^postgresql:/, "http:").replace(/^postgres:/, "http:"));
    const db = u.pathname.replace(/^\//, "") || "(default)";
    return `host=${u.hostname}${u.port ? `:${u.port}` : ""} db=${db.split("?")[0]} user=${u.username || "(none)"}`;
  } catch {
    return "(unparseable DATABASE_URL — not printed)";
  }
}
