"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql, and } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  projects,
  projectMembers,
  phases,
  tasks,
  milestones,
  projectTemplates,
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
import { addDays } from "@/lib/dates";
import { forecastImplementation, type ImplementationScope } from "@/lib/estimator";
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
  leadId: z.string().optional(),
  startDate: z.string().optional(),
  targetGoLiveDate: z.string().optional(),
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
    leadId: formData.get("leadId") || undefined,
    startDate: formData.get("startDate")?.toString() || undefined,
    targetGoLiveDate: formData.get("targetGoLiveDate")?.toString() || undefined,
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

  const start = d.startDate ? new Date(d.startDate) : new Date();
  const code = await nextProjectCode(d.type);

  let template = null;
  if (d.templateId) {
    template = await db.query.projectTemplates.findFirst({
      where: eq(projectTemplates.id, d.templateId),
      with: {
        phases: { with: { tasks: true }, orderBy: (p, { asc }) => [asc(p.order)] },
        milestones: { orderBy: (m, { asc }) => [asc(m.order)] },
      },
    });
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

  const targetGoLive = scenarioProjection
    ? scenarioProjection.goLiveDate
    : d.targetGoLiveDate
      ? new Date(d.targetGoLiveDate)
      : template
        ? addDays(start, template.durationDays)
        : null;

  // Scale the template's static day offsets to the scoped timeline when both
  // are in play, so the phase list/order stays intact but the pacing reflects
  // this specific implementation's estimate rather than the template default.
  const scaleFactor =
    scenarioProjection && template && template.durationDays > 0
      ? scenarioProjection.calendarDays / template.durationDays
      : 1;
  const scaled = (days: number) => Math.max(0, Math.round(days * scaleFactor));

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
          portalEnabled: d.type !== "INTERNAL",
        })
        .returning({ id: projects.id });

      await tx
        .insert(projectMembers)
        .values({ projectId: project.id, userId: d.leadId || actor.id, role: "LEAD" })
        .onConflictDoNothing();

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

      if (template) {
        for (const tp of template.phases) {
          const phaseStart = addDays(start, scaled(tp.offsetDays));
          const [phase] = await tx
            .insert(phases)
            .values({
              projectId: project.id,
              name: tp.name,
              description: tp.description,
              order: tp.order,
              visibility: tp.visibility,
              startDate: phaseStart,
              dueDate: addDays(phaseStart, scaled(tp.durationDays)),
            })
            .returning({ id: phases.id });

          const orderedTasks = [...tp.tasks].sort((a, b) => a.order - b.order);
          if (orderedTasks.length > 0) {
            await tx.insert(tasks).values(
              orderedTasks.map((tt) => {
                const taskStart = addDays(phaseStart, scaled(tt.offsetDays));
                return {
                  projectId: project.id,
                  phaseId: phase.id,
                  title: tt.title,
                  description: tt.description,
                  priority: tt.priority,
                  // Customer-side work is always visible; otherwise honor the template.
                  visibility: tt.ownerSide === "CUSTOMER" ? ("SHARED" as const) : tt.visibility,
                  ownerSide: tt.ownerSide,
                  order: tt.order,
                  startDate: taskStart,
                  dueDate: addDays(taskStart, scaled(tt.durationDays)),
                  estimateHours: tt.estimateHours,
                  assigneeId: tt.ownerSide === "INTERNAL" ? (d.leadId || actor.id) : null,
                  createdById: actor.id,
                };
              }),
            );
          }
        }

        if (template.milestones.length > 0) {
          await tx.insert(milestones).values(
            template.milestones.map((tm) => ({
              projectId: project.id,
              name: tm.name,
              description: tm.description,
              order: tm.order,
              visibility: tm.visibility,
              isGoLive: tm.isGoLive,
              dueDate:
                tm.isGoLive && targetGoLive ? targetGoLive : addDays(start, scaled(tm.offsetDays)),
            })),
          );
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
  const portalEnabled = formData.get("portalEnabled");
  const portalWelcomeMessage = formData.get("portalWelcomeMessage")?.toString();

  const nextTargetGoLive =
    targetGoLiveDate !== undefined ? (targetGoLiveDate ? new Date(targetGoLiveDate) : null) : undefined;

  await db
    .update(projects)
    .set({
      ...(name ? { name } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(status ? { status: status as never } : {}),
      ...(health ? { health: health as never } : {}),
      ...(leadId !== undefined ? { leadId: leadId || null } : {}),
      ...(nextTargetGoLive !== undefined ? { targetGoLiveDate: nextTargetGoLive } : {}),
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

  // A go-live that moves after it already had a date is a slip. Log it —
  // cause tagging is prompted for in the UI but skippable, same as the old
  // PRISM tool: an untagged event stays visible rather than silently
  // disappearing from the attribution split.
  if (
    nextTargetGoLive !== undefined &&
    before.targetGoLiveDate &&
    nextTargetGoLive &&
    nextTargetGoLive.getTime() !== new Date(before.targetGoLiveDate).getTime()
  ) {
    const days = Math.round(
      (nextTargetGoLive.getTime() - new Date(before.targetGoLiveDate).getTime()) / 86_400_000,
    );
    await db.insert(slipEvents).values({
      projectId,
      fromDate: before.targetGoLiveDate,
      toDate: nextTargetGoLive,
      days,
      cause: slipCause === "CUSTOMER" || slipCause === "PIMSY" ? slipCause : null,
      note: slipNote || null,
      createdById: actor.id,
    });
    await audit({
      actor,
      action: "project.go_live.slipped",
      entityType: "project",
      entityId: projectId,
      summary: `${before.code}: go-live moved ${days > 0 ? "+" : ""}${days}d`,
      metadata: { days, cause: slipCause ?? null },
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
  const role = (formData.get("role")?.toString() ?? "CONTRIBUTOR") as
    | "LEAD"
    | "CONTRIBUTOR"
    | "OBSERVER"
    | "CUSTOMER_CONTACT";
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
