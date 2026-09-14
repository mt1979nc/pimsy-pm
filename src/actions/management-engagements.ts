"use server";

import { redirect } from "next/navigation";
import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { db } from "@/db";
import {
  customerAccounts,
  projectMembers,
  projectScopes,
  projects,
  slipEvents,
  users,
} from "@/db/schema";
import { requirePortfolioAccess } from "@/lib/guard";
import { canManagePrismCapacity, ForbiddenError, NotFoundError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import {
  complexityTier,
  parseDiscoveryScenario,
  type ImplementationScope,
} from "@/lib/estimator";
import {
  chosenScenario,
  kickoffOrToday,
  recommendGoLive,
  resolveCommittedGoLive,
} from "@/lib/go-live-recommendation";
import { loadRosterGoLiveContext } from "@/lib/forecast-data";
import {
  inferPrismStatus,
  isPrismStatus,
  mapPrismStatusToEnums,
  type PrismStatus,
} from "@/lib/prism-status";
import {
  cascadeRescheduleProject,
  resolveSlipPush,
  shouldCascadeReschedule,
} from "@/lib/project-timeline";
import { parseDateInput } from "@/lib/dates";
import { revalidatePrismSurfaces } from "@/lib/prism-surfaces";
import { acronymKey } from "@/lib/prism-dump";
import { sumSlipDays } from "@/lib/engagement-roster";
import type { ActionState } from "@/actions/messages";

export async function listEngagements() {
  await requirePortfolioAccess();

  const rows = await db.query.projects.findMany({
    where: and(
      isNull(projects.archivedAt),
      eq(projects.type, "IMPLEMENTATION"),
      ne(projects.status, "CANCELLED"),
    ),
    with: {
      customerAccount: { columns: { id: true, name: true, status: true } },
      scope: true,
      lead: { columns: { id: true, name: true, email: true } },
      coLead: { columns: { id: true, name: true, email: true } },
      slipEvents: { columns: { days: true } },
    },
    orderBy: [asc(projects.code)],
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    status: r.status,
    leadId: r.leadId,
    coLeadId: r.coLeadId,
    ownerSplitPercent: r.ownerSplitPercent,
    customHoursPerWeek: r.customHoursPerWeek,
    prismStatus: r.prismStatus,
    prismNote: r.prismNote,
    prismClientId: r.prismClientId,
    crmAcronym: r.crmAcronym,
    startDate: r.startDate,
    initialGoLiveDate: r.initialGoLiveDate,
    targetGoLiveDate: r.targetGoLiveDate,
    estimatedHours: r.estimatedHours,
    customerId: r.customerAccount?.id ?? null,
    customerName: r.customerAccount?.name ?? null,
    customerStatus: r.customerAccount?.status ?? null,
    leadName: r.lead?.name ?? r.lead?.email ?? null,
    coLeadName: r.coLead?.name ?? r.coLead?.email ?? null,
    userCount: r.scope?.userCount ?? null,
    locationCount: r.scope?.locationCount ?? null,
    trainingsPerWeek: r.scope?.trainingsPerWeek ?? null,
    complexityTier: r.scope?.complexityTier ?? null,
    scopeEstimatedHours: r.scope?.estimatedHours ?? null,
    serviceLines: r.scope?.serviceLines ?? [],
    slipDays: sumSlipDays(r.slipEvents),
    acronym: r.crmAcronym || r.prismClientId || r.code,
    effectivePrismStatus: inferPrismStatus({
      prismStatus: r.prismStatus,
      projectStatus: r.status,
      customerStatus: r.customerAccount?.status,
      startDate: r.startDate,
    }),
    displayHours: r.customHoursPerWeek ?? r.scope?.estimatedHours ?? r.estimatedHours,
  }));
}

export async function getEngagementForEdit(projectId: string) {
  await requirePortfolioAccess();

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: {
      customerAccount: true,
      scope: true,
      lead: { columns: { id: true, name: true, email: true, canLead: true } },
      coLead: { columns: { id: true, name: true, email: true, canLead: true } },
      slipEvents: {
        orderBy: [desc(slipEvents.createdAt)],
        limit: 20,
      },
    },
  });
  if (!project || project.archivedAt) throw new NotFoundError("Engagement not found.");

  const leadCandidates = await db.query.users.findMany({
    where: and(eq(users.isActive, true), ne(users.role, "CUSTOMER"), eq(users.canLead, true)),
    columns: { id: true, name: true, email: true, canLead: true, isDirector: true },
    orderBy: [asc(users.name)],
  });

  const extraIds = [project.leadId, project.coLeadId].filter(
    (id): id is string => !!id && !leadCandidates.some((u) => u.id === id),
  );
  const extras =
    extraIds.length === 0
      ? []
      : await db.query.users.findMany({
          where: inArray(users.id, extraIds),
          columns: { id: true, name: true, email: true, canLead: true, isDirector: true },
        });

  const leadOptions = [...leadCandidates, ...extras].sort((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );

  return {
    project,
    leadOptions,
    effectivePrismStatus: inferPrismStatus({
      prismStatus: project.prismStatus,
      projectStatus: project.status,
      customerStatus: project.customerAccount?.status,
      startDate: project.startDate,
    }),
  };
}

export async function updateEngagement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePortfolioAccess();
  if (!canManagePrismCapacity(actor)) {
    throw new ForbiddenError("Management access required.");
  }

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return { error: "Missing project." };

  const before = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { scope: true, customerAccount: true },
  });
  if (!before || before.archivedAt) return { error: "Engagement not found." };

  const leadId = formData.get("leadId")?.toString() || null;
  const coLeadId = formData.get("coLeadId")?.toString() || null;
  const splitRaw = formData.get("ownerSplitPercent")?.toString() ?? "100";
  const ownerSplitPercent = Number.parseInt(splitRaw, 10);
  if (!Number.isFinite(ownerSplitPercent) || ownerSplitPercent < 1 || ownerSplitPercent > 100) {
    return { error: "Owner split must be 1–100." };
  }
  if (coLeadId && coLeadId === leadId) {
    return { error: "Co-lead must be different from primary owner." };
  }

  const customHpwRaw = formData.get("customHoursPerWeek")?.toString().trim() ?? "";
  let customHoursPerWeek: number | null = null;
  if (customHpwRaw !== "") {
    const n = Number.parseFloat(customHpwRaw);
    if (!Number.isFinite(n) || n < 0 || n > 80) {
      return { error: "Custom hrs/wk must be between 0 and 80." };
    }
    customHoursPerWeek = n;
  }

  const prismStatusRaw = formData.get("prismStatus")?.toString() ?? "";
  if (!isPrismStatus(prismStatusRaw)) {
    return { error: "Status must be active, pre-kickoff, or pipeline." };
  }
  const prismStatus = prismStatusRaw as PrismStatus;
  const prismNote = formData.get("prismNote")?.toString().trim() || null;

  const kickoffDate = parseDateInput(formData.get("kickoffDate")?.toString());
  const initialGoLiveDate = parseDateInput(formData.get("initialGoLiveDate")?.toString());
  const requestedTargetGoLive = parseDateInput(formData.get("targetGoLiveDate")?.toString());
  const slipCause = formData.get("slipCause")?.toString();
  const slipNote = formData.get("slipNote")?.toString();
  const slipDaysRaw = formData.get("slipDays")?.toString();

  const scopeInput = scopeFromForm(formData);
  const plan = await rosterGoLivePlan(scopeInput, kickoffDate, formData, requestedTargetGoLive);
  const tier = complexityTier(scopeInput);
  const estimatedHours = plan.estimatedHours;
  const { userCount, locationCount, formPageCount, trainingsPerWeek, serviceLines, stateCompliance, minimalOrgStructure } =
    scopeInput;

  const mapped = mapPrismStatusToEnums(prismStatus);

  const nextForecastDays = plan.chosen.calendarDays;
  const previousForecastDays = before.scope
    ? chosenScenario(
        recommendGoLive({
          scope: {
            userCount: before.scope.userCount,
            locationCount: before.scope.locationCount,
            formPageCount: before.scope.formPageCount,
            trainingsPerWeek: before.scope.trainingsPerWeek,
            serviceLines: before.scope.serviceLines ?? [],
            stateCompliance: before.scope.stateCompliance,
            minimalOrgStructure: before.scope.minimalOrgStructure,
          },
          kickoffDate: before.startDate ?? kickoffOrToday(kickoffDate),
          samples: plan.samples,
          exclusions: plan.exclusions,
        }),
        before.scope.discoveryScenario,
      ).calendarDays
    : null;

  // Slip = schedule push (new date and/or +slipDays). Reject note-only slips.
  const slip = resolveSlipPush({
    currentGoLive: before.targetGoLiveDate ? new Date(before.targetGoLiveDate) : null,
    requestedGoLive: requestedTargetGoLive,
    slipDaysRaw,
    slipCause,
    slipNote,
  });
  if (!slip.ok) return { error: slip.error };
  const targetGoLiveDate = slip.nextGoLive;

  // Initial go-live locks after first commit (never overwrite once set).
  const resolvedInitial =
    before.initialGoLiveDate ?? initialGoLiveDate ?? targetGoLiveDate;

  await db
    .update(projects)
    .set({
      leadId,
      coLeadId,
      ownerSplitPercent,
      customHoursPerWeek,
      prismStatus,
      prismNote,
      startDate: kickoffDate,
      initialGoLiveDate: resolvedInitial,
      targetGoLiveDate,
      status: mapped.projectStatus,
      estimatedHours: Math.round(estimatedHours),
      crmAcronym: before.crmAcronym || before.code,
      prismClientId: before.prismClientId || before.code,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  if (before.customerAccountId) {
    // Don't demote LIVE/AT_RISK/CHURNED customers just because prism status changed.
    const preserveCustomer =
      before.customerAccount &&
      ["LIVE", "AT_RISK", "CHURNED"].includes(before.customerAccount.status);
    await db
      .update(customerAccounts)
      .set({
        ...(preserveCustomer ? {} : { status: mapped.customerStatus }),
        seatCount: userCount,
        updatedAt: new Date(),
      })
      .where(eq(customerAccounts.id, before.customerAccountId));
  }

  const scopeValues = {
    userCount,
    locationCount,
    formPageCount,
    trainingsPerWeek,
    serviceLines,
    stateCompliance,
    minimalOrgStructure,
    complexityTier: tier,
    estimatedHours,
    discoveryScenario: plan.scenario,
    updatedAt: new Date(),
  };

  if (before.scope) {
    await db.update(projectScopes).set(scopeValues).where(eq(projectScopes.projectId, projectId));
  } else {
    await db.insert(projectScopes).values({ projectId, ...scopeValues });
  }

  if (slip.slipped) {
    await db.insert(slipEvents).values({
      projectId,
      fromDate: slip.fromDate,
      toDate: slip.nextGoLive,
      days: slip.days,
      cause: slip.cause,
      note: slip.note,
      createdById: actor.id,
    });
    await audit({
      actor,
      action: "project.go_live.slipped",
      entityType: "project",
      entityId: projectId,
      summary: `${before.code}: go-live moved ${slip.days > 0 ? "+" : ""}${slip.days}d`,
      metadata: { days: slip.days, cause: slip.cause, source: "management" },
    });
  }

  const cascadePlan = shouldCascadeReschedule({
    previousKickoff: before.startDate ? new Date(before.startDate) : null,
    previousGoLive: before.targetGoLiveDate ? new Date(before.targetGoLiveDate) : null,
    previousForecastCalendarDays: previousForecastDays,
    nextKickoff: kickoffDate ?? (before.startDate ? new Date(before.startDate) : null),
    nextGoLive: targetGoLiveDate,
    nextForecastCalendarDays: nextForecastDays,
  });
  if (cascadePlan.cascade && cascadePlan.next) {
    await cascadeRescheduleProject({
      projectId,
      templateId: before.templateId,
      previous: cascadePlan.previous,
      next: cascadePlan.next,
    });
  }

  await audit({
    actor,
    action: "management.engagement.updated",
    entityType: "project",
    entityId: projectId,
    summary: `${before.code}: engagement roster updated (${prismStatus})`,
    metadata: {
      prismStatus,
      leadId,
      coLeadId,
      ownerSplitPercent,
      customHoursPerWeek,
    },
  });

  revalidatePrismSurfaces(projectId);
  return { ok: true };
}

export async function listLeadOptions() {
  await requirePortfolioAccess();
  return db.query.users.findMany({
    where: and(eq(users.isActive, true), ne(users.role, "CUSTOMER"), eq(users.canLead, true)),
    columns: { id: true, name: true, email: true, canLead: true, isDirector: true },
    orderBy: [asc(users.name)],
  });
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function scopeFromForm(formData: FormData): ImplementationScope {
  const userCount = Math.max(1, Number.parseInt(String(formData.get("userCount") ?? "1"), 10) || 1);
  const locationCount = Math.max(
    1,
    Number.parseInt(String(formData.get("locationCount") ?? "1"), 10) || 1,
  );
  const formPageCount = Math.max(
    0,
    Number.parseInt(String(formData.get("formPageCount") ?? "25"), 10) || 25,
  );
  const trainingsPerWeek = Math.max(
    0,
    Number.parseInt(String(formData.get("trainingsPerWeek") ?? "2"), 10) || 2,
  );
  const stateCompliance = formData.get("stateCompliance") === "on";
  const minimalOrgStructure = formData.get("minimalOrgStructure") === "on";
  const serviceLines = formData.getAll("serviceLines").map(String).filter(Boolean);
  return {
    userCount,
    locationCount,
    formPageCount,
    trainingsPerWeek,
    serviceLines,
    stateCompliance,
    minimalOrgStructure,
  };
}

async function rosterGoLivePlan(
  scopeInput: ImplementationScope,
  kickoffDate: Date | null,
  formData: FormData,
  requestedGoLive: Date | null,
) {
  const scenario = parseDiscoveryScenario(formData.get("discoveryScenario"));
  const { samples, exclusions } = await loadRosterGoLiveContext();
  const rec = recommendGoLive({
    scope: scopeInput,
    kickoffDate: kickoffOrToday(kickoffDate),
    samples,
    exclusions,
  });
  const chosen = chosenScenario(rec, scenario);
  const goLive = resolveCommittedGoLive({ rec, scenario, requestedGoLive });
  return { scenario, rec, chosen, goLive, estimatedHours: chosen.estimatedHours, samples, exclusions };
}

export async function createEngagement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePortfolioAccess();
  if (!canManagePrismCapacity(actor)) {
    throw new ForbiddenError("Management access required.");
  }

  const acronym = acronymKey(formData.get("acronym")?.toString());
  const accountName = formData.get("accountName")?.toString().trim() ?? "";
  if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(acronym)) {
    return { error: "Acronym must be 2–20 letters/numbers (e.g. CEDAR)." };
  }
  if (!accountName) return { error: "Customer name is required." };

  const clash = await db.query.projects.findFirst({
    where: or(eq(projects.code, acronym), eq(projects.prismClientId, acronym), eq(projects.crmAcronym, acronym)),
    columns: { id: true, code: true },
  });
  if (clash) return { error: `Acronym ${acronym} already exists (${clash.code}).` };

  const leadId = formData.get("leadId")?.toString() || null;
  const coLeadId = formData.get("coLeadId")?.toString() || null;
  const splitRaw = formData.get("ownerSplitPercent")?.toString() ?? "100";
  const ownerSplitPercent = Number.parseInt(splitRaw, 10);
  if (!Number.isFinite(ownerSplitPercent) || ownerSplitPercent < 1 || ownerSplitPercent > 100) {
    return { error: "Owner split must be 1–100." };
  }
  if (coLeadId && coLeadId === leadId) {
    return { error: "Co-lead must be different from primary owner." };
  }

  const customHpwRaw = formData.get("customHoursPerWeek")?.toString().trim() ?? "";
  let customHoursPerWeek: number | null = null;
  if (customHpwRaw !== "") {
    const n = Number.parseFloat(customHpwRaw);
    if (!Number.isFinite(n) || n < 0 || n > 80) {
      return { error: "Custom hrs/wk must be between 0 and 80." };
    }
    customHoursPerWeek = n;
  }

  const prismStatusRaw = formData.get("prismStatus")?.toString() ?? "pipeline";
  if (!isPrismStatus(prismStatusRaw)) {
    return { error: "Status must be active, pre-kickoff, or pipeline." };
  }
  const prismStatus = prismStatusRaw as PrismStatus;
  const prismNote = formData.get("prismNote")?.toString().trim() || null;
  const kickoffDate = parseDateInput(formData.get("kickoffDate")?.toString());
  const requestedGoLive = parseDateInput(formData.get("targetGoLiveDate")?.toString());

  const scopeInput = scopeFromForm(formData);
  const plan = await rosterGoLivePlan(scopeInput, kickoffDate, formData, requestedGoLive);
  const { userCount, locationCount, formPageCount, trainingsPerWeek, serviceLines, stateCompliance, minimalOrgStructure } =
    scopeInput;
  const tier = complexityTier(scopeInput);
  const estimatedHours = plan.estimatedHours;
  const targetGoLiveDate = plan.goLive;
  const mapped = mapPrismStatusToEnums(prismStatus);

  let slug = slugify(accountName);
  let customerId: string;
  const existingCustomer = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.slug, slug),
    columns: { id: true },
  });
  if (existingCustomer) {
    customerId = existingCustomer.id;
    await db
      .update(customerAccounts)
      .set({ seatCount: userCount, status: mapped.customerStatus, updatedAt: new Date() })
      .where(eq(customerAccounts.id, customerId));
  } else {
    const [row] = await db
      .insert(customerAccounts)
      .values({ name: accountName, slug, seatCount: userCount, status: mapped.customerStatus })
      .returning({ id: customerAccounts.id });
    customerId = row.id;
  }

  const [project] = await db
    .insert(projects)
    .values({
      name: `${accountName} — PIMSY implementation`,
      code: acronym,
      type: "IMPLEMENTATION",
      status: mapped.projectStatus,
      customerAccountId: customerId,
      leadId,
      coLeadId,
      ownerSplitPercent,
      customHoursPerWeek,
      prismStatus,
      prismNote,
      startDate: kickoffDate,
      initialGoLiveDate: targetGoLiveDate,
      targetGoLiveDate,
      estimatedHours: Math.round(estimatedHours),
      portalEnabled: prismStatus !== "pipeline",
      prismClientId: acronym,
      crmAcronym: acronym,
      description: "Added to the Prism roster in PATH. Playbook can be attached later from New project.",
    })
    .returning({ id: projects.id });

  if (leadId) {
    await db.insert(projectMembers).values({ projectId: project.id, userId: leadId, role: "LEAD" }).onConflictDoNothing();
  }
  if (coLeadId && coLeadId !== leadId) {
    await db
      .insert(projectMembers)
      .values({ projectId: project.id, userId: coLeadId, role: "CONTRIBUTOR" })
      .onConflictDoNothing();
  }

  await db.insert(projectScopes).values({
    projectId: project.id,
    userCount,
    locationCount,
    formPageCount,
    trainingsPerWeek,
    serviceLines,
    stateCompliance,
    minimalOrgStructure,
    complexityTier: tier,
    estimatedHours,
    discoveryScenario: plan.scenario,
  });

  await audit({
    actor,
    action: "management.engagement.created",
    entityType: "project",
    entityId: project.id,
    summary: `${acronym}: added to roster (${prismStatus})`,
    metadata: { prismStatus, leadId, estimatedHours, discoveryScenario: plan.scenario, goLiveSource: plan.rec.goLiveSource },
  });

  revalidatePrismSurfaces(project.id);
  redirect(`/management/engagements/${project.id}`);
}
