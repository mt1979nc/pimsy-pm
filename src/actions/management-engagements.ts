"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  customerAccounts,
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
  forecastImplementation,
  type ImplementationScope,
} from "@/lib/estimator";
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
      slipEvents: { columns: { id: true } },
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
    slipCount: r.slipEvents.length,
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

  const scopeInput: ImplementationScope = {
    userCount,
    locationCount,
    formPageCount,
    trainingsPerWeek,
    serviceLines,
    stateCompliance,
    minimalOrgStructure,
  };
  const tier = complexityTier(scopeInput);
  const kickoffForEstimate = kickoffDate ?? before.startDate ?? new Date();
  const estimate = forecastImplementation(scopeInput, kickoffForEstimate);
  const estimatedHours = estimate.hours.totalHours;

  const mapped = mapPrismStatusToEnums(prismStatus);

  const typicalForecastDays =
    estimate.scenarios.find((s) => s.scenario === (before.scope?.discoveryScenario ?? "TYPICAL"))
      ?.calendarDays ??
    estimate.scenarios[1]?.calendarDays ??
    null;
  const previousForecastDays = before.scope
    ? (
        forecastImplementation(
          {
            userCount: before.scope.userCount,
            locationCount: before.scope.locationCount,
            formPageCount: before.scope.formPageCount,
            trainingsPerWeek: before.scope.trainingsPerWeek,
            serviceLines: before.scope.serviceLines ?? [],
            stateCompliance: before.scope.stateCompliance,
            minimalOrgStructure: before.scope.minimalOrgStructure,
          },
          before.startDate ?? kickoffForEstimate,
        ).scenarios.find((s) => s.scenario === (before.scope?.discoveryScenario ?? "TYPICAL"))
          ?.calendarDays ?? null
      )
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
    nextForecastCalendarDays: typicalForecastDays,
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

  revalidatePath("/management");
  revalidatePath("/management/engagements");
  revalidatePath(`/management/engagements/${projectId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/reports/capacity");
  revalidatePath("/reports/analysis");
  return { ok: true };
}
