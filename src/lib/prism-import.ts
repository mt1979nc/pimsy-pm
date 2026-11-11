/**
 * Prism → PATH import. Idempotent when a customer matches an existing project.
 *
 * Native Postgres is the write store. This never POSTs Prism saveState and
 * never deletes rows. WIP playbooks, demo logins, path-managed people, and
 * lead / exempt / director on people already in PATH are left intact.
 *
 * Matching and Alexander's overrides live in prism-import-match.ts and
 * prism-import-overrides.ts.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  customerAccounts,
  projectMembers,
  projectScopes,
  projects,
  slipEvents,
  users,
  type ComplexityTier,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { CAPACITY_PHASE_LABELS, type CapacityPhase } from "@/lib/capacity-phase";
import { parseDateInput, utcDayKey } from "@/lib/dates";
import { complexityTier, forecastImplementation, type ImplementationScope } from "@/lib/estimator";
import { mapPrismStatusToEnums, PRISM_STATUS_LABELS, isPrismStatus, type PrismStatus } from "@/lib/prism-status";
import {
  emailForTeamMember,
  isProtectedEmail,
  isProtectedProjectCode,
  type PrismDump,
  type PrismDumpCompleted,
  type PrismDumpCustomer,
  type PrismDumpSlip,
  type PrismDumpTeamMember,
} from "@/lib/prism-dump";
import {
  fillBlankAcronym,
  findRosterShellDuplicates,
  isPrismRosterShell,
  matchProject,
  namesCompatible,
  PRISM_CUTOVER_ROSTER_DESCRIPTION,
  projectAcronym,
  projectLabel,
  resolveProjectMatch,
  type ExistingProjectSnapshot,
  type ProjectMatchResult,
  type ProjectMatchVia,
  type RosterShellDuplicate,
} from "@/lib/prism-import-match";
import {
  applyPrismCustomerOverrides,
  customerOverride,
  excludedTeam,
  type PrismCustomerStatus,
} from "@/lib/prism-import-overrides";
import { staffingRoleFromTitle } from "@/lib/staffing";
import { env } from "@/lib/env";

export type { ExistingProjectSnapshot, ProjectMatchResult, ProjectMatchVia, RosterShellDuplicate };
export {
  fillBlankAcronym,
  findRosterShellDuplicates,
  isPrismRosterShell,
  matchProject,
  namesCompatible,
  PRISM_CUTOVER_ROSTER_DESCRIPTION,
  resolveProjectMatch,
};

export type ExistingUserSnapshot = {
  id: string;
  email: string;
  prismTeamId: string | null;
  name: string | null;
  role: string;
  /** Added in Settings → People. Import must not rewrite or deactivate them. */
  pathManaged?: boolean;
};

export type ExistingPmState = {
  users: ExistingUserSnapshot[];
  projects: ExistingProjectSnapshot[];
};

export type ImportAction =
  | "insert"
  | "update"
  | "skip"
  | "protect-wip"
  | "protect-demo"
  | "ambiguous";

export type ImportMatchLabel = "NEW" | "AMBIGUOUS" | "SKIPPED" | "MATCHED";

export type ImportPlanRow = {
  kind: "team" | "customer" | "completed" | "slip";
  key: string;
  action: ImportAction;
  detail: string;
  matchLabel?: ImportMatchLabel;
  changes?: string[];
  projectId?: string;
  projectName?: string;
  projectAcronym?: string;
  via?: ProjectMatchVia;
  accountName?: string;
  parentKey?: string;
  slipSummary?: string;
};

export type ImportPlan = {
  team: ImportPlanRow[];
  customers: ImportPlanRow[];
  completed: ImportPlanRow[];
  slips: ImportPlanRow[];
  warnings: string[];
  overrideNotes: string[];
  duplicateShells: RosterShellDuplicate[];
  /** Dump with customer overrides applied. The input dump is not mutated. */
  prepared: PrismDump;
};

export type ImportApplyResult = ImportPlan & {
  teamUpserted: number;
  customersInserted: number;
  customersUpdated: number;
  completedInserted: number;
  completedUpdated: number;
  skipped: number;
};

const COMPLEXITY: Record<string, ComplexityTier> = {
  STANDARD: "STANDARD",
  MODERATE: "MODERATE",
  HIGH: "HIGH",
  ENTERPRISE: "ENTERPRISE",
};

export function isWipProject(p: Pick<ExistingProjectSnapshot, "templateId" | "taskCountTotal">): boolean {
  return Boolean(p.templateId) || (p.taskCountTotal ?? 0) > 0;
}

export function matchUser(
  teamId: string | null,
  email: string | null,
  people: ExistingUserSnapshot[],
): ExistingUserSnapshot | undefined {
  const tid = (teamId ?? "").trim().toLowerCase();
  if (tid) {
    const byTeam = people.find((u) => (u.prismTeamId ?? "").toLowerCase() === tid);
    if (byTeam) return byTeam;
  }
  if (email) {
    const needle = email.toLowerCase();
    return people.find((u) => u.email.toLowerCase() === needle);
  }
  return undefined;
}

/**
 * Fields written onto a person who is already in PATH.
 * Lead, exempt, and director are absent on purpose.
 */
export function prismTeamUpdateFields(
  existing: { name: string | null },
  member: { name: string; hoursPerWeek: number; teamId: string },
  active: boolean,
) {
  return {
    name: existing.name ?? member.name,
    capacityHoursPerWeek: Math.round(member.hoursPerWeek),
    prismTeamId: member.teamId,
    isActive: active,
    updatedAt: new Date(),
  };
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function parseComplexity(raw: string | null | undefined): ComplexityTier | null {
  if (!raw) return null;
  return COMPLEXITY[raw.trim().toUpperCase()] ?? null;
}

function dayKey(value: Date | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return utcDayKey(value);
  const parsed = parseDateInput(String(value));
  return parsed ? utcDayKey(parsed) : String(value).slice(0, 10);
}

function known<K extends keyof ExistingProjectSnapshot>(project: ExistingProjectSnapshot, key: K): boolean {
  return Object.prototype.hasOwnProperty.call(project, key) && project[key] !== undefined;
}

function changeLine(label: string, from: string | null, to: string | null, note?: string): string | null {
  const left = from?.trim() ? from : "—";
  const right = to?.trim() ? to : "—";
  if (left === right) return null;
  return note ? `${label}  ${left} → ${right} (${note})` : `${label}  ${left} → ${right}`;
}

function prismStatusLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return isPrismStatus(value) ? PRISM_STATUS_LABELS[value] : value;
}

function phaseLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return CAPACITY_PHASE_LABELS[value as CapacityPhase] ?? value;
}

function personLabel(name: string | null | undefined, teamId: string | null | undefined, email?: string | null): string {
  const who = name?.trim() || email?.trim() || "";
  const tid = (teamId ?? "").trim();
  if (who && tid) return `${who} (${tid})`;
  return who || tid || "—";
}

function leadChangeLines(
  owner: string | null,
  project: ExistingProjectSnapshot | undefined,
  users: ExistingUserSnapshot[],
): string[] {
  const ban = owner ? excludedTeam(owner) : undefined;
  if (ban) return [`lead  unchanged — ${ban.name} (${ban.teamId}) is excluded`];
  const incoming = owner
    ? users.find((user) => (user.prismTeamId ?? "").toLowerCase() === owner.toLowerCase())
    : undefined;
  const next = incoming ? personLabel(incoming.name, incoming.prismTeamId ?? owner, incoming.email) : owner;
  if (!project) {
    const line = changeLine("lead", null, next);
    return line ? [line] : [];
  }
  if (!known(project, "leadId") && !known(project, "leadName") && !known(project, "leadPrismTeamId")) return [];
  let current = "—";
  if (project.leadName || project.leadPrismTeamId) current = personLabel(project.leadName, project.leadPrismTeamId);
  else if (project.leadId) {
    const user = users.find((row) => row.id === project.leadId);
    current = user ? personLabel(user.name, user.prismTeamId, user.email) : project.leadId;
  }
  const line = changeLine("lead", current, next);
  return line ? [line] : [];
}

function customerFieldChanges(
  customer: PrismDumpCustomer,
  project: ExistingProjectSnapshot | undefined,
  users: ExistingUserSnapshot[],
): string[] {
  const override = customerOverride(customer.id);
  const lines: string[] = [];
  const prismLabel = override?.customerStatus || override?.phase ? "prism status" : "status";
  if (!project || known(project, "prismStatus")) {
    const line = changeLine(prismLabel, project ? prismStatusLabel(project.prismStatus) : null, prismStatusLabel(customer.status));
    if (line) lines.push(line);
  }
  if (override?.customerStatus) {
    const from = project && known(project, "customerStatus") ? project.customerStatus ?? null : null;
    const line = changeLine("status", from, override.customerStatus, "override");
    if (line) lines.push(line);
  }
  if (override?.phase) {
    const from = project && known(project, "currentPhase") ? phaseLabel(project.currentPhase) : null;
    const line = changeLine("status", from, phaseLabel(override.phase), "override");
    if (line) lines.push(line);
  }
  if (!project || known(project, "startDate")) {
    const line = changeLine("kickoff", project ? dayKey(project.startDate) : null, customer.kickoffDate, override?.kickoff ? "override" : undefined);
    if (line) lines.push(line);
  }
  if (!project || known(project, "targetGoLiveDate")) {
    const line = changeLine(
      "go-live",
      project ? dayKey(project.targetGoLiveDate) : null,
      customer.goliveDate,
      override?.goLive ? "override" : undefined,
    );
    if (line) lines.push(line);
  }
  if (override?.initialGoLive) {
    if (!project || known(project, "initialGoLiveDate")) {
      const line = changeLine(
        "initial go-live",
        project ? dayKey(project.initialGoLiveDate) : null,
        override.initialGoLive,
        "override",
      );
      if (line) lines.push(line);
    }
  } else if (!project || (known(project, "initialGoLiveDate") && !project.initialGoLiveDate)) {
    const line = changeLine("initial go-live", null, customer.initialGolive ?? customer.goliveDate);
    if (line) lines.push(line);
  }
  if (override?.customerStatus === "LIVE" && override.goLive && (!project || known(project, "actualGoLiveDate"))) {
    const line = changeLine(
      "actual go-live",
      project ? dayKey(project.actualGoLiveDate) : null,
      override.goLive,
      "override",
    );
    if (line) lines.push(line);
  }
  lines.push(...leadChangeLines(customer.owner, project, users));
  return lines;
}

function completedFieldChanges(
  row: PrismDumpCompleted,
  project: ExistingProjectSnapshot | undefined,
  users: ExistingUserSnapshot[],
): string[] {
  const override = customerOverride(row.id);
  const lines: string[] = [];
  if (!project || known(project, "status")) {
    const line = changeLine("status", project ? project.status : null, "COMPLETED");
    if (line) lines.push(line);
  }
  if (override?.phase) {
    const from = project && known(project, "currentPhase") ? phaseLabel(project.currentPhase) : null;
    const line = changeLine("status", from, phaseLabel(override.phase), "override");
    if (line) lines.push(line);
  }
  if (!project || known(project, "startDate")) {
    const line = changeLine("kickoff", project ? dayKey(project.startDate) : null, row.kickoffDate, override?.kickoff ? "override" : undefined);
    if (line) lines.push(line);
  }
  if (!project || known(project, "targetGoLiveDate") || known(project, "actualGoLiveDate")) {
    const current = project ? dayKey(project.actualGoLiveDate ?? project.targetGoLiveDate) : null;
    const line = changeLine("go-live", current, row.goliveDate, override?.goLive ? "override" : undefined);
    if (line) lines.push(line);
  }
  lines.push(...leadChangeLines(row.owner, project, users));
  return lines;
}

function baseMatch(
  kind: "customer" | "completed",
  key: string,
  accountName: string,
  match: ProjectMatchResult,
): ImportPlanRow | null {
  if (match.kind === "ambiguous") {
    return {
      kind,
      key,
      accountName,
      action: "ambiguous",
      matchLabel: "AMBIGUOUS",
      via: match.via,
      detail: `AMBIGUOUS — ${match.candidates.map(projectLabel).join("; ")}. Not written.`,
      changes: [],
    };
  }
  if (match.kind === "archived") {
    return {
      kind,
      key,
      accountName,
      action: "skip",
      matchLabel: "SKIPPED",
      via: match.via,
      detail: `SKIPPED — archived ${match.candidates.map(projectLabel).join("; ")}. Not updated and not inserted again.`,
      changes: [],
    };
  }
  if (match.kind === "none") return null;
  return null;
}

function matchedRow(
  kind: "customer" | "completed",
  key: string,
  accountName: string,
  match: Extract<ProjectMatchResult, { kind: "match" }>,
  changes: string[],
): Omit<ImportPlanRow, "action" | "matchLabel" | "detail"> {
  const project = match.project;
  return {
    kind,
    key,
    accountName,
    projectId: project.id,
    projectName: project.name?.trim() || project.customerName?.trim() || project.code,
    projectAcronym: projectAcronym(project) || project.code,
    via: match.via,
    changes,
  };
}

function matchNote(match: Extract<ProjectMatchResult, { kind: "match" }>): string {
  const archived = match.project.archivedAt ? "This PATH row is archived." : "";
  const also = match.archivedAlso.length
    ? `Archived also matched: ${match.archivedAlso.map(projectLabel).join("; ")} (not written).`
    : "";
  return [archived, also].filter(Boolean).join(" ");
}

function slipRows(customer: PrismDumpCustomer, parent: ImportPlanRow, slipCount: number): ImportPlanRow[] {
  const blockedByGoLive = Boolean(customerOverride(customer.id)?.goLive);
  return customer.slipLog.map((slip) => {
    const summary = [slip.from && slip.to ? `${slip.from} → ${slip.to}` : `${slip.from ?? "?"} → ${slip.to ?? "?"}`, slip.days != null ? `${slip.days}d` : null, slip.cause, slip.note]
      .filter(Boolean)
      .join("  ");
    const base = {
      kind: "slip" as const,
      key: `${customer.id}:${slip.from ?? ""}:${slip.to ?? ""}:${slip.days ?? ""}`,
      parentKey: customer.id,
      accountName: customer.acct,
      projectId: parent.projectId,
      projectName: parent.projectName,
      projectAcronym: parent.projectAcronym,
      changes: [] as string[],
      slipSummary: summary,
    };
    if (parent.matchLabel === "AMBIGUOUS" || parent.action === "ambiguous") {
      return { ...base, action: "ambiguous" as const, matchLabel: "AMBIGUOUS" as const, detail: "Not written." };
    }
    if (parent.matchLabel === "SKIPPED" || parent.action === "skip" || parent.action === "protect-demo") {
      return { ...base, action: "skip" as const, matchLabel: "SKIPPED" as const, detail: "Not written." };
    }
    if (blockedByGoLive) {
      return {
        ...base,
        action: "skip" as const,
        matchLabel: "SKIPPED" as const,
        detail: "go-live is overridden; Prism slips are not imported",
      };
    }
    if (slipCount > 0 && parent.action !== "insert") {
      return {
        ...base,
        action: "skip" as const,
        matchLabel: "SKIPPED" as const,
        detail: "project already has slips; not overwritten",
      };
    }
    if (parent.matchLabel === "NEW" || parent.action === "insert") {
      return { ...base, action: "insert" as const, matchLabel: "NEW" as const, detail: "" };
    }
    return { ...base, action: "insert" as const, matchLabel: "MATCHED" as const, detail: "" };
  });
}

function markCollisions(rows: ImportPlanRow[], warnings: string[]) {
  const groups = new Map<string, ImportPlanRow[]>();
  for (const row of rows) {
    if (!row.projectId) continue;
    if (row.action === "skip" || row.action === "ambiguous" || row.action === "protect-demo") continue;
    const list = groups.get(row.projectId) ?? [];
    list.push(row);
    groups.set(row.projectId, list);
  }
  for (const [projectId, group] of groups) {
    if (group.length < 2) continue;
    const keys = group.map((row) => row.key).join(", ");
    warnings.push(`${keys} match PATH project ${projectId}. Not written.`);
    for (const row of group) {
      row.action = "ambiguous";
      row.matchLabel = "AMBIGUOUS";
      row.detail = `AMBIGUOUS — ${keys} match the same PATH project ${projectId}. Not written.`;
      row.projectId = undefined;
      row.projectName = undefined;
      row.projectAcronym = undefined;
      row.changes = [];
    }
  }
}

function countSkipped(rows: ImportPlanRow[]): number {
  return rows.filter((row) => row.action === "skip" || row.action === "ambiguous" || row.action.startsWith("protect")).length;
}

/**
 * Decide inserts/updates without touching the database — used by tests and dry-run.
 */
export function planPrismImport(dump: PrismDump, existing: ExistingPmState): ImportPlan {
  const preparedResult = applyPrismCustomerOverrides(dump);
  const source = preparedResult.dump;
  const warnings: string[] = [];
  const overrideNotes = preparedResult.notes;
  const team: ImportPlanRow[] = [];
  const customers: ImportPlanRow[] = [];
  const completed: ImportPlanRow[] = [];

  for (const member of source.team) {
    const ban = excludedTeam(member.teamId);
    if (ban) {
      team.push({
        kind: "team",
        key: member.teamId,
        action: "skip",
        matchLabel: "SKIPPED",
        detail: `${ban.name} (${member.teamId}) is excluded — not imported, not touched. ${ban.reason}`,
      });
      continue;
    }
    const email = emailForTeamMember(member);
    if (email && isProtectedEmail(email)) {
      team.push({
        kind: "team",
        key: member.teamId,
        action: "protect-demo",
        detail: `${member.name} (${email}) is a demo login — flags/hours not overwritten`,
      });
      continue;
    }
    const hit = matchUser(member.teamId, email, existing.users);
    if (hit && isProtectedEmail(hit.email)) {
      team.push({
        kind: "team",
        key: member.teamId,
        action: "protect-demo",
        detail: `${hit.email} is protected`,
      });
      continue;
    }
    if (hit?.pathManaged) {
      team.push({
        kind: "team",
        key: member.teamId,
        action: "skip",
        detail: `${hit.email} was added in PATH — left alone`,
      });
      continue;
    }
    team.push({
      kind: "team",
      key: member.teamId,
      action: hit ? "update" : email ? "insert" : "skip",
      detail: hit
        ? `update ${hit.email} hours=${member.hoursPerWeek}; lead, exempt, and director kept`
        : email
          ? `insert ${email}`
          : `no email for teamId ${member.teamId} (${member.name}) — skipped`,
    });
    if (!hit && !email) warnings.push(`Team ${member.teamId} (${member.name}) has no email mapping; not inserted.`);
  }

  for (const member of source.formerTeam) {
    const ban = excludedTeam(member.teamId);
    if (ban) {
      team.push({
        kind: "team",
        key: member.teamId || member.name,
        action: "skip",
        matchLabel: "SKIPPED",
        detail: `${ban.name} (${member.teamId}) is excluded — not imported, not touched. ${ban.reason}`,
      });
      continue;
    }
    const email = emailForTeamMember(member);
    const hit = matchUser(member.teamId, email, existing.users);
    if (hit && isProtectedEmail(hit.email)) continue;
    if (hit?.pathManaged) {
      team.push({
        kind: "team",
        key: member.teamId || email || member.name,
        action: "skip",
        detail: `${hit.email} was added in PATH — left alone`,
      });
      continue;
    }
    team.push({
      kind: "team",
      key: member.teamId || email || member.name,
      action: hit ? "update" : "skip",
      detail: hit ? `mark inactive ${hit.email}; lead, exempt, and director kept` : `former ${member.name} not in PATH`,
    });
  }

  for (const customer of source.customers) {
    const match = resolveProjectMatch(customer.id, existing.projects, customer.acct);
    const blocked = baseMatch("customer", customer.id, customer.acct, match);
    if (blocked) {
      customers.push(blocked);
      warnings.push(`${customer.id}: ${blocked.detail}`);
      continue;
    }
    if (match.kind !== "match") {
      customers.push({
        kind: "customer",
        key: customer.id,
        accountName: customer.acct,
        action: "insert",
        matchLabel: "NEW",
        detail: `NEW — no PATH project matched ${customer.id} / ${customer.acct}.`,
        changes: customerFieldChanges(customer, undefined, existing.users),
      });
      continue;
    }
    const note = matchNote(match);
    if (isProtectedProjectCode(match.project.code)) {
      customers.push({
        kind: "customer",
        key: customer.id,
        accountName: customer.acct,
        action: "protect-demo",
        matchLabel: "SKIPPED",
        detail: `SKIPPED — ${projectLabel(match.project)} is the demo project and is left alone.`,
        changes: [],
      });
      continue;
    }
    const changes = customerFieldChanges(customer, match.project, existing.users);
    const row = matchedRow("customer", customer.id, customer.acct, match, changes);
    if (isWipProject(match.project)) {
      customers.push({
        ...row,
        action: "protect-wip",
        matchLabel: "MATCHED",
        detail: `Playbook and tasks kept. ${note}`.trim(),
      });
      continue;
    }
    customers.push({
      ...row,
      action: "update",
      matchLabel: "MATCHED",
      detail: note,
    });
  }

  for (const row of source.completed) {
    const match = resolveProjectMatch(row.id, existing.projects, row.acct, { allowArchived: true });
    const blocked = baseMatch("completed", row.id, row.acct, match);
    if (blocked) {
      completed.push(blocked);
      warnings.push(`${row.id}: ${blocked.detail}`);
      continue;
    }
    if (match.kind !== "match") {
      completed.push({
        kind: "completed",
        key: row.id,
        accountName: row.acct,
        action: "insert",
        matchLabel: "NEW",
        detail: `NEW — no PATH project matched ${row.id} / ${row.acct}.`,
        changes: completedFieldChanges(row, undefined, existing.users),
      });
      continue;
    }
    if (isProtectedProjectCode(match.project.code)) {
      completed.push({
        kind: "completed",
        key: row.id,
        accountName: row.acct,
        action: "protect-demo",
        matchLabel: "SKIPPED",
        detail: `SKIPPED — ${projectLabel(match.project)} is the demo project and is left alone.`,
        changes: [],
      });
      continue;
    }
    if (isWipProject(match.project) && match.project.status !== "COMPLETED") {
      completed.push({
        ...matchedRow("completed", row.id, row.acct, match, ["status  not flipped — PATH still has a live playbook"]),
        action: "protect-wip",
        matchLabel: "MATCHED",
        detail: `MATCHED ${projectLabel(match.project)}. Prism lists this completed but PATH still has a playbook.`,
      });
      warnings.push(`${row.id}: Prism completed, PATH has a live playbook — left in progress.`);
      continue;
    }
    completed.push({
      ...matchedRow("completed", row.id, row.acct, match, completedFieldChanges(row, match.project, existing.users)),
      action: "update",
      matchLabel: "MATCHED",
      detail: matchNote(match),
    });
  }

  markCollisions([...customers, ...completed], warnings);

  const slips = source.customers.flatMap((customer) => {
    const parent = customers.find((row) => row.key === customer.id);
    if (!parent) return [];
    const project = parent.projectId ? existing.projects.find((row) => row.id === parent.projectId) : undefined;
    return slipRows(customer, parent, project?.slipCount ?? 0);
  });

  return {
    team,
    customers,
    completed,
    slips,
    warnings,
    overrideNotes,
    duplicateShells: findRosterShellDuplicates(existing.projects),
    prepared: source,
  };
}

function customerStatusForPrism(status: PrismStatus, completed: boolean): PrismCustomerStatus {
  if (completed) return "LIVE";
  return mapPrismStatusToEnums(status).customerStatus;
}

function projectStatusForPrism(status: PrismStatus, completed: boolean) {
  if (completed) return "COMPLETED" as const;
  return mapPrismStatusToEnums(status).projectStatus;
}

function scopeFromCustomer(c: PrismDumpCustomer): ImplementationScope {
  return {
    userCount: c.users,
    locationCount: c.locations,
    formPageCount: c.fp || 25,
    trainingsPerWeek: Math.max(1, c.trainingsPerWeek || 2),
    serviceLines: c.serviceLines.length ? c.serviceLines : ["OUTPATIENT_THERAPY"],
    stateCompliance: c.stateComp,
    minimalOrgStructure: c.supportStruct === false,
    intakeAssistant: false,
  };
}

function estimatedHoursFor(c: PrismDumpCustomer, kickoff: Date | null): number {
  const scope = scopeFromCustomer(c);
  const estimate = forecastImplementation(scope, kickoff ?? new Date());
  return estimate.hours.totalHours;
}

function resolveOwnerId(
  teamId: string | null,
  teamIds: Map<string, string>,
  existingId: string | null | undefined,
): string | null {
  if (!teamId) return null;
  if (excludedTeam(teamId)) return existingId ?? null;
  const hit = teamIds.get(teamId);
  if (hit) return hit;
  return existingId ?? null;
}

async function loadExistingState(): Promise<ExistingPmState> {
  const [people, rows, slipCountRows] = await Promise.all([
    db.query.users.findMany({
      columns: { id: true, email: true, prismTeamId: true, name: true, role: true, pathManaged: true },
    }),
    db.query.projects.findMany({
      columns: {
        id: true,
        code: true,
        name: true,
        description: true,
        prismClientId: true,
        crmAcronym: true,
        customerAccountId: true,
        templateId: true,
        taskCountTotal: true,
        status: true,
        archivedAt: true,
        leadId: true,
        coLeadId: true,
        startDate: true,
        initialGoLiveDate: true,
        targetGoLiveDate: true,
        actualGoLiveDate: true,
        prismStatus: true,
        currentPhase: true,
      },
      with: {
        customerAccount: { columns: { name: true, status: true } },
        lead: { columns: { name: true, prismTeamId: true } },
      },
    }),
    db
      .select({ projectId: slipEvents.projectId, n: sql<number>`count(*)::int` })
      .from(slipEvents)
      .groupBy(slipEvents.projectId),
  ]);
  const slipCounts = new Map(slipCountRows.map((row) => [row.projectId, Number(row.n)]));
  return {
    users: people,
    projects: rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      prismClientId: row.prismClientId,
      crmAcronym: row.crmAcronym,
      customerAccountId: row.customerAccountId,
      customerName: row.customerAccount?.name ?? null,
      customerStatus: row.customerAccount?.status ?? null,
      templateId: row.templateId,
      taskCountTotal: row.taskCountTotal,
      status: row.status,
      archivedAt: row.archivedAt,
      leadId: row.leadId,
      coLeadId: row.coLeadId,
      leadName: row.lead?.name ?? null,
      leadPrismTeamId: row.lead?.prismTeamId ?? null,
      startDate: row.startDate,
      initialGoLiveDate: row.initialGoLiveDate,
      targetGoLiveDate: row.targetGoLiveDate,
      actualGoLiveDate: row.actualGoLiveDate,
      prismStatus: row.prismStatus,
      currentPhase: row.currentPhase,
      slipCount: slipCounts.get(row.id) ?? 0,
    })),
  };
}

async function upsertCustomerAccount(
  name: string,
  seatCount: number,
  status: PrismCustomerStatus,
  forceStatus = false,
) {
  let slug = slugify(name);
  const existing = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.slug, slug) });
  if (existing) {
    const sticky = ["LIVE", "AT_RISK", "CHURNED"].includes(existing.status);
    await db
      .update(customerAccounts)
      .set({
        name,
        seatCount,
        status: forceStatus || !sticky ? status : existing.status,
        updatedAt: new Date(),
      })
      .where(eq(customerAccounts.id, existing.id));
    return existing.id;
  }
  for (let i = 2; i < 100; i++) {
    const clash = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.slug, slug) });
    if (!clash) break;
    slug = `${slugify(name)}-${i}`;
  }
  const [row] = await db
    .insert(customerAccounts)
    .values({ name, slug, seatCount, status })
    .returning({ id: customerAccounts.id });
  return row.id;
}

async function ensureLeadMembership(projectId: string, leadId: string | null, coLeadId: string | null) {
  if (leadId) {
    await db
      .insert(projectMembers)
      .values({ projectId, userId: leadId, role: "LEAD" })
      .onConflictDoNothing();
  }
  if (coLeadId && coLeadId !== leadId) {
    await db.insert(projectMembers).values({ projectId, userId: coLeadId, role: "CONTRIBUTOR" }).onConflictDoNothing();
  }
}

async function upsertScope(
  projectId: string,
  scope: ImplementationScope,
  estimatedHours: number,
  complexity: ComplexityTier,
) {
  const existing = await db.query.projectScopes.findFirst({
    where: eq(projectScopes.projectId, projectId),
    columns: { projectId: true },
  });
  const values = {
    userCount: scope.userCount,
    locationCount: scope.locationCount,
    formPageCount: scope.formPageCount,
    trainingsPerWeek: scope.trainingsPerWeek,
    serviceLines: scope.serviceLines,
    stateCompliance: scope.stateCompliance,
    minimalOrgStructure: scope.minimalOrgStructure,
    intakeAssistant: scope.intakeAssistant,
    complexityTier: complexity,
    estimatedHours,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(projectScopes).set(values).where(eq(projectScopes.projectId, projectId));
  } else {
    await db.insert(projectScopes).values({ projectId, ...values });
  }
}

async function importSlipsIfEmpty(projectId: string, slips: PrismDumpSlip[], kickoff: Date | null, initial: Date | null, current: Date | null) {
  const existing = await db.query.slipEvents.findFirst({
    where: eq(slipEvents.projectId, projectId),
    columns: { id: true },
  });
  if (existing) return;

  if (slips.length > 0) {
    for (const s of slips) {
      const from = s.from ? parseDateInput(s.from) : null;
      const to = s.to ? parseDateInput(s.to) : null;
      if (!from || !to) continue;
      const days = s.days ?? Math.round((to.getTime() - from.getTime()) / 86_400_000);
      if (days === 0) continue;
      await db.insert(slipEvents).values({
        projectId,
        fromDate: from,
        toDate: to,
        days,
        cause: s.cause,
        note: s.note ?? "Imported from Prism slipLog",
        createdById: null,
      });
    }
    return;
  }

  if (initial && current && initial.getTime() !== current.getTime()) {
    const days = Math.round((current.getTime() - initial.getTime()) / 86_400_000);
    if (days === 0) return;
    await db.insert(slipEvents).values({
      projectId,
      fromDate: initial,
      toDate: current,
      days,
      cause: null,
      note: "Aggregate imported from Prism (no per-event slipLog).",
      createdById: null,
    });
  }
  void kickoff;
}

async function applyTeam(
  dump: PrismDump,
  people: ExistingUserSnapshot[],
): Promise<{ upserted: number; ids: Map<string, string> }> {
  const ids = new Map<string, string>();
  let upserted = 0;

  const applyMember = async (member: PrismDumpTeamMember, active: boolean) => {
    if (excludedTeam(member.teamId)) return;
    const email = emailForTeamMember(member);
    if (email && isProtectedEmail(email)) {
      const hit = matchUser(member.teamId, email, people);
      if (hit) ids.set(member.teamId, hit.id);
      return;
    }
    const hit = matchUser(member.teamId, email, people);
    if (hit && isProtectedEmail(hit.email)) {
      ids.set(member.teamId, hit.id);
      return;
    }
    if (hit?.pathManaged) {
      ids.set(member.teamId, hit.id);
      return;
    }
    if (hit) {
      await db.update(users).set(prismTeamUpdateFields(hit, member, active)).where(eq(users.id, hit.id));
      ids.set(member.teamId, hit.id);
      upserted++;
      return;
    }
    if (!email) return;
    const isBootstrapOwner = env.BOOTSTRAP_OWNER_EMAIL && email.toLowerCase() === env.BOOTSTRAP_OWNER_EMAIL;
    const [row] = await db
      .insert(users)
      .values({
        email,
        name: member.name,
        role: isBootstrapOwner ? "OWNER" : "SPECIALIST",
        title: member.flags.director ? "Implementation Director" : "Implementation Specialist",
        capacityHoursPerWeek: Math.round(member.hoursPerWeek),
        isActive: active,
        capacityExempt: member.flags.capacityExempt,
        canLead: member.flags.canLead,
        isDirector: member.flags.director,
        prismTeamId: member.teamId,
        staffingRole: staffingRoleFromTitle(member.flags.director ? "Implementation Director" : "Implementation Specialist"),
      })
      .returning({ id: users.id });
    ids.set(member.teamId, row.id);
    people.push({
      id: row.id,
      email,
      prismTeamId: member.teamId,
      name: member.name,
      role: isBootstrapOwner ? "OWNER" : "SPECIALIST",
    });
    upserted++;
  };

  for (const member of dump.team) await applyMember(member, true);
  for (const member of dump.formerTeam) await applyMember(member, false);
  return { upserted, ids };
}

async function applyActiveCustomer(
  customer: PrismDumpCustomer,
  teamIds: Map<string, string>,
  existing: ExistingProjectSnapshot | undefined,
  mode: ImportAction,
) {
  if (mode !== "insert" && mode !== "update" && mode !== "protect-wip") return "skip" as const;
  if (mode !== "insert" && !existing) return "skip" as const;
  if (existing?.archivedAt) return "skip" as const;
  const override = customerOverride(customer.id);
  const leadId = resolveOwnerId(customer.owner, teamIds, existing?.leadId);
  const coLeadId = resolveOwnerId(customer.owner2, teamIds, existing?.coLeadId);
  const kickoff = customer.kickoffDate ? parseDateInput(customer.kickoffDate) : null;
  const initial = customer.initialGolive ? parseDateInput(customer.initialGolive) : null;
  const current = customer.goliveDate ? parseDateInput(customer.goliveDate) : initial;
  const scope = scopeFromCustomer(customer);
  const hours = estimatedHoursFor(customer, kickoff);
  const tier = complexityTier(scope);
  const wipProtect = mode === "protect-wip";
  const customerStatus = override?.customerStatus ?? customerStatusForPrism(customer.status, false);
  const phasePatch = override?.phase ? { currentPhase: override.phase, phaseRecordedAt: new Date() } : {};
  const actualPatch =
    override?.customerStatus === "LIVE" && override.goLive
      ? { actualGoLiveDate: parseDateInput(override.goLive) }
      : {};

  if (!existing) {
    const customerId = await upsertCustomerAccount(customer.acct, customer.users, customerStatus, Boolean(override?.customerStatus));
    const [project] = await db
      .insert(projects)
      .values({
        name: `${customer.acct} — PIMSY implementation`,
        code: customer.id,
        type: "IMPLEMENTATION",
        status: projectStatusForPrism(customer.status, false),
        customerAccountId: customerId,
        leadId,
        coLeadId,
        ownerSplitPercent: customer.split,
        customHoursPerWeek: customer.customHpw,
        prismStatus: customer.status,
        prismNote: customer.note,
        startDate: kickoff,
        initialGoLiveDate: initial ?? current,
        targetGoLiveDate: current,
        estimatedHours: Math.round(hours),
        portalEnabled: customer.status !== "pipeline",
        description: PRISM_CUTOVER_ROSTER_DESCRIPTION,
        prismClientId: customer.id,
        crmAcronym: customer.id,
        ...phasePatch,
        ...actualPatch,
      })
      .returning({ id: projects.id });
    await ensureLeadMembership(project.id, leadId, coLeadId);
    await upsertScope(project.id, scope, hours, tier);
    if (!override?.goLive) await importSlipsIfEmpty(project.id, customer.slipLog, kickoff, initial, current);
    return "insert" as const;
  }

  const before = await db.query.projects.findFirst({
    where: eq(projects.id, existing.id),
    columns: { initialGoLiveDate: true, customerAccountId: true },
  });
  await db
    .update(projects)
    .set({
      leadId,
      coLeadId,
      ownerSplitPercent: customer.split,
      customHoursPerWeek: customer.customHpw,
      prismStatus: customer.status,
      prismNote: customer.note,
      startDate: kickoff,
      targetGoLiveDate: current,
      estimatedHours: Math.round(hours),
      prismClientId: fillBlankAcronym(existing.prismClientId, customer.id),
      crmAcronym: fillBlankAcronym(existing.crmAcronym, customer.id),
      updatedAt: new Date(),
      ...(!wipProtect ? { status: projectStatusForPrism(customer.status, false) } : {}),
      ...(override?.initialGoLive
        ? { initialGoLiveDate: parseDateInput(override.initialGoLive) }
        : before && !before.initialGoLiveDate
          ? { initialGoLiveDate: initial ?? current }
          : {}),
      ...phasePatch,
      ...actualPatch,
    })
    .where(eq(projects.id, existing.id));
  if (before?.customerAccountId) {
    const accountPatch: {
      seatCount: number;
      updatedAt: Date;
      name?: string;
      status?: PrismCustomerStatus;
    } = { seatCount: customer.users, updatedAt: new Date() };
    if (namesCompatible(existing.customerName, customer.acct)) accountPatch.name = customer.acct;
    if (override?.customerStatus) accountPatch.status = override.customerStatus;
    await db
      .update(customerAccounts)
      .set(accountPatch)
      .where(eq(customerAccounts.id, before.customerAccountId));
  }
  await ensureLeadMembership(existing.id, leadId, coLeadId);
  await upsertScope(existing.id, scope, hours, tier);
  if (!override?.goLive) await importSlipsIfEmpty(existing.id, customer.slipLog, kickoff, initial, current);
  return "update" as const;
}

async function applyCompleted(
  row: PrismDumpCompleted,
  teamIds: Map<string, string>,
  existing: ExistingProjectSnapshot | undefined,
  mode: ImportAction,
) {
  if (mode !== "insert" && mode !== "update") return "skip" as const;
  if (mode !== "insert" && !existing) return "skip" as const;
  const override = customerOverride(row.id);
  const leadId = resolveOwnerId(row.owner, teamIds, existing?.leadId);
  const kickoff = row.kickoffDate ? parseDateInput(row.kickoffDate) : null;
  const actual = row.goliveDate ? parseDateInput(row.goliveDate) : null;
  const initial =
    (row.initialGolive ? parseDateInput(row.initialGolive) : null) ??
    (kickoff && row.forecastDays != null ? new Date(kickoff.getTime() + row.forecastDays * 86_400_000) : null);
  const hours = row.estimatedHours ?? 0;
  const tier = parseComplexity(row.complexity) ?? "STANDARD";
  const scope: ImplementationScope = {
    userCount: row.users,
    locationCount: 1,
    formPageCount: 25,
    trainingsPerWeek: 2,
    serviceLines: [],
    stateCompliance: false,
    minimalOrgStructure: false,
    intakeAssistant: false,
  };
  const phasePatch = override?.phase ? { currentPhase: override.phase, phaseRecordedAt: new Date() } : {};

  if (!existing) {
    const customerId = await upsertCustomerAccount(row.acct, row.users, override?.customerStatus ?? "LIVE", Boolean(override?.customerStatus));
    const [project] = await db
      .insert(projects)
      .values({
        name: `${row.acct} — PIMSY implementation`,
        code: row.id,
        type: "IMPLEMENTATION",
        status: "COMPLETED",
        customerAccountId: customerId,
        leadId,
        startDate: kickoff,
        initialGoLiveDate: initial,
        targetGoLiveDate: initial ?? actual,
        actualGoLiveDate: actual,
        estimatedHours: Math.round(hours),
        portalEnabled: false,
        archivedAt: new Date(),
        description: `Imported from Prism completed implementations (${row.era ?? "unknown"} era).`,
        prismEra: row.era === "legacy" || row.era === "current" ? row.era : null,
        prismClientId: row.id,
        crmAcronym: row.id,
        prismStatus: "active",
        ...phasePatch,
      })
      .returning({ id: projects.id });
    await ensureLeadMembership(project.id, leadId, null);
    await upsertScope(project.id, scope, hours, tier);
    if (!override?.goLive && initial && actual && initial.getTime() !== actual.getTime()) {
      await importSlipsIfEmpty(project.id, [], kickoff, initial, actual);
    }
    return "insert" as const;
  }

  await db
    .update(projects)
    .set({
      leadId,
      ...(kickoff ? { startDate: kickoff } : {}),
      actualGoLiveDate: actual,
      ...(override?.initialGoLive
        ? { initialGoLiveDate: parseDateInput(override.initialGoLive) }
        : existing.status === "COMPLETED" && initial
          ? { initialGoLiveDate: initial }
          : {}),
      ...(hours > 0 ? { estimatedHours: Math.round(hours) } : {}),
      prismClientId: fillBlankAcronym(existing.prismClientId, row.id),
      crmAcronym: fillBlankAcronym(existing.crmAcronym, row.id),
      prismEra: row.era === "legacy" || row.era === "current" ? row.era : null,
      status: "COMPLETED",
      archivedAt: existing.archivedAt ?? new Date(),
      portalEnabled: false,
      updatedAt: new Date(),
      ...phasePatch,
    })
    .where(eq(projects.id, existing.id));
  await ensureLeadMembership(existing.id, leadId, null);
  await upsertScope(existing.id, scope, hours, tier);
  return "update" as const;
}

export async function applyPrismImport(dump: PrismDump, opts: { dryRun?: boolean } = {}): Promise<ImportApplyResult> {
  const existing = await loadExistingState();
  const plan = planPrismImport(dump, existing);
  if (opts.dryRun) {
    return {
      ...plan,
      teamUpserted: plan.team.filter((row) => row.action === "insert" || row.action === "update").length,
      customersInserted: plan.customers.filter((row) => row.action === "insert").length,
      customersUpdated: plan.customers.filter((row) => row.action === "update" || row.action === "protect-wip").length,
      completedInserted: plan.completed.filter((row) => row.action === "insert").length,
      completedUpdated: plan.completed.filter((row) => row.action === "update").length,
      skipped: countSkipped([...plan.team, ...plan.customers, ...plan.completed]),
    };
  }

  const source = plan.prepared;
  const { upserted, ids } = await applyTeam(source, existing.users);
  let customersInserted = 0;
  let customersUpdated = 0;
  let completedInserted = 0;
  let completedUpdated = 0;
  let skipped = 0;

  const customerPlan = new Map(plan.customers.map((row) => [row.key, row]));
  for (const customer of source.customers) {
    const row = customerPlan.get(customer.id);
    const action = row?.action ?? "skip";
    const existingProject = row?.projectId ? existing.projects.find((project) => project.id === row.projectId) : undefined;
    const result = await applyActiveCustomer(customer, ids, existingProject, action);
    if (result === "insert") customersInserted++;
    else if (result === "update") customersUpdated++;
    else skipped++;
  }

  const donePlan = new Map(plan.completed.map((row) => [row.key, row]));
  for (const row of source.completed) {
    const planned = donePlan.get(row.id);
    const action = planned?.action ?? "skip";
    const existingProject = planned?.projectId
      ? existing.projects.find((project) => project.id === planned.projectId)
      : undefined;
    const result = await applyCompleted(row, ids, existingProject, action);
    if (result === "insert") completedInserted++;
    else if (result === "update") completedUpdated++;
    else skipped++;
  }

  await audit({
    actor: null,
    action: "prism.import.cutover",
    entityType: "system",
    entityId: "prism-cutover",
    summary: `Prism cutover import: ${customersInserted + customersUpdated} active, ${completedInserted + completedUpdated} completed, ${upserted} team`,
    metadata: {
      source: dump.source,
      exportedAt: dump.exportedAt,
      customersInserted,
      customersUpdated,
      completedInserted,
      completedUpdated,
      teamUpserted: upserted,
      warnings: plan.warnings,
      overrideNotes: plan.overrideNotes,
      duplicateShells: plan.duplicateShells.length,
    },
  });

  return {
    ...plan,
    teamUpserted: upserted,
    customersInserted,
    customersUpdated,
    completedInserted,
    completedUpdated,
    skipped: skipped + countSkipped(plan.team),
  };
}
