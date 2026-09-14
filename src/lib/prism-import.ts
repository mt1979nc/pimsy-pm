/**
 * One-time Prism → PM import (idempotent by acronym / prism_team_id).
 *
 * Native Postgres is the write store. This never POSTs Prism saveState.
 * WIP playbooks, demo logins, and protected codes are left intact.
 */

import { eq } from "drizzle-orm";

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
import { parseDateInput } from "@/lib/dates";
import { complexityTier, forecastImplementation, type ImplementationScope } from "@/lib/estimator";
import { mapPrismStatusToEnums, type PrismStatus } from "@/lib/prism-status";
import {
  acronymKey,
  emailForTeamMember,
  isProtectedEmail,
  isProtectedProjectCode,
  type PrismDump,
  type PrismDumpCompleted,
  type PrismDumpCustomer,
  type PrismDumpSlip,
  type PrismDumpTeamMember,
} from "@/lib/prism-dump";
import { staffingRoleFromTitle } from "@/lib/staffing";
import { env } from "@/lib/env";

export type ExistingProjectSnapshot = {
  id: string;
  code: string;
  prismClientId: string | null;
  crmAcronym: string | null;
  templateId: string | null;
  taskCountTotal: number;
  status: string;
  archivedAt: Date | null;
};

export type ExistingUserSnapshot = {
  id: string;
  email: string;
  prismTeamId: string | null;
  name: string | null;
  role: string;
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
  | "protect-demo";

export type ImportPlanRow = {
  kind: "team" | "customer" | "completed";
  key: string;
  action: ImportAction;
  detail: string;
};

export type ImportPlan = {
  team: ImportPlanRow[];
  customers: ImportPlanRow[];
  completed: ImportPlanRow[];
  warnings: string[];
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

export function matchProject(
  acronym: string,
  projects: ExistingProjectSnapshot[],
): ExistingProjectSnapshot | undefined {
  const key = acronymKey(acronym);
  return projects.find((p) => {
    if (acronymKey(p.code) === key) return true;
    if (acronymKey(p.prismClientId) === key) return true;
    if (acronymKey(p.crmAcronym) === key) return true;
    return false;
  });
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

/**
 * Decide inserts/updates without touching the database — used by tests and dry-run.
 */
export function planPrismImport(dump: PrismDump, existing: ExistingPmState): ImportPlan {
  const warnings: string[] = [];
  const team: ImportPlanRow[] = [];
  const customers: ImportPlanRow[] = [];
  const completed: ImportPlanRow[] = [];

  for (const m of dump.team) {
    const email = emailForTeamMember(m);
    if (email && isProtectedEmail(email)) {
      team.push({
        kind: "team",
        key: m.teamId,
        action: "protect-demo",
        detail: `${m.name} (${email}) is a demo login — flags/hours not overwritten`,
      });
      continue;
    }
    const hit = matchUser(m.teamId, email, existing.users);
    if (hit && isProtectedEmail(hit.email)) {
      team.push({
        kind: "team",
        key: m.teamId,
        action: "protect-demo",
        detail: `${hit.email} is protected`,
      });
      continue;
    }
    team.push({
      kind: "team",
      key: m.teamId,
      action: hit ? "update" : email ? "insert" : "skip",
      detail: hit
        ? `update ${hit.email} hours=${m.hoursPerWeek}`
        : email
          ? `insert ${email}`
          : `no email for teamId ${m.teamId} (${m.name}) — skipped`,
    });
    if (!hit && !email) {
      warnings.push(`Team ${m.teamId} (${m.name}) has no email mapping; not inserted.`);
    }
  }

  for (const m of dump.formerTeam) {
    const email = emailForTeamMember(m);
    const hit = matchUser(m.teamId, email, existing.users);
    if (hit && isProtectedEmail(hit.email)) continue;
    team.push({
      kind: "team",
      key: m.teamId || email || m.name,
      action: hit ? "update" : "skip",
      detail: hit ? `mark inactive ${hit.email}` : `former ${m.name} not in PATH`,
    });
  }

  for (const c of dump.customers) {
    const existingP = matchProject(c.id, existing.projects);
    if (existingP && isProtectedProjectCode(existingP.code)) {
      customers.push({
        kind: "customer",
        key: c.id,
        action: "protect-demo",
        detail: `${existingP.code} is the demo project — left alone`,
      });
      continue;
    }
    if (existingP && isWipProject(existingP)) {
      customers.push({
        kind: "customer",
        key: c.id,
        action: "protect-wip",
        detail: `update Prism fields on WIP ${existingP.code}; playbook/tasks kept`,
      });
      continue;
    }
    customers.push({
      kind: "customer",
      key: c.id,
      action: existingP ? "update" : "insert",
      detail: existingP ? `update ${existingP.code}` : `insert roster-only ${c.id}`,
    });
  }

  for (const c of dump.completed) {
    const existingP = matchProject(c.id, existing.projects);
    if (existingP && isProtectedProjectCode(existingP.code)) {
      completed.push({
        kind: "completed",
        key: c.id,
        action: "protect-demo",
        detail: `${existingP.code} protected`,
      });
      continue;
    }
    if (existingP && isWipProject(existingP) && existingP.status !== "COMPLETED") {
      completed.push({
        kind: "completed",
        key: c.id,
        action: "protect-wip",
        detail: `Prism lists ${c.id} completed but PM still has WIP — status not flipped`,
      });
      warnings.push(`${c.id}: Prism completed, PM has a live playbook — left in progress.`);
      continue;
    }
    completed.push({
      kind: "completed",
      key: c.id,
      action: existingP ? "update" : "insert",
      detail: existingP ? `update completed ${existingP.code}` : `insert completed ${c.id}`,
    });
  }

  return { team, customers, completed, warnings };
}

function customerStatusForPrism(status: PrismStatus, completed: boolean) {
  if (completed) return "LIVE" as const;
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
  };
}

function estimatedHoursFor(c: PrismDumpCustomer, kickoff: Date | null): number {
  const scope = scopeFromCustomer(c);
  const estimate = forecastImplementation(scope, kickoff ?? new Date());
  return estimate.hours.totalHours;
}

async function loadExistingState(): Promise<ExistingPmState> {
  const [people, rows] = await Promise.all([
    db.query.users.findMany({
      columns: { id: true, email: true, prismTeamId: true, name: true, role: true },
    }),
    db.query.projects.findMany({
      columns: {
        id: true,
        code: true,
        prismClientId: true,
        crmAcronym: true,
        templateId: true,
        taskCountTotal: true,
        status: true,
        archivedAt: true,
      },
    }),
  ]);
  return { users: people, projects: rows };
}

async function upsertCustomerAccount(name: string, seatCount: number, status: "PROSPECT" | "ONBOARDING" | "LIVE") {
  let slug = slugify(name);
  const existing = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.slug, slug) });
  if (existing) {
    await db
      .update(customerAccounts)
      .set({
        name,
        seatCount,
        status: ["LIVE", "AT_RISK", "CHURNED"].includes(existing.status) ? existing.status : status,
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

  const applyMember = async (m: PrismDumpTeamMember, active: boolean) => {
    const email = emailForTeamMember(m);
    if (email && isProtectedEmail(email)) {
      const hit = matchUser(m.teamId, email, people);
      if (hit) ids.set(m.teamId, hit.id);
      return;
    }
    const hit = matchUser(m.teamId, email, people);
    if (hit && isProtectedEmail(hit.email)) {
      ids.set(m.teamId, hit.id);
      return;
    }
    if (hit) {
      await db
        .update(users)
        .set({
          name: hit.name ?? m.name,
          capacityHoursPerWeek: Math.round(m.hoursPerWeek),
          capacityExempt: m.flags.capacityExempt,
          canLead: m.flags.canLead,
          isDirector: m.flags.director,
          prismTeamId: m.teamId,
          isActive: active,
          updatedAt: new Date(),
        })
        .where(eq(users.id, hit.id));
      ids.set(m.teamId, hit.id);
      upserted++;
      return;
    }
    if (!email) return;
    const isBootstrapOwner = env.BOOTSTRAP_OWNER_EMAIL && email.toLowerCase() === env.BOOTSTRAP_OWNER_EMAIL;
    const [row] = await db
      .insert(users)
      .values({
        email,
        name: m.name,
        role: isBootstrapOwner ? "OWNER" : "SPECIALIST",
        title: m.flags.director ? "Implementation Director" : "Implementation Specialist",
        capacityHoursPerWeek: Math.round(m.hoursPerWeek),
        isActive: active,
        capacityExempt: m.flags.capacityExempt,
        canLead: m.flags.canLead,
        isDirector: m.flags.director,
        prismTeamId: m.teamId,
        staffingRole: staffingRoleFromTitle(m.flags.director ? "Implementation Director" : "Implementation Specialist"),
      })
      .returning({ id: users.id });
    ids.set(m.teamId, row.id);
    people.push({ id: row.id, email, prismTeamId: m.teamId, name: m.name, role: isBootstrapOwner ? "OWNER" : "SPECIALIST" });
    upserted++;
  };

  for (const m of dump.team) await applyMember(m, true);
  for (const m of dump.formerTeam) await applyMember(m, false);
  return { upserted, ids };
}

async function applyActiveCustomer(
  c: PrismDumpCustomer,
  teamIds: Map<string, string>,
  existing: ExistingProjectSnapshot | undefined,
  mode: ImportAction,
) {
  if (mode === "skip" || mode === "protect-demo") return "skip" as const;
  const leadId = (c.owner && teamIds.get(c.owner)) || null;
  const coLeadId = (c.owner2 && teamIds.get(c.owner2)) || null;
  const kickoff = c.kickoffDate ? parseDateInput(c.kickoffDate) : null;
  const initial = c.initialGolive ? parseDateInput(c.initialGolive) : null;
  const current = c.goliveDate ? parseDateInput(c.goliveDate) : initial;
  const scope = scopeFromCustomer(c);
  const hours = estimatedHoursFor(c, kickoff);
  const tier = complexityTier(scope);
  const completed = false;
  const wipProtect = mode === "protect-wip";

  if (!existing) {
    const customerId = await upsertCustomerAccount(c.acct, c.users, customerStatusForPrism(c.status, completed));
    const [project] = await db
      .insert(projects)
      .values({
        name: `${c.acct} — PIMSY implementation`,
        code: c.id,
        type: "IMPLEMENTATION",
        status: projectStatusForPrism(c.status, completed),
        customerAccountId: customerId,
        leadId,
        coLeadId,
        ownerSplitPercent: c.split,
        customHoursPerWeek: c.customHpw,
        prismStatus: c.status,
        prismNote: c.note,
        startDate: kickoff,
        initialGoLiveDate: initial ?? current,
        targetGoLiveDate: current,
        estimatedHours: Math.round(hours),
        portalEnabled: c.status !== "pipeline",
        description: "Imported from Prism at cutover. Roster/capacity record — playbook not materialized.",
        prismClientId: c.id,
        crmAcronym: c.id,
      })
      .returning({ id: projects.id });
    await ensureLeadMembership(project.id, leadId, coLeadId);
    await upsertScope(project.id, scope, hours, tier);
    await importSlipsIfEmpty(project.id, c.slipLog, kickoff, initial, current);
    return "insert" as const;
  }

  const before = await db.query.projects.findFirst({
    where: eq(projects.id, existing.id),
    columns: { initialGoLiveDate: true, customerAccountId: true },
  });
  if (!existing.archivedAt) {
    await db
      .update(projects)
      .set({
        leadId,
        coLeadId,
        ownerSplitPercent: c.split,
        customHoursPerWeek: c.customHpw,
        prismStatus: c.status,
        prismNote: c.note,
        startDate: kickoff,
        targetGoLiveDate: current,
        estimatedHours: Math.round(hours),
        prismClientId: existing.prismClientId || c.id,
        crmAcronym: existing.crmAcronym || c.id,
        updatedAt: new Date(),
        ...(!wipProtect ? { status: projectStatusForPrism(c.status, completed) } : {}),
        ...(before && !before.initialGoLiveDate ? { initialGoLiveDate: initial ?? current } : {}),
      })
      .where(eq(projects.id, existing.id));
    if (before?.customerAccountId) {
      await db
        .update(customerAccounts)
        .set({
          name: c.acct,
          seatCount: c.users,
          updatedAt: new Date(),
        })
        .where(eq(customerAccounts.id, before.customerAccountId));
    }
  }
  await ensureLeadMembership(existing.id, leadId, coLeadId);
  await upsertScope(existing.id, scope, hours, tier);
  await importSlipsIfEmpty(existing.id, c.slipLog, kickoff, initial, current);
  return wipProtect ? ("update" as const) : ("update" as const);
}

async function applyCompleted(
  c: PrismDumpCompleted,
  teamIds: Map<string, string>,
  existing: ExistingProjectSnapshot | undefined,
  mode: ImportAction,
) {
  if (mode === "skip" || mode === "protect-demo" || mode === "protect-wip") return "skip" as const;
  const leadId = (c.owner && teamIds.get(c.owner)) || null;
  const kickoff = c.kickoffDate ? parseDateInput(c.kickoffDate) : null;
  const actual = c.goliveDate ? parseDateInput(c.goliveDate) : null;
  const initial =
    (c.initialGolive ? parseDateInput(c.initialGolive) : null) ??
    (kickoff && c.forecastDays != null ? new Date(kickoff.getTime() + c.forecastDays * 86_400_000) : null);
  const hours = c.estimatedHours ?? 0;
  const tier = parseComplexity(c.complexity) ?? "STANDARD";
  const scope: ImplementationScope = {
    userCount: c.users,
    locationCount: 1,
    formPageCount: 25,
    trainingsPerWeek: 2,
    serviceLines: [],
    stateCompliance: false,
    minimalOrgStructure: false,
  };

  if (!existing) {
    const customerId = await upsertCustomerAccount(c.acct, c.users, "LIVE");
    const [project] = await db
      .insert(projects)
      .values({
        name: `${c.acct} — PIMSY implementation`,
        code: c.id,
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
        description: `Imported from Prism completed implementations (${c.era ?? "unknown"} era).`,
        prismClientId: c.id,
        crmAcronym: c.id,
        prismStatus: "active",
      })
      .returning({ id: projects.id });
    await ensureLeadMembership(project.id, leadId, null);
    await upsertScope(project.id, scope, hours, tier);
    if (initial && actual && initial.getTime() !== actual.getTime()) {
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
      ...(existing.status === "COMPLETED" && initial ? { initialGoLiveDate: initial } : {}),
      ...(hours > 0 ? { estimatedHours: Math.round(hours) } : {}),
      prismClientId: existing.prismClientId || c.id,
      crmAcronym: existing.crmAcronym || c.id,
      status: "COMPLETED",
      archivedAt: existing.archivedAt ?? new Date(),
      portalEnabled: false,
      updatedAt: new Date(),
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
      teamUpserted: 0,
      customersInserted: 0,
      customersUpdated: 0,
      completedInserted: 0,
      completedUpdated: 0,
      skipped: [...plan.team, ...plan.customers, ...plan.completed].filter((r) =>
        r.action === "skip" || r.action.startsWith("protect"),
      ).length,
    };
  }

  const { upserted, ids } = await applyTeam(dump, existing.users);
  let customersInserted = 0;
  let customersUpdated = 0;
  let completedInserted = 0;
  let completedUpdated = 0;
  let skipped = 0;

  const customerPlan = new Map(plan.customers.map((r) => [r.key, r]));
  for (const c of dump.customers) {
    const row = customerPlan.get(c.id);
    const action = row?.action ?? "skip";
    const existingP = matchProject(c.id, existing.projects);
    const result = await applyActiveCustomer(c, ids, existingP, action);
    if (result === "insert") customersInserted++;
    else if (result === "update") customersUpdated++;
    else skipped++;
  }

  const donePlan = new Map(plan.completed.map((r) => [r.key, r]));
  for (const c of dump.completed) {
    const row = donePlan.get(c.id);
    const action = row?.action ?? "skip";
    const existingP = matchProject(c.id, existing.projects);
    const result = await applyCompleted(c, ids, existingP, action);
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
    },
  });

  return {
    ...plan,
    teamUpserted: upserted,
    customersInserted,
    customersUpdated,
    completedInserted,
    completedUpdated,
    skipped: skipped + plan.team.filter((t) => t.action === "skip" || t.action.startsWith("protect")).length,
  };
}

