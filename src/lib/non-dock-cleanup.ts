/**
 * Classify PATH customers/projects for `db:cleanup:non-dock`.
 *
 * Default: delete **active book** that is not on the Dock WIP allowlist.
 * Always keep post go-live / completed / archived analytics sites so
 * Forecast and Analysis still have history — even when Dock no longer
 * has an active workspace for that acronym.
 *
 * Named staff are never deleted (enforced in the script).
 */
import { isProtectedStaffEmail, normalizeKey, projectAcronyms, type DemoProjectRef } from "@/lib/demo-entities";
import { isPrismStatus } from "@/lib/prism-status";

export type NonDockProjectRef = DemoProjectRef & {
  status?: string | null;
  prismStatus?: string | null;
  actualGoLiveDate?: Date | string | null;
  archivedAt?: Date | string | null;
  customerStatus?: string | null;
  startDate?: Date | string | null;
  targetGoLiveDate?: Date | string | null;
  taskCountTotal?: number | null;
  type?: string | null;
  customerAccountId?: string | null;
};

export type NonDockCustomerRef = {
  id: string;
  slug: string | null;
  name: string | null;
  status?: string | null;
};

export type NonDockClassify = "delete" | "keep-allowlist" | "keep-legacy" | "keep-analytics";

export type NonDockOptions = {
  /** Acronyms currently on Dock Implementation WIP (required). */
  allowlist: ReadonlySet<string>;
  /**
   * Also keep Prism pipeline / analytics-only sites that are not Dock WIP.
   * Default false: pipeline/pre-kickoff/active not on the allowlist are pruned.
   */
  keepPrismAnalytics?: boolean;
  /** Clock for tests. */
  now?: Date;
};

function asDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isOnDockAllowlist(p: DemoProjectRef, allowlist: ReadonlySet<string>): boolean {
  return projectAcronyms(p).some((k) => allowlist.has(k));
}

/**
 * Dock test/draft / process-improvement spaces — exclude from the PATH book
 * unless Alexander puts a real customer acronym on the WIP allowlist.
 * Examples from the 2026-09-14 inventory: DRAFT Impl. Billing/RCM tab,
 * MT Test, Test Dock, MT Test 5, MT Testing 4.
 */
const DOCK_TEST_DRAFT_NAME_RE = [
  /\bdraft\s+impl\b/i,
  /\bmt\s+tests?\b/i,
  /\bmt\s+testing\b/i,
  /\btest\s+dock\b/i,
  /\bprocess[- ]improvement\b/i,
];

export function isDockTestOrDraftWorkspace(p: {
  name?: string | null;
  code?: string | null;
}): boolean {
  const hay = `${p.name ?? ""} ${p.code ?? ""}`;
  return DOCK_TEST_DRAFT_NAME_RE.some((re) => re.test(hay));
}

/**
 * Historical / post go-live — keep for Forecast/Analysis even if Dock
 * dropped the active workspace.
 */
export function isLegacyHistoricalSite(p: NonDockProjectRef, now = new Date()): boolean {
  const status = (p.status ?? "").toUpperCase();
  if (status === "COMPLETED" || status === "CANCELLED") return true;
  if (p.archivedAt) return true;

  const actual = asDate(p.actualGoLiveDate);
  if (actual && actual.getTime() < now.getTime()) return true;

  const customer = (p.customerStatus ?? "").toUpperCase();
  if (customer === "LIVE" || customer === "CHURNED") {
    // Live book of business: treat as historical unless still an active WIP.
    if (!isActiveWipBook(p, now)) return true;
  }
  return false;
}

/**
 * Active / pre-kickoff / pipeline / in-flight WIP — prune when not on Dock.
 */
export function isActiveWipBook(p: NonDockProjectRef, now = new Date()): boolean {
  if (p.archivedAt) return false;
  const status = (p.status ?? "").toUpperCase();
  if (status === "COMPLETED" || status === "CANCELLED") return false;

  const actual = asDate(p.actualGoLiveDate);
  if (actual && actual.getTime() < now.getTime()) return false;

  const prism = (p.prismStatus ?? "").toLowerCase();
  if (isPrismStatus(prism)) {
    return prism === "active" || prism === "pre-kickoff" || prism === "pipeline";
  }

  if (status === "IN_PROGRESS" || status === "ON_HOLD" || status === "BLOCKED") return true;
  if (status === "NOT_STARTED") return true;

  const customer = (p.customerStatus ?? "").toUpperCase();
  if (customer === "PROSPECT" || customer === "ONBOARDING" || customer === "AT_RISK") return true;

  return false;
}

/** Pipeline-only / roster analytics without a Dock workspace. */
export function isPrismAnalyticsOnly(p: NonDockProjectRef): boolean {
  const prism = (p.prismStatus ?? "").toLowerCase();
  if (prism === "pipeline") return true;
  const customer = (p.customerStatus ?? "").toUpperCase();
  if (customer === "PROSPECT" && (p.status ?? "").toUpperCase() === "NOT_STARTED") return true;
  return false;
}

export function classifyNonDockProject(p: NonDockProjectRef, opts: NonDockOptions): NonDockClassify {
  const now = opts.now ?? new Date();
  if (isDockTestOrDraftWorkspace(p) && !isOnDockAllowlist(p, opts.allowlist)) {
    return "delete";
  }
  if (isOnDockAllowlist(p, opts.allowlist)) return "keep-allowlist";
  const isInternal =
    (p.type ?? "").toUpperCase() === "INTERNAL" ||
    (!p.customerAccountId && !p.crmAcronym && !p.prismClientId);
  if (isInternal) return "keep-legacy";
  if (isLegacyHistoricalSite(p, now)) return "keep-legacy";
  if (opts.keepPrismAnalytics && isPrismAnalyticsOnly(p)) return "keep-analytics";
  if (isActiveWipBook(p, now)) return "delete";
  // Unknown leftover — keep rather than wipe history.
  return "keep-legacy";
}

export function classifyNonDockCustomer(
  _c: NonDockCustomerRef,
  projectClasses: NonDockClassify[],
): "delete" | "keep" {
  if (projectClasses.length === 0) {
    // Customer with no projects: not Dock WIP, not historical — candidate.
    return "delete";
  }
  const keeps = projectClasses.filter((x) => x !== "delete");
  if (keeps.length > 0) return "keep";
  return "delete";
}

export { isProtectedStaffEmail, normalizeKey };
