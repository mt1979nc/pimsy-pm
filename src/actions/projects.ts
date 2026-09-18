"use server";

import { revalidatePrismSurfaces } from "@/lib/prism-surfaces";
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
  canDeletePortfolioRecords,
  isCustomer,
  ForbiddenError,
  NotFoundError,
  type Actor,
} from "@/lib/authz";
import {
  hardDeleteProject,
  loadProjectForDelete,
  planProjectDelete,
} from "@/lib/delete-records";
import { refreshProjectCounters } from "@/lib/rollup";
import { fillWorkspaceAccessTasks, resolveWorkspaceAccess } from "@/lib/workspace-access-fill";
import { customFieldsWithoutBookmark } from "@/lib/accessing-pimsy";
import { notify } from "@/lib/notify";
import {
  editStatusUpdateForActor,
  deleteStatusUpdateForActor,
  editRiskForActor,
  deleteRiskForActor,
} from "@/lib/content-edit";
import { audit } from "@/lib/audit";
import { completeHistoricalProjectOnTime } from "@/lib/historical-complete";
import { parseDateInput, toDateInput } from "@/lib/dates";
import { forecastImplementation, parseSkipUsFederalHolidays, type ImplementationScope } from "@/lib/estimator";
import {
  cascadeRescheduleProject,
  resolvePlaybookScale,
  resolveSlipPush,
  shouldCascadeReschedule,
} from "@/lib/project-timeline";
import {
  applyRequiredProjectSlip,
  commitGoLiveSlip,
  formatSlipRecordedMessage,
  slipFieldsFromForm,
} from "@/lib/project-slip";
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
import { autoAssignForProjectRole, notifyDefaultAssigneesForProject } from "@/lib/task-assignees";
import { isCustomerMemberRole } from "@/lib/task-role-match";
import {
  addRcmBlockedMessage,
  addRcmEligibility,
  billingRcmAssignmentsFromMembers,
  isHandoffComplete,
  mergeBillingRcmAssignments,
  projectHasRcmTrack,
  RCM_TRACK_ALREADY_PRESENT,
  type AddRcmBlockedReason,
} from "@/lib/add-rcm";
import {
  parseExcludeFromAnalytics,
  parseExcludeFromAnalyticsIfPresent,
} from "@/lib/analytics-exclude";
import {
  autoInviteCustomerContact,
  autoInviteCustomerContactsForProject,
  parseOptionalPortalContact,
  sendCustomerInvite,
  type PortalContactFields,
} from "@/lib/customer-invite";
import { revalidateAboutSurfaces } from "@/lib/about-revalidate";
import { parseCustomFieldLines } from "@/lib/about-profile";
import { parseDealLink } from "@/lib/hubspot";
import { parseOptionalHttpUrl } from "@/lib/http-url";
import { parseBookingUrlsFromForm } from "@/lib/booking-urls";
import type { ActionState } from "./messages";

const scopeSchema = z.object({
  userCount: z.number().int().min(1).max(100000),
  locationCount: z.number().int().min(1).max(1000),
  formPageCount: z.number().int().min(0).max(10000),
  trainingsPerWeek: z.number().int().min(1).max(7),
  serviceLines: z.array(z.string()).max(50),
  stateCompliance: z.boolean(),
  minimalOrgStructure: z.boolean(),
  intakeAssistant: z.boolean().optional().default(false),
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

async function invitePortalContactsForSite(opts: {
  actor: Actor;
  projectId: string;
  customerAccountId: string | null | undefined;
  portalEnabled: boolean;
  newContact?: PortalContactFields | null;
}) {
  if (!opts.portalEnabled || !opts.customerAccountId) return;
  if (opts.newContact) {
    const invited = await autoInviteCustomerContact({
      customerAccountId: opts.customerAccountId,
      email: opts.newContact.email,
      name: opts.newContact.name,
      title: opts.newContact.title,
      phone: opts.newContact.phone,
      actor: opts.actor,
      projectId: opts.projectId,
    });
    if (!invited.ok) {
      console.error("auto-invite new project contact failed", invited.error);
    }
  }
  await autoInviteCustomerContactsForProject({
    projectId: opts.projectId,
    customerAccountId: opts.customerAccountId,
    actor: opts.actor,
  });
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
  hubspotDealUrl: z.string().optional(),
  crmAcronym: z.string().trim().max(40).optional(),
  crmKey: z.string().trim().max(120).optional(),
  bookmarkUrl: z.string().trim().max(500).optional(),
  scopeJson: z.string().optional(),
  discoveryScenario: z.enum(["OPTIMISTIC", "TYPICAL", "PESSIMISTIC"]).optional(),
  skipUsFederalHolidays: z.string().optional(),
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
    hubspotDealUrl: formData.get("hubspotDealUrl")?.toString() || undefined,
    crmAcronym: formData.get("crmAcronym")?.toString() || undefined,
    crmKey: formData.get("crmKey")?.toString() || undefined,
    bookmarkUrl: formData.get("bookmarkUrl")?.toString() || undefined,
    scopeJson: formData.get("scopeJson")?.toString() || undefined,
    discoveryScenario: (formData.get("discoveryScenario")?.toString() as never) || undefined,
    skipUsFederalHolidays: formData.get("skipUsFederalHolidays")?.toString() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const d = parsed.data;

  if (d.type !== "INTERNAL" && !d.customerAccountId) {
    return { error: "Pick the customer this project belongs to." };
  }

  const portalContact = parseOptionalPortalContact(formData);
  if (!portalContact.ok) return { error: portalContact.error };
  if (d.type === "INTERNAL" && portalContact.contact) {
    return { error: "Internal projects have no customer portal contacts." };
  }

  const dealLink = parseDealLink(d.hubspotDealUrl ?? "");
  if (!dealLink.ok) return { error: dealLink.error };
  const hubspotDealUrl = dealLink.deal?.href ?? null;

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
        skipUsFederalHolidays: parseSkipUsFederalHolidays(d.skipUsFederalHolidays),
      });
    } catch (err) {
      console.error("addRcmTrackToProject failed", err);
      if (err instanceof Error && err.message === RCM_TRACK_ALREADY_PRESENT) {
        return { error: err.message };
      }
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
    const source = await db.query.projects.findFirst({
      where: eq(projects.id, d.sourceProjectId),
      columns: { customerAccountId: true, portalEnabled: true },
    });
    await invitePortalContactsForSite({
      actor,
      projectId: d.sourceProjectId,
      customerAccountId: source?.customerAccountId,
      portalEnabled: source?.portalEnabled ?? false,
      newContact: portalContact.contact,
    });
    revalidatePrismSurfaces(d.sourceProjectId);
    revalidatePath(`/projects/${d.sourceProjectId}`);
    redirect(`/projects/${d.sourceProjectId}`);
  }

  // Scoping (PRISM's Forecast+, ported) is optional. When present, it's the
  // canonical source for the target go-live, estimated hours, and — if a
  // template was also chosen — the scale applied to that template's phase
  // and task timing. We recompute the forecast server-side rather than
  // trusting whatever the client displayed.
  const scope = parseScope(d.scopeJson);
  const skipUsFederalHolidays = parseSkipUsFederalHolidays(d.skipUsFederalHolidays);
  const forecast = scope ? forecastImplementation(scope, start, { skipUsFederalHolidays }) : null;
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
        complexityTier: forecast?.complexityTier ?? null,
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

  const access = await resolveWorkspaceAccess({
    customerAccountId: d.type === "INTERNAL" ? null : (d.customerAccountId ?? null),
    form: {
      crmAcronym: d.crmAcronym,
      crmKey: d.crmKey,
      bookmarkUrl: d.bookmarkUrl,
    },
  });

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
          excludeFromAnalytics: parseExcludeFromAnalytics(formData),
          hubspotDealUrl,
          crmAcronym: access.crmAcronym,
          crmKey: access.crmKey,
          customFields: access.customFields,
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
          intakeAssistant: scope.intakeAssistant,
          complexityTier: forecast.complexityTier,
          estimatedHours: forecast.hours.totalHours,
          discoveryScenario: d.discoveryScenario ?? "TYPICAL",
          skipUsFederalHolidays,
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
          skipUsFederalHolidays,
          forecastProjection: scenarioProjection ?? null,
          goLive: targetGoLive,
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

      await fillWorkspaceAccessTasks(tx, {
        projectId: project.id,
        actorId: actor.id,
        access,
      });

      return project.id;
    });
  } catch (err) {
    console.error("createProject failed", err);
    return { error: "Could not create the project. Please try again." };
  }

  await refreshProjectCounters(projectId);
  await notifyDefaultAssigneesForProject({ projectId, actorId: actor.id });
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

  await invitePortalContactsForSite({
    actor,
    projectId,
    customerAccountId: d.type === "INTERNAL" ? null : d.customerAccountId,
    portalEnabled: d.type !== "INTERNAL",
    newContact: portalContact.contact,
  });

  revalidatePrismSurfaces(projectId);
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

  let before;
  try {
    before = await assertProjectWrite(actor, projectId);
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { error: err.message };
    }
    throw err;
  }

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
  const excludeFromAnalytics = parseExcludeFromAnalyticsIfPresent(formData);

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
      ...(excludeFromAnalytics !== undefined ? { excludeFromAnalytics } : {}),
      ...(status === "COMPLETED" && !before.actualGoLiveDate
        ? { actualGoLiveDate: new Date() }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  if (leadId && leadId !== before.leadId) {
    await db
      .insert(projectMembers)
      .values({ projectId, userId: leadId, role: "LEAD" })
      .onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userId],
        set: { role: "LEAD" },
      });
    await autoAssignForProjectRole({
      projectId,
      userId: leadId,
      role: "LEAD",
      actorId: actor.id,
    });
  }

  if (slip.slipped) {
    await commitGoLiveSlip({
      actor,
      project: {
        id: projectId,
        code: before.code,
      },
      slip: {
        nextGoLive: slip.nextGoLive,
        fromDate: slip.fromDate,
        days: slip.days,
        cause: slip.cause,
        note: slip.note,
      },
      source: "settings",
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

  revalidatePrismSurfaces(projectId);
  if (portalEnabled !== null && portalEnabled === "on" && !before.portalEnabled && before.customerAccountId) {
    await invitePortalContactsForSite({
      actor,
      projectId,
      customerAccountId: before.customerAccountId,
      portalEnabled: true,
    });
  }
  if (slip.slipped) {
    return {
      ok: true,
      slipped: true,
      message: formatSlipRecordedMessage(slip.days, slip.fromDate, slip.nextGoLive),
      targetGoLiveDate: toDateInput(slip.nextGoLive),
    };
  }
  return { ok: true, message: "Saved." };
}

/**
 * Dedicated Record-slip action for specialists and managers. Requires a real
 * date move or +N days; cause/note alone is rejected. Same write gate as
 * project settings (`assertProjectWrite`: covering SPECIALIST can save a slip
 * on any unarchived site; MEMBER needs lead or non-observer membership).
 */
export async function recordProjectSlip(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return { error: "Missing project." };

  try {
    await assertProjectWrite(actor, projectId);
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { error: err.message };
    }
    throw err;
  }

  const sourceRaw = formData.get("slipSource")?.toString();
  const source = sourceRaw === "weekly" || sourceRaw === "management" ? sourceRaw : "settings";
  const fields = slipFieldsFromForm(formData);
  const result = await applyRequiredProjectSlip({
    actor,
    projectId,
    ...fields,
    source,
  });
  if (!result.ok) return { error: result.error };

  revalidatePrismSurfaces(projectId);
  return {
    ok: true,
    slipped: true,
    message: result.message,
    targetGoLiveDate: result.targetGoLiveDate,
  };
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
    columns: { customerAccountId: true, portalEnabled: true },
  });

  // A customer contact may only be added to their own account's project.
  if (target.role === "CUSTOMER") {
    if (!project?.customerAccountId || target.customerAccountId !== project.customerAccountId) {
      return { error: "That contact belongs to a different customer account." };
    }
  } else if (isCustomerMemberRole(role)) {
    return { error: "That role is for a customer contact." };
  }

  const storedRole = target.role === "CUSTOMER"
    ? isCustomerMemberRole(role)
      ? role
      : "CUSTOMER_CONTACT"
    : role;

  await db
    .insert(projectMembers)
    .values({
      projectId,
      userId,
      role: storedRole,
    })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: { role: storedRole },
    });

  await autoAssignForProjectRole({
    projectId,
    userId,
    role: storedRole,
    actorId: actor.id,
  });

  await audit({
    actor,
    action: "project.member.added",
    entityType: "project",
    entityId: projectId,
    summary: `${target.name ?? userId} added`,
  });

  if (target.role === "CUSTOMER" && project?.customerAccountId && project.portalEnabled) {
    const account = await db.query.customerAccounts.findFirst({
      where: eq(customerAccounts.id, project.customerAccountId),
      columns: { name: true },
    });
    if (account) {
      await sendCustomerInvite({
        userId: target.id,
        actor,
        customerName: account.name,
      });
    }
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath(`/portal/projects/${projectId}`);
  revalidateAboutSurfaces({ projectId, customerAccountId: project?.customerAccountId });
  return { ok: true };
}

export async function setProjectMemberRole(
  projectId: string,
  userId: string,
  roleRaw: string,
): Promise<{ ok: true } | { error: string }> {
  const actor = await requireStaff();
  await assertProjectWrite(actor, projectId);
  if (!ASSIGNABLE_PROJECT_ROLES.includes(roleRaw as (typeof ASSIGNABLE_PROJECT_ROLES)[number])) {
    return { error: "Pick a valid project role." };
  }
  const role = roleRaw as (typeof ASSIGNABLE_PROJECT_ROLES)[number];
  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true, customerAccountId: true, name: true },
  });
  if (!target) return { error: "That person no longer exists." };
  if (target.role === "CUSTOMER" && !isCustomerMemberRole(role)) {
    return { error: "Pick project lead, billing, or team member for a customer contact." };
  }
  if (target.role !== "CUSTOMER" && isCustomerMemberRole(role)) {
    return { error: "That role is for a customer contact." };
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { customerAccountId: true },
  });

  await db
    .update(projectMembers)
    .set({ role })
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));

  await autoAssignForProjectRole({
    projectId,
    userId,
    role,
    actorId: actor.id,
  });

  await audit({
    actor,
    action: "project.member.role_changed",
    entityType: "project",
    entityId: projectId,
    summary: `${target.name ?? userId} → ${role}`,
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath(`/portal/projects/${projectId}`);
  revalidateAboutSurfaces({ projectId, customerAccountId: project?.customerAccountId });
  return { ok: true };
}

export async function removeProjectMember(projectId: string, userId: string) {
  const actor = await requireStaff();
  await assertProjectWrite(actor, projectId);
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { customerAccountId: true },
  });
  await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  revalidatePath(`/projects/${projectId}`);
  revalidateAboutSurfaces({ projectId, customerAccountId: project?.customerAccountId });
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

export async function deleteProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (!projectId) return { error: "Missing project." };
  if (!canDeletePortfolioRecords(actor)) {
    return { error: "Only owners, admins, and managers can delete a project." };
  }

  const project = await loadProjectForDelete(projectId);
  if (!project) return { error: "Project not found." };

  const planned = planProjectDelete({
    actor,
    confirmation,
    name: project.name,
    code: project.code,
    acronym: project.crmAcronym || project.prismClientId,
  });
  if (!planned.ok) return { error: planned.error };

  await hardDeleteProject(projectId);
  await audit({
    actor,
    action: "project.deleted",
    entityType: "project",
    entityId: projectId,
    summary: `${project.code} ${project.name}`,
    metadata: {
      code: project.code,
      name: project.name,
      customerAccountId: project.customerAccountId,
    },
  });
  revalidatePrismSurfaces(projectId);
  revalidatePath("/projects");
  revalidatePath("/customers");
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

export type AddRcmActionState = ActionState & { alreadyOn?: boolean };

const ADD_RCM_BLOCKED_MESSAGES = new Set<string>(
  (
    [
      "already-on",
      "completed",
      "cancelled",
      "archived",
      "onboarded",
      "handoff",
      "not-implementation",
    ] as AddRcmBlockedReason[]
  ).map(addRcmBlockedMessage),
);

export async function addRcmTrack(
  _prev: AddRcmActionState,
  formData: FormData,
): Promise<AddRcmActionState> {
  const actor = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return { error: "Missing project." };
  await assertProjectWrite(actor, projectId);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: {
      id: true,
      status: true,
      type: true,
      onboarded: true,
      archivedAt: true,
      playbookPath: true,
      rcmTaskCountTotal: true,
    },
    with: {
      members: { columns: { userId: true, role: true } },
    },
  });
  if (!project) return { error: "Missing project." };

  if (
    projectHasRcmTrack({
      playbookPath: project.playbookPath,
      rcmTaskCountTotal: project.rcmTaskCountTotal,
    })
  ) {
    return { alreadyOn: true };
  }

  const phaseRows = await db.query.phases.findMany({
    where: eq(phases.projectId, projectId),
    columns: { id: true, name: true, status: true, notApplicable: true },
  });
  const taskRows = await db.query.tasks.findMany({
    where: eq(tasks.projectId, projectId),
    columns: { phaseId: true, status: true, notApplicable: true, workTrack: true },
  });
  const eligibility = addRcmEligibility({
    type: project.type,
    status: project.status,
    onboarded: project.onboarded,
    archivedAt: project.archivedAt,
    playbookPath: project.playbookPath,
    rcmTaskCountTotal: project.rcmTaskCountTotal,
    hasRcmWorkTrack: taskRows.some((t) => t.workTrack === "RCM"),
    handoffComplete: isHandoffComplete(
      phaseRows.map((p) => ({
        name: p.name,
        status: p.status,
        notApplicable: p.notApplicable,
        tasks: taskRows
          .filter((t) => t.phaseId === p.id)
          .map((t) => ({ status: t.status, notApplicable: t.notApplicable })),
      })),
    ),
  });
  if (!eligibility.ok) {
    if (eligibility.reason === "already-on") return { alreadyOn: true };
    return { error: addRcmBlockedMessage(eligibility.reason) };
  }

  const templates = await resolveTemplatesForPath("RCM_PRISM");
  if (templates.length === 0) {
    return { error: "The RCM (Prism data) playbook is not seeded yet." };
  }
  const excludedAreaKeys = parseExcludedAreaKeys(formData);
  const roleAssignments = mergeBillingRcmAssignments(
    billingRcmAssignmentsFromMembers(project.members),
    parseRoleAssignments(formData),
  );
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
      overlapMode: "connect",
      requireActiveWip: true,
    });
  } catch (err) {
    console.error("addRcmTrack failed", err);
    if (err instanceof Error && err.message === RCM_TRACK_ALREADY_PRESENT) {
      return { alreadyOn: true };
    }
    if (err instanceof Error && ADD_RCM_BLOCKED_MESSAGES.has(err.message)) {
      return { error: err.message };
    }
    return { error: "Could not add RCM." };
  }
  await audit({
    actor,
    action: "project.rcm_track.added",
    entityType: "project",
    entityId: projectId,
    summary: "RCM area added on existing Implementation WIP",
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath(`/projects/${projectId}/settings`);
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
  revalidatePath(`/projects/${phase.projectId}/tasks`);
  revalidatePath(`/projects/${phase.projectId}/customer-view`);
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

function revalidateProjectUpdates(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/customer-view`);
  revalidatePath("/reports");
}

export async function editStatusUpdate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const updateId = String(formData.get("updateId") ?? "");
  if (!updateId) return { error: "Missing update." };
  const health = String(formData.get("health") ?? "") as "GREEN" | "YELLOW" | "RED";
  try {
    const { projectId } = await editStatusUpdateForActor(actor, updateId, {
      summary: String(formData.get("summary") ?? ""),
      accomplished: formData.get("accomplished")?.toString() ?? null,
      upcoming: formData.get("upcoming")?.toString() ?? null,
      needsFromYou: formData.get("needsFromYou")?.toString() ?? null,
      health,
    });
    revalidateProjectUpdates(projectId);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save that update." };
  }
}

export async function deleteStatusUpdate(updateId: string) {
  const actor = await requireStaff();
  const { projectId } = await deleteStatusUpdateForActor(actor, updateId);
  revalidateProjectUpdates(projectId);
}

export async function editRisk(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireStaff();
  const riskId = String(formData.get("riskId") ?? "");
  if (!riskId) return { error: "Missing risk." };
  const severity = String(formData.get("severity") ?? "") as
    | "LOW"
    | "MEDIUM"
    | "HIGH"
    | "CRITICAL";
  try {
    const { projectId } = await editRiskForActor(actor, riskId, {
      title: String(formData.get("title") ?? ""),
      description: formData.get("description")?.toString() ?? null,
      severity,
    });
    revalidateProjectUpdates(projectId);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save that risk." };
  }
}

export async function deleteRisk(riskId: string) {
  const actor = await requireStaff();
  const { projectId } = await deleteRiskForActor(actor, riskId);
  revalidateProjectUpdates(projectId);
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

  const dealLink = parseDealLink(formData.get("hubspotDealUrl")?.toString() ?? "");
  if (!dealLink.ok) return { error: dealLink.error };
  const zoomLink = parseOptionalHttpUrl(formData.get("zoomBookingUrl")?.toString() ?? "");
  if (!zoomLink.ok) return { error: zoomLink.error };

  const prismClientId = formData.get("prismClientId")?.toString().trim() ?? "";
  const crmAcronym = formData.get("crmAcronym")?.toString().trim() ?? "";
  const crmKey = formData.get("crmKey")?.toString().trim() ?? "";
  const bookmarkUrl = formData.get("bookmarkUrl")?.toString().trim() ?? "";
  const parsedBookings = parseBookingUrlsFromForm(formData);
  if (!parsedBookings.ok) return { error: parsedBookings.error };
  const bookingUrls = parsedBookings.urls;
  const aboutNotes = formData.get("aboutNotes")?.toString() ?? "";
  const onboarded = formData.get("onboarded") === "on";
  const customFields = parseCustomFieldLines(formData.get("customFields")?.toString() ?? "");

  const existing = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { customerAccountId: true, customFields: true },
  });

  const access = await resolveWorkspaceAccess({
    customerAccountId: existing?.customerAccountId ?? null,
    form: { crmAcronym, crmKey, bookmarkUrl },
    existingCustomFields: customFieldsWithoutBookmark({
      ...(existing?.customFields ?? {}),
      ...customFields,
    }),
    inheritMissing: false,
  });

  await db
    .update(projects)
    .set({
      hubspotDealUrl: dealLink.deal?.href ?? null,
      prismClientId: prismClientId || null,
      crmAcronym: access.crmAcronym,
      crmKey: access.crmKey,
      bookingUrls,
      zoomBookingUrl: bookingUrls.kickoff ?? zoomLink.href,
      aboutNotes: aboutNotes.trim() || null,
      onboarded,
      customFields: access.customFields,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  await fillWorkspaceAccessTasks(db, {
    projectId,
    actorId: actor.id,
    access,
  });

  await audit({
    actor,
    action: "project.about.updated",
    entityType: "project",
    entityId: projectId,
    summary: "About / site profile updated",
  });

  revalidatePath(`/projects/${projectId}`);
  revalidateAboutSurfaces({ projectId, customerAccountId: existing?.customerAccountId });
  revalidatePath("/dashboard");
  revalidatePath("/my-work");
  revalidatePath("/reports");
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

  revalidatePrismSurfaces(slip.projectId);
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
    columns: { customerAccountId: true, portalEnabled: true },
  });
  if (!project?.customerAccountId || contact.customerAccountId !== project.customerAccountId) {
    throw new ForbiddenError("That contact belongs to a different customer.");
  }
  await db
    .insert(projectMembers)
    .values({ projectId, userId, role: "CUSTOMER_CONTACT" })
    .onConflictDoNothing();
  if (project.portalEnabled) {
    const account = await db.query.customerAccounts.findFirst({
      where: eq(customerAccounts.id, project.customerAccountId),
      columns: { name: true },
    });
    if (account) {
      await sendCustomerInvite({
        userId,
        actor,
        customerName: account.name,
      });
    }
  }
  revalidatePath(`/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// Historical complete-on-time (PATH-native)
// ---------------------------------------------------------------------------

export async function completeHistoricalTasksOnTime(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (!projectId) return { error: "Missing project." };

  const project = await assertProjectWrite(actor, projectId);
  const token = (project.crmAcronym || project.code || project.name).trim();
  const okConfirm =
    confirmation.localeCompare(token, undefined, { sensitivity: "accent" }) === 0 ||
    confirmation.localeCompare(project.code, undefined, { sensitivity: "accent" }) === 0 ||
    confirmation.localeCompare(project.name, undefined, { sensitivity: "accent" }) === 0;
  if (!okConfirm) {
    return { error: `Type ${token} to confirm.` };
  }

  const result = await completeHistoricalProjectOnTime(projectId, { apply: true });
  if (!result.assessment.ok) return { error: result.assessment.reason };
  if (result.planned.length === 0) {
    return { error: "No open tasks to complete." };
  }

  await audit({
    actor,
    action: "project.historical_complete_on_time",
    entityType: "project",
    entityId: projectId,
    summary: `${project.code}: marked ${result.applied} open task${result.applied === 1 ? "" : "s"} complete on time`,
    metadata: { applied: result.applied, gate: result.assessment.gate },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath("/dashboard");
  revalidatePath("/my-work");
  revalidatePath("/reports");
  return { ok: true };
}
