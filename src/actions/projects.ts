"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql, and, desc } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  projects,
  projectMembers,
  phases,
  tasks,
  milestones,
  projectScopes,
  slipEvents,
  statusUpdates,
  risks,
  users,
  customerAccounts,
} from "@/db/schema";
import { requireStaff, requireUser } from "@/lib/guard";
import {
  assertProjectAccess,
  assertProjectWrite,
  canCreateProjects,
  isCustomer,
  ForbiddenError,
  NotFoundError,
} from "@/lib/authz";
import { refreshProjectCounters } from "@/lib/rollup";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { addDays, parseDateInput } from "@/lib/dates";
import { forecastImplementation, type ImplementationScope } from "@/lib/estimator";
import {
  cascadeRescheduleProject,
  resolvePlaybookScale,
  resolveSlipPush,
  shouldCascadeReschedule,
} from "@/lib/project-timeline";
import {
  addRcmTrackToProject,
  applyRoleMemberships,
  loadTemplateById,
  materializeTemplatesOnProject,
  parseExcludedAreaKeys,
  parsePlaybookPath,
  parseRoleAssignments,
  resolveTemplatesForPath,
  setPhaseNotApplicable,
} from "@/lib/playbook";
import { ASSIGNABLE_PROJECT_ROLES } from "@/lib/staffing";
import type { ActionState } from "./messages";

const scopeSchema = z.object({
  userCount: z.number().int().min(1).max(100000),
  locationCount: z.number().int().min(1).max(1000),
  formPageCount: z.number().int().min(0).max(10000),
  trainingsPerWeek: z.number().int().min(1).max(7),
  serviceLines: z.array(z.string()).max(50),
  stateCompliance: z.boolean(),
  minimalOrgStructure: z.boolean(),
});

/** Parses and validates the scoping payload from the new-project form. Never
 *  trusts the client's own hour math — only the raw inputs. */
function parseScope(raw: string | undefined): ImplementationScope | null {
  if (!raw) return null;
  try {
    const parsed = scopeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(200),
  type: z.enum(["IMPLEMENTATION", "MIGRATION", "TRAINING", "SUPPORT", "INTERNAL"]),
  customerAccountId: z.string().optional(),
  templateId: z.string().optional(),
  playbookPath: z.enum(["EHR", "EHR_RCM", "RCM_LEGACY", "RCM_PRISM"]).optional(),
  sourceProjectId: z.string().optional(),
  leadId: z.string().optional(),
  startDate: z.string().optional(),
  targetGoLiveDate: z.string().optional(),
  rcmTargetGoLiveDate: z.string().optional(),
  description: z.string().trim().max(5000).optional(),
  scopeJson: z.string().optional(),
  discoveryScenario: z.enum(["OPTIMISTIC", "TYPICAL", "PESSIMISTIC"]).optional(),
});

async function nextProjectCode(type: string) {
  const prefix =
    type === "IMPLEMENTATION"
      ? "IMP"
      : type === "MIGRATION"
        ? "MIG"
        : type === "TRAINING"
          ? "TRN"
          : type === "SUPPORT"
            ? "SUP"
            : "INT";
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projects)
    .where(eq(projects.type, type as never));
  let n = (row?.n ?? 0) + 1;
  // Guard against gaps/collisions from deletions.
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = `${prefix}-${String(n).padStart(4, "0")}`;
    const clash = await db.query.projects.findFirst({
      where: eq(projects.code, code),
      columns: { id: true },
    });
    if (!clash) return code;
    n++;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Creates a project and, when a template is chosen, materializes the entire
 * playbook: phases, tasks (internal and customer-side), and milestones, with
 * every date computed from the start date.
 */
export async function createProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  if (!canCreateProjects(actor)) return { error: "You cannot create projects." };

  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") ?? "IMPLEMENTATION",
    customerAccountId: formData.get("customerAccountId") || undefined,
    templateId: formData.get("templateId") || undefined,
    playbookPath: parsePlaybookPath(formData.get("playbookPath")?.toString()) ?? undefined,
    sourceProjectId: formData.get("sourceProjectId")?.toString() || undefined,
    leadId: formData.get("leadId") || undefined,
    startDate: formData.get("startDate")?.toString() || undefined,
    targetGoLiveDate: formData.get("targetGoLiveDate")?.toString() || undefined,
    rcmTargetGoLiveDate: formData.get("rcmTargetGoLiveDate")?.toString() || undefined,
    description: formData.get("description")?.toString() || undefined,
    scopeJson: formData.get("scopeJson")?.toString() || undefined,
    discoveryScenario: (formData.get("discoveryScenario")?.toString() as never) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const d = parsed.data;

  if (d.type !== "INTERNAL" && !d.customerAccountId) {
    return { error: "Pick the customer this project belongs to." };
  }

  const start = d.startDate ? (parseDateInput(d.startDate) ?? new Date()) : new Date();
  const code = await nextProjectCode(d.type);

  const excludedAreaKeys = parseExcludedAreaKeys(formData);
  const roleAssignments = parseRoleAssignments(formData);
  const playbookPath = d.playbookPath ?? null;

  let loadedTemplates = playbookPath ? await resolveTemplatesForPath(playbookPath) : [];
  if (d.templateId && loadedTemplates.length === 0) {
    const one = await loadTemplateById(d.templateId);
    if (one) loadedTemplates = [one];
  }
  // Explicit template wins when the user picked a custom playbook, not a path card.
  if (d.templateId && !playbookPath) {
    const one = await loadTemplateById(d.templateId);
    loadedTemplates = one ? [one] : [];
  }
  const template = loadedTemplates[0] ?? null;

  // Path 4: attach RCM to an existing EHR site instead of creating a new project.
  if (playbookPath === "RCM_PRISM" && d.sourceProjectId) {
    await assertProjectWrite(actor, d.sourceProjectId);
    const rcmTemplates =
      loadedTemplates.length > 0 ? loadedTemplates : await resolveTemplatesForPath("RCM_PRISM");
    if (rcmTemplates.length === 0) {
      return { error: "The RCM (Prism data) playbook is not seeded yet. Run npm run db:seed -- --templates-only." };
    }
    const rcmStart = d.startDate ? (parseDateInput(d.startDate) ?? new Date()) : new Date();
    const rcmTarget = d.rcmTargetGoLiveDate
      ? parseDateInput(d.rcmTargetGoLiveDate)
      : d.targetGoLiveDate
        ? parseDateInput(d.targetGoLiveDate)
        : null;
    const rcmPlaybook = resolvePlaybookScale({
      kickoff: rcmStart,
      templateDurationDays: rcmTemplates[0]?.durationDays ?? 45,
      forecastCalendarDays: null,
      targetGoLive: rcmTarget,
    });
    try {
      await addRcmTrackToProject({
        projectId: d.sourceProjectId,
        actorId: actor.id,
        templates: rcmTemplates,
        excludedAreaKeys,
        roleAssignments,
        rcmStart,
        rcmTargetGoLive: rcmPlaybook.goLive,
        scaleFactor: rcmPlaybook.scaleFactor,
      });
    } catch (err) {
      console.error("addRcmTrackToProject failed", err);
      return { error: "Could not add the RCM track to that project." };
    }
    await audit({
      actor,
      action: "project.rcm_track.added",
      entityType: "project",
      entityId: d.sourceProjectId,
      summary: "RCM track added (Prism data path)",
      metadata: { playbookPath, excludedAreaKeys },
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${d.sourceProjectId}`);
    redirect(`/projects/${d.sourceProjectId}`);
  }

  // Scoping (PRISM's Forecast+, ported) is optional. When present, it's the
  // canonical source for the target go-live, estimated hours, and — if a
  // template was also chosen — the scale applied to that template's phase
  // and task timing. We recompute the forecast server-side rather than
  // trusting whatever the client displayed.
  const scope = parseScope(d.scopeJson);
  const forecast = scope ? forecastImplementation(scope, start) : null;
  const scenarioProjection = forecast?.scenarios.find(
    (s) => s.scenario === (d.discoveryScenario ?? "TYPICAL"),
  );

  // Scale template offsets to the kickoff→go-live window: forecast scenario
  // days when scoped, otherwise explicit targetGoLiveDate / template duration.
  // create-without-scope + target still scales (calendarDays / template.durationDays).
  const playbook = loadedTemplates.length > 0
    ? resolvePlaybookScale({
        kickoff: start,
        templateDurationDays: Math.max(...loadedTemplates.map((t) => t.durationDays)),
        forecastCalendarDays: scenarioProjection?.calendarDays ?? null,
        targetGoLive: d.targetGoLiveDate ? parseDateInput(d.targetGoLiveDate) : null,
      })
    : null;
  const scaleFactor = playbook?.scaleFactor ?? 1;
  const targetGoLive = scenarioProjection
    ? scenarioProjection.goLiveDate
    : d.targetGoLiveDate
      ? parseDateInput(d.targetGoLiveDate)
      : playbook
        ? playbook.goLive
        : null;

  let projectId: string;
  try {
    projectId = await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({
          name: d.name,
          code,
          description: d.description || null,
          type: d.type,
          status: "NOT_STARTED",
          customerAccountId: d.type === "INTERNAL" ? null : (d.customerAccountId ?? null),
          leadId: d.leadId || actor.id,
          startDate: start,
          initialGoLiveDate: targetGoLive,
          targetGoLiveDate: targetGoLive,
          estimatedHours: forecast ? Math.round(forecast.hours.totalHours) : null,
          templateId: template?.id ?? null,
          playbookPath,
          portalEnabled: d.type !== "INTERNAL",
        })
        .returning({ id: projects.id });

      await applyRoleMemberships({
        tx,
        projectId: project.id,
        roleAssignments,
        leadId: d.leadId || actor.id,
      });

      if (scope && forecast) {
        await tx.insert(projectScopes).values({
          projectId: project.id,
          userCount: scope.userCount,
          locationCount: scope.locationCount,
          formPageCount: scope.formPageCount,
          trainingsPerWeek: scope.trainingsPerWeek,
          serviceLines: scope.serviceLines,
          stateCompliance: scope.stateCompliance,
          minimalOrgStructure: scope.minimalOrgStructure,
          complexityTier: forecast.complexityTier,
          estimatedHours: forecast.hours.totalHours,
          discoveryScenario: d.discoveryScenario ?? "TYPICAL",
        });
      }

      if (loadedTemplates.length > 0) {
        await materializeTemplatesOnProject({
          tx,
          projectId: project.id,
          templates: loadedTemplates,
          actorId: actor.id,
          start,
          scaleFactor,
          excludedAreaKeys,
          roleAssignments,
          defaultInternalAssigneeId: d.leadId || actor.id,
        });
        if (playbookPath === "EHR_RCM" || playbookPath === "RCM_LEGACY" || playbookPath === "RCM_PRISM") {
          await tx
            .update(projects)
            .set({
              rcmStartedAt: start,
              rcmTargetGoLiveDate: targetGoLive,
            })
            .where(eq(projects.id, project.id));
        }
      }

      return project.id;
    });
  } catch (err) {
    console.error("createProject failed", err);
    return { error: "Could not create the project. Please try again." };
  }

  await refreshProjectCounters(projectId);
  await audit({
    actor,
    action: "project.created",
    entityType: "project",
    entityId: projectId,
    summary: `${code} — ${d.name}`,
    metadata: {
      templateId: template?.id ?? null,
      type: d.type,
      scoped: Boolean(scope),
      complexityTier: forecast?.complexityTier ?? null,
    },
  });

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect(`/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return { error: "Missing project." };

  const before = await assertProjectWrite(actor, projectId);

  const status = formData.get("status")?.toString();
  const health = formData.get("health")?.toString();
  const leadId = formData.get("leadId")?.toString();
  const name = formData.get("name")?.toString().trim();
  const description = formData.get("description")?.toString();
  const targetGoLiveDate = formData.get("targetGoLiveDate")?.toString();
  const slipCause = formData.get("slipCause")?.toString(); // "CUSTOMER" | "PIMSY" | undefined
  const slipNote = formData.get("slipNote")?.toString();
  const slipDaysRaw = formData.get("slipDays")?.toString();
  const portalEnabled = formData.get("portalEnabled");
  const portalWelcomeMessage = formData.get("portalWelcomeMessage")?.toString();

  // Slip = schedule push. Accept a new target date and/or +slipDays; reject
  // cause/note-only metadata that would not move go-live.
  const requestedGoLive =
    targetGoLiveDate !== undefined
      ? targetGoLiveDate
        ? parseDateInput(targetGoLiveDate)
        : null
      : before.targetGoLiveDate
        ? new Date(before.targetGoLiveDate)
        : null;
  const slip = resolveSlipPush({
    currentGoLive: before.targetGoLiveDate ? new Date(before.targetGoLiveDate) : null,
    requestedGoLive,
    slipDaysRaw,
    slipCause,
    slipNote,
  });
  if (!slip.ok) return { error: slip.error };
  const nextTargetGoLive = slip.nextGoLive;

  await db
    .update(projects)
    .set({
      ...(name ? { name } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(status ? { status: status as never } : {}),
      ...(health ? { health: health as never } : {}),
      ...(leadId !== undefined ? { leadId: leadId || null } : {}),
      targetGoLiveDate: nextTargetGoLive,
      // The initial commitment is set once, at creation, and never moves here.
      ...(before.initialGoLiveDate === null && nextTargetGoLive
        ? { initialGoLiveDate: nextTargetGoLive }
        : {}),
      ...(portalEnabled !== null ? { portalEnabled: portalEnabled === "on" } : {}),
      ...(portalWelcomeMessage !== undefined
        ? { portalWelcomeMessage: portalWelcomeMessage || null }
        : {}),
      ...(status === "COMPLETED" && !before.actualGoLiveDate
        ? { actualGoLiveDate: new Date() }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

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
      metadata: { days: slip.days, cause: slip.cause, source: "settings" },
    });
  }

  // Cascade open phase/task dates when the kickoff→go-live window changed.
  const cascadePlan = shouldCascadeReschedule({
    previousKickoff: before.startDate ? new Date(before.startDate) : null,
    previousGoLive: before.targetGoLiveDate ? new Date(before.targetGoLiveDate) : null,
    nextKickoff: before.startDate ? new Date(before.startDate) : null,
    nextGoLive: nextTargetGoLive,
  });
  if (cascadePlan.cascade && cascadePlan.next) {
    await cascadeRescheduleProject({
      projectId,
      templateId: before.templateId,
      previous: cascadePlan.previous,
      next: cascadePlan.next,
    });
  }

  if (health && health !== before.health) {
    await audit({
      actor,
      action: "project.health.changed",
      entityType: "project",
      entityId: projectId,
      summary: `${before.name}: ${before.health} → ${health}`,
      metadata: { from: before.health, to: health },
    });
    if (health === "RED") {
      const managers = await db.query.users.findMany({
        where: and(eq(users.isActive, true)),
        columns: { id: true, role: true },
      });
      await notify({
        userIds: managers.filter((m) => ["OWNER", "ADMIN", "MANAGER"].includes(m.role)).map((m) => m.id),
        type: "PROJECT_HEALTH_CHANGED",
        title: `${before.code} flagged at risk`,
        body: before.name,
        linkUrl: `/projects/${projectId}`,
        email: true,
        exceptUserId: actor.id,
      });
    }
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/reports");
  return { ok: true };
}

export async function addProjectMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const roleRaw = formData.get("role")?.toString() ?? "CONTRIBUTOR";
  const allowedRoles = ASSIGNABLE_PROJECT_ROLES;
  if (!allowedRoles.includes(roleRaw as (typeof allowedRoles)[number])) {
    return { error: "Pick a valid project role." };
  }
  const role = roleRaw as (typeof allowedRoles)[number];
  if (!projectId || !userId) return { error: "Pick someone to add." };

  await assertProjectWrite(actor, projectId);

  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true, customerAccountId: true, name: true },
  });
  if (!target) return { error: "That person no longer exists." };

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { customerAccountId: true },
  });

  // A customer contact may only be added to their own account's project.
  if (target.role === "CUSTOMER") {
    if (!project?.customerAccountId || target.customerAccountId !== project.customerAccountId) {
      return { error: "That contact belongs to a different customer account." };
    }
  }

  await db
    .insert(projectMembers)
    .values({
      projectId,
      userId,
      role: target.role === "CUSTOMER" ? "CUSTOMER_CONTACT" : role,
    })
    .onConflictDoNothing();

  await audit({
    actor,
    action: "project.member.added",
    entityType: "project",
    entityId: projectId,
    summary: `${target.name ?? userId} added`,
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function removeProjectMember(projectId: string, userId: string) {
  const actor = await requireStaff();
  await assertProjectWrite(actor, projectId);
  await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  revalidatePath(`/projects/${projectId}`);
}

export async function archiveProject(projectId: string) {
  const actor = await requireStaff();
  await assertProjectWrite(actor, projectId);
  await db
    .update(projects)
    .set({ archivedAt: new Date(), portalEnabled: false })
    .where(eq(projects.id, projectId));
  await audit({
    actor,
    action: "project.archived",
    entityType: "project",
    entityId: projectId,
  });
  revalidatePath("/projects");
  redirect("/projects");
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export async function createPhase(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!projectId || !name) return { error: "Phase needs a name." };
  await assertProjectWrite(actor, projectId);

  const existing = await db.query.phases.findMany({
    where: eq(phases.projectId, projectId),
    columns: { order: true },
  });
  const maxOrder = existing.reduce((m, p) => Math.max(m, p.order), 0);

  await db.insert(phases).values({
    projectId,
    name,
    order: maxOrder + 1,
    visibility: (formData.get("visibility")?.toString() as never) ?? "SHARED",
    dueDate: formData.get("dueDate")?.toString()
      ? new Date(formData.get("dueDate")!.toString())
      : null,
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/tasks`);
  return { ok: true };
}

/**
 * Shows or hides a phase's tab in the customer portal. This is the only
 * thing that controls whether a phase appears there — it's the same
 * `visibility` column the portal's task/milestone queries already filter on,
 * just exposed as a per-phase switch instead of being fixed by the template.
 */
export async function markPhaseNotApplicable(phaseId: string, notApplicable: boolean) {
  const actor = await requireStaff();
  const phase = await db.query.phases.findFirst({
    where: eq(phases.id, phaseId),
    columns: { id: true, projectId: true, name: true },
  });
  if (!phase) throw new NotFoundError("Phase not found.");
  await assertProjectWrite(actor, phase.projectId);
  await setPhaseNotApplicable(phaseId, notApplicable);
  await audit({
    actor,
    action: notApplicable ? "phase.marked_na" : "phase.restored_from_na",
    entityType: "phase",
    entityId: phaseId,
    summary: `${phase.name}: ${notApplicable ? "not applicable on this project" : "restored"}`,
    metadata: { projectId: phase.projectId },
  });
  revalidatePath(`/projects/${phase.projectId}`);
  revalidatePath(`/projects/${phase.projectId}/tasks`);
  revalidatePath(`/portal/projects/${phase.projectId}`);
}

export async function addRcmTrack(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return { error: "Missing project." };
  await assertProjectWrite(actor, projectId);

  const templates = await resolveTemplatesForPath("RCM_PRISM");
  if (templates.length === 0) {
    return { error: "The RCM (Prism data) playbook is not seeded yet." };
  }
  const excludedAreaKeys = parseExcludedAreaKeys(formData);
  const roleAssignments = parseRoleAssignments(formData);
  const rcmStart = parseDateInput(formData.get("rcmStartDate")?.toString() ?? "") ?? new Date();
  const rcmTarget = parseDateInput(formData.get("rcmTargetGoLiveDate")?.toString() ?? "");
  const scale = resolvePlaybookScale({
    kickoff: rcmStart,
    templateDurationDays: templates[0].durationDays,
    forecastCalendarDays: null,
    targetGoLive: rcmTarget,
  });
  try {
    await addRcmTrackToProject({
      projectId,
      actorId: actor.id,
      templates,
      excludedAreaKeys,
      roleAssignments,
      rcmStart,
      rcmTargetGoLive: scale.goLive,
      scaleFactor: scale.scaleFactor,
    });
  } catch (err) {
    console.error("addRcmTrack failed", err);
    return { error: "Could not add the RCM track." };
  }
  await audit({
    actor,
    action: "project.rcm_track.added",
    entityType: "project",
    entityId: projectId,
    summary: "RCM track added from project settings",
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function setPhaseVisibility(phaseId: string, visible: boolean) {
  const actor = await requireStaff();
  const phase = await db.query.phases.findFirst({ where: eq(phases.id, phaseId) });
  if (!phase) throw new NotFoundError("Phase not found.");
  await assertProjectWrite(actor, phase.projectId);

  const visibility = visible ? "SHARED" : "INTERNAL";
  if (phase.visibility === visibility) return;

  await db.update(phases).set({ visibility }).where(eq(phases.id, phaseId));
  await audit({
    actor,
    action: "phase.visibility.changed",
    entityType: "phase",
    entityId: phaseId,
    summary: `${phase.name}: ${visible ? "now visible to customer" : "hidden from customer"}`,
    metadata: { projectId: phase.projectId, from: phase.visibility, to: visibility },
  });

  revalidatePath(`/projects/${phase.projectId}/settings`);
  revalidatePath(`/portal/projects/${phase.projectId}`);
}

// ---------------------------------------------------------------------------
// Risks
// ---------------------------------------------------------------------------

export async function createRisk(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!projectId || !title) return { error: "Describe the risk." };
  await assertProjectWrite(actor, projectId);

  const [risk] = await db
    .insert(risks)
    .values({
      projectId,
      title,
      description: formData.get("description")?.toString() || null,
      severity: (formData.get("severity")?.toString() as never) ?? "MEDIUM",
      visibility: (formData.get("visibility")?.toString() as never) ?? "INTERNAL",
      ownerId: formData.get("ownerId")?.toString() || actor.id,
    })
    .returning({ id: risks.id });

  await audit({
    actor,
    action: "risk.raised",
    entityType: "risk",
    entityId: risk.id,
    summary: title,
    metadata: { projectId },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/reports");
  return { ok: true };
}

export async function setRiskStatus(riskId: string, status: string) {
  const actor = await requireStaff();
  const risk = await db.query.risks.findFirst({ where: eq(risks.id, riskId) });
  if (!risk) throw new NotFoundError("Risk not found.");
  await assertProjectWrite(actor, risk.projectId);

  await db
    .update(risks)
    .set({
      status: status as never,
      resolvedAt: status === "RESOLVED" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(risks.id, riskId));

  revalidatePath(`/projects/${risk.projectId}`);
  revalidatePath("/reports");
}

// ---------------------------------------------------------------------------
// Status updates (the weekly customer-facing report)
// ---------------------------------------------------------------------------

export async function publishStatusUpdate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  const summary = String(formData.get("summary") ?? "").trim();
  if (!projectId || !summary) return { error: "Write a summary." };

  const project = await assertProjectWrite(actor, projectId);
  const visibility = (formData.get("visibility")?.toString() as "INTERNAL" | "SHARED") ?? "SHARED";
  const health = (formData.get("health")?.toString() as never) ?? project.health;

  const [row] = await db
    .insert(statusUpdates)
    .values({
      projectId,
      authorId: actor.id,
      summary,
      accomplished: formData.get("accomplished")?.toString() || null,
      upcoming: formData.get("upcoming")?.toString() || null,
      needsFromYou: formData.get("needsFromYou")?.toString() || null,
      health,
      visibility,
      publishedAt: new Date(),
    })
    .returning({ id: statusUpdates.id });

  if (health !== project.health) {
    await db.update(projects).set({ health }).where(eq(projects.id, projectId));
  }

  await audit({
    actor,
    action: "status_update.published",
    entityType: "status_update",
    entityId: row.id,
    summary: `${project.code} status update`,
    metadata: { projectId, visibility },
  });

  if (visibility === "SHARED" && project.customerAccountId) {
    const contacts = await db.query.users.findMany({
      where: and(
        eq(users.customerAccountId, project.customerAccountId),
        eq(users.isActive, true),
      ),
      columns: { id: true },
    });
    await notify({
      userIds: contacts.map((c) => c.id),
      type: "STATUS_UPDATE_PUBLISHED",
      title: `${project.name}: new project update`,
      body: summary.slice(0, 240),
      linkUrl: `/portal/projects/${projectId}`,
      email: true,
    });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// About / site profile
// ---------------------------------------------------------------------------

export async function updateProjectAbout(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return { error: "Missing project." };

  await assertProjectWrite(actor, projectId);

  const hubspotDealUrl = formData.get("hubspotDealUrl")?.toString().trim() ?? "";
  const prismClientId = formData.get("prismClientId")?.toString().trim() ?? "";
  const crmAcronym = formData.get("crmAcronym")?.toString().trim() ?? "";
  const crmKey = formData.get("crmKey")?.toString().trim() ?? "";
  const zoomBookingUrl = formData.get("zoomBookingUrl")?.toString().trim() ?? "";
  const aboutNotes = formData.get("aboutNotes")?.toString() ?? "";

  // Optional free-form custom fields as "key=value" lines.
  const customRaw = formData.get("customFields")?.toString() ?? "";
  const customFields: Record<string, string> = {};
  for (const line of customRaw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key) customFields[key] = value;
  }

  await db
    .update(projects)
    .set({
      hubspotDealUrl: hubspotDealUrl || null,
      prismClientId: prismClientId || null,
      crmAcronym: crmAcronym || null,
      crmKey: crmKey || null,
      zoomBookingUrl: zoomBookingUrl || null,
      aboutNotes: aboutNotes || null,
      customFields,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  await audit({
    actor,
    action: "project.about.updated",
    entityType: "project",
    entityId: projectId,
    summary: "About / site profile updated",
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/about`);
  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}/about`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Slip history — undo a mistaken go-live push
// ---------------------------------------------------------------------------

/**
 * Delete the most recent slip for a project, restore target go-live to the
 * slip's fromDate, and cascade-rescale open phase/task dates back. Older slips
 * must be deleted newest-first so timeline math stays consistent.
 */
export async function deleteSlipEvent(slipId: string): Promise<ActionState> {
  const actor = await requireStaff();
  const slip = await db.query.slipEvents.findFirst({
    where: eq(slipEvents.id, slipId),
  });
  if (!slip) return { error: "That slip was already removed." };

  const project = await assertProjectWrite(actor, slip.projectId);

  const latest = await db.query.slipEvents.findFirst({
    where: eq(slipEvents.projectId, slip.projectId),
    orderBy: [desc(slipEvents.createdAt)],
  });
  if (!latest || latest.id !== slip.id) {
    return {
      error: "Only the most recent slip can be deleted. Remove newer slips first.",
    };
  }

  const previousGoLive = project.targetGoLiveDate ? new Date(project.targetGoLiveDate) : null;
  const restoredGoLive = new Date(slip.fromDate);
  const kickoff = project.startDate ? new Date(project.startDate) : null;

  await db
    .update(projects)
    .set({ targetGoLiveDate: restoredGoLive, updatedAt: new Date() })
    .where(eq(projects.id, slip.projectId));

  const cascadePlan = shouldCascadeReschedule({
    previousKickoff: kickoff,
    previousGoLive,
    nextKickoff: kickoff,
    nextGoLive: restoredGoLive,
  });
  if (cascadePlan.cascade && cascadePlan.next) {
    await cascadeRescheduleProject({
      projectId: slip.projectId,
      templateId: project.templateId,
      previous: cascadePlan.previous,
      next: cascadePlan.next,
    });
  }

  await db.delete(slipEvents).where(eq(slipEvents.id, slip.id));

  await audit({
    actor,
    action: "project.go_live.slip_deleted",
    entityType: "project",
    entityId: slip.projectId,
    summary: `${project.code}: slip undone (${slip.days > 0 ? "+" : ""}${slip.days}d)`,
    metadata: {
      slipId: slip.id,
      days: slip.days,
      fromDate: slip.fromDate,
      toDate: slip.toDate,
      restoredGoLive,
    },
  });

  revalidatePath(`/projects/${slip.projectId}`);
  revalidatePath(`/projects/${slip.projectId}/settings`);
  revalidatePath(`/management/engagements/${slip.projectId}`);
  revalidatePath("/management/engagements");
  revalidatePath("/reports/analysis");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Read helper used by pages
// ---------------------------------------------------------------------------

export async function getProjectOr404(projectId: string) {
  const actor = await requireUser();
  const project = await assertProjectAccess(actor, projectId);
  if (isCustomer(actor) && !project.portalEnabled) throw new NotFoundError();
  return { actor, project };
}

export async function inviteExistingContactToProject(projectId: string, userId: string) {
  const actor = await requireStaff();
  await assertProjectWrite(actor, projectId);
  const contact = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!contact || contact.role !== "CUSTOMER") throw new ForbiddenError();
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { customerAccountId: true },
  });
  if (!project?.customerAccountId || contact.customerAccountId !== project.customerAccountId) {
    throw new ForbiddenError("That contact belongs to a different customer.");
  }
  await db
    .insert(projectMembers)
    .values({ projectId, userId, role: "CUSTOMER_CONTACT" })
    .onConflictDoNothing();
  revalidatePath(`/projects/${projectId}`);
}
