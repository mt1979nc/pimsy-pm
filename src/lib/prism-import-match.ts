/**
 * Match a Prism customer onto an existing PATH project.
 *
 * Order: prismClientId, then code / crmAcronym, then a normalized account name.
 * Blank keys never match. Several active candidates at the winning tier are
 * ambiguous and must not be written. An archived-only hit is not a successful
 * update for a live Prism customer (the caller skips it and does not insert
 * another row). Completed history may opt in to an archived match — those
 * rows are stored archived on purpose.
 */

import { acronymKey } from "@/lib/prism-dump";

export const PRISM_CUTOVER_ROSTER_DESCRIPTION =
  "Imported from Prism at cutover. Roster/capacity record — playbook not materialized.";

export type ExistingProjectSnapshot = {
  id: string;
  code: string;
  name?: string | null;
  description?: string | null;
  prismClientId: string | null;
  crmAcronym: string | null;
  customerAccountId?: string | null;
  customerName?: string | null;
  customerStatus?: string | null;
  templateId: string | null;
  taskCountTotal: number;
  status: string;
  archivedAt: Date | null;
  leadId?: string | null;
  coLeadId?: string | null;
  thirdSpecialistId?: string | null;
  thirdSpecialistName?: string | null;
  leadName?: string | null;
  leadPrismTeamId?: string | null;
  coLeadName?: string | null;
  coLeadPrismTeamId?: string | null;
  /** Dated slips already stored on this project. Used to append, not replace. */
  existingSlips?: { from: string; to: string }[];
  startDate?: Date | null;
  initialGoLiveDate?: Date | null;
  targetGoLiveDate?: Date | null;
  actualGoLiveDate?: Date | null;
  prismStatus?: string | null;
  currentPhase?: string | null;
  slipCount?: number;
};

export type ProjectMatchVia = "prismClientId" | "code" | "crmAcronym" | "name";

export type ProjectMatchResult =
  | {
      kind: "match";
      project: ExistingProjectSnapshot;
      via: ProjectMatchVia;
      /** Archived rows that also hit. They are not the write target. */
      archivedAlso: ExistingProjectSnapshot[];
    }
  | {
      kind: "ambiguous";
      via: ProjectMatchVia;
      candidates: ExistingProjectSnapshot[];
    }
  | {
      kind: "archived";
      via: ProjectMatchVia;
      candidates: ExistingProjectSnapshot[];
    }
  | { kind: "none" };

export type RosterShellDuplicate = {
  shellId: string;
  shellCode: string;
  shellName: string;
  shellArchived: boolean;
  siblingId: string;
  siblingCode: string;
  siblingName: string;
  siblingAcronym: string;
};

/** Lowercase, drop punctuation, and ignore the cutover roster suffix. */
export function normalizeAccountName(value: string | null | undefined): string {
  const lowered = (value ?? "").toLowerCase().replace(/['’]/g, "");
  const stripped = lowered.replace(/\s*(?:—|–|-)\s*pimsy implementation\s*$/i, "");
  return stripped
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function projectAcronym(project: Pick<ExistingProjectSnapshot, "crmAcronym" | "prismClientId" | "code">): string {
  return acronymKey(project.crmAcronym) || acronymKey(project.prismClientId) || acronymKey(project.code);
}

export function projectLabel(project: ExistingProjectSnapshot): string {
  const name = project.name?.trim() || project.customerName?.trim() || project.code;
  const acronym = projectAcronym(project) || project.code || "—";
  return `${project.id}  ${name}  (${acronym})`;
}

function nameKeys(project: ExistingProjectSnapshot): string[] {
  const keys = new Set<string>();
  for (const raw of [project.customerName, project.name]) {
    const key = normalizeAccountName(raw);
    if (key.length >= 2) keys.add(key);
  }
  return [...keys];
}

function dedupe(rows: ExistingProjectSnapshot[]): ExistingProjectSnapshot[] {
  const seen = new Set<string>();
  const out: ExistingProjectSnapshot[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function viaForAcronym(rows: ExistingProjectSnapshot[], key: string): "code" | "crmAcronym" {
  return rows.some((row) => acronymKey(row.code) === key) ? "code" : "crmAcronym";
}

export function resolveProjectMatch(
  acronym: string,
  projects: ExistingProjectSnapshot[],
  accountName?: string | null,
  opts?: { allowArchived?: boolean },
): ProjectMatchResult {
  const key = acronymKey(acronym);
  const nameKey = normalizeAccountName(accountName);
  const tiers: { via: ProjectMatchVia; rows: ExistingProjectSnapshot[] }[] = [];

  if (key) {
    tiers.push({
      via: "prismClientId",
      rows: projects.filter((project) => acronymKey(project.prismClientId) === key),
    });
    const acronymHits = projects.filter(
      (project) => acronymKey(project.code) === key || acronymKey(project.crmAcronym) === key,
    );
    tiers.push({ via: viaForAcronym(acronymHits, key), rows: acronymHits });
  }
  if (nameKey.length >= 2) {
    tiers.push({
      via: "name",
      rows: projects.filter((project) => nameKeys(project).includes(nameKey)),
    });
  }

  const passedArchived: ExistingProjectSnapshot[] = [];
  let archivedFallback: { via: ProjectMatchVia; candidates: ExistingProjectSnapshot[] } | null = null;

  for (const tier of tiers) {
    const unique = dedupe(tier.rows);
    if (!unique.length) continue;
    const active = unique.filter((project) => !project.archivedAt);
    const archived = unique.filter((project) => project.archivedAt);

    if (active.length === 1) {
      return {
        kind: "match",
        project: active[0]!,
        via: tier.via,
        archivedAlso: dedupe([...archived, ...passedArchived]),
      };
    }
    if (active.length > 1) {
      return { kind: "ambiguous", via: tier.via, candidates: active };
    }
    if (opts?.allowArchived && archived.length === 1) {
      return { kind: "match", project: archived[0]!, via: tier.via, archivedAlso: [] };
    }
    if (opts?.allowArchived && archived.length > 1) {
      return { kind: "ambiguous", via: tier.via, candidates: archived };
    }
    if (archived.length) {
      passedArchived.push(...archived);
      if (!archivedFallback) archivedFallback = { via: tier.via, candidates: archived };
    }
  }

  if (archivedFallback) {
    return { kind: "archived", via: archivedFallback.via, candidates: dedupe(archivedFallback.candidates) };
  }
  return { kind: "none" };
}

export function matchProject(
  acronym: string,
  projects: ExistingProjectSnapshot[],
  accountName?: string | null,
): ExistingProjectSnapshot | undefined {
  const result = resolveProjectMatch(acronym, projects, accountName);
  return result.kind === "match" ? result.project : undefined;
}

export function isPrismRosterShell(project: ExistingProjectSnapshot): boolean {
  const description = (project.description ?? "").trim();
  if (description !== PRISM_CUTOVER_ROSTER_DESCRIPTION) return false;
  if (project.templateId) return false;
  if ((project.taskCountTotal ?? 0) > 0) return false;
  return true;
}

/**
 * Oct 1 cutover shells that sit beside a real project for the same customer.
 * Report only. Callers must not delete or archive from this list.
 */
export function findRosterShellDuplicates(projects: ExistingProjectSnapshot[]): RosterShellDuplicate[] {
  const shells = projects.filter(isPrismRosterShell);
  const out: RosterShellDuplicate[] = [];
  for (const shell of shells) {
    const shellNames = new Set(nameKeys(shell));
    const siblings = projects.filter((other) => {
      if (other.id === shell.id || isPrismRosterShell(other)) return false;
      if (
        shell.customerAccountId &&
        other.customerAccountId &&
        shell.customerAccountId === other.customerAccountId
      ) {
        return true;
      }
      return nameKeys(other).some((key) => shellNames.has(key));
    });
    if (!siblings.length) continue;
    const sibling = siblings.find((row) => !row.archivedAt) ?? siblings[0]!;
    out.push({
      shellId: shell.id,
      shellCode: shell.code,
      shellName: shell.name?.trim() || shell.customerName?.trim() || shell.code,
      shellArchived: Boolean(shell.archivedAt),
      siblingId: sibling.id,
      siblingCode: sibling.code,
      siblingName: sibling.name?.trim() || sibling.customerName?.trim() || sibling.code,
      siblingAcronym: projectAcronym(sibling),
    });
  }
  return out;
}

/** Keep a non-blank PATH acronym. Fill only when the stored value is blank. */
export function fillBlankAcronym(current: string | null | undefined, incoming: string | null | undefined): string | null {
  if ((current ?? "").trim()) return current ?? null;
  const next = (incoming ?? "").trim();
  return next || null;
}

/**
 * True when the stored customer name is empty or the same account after
 * normalization. Unknown (null/undefined) does not rename the account.
 */
export function namesCompatible(current: string | null | undefined, incoming: string): boolean {
  if (current == null) return false;
  if (!current.trim()) return true;
  const next = normalizeAccountName(incoming);
  if (!next) return false;
  return normalizeAccountName(current) === next;
}
