"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, inArray, isNull, desc } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { tasks, taskComments, milestones, projects, users, projectMembers, phases } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import {
  assertProjectAccess,
  assertProjectWrite,
  isCustomer,
  canSeeInternal,
  ForbiddenError,
  NotFoundError,
  resolveVisibilityForActor,
  type Actor,
} from "@/lib/authz";
import { refreshProjectCounters } from "@/lib/rollup";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { fmtDate, parseSessionDateTime } from "@/lib/dates";
import { setTaskNotApplicable } from "@/lib/playbook";
import { isSpecialistSubtask, liveTaskCreateDefaults } from "@/lib/task-visibility";
import { customerMayChangeAssignee } from "@/lib/task-role-match";
import { exposePhaseFromCompletedTask } from "@/lib/expose-phase";
import { applyTaskMove } from "@/lib/task-relink";
import { syncMilestonesFromTaskCompletion } from "@/lib/milestone-rollup";
import {
  addAssigneesToTask,
  newTaskAssigneeIds,
  removeAssigneeFromTask,
  taskAssigneeIds,
} from "@/lib/task-assignees";
import { applySupportHandoffOnComplete } from "@/lib/support-handoff";
import { isHandOffToSupportTask } from "@/lib/support-handoff-meta";
import { syncConnectedTaskStatus } from "@/lib/connected-task-sync";
import { applyTrainingBooking, applyTrainingStatusSideEffects } from "@/lib/training-ops";
import { canBookTrainingSession } from "@/lib/training-session";
import type { ActionState } from "./messages";

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? new Date(v) : null));

const createTaskSchema = z.object({
  projectId: z.string().min(1),
  phaseId: z.string().optional(),
  parentTaskId: z.string().optional(),
  title: z.string().trim().min(1, "Task needs a title.").max(300),
  description: z.string().trim().max(10000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  visibility: z.enum(["INTERNAL", "SHARED"]).optional(),
  ownerSide: z.enum(["INTERNAL", "CUSTOMER"]).optional(),
  assigneeId: z.string().optional(),
  dueDate: optionalDate,
  estimateHours: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null)),
});

export async function createTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();

  const parsed = createTaskSchema.safeParse({
    projectId: formData.get("projectId"),
    phaseId: formData.get("phaseId") || undefined,
    parentTaskId: formData.get("parentTaskId") || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    status: formData.get("status") || undefined,
    priority: formData.get("priority") || undefined,
    visibility: formData.get("visibility") || undefined,
    ownerSide: formData.get("ownerSide") || undefined,
    assigneeId: formData.get("assigneeId") || undefined,
    dueDate: formData.get("dueDate")?.toString(),
    estimateHours: formData.get("estimateHours")?.toString(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const d = parsed.data;

  await assertProjectWrite(actor, d.projectId);

  let phaseId = d.phaseId || null;
  let parentTaskId: string | null = d.parentTaskId || null;
  let workTrack: "EHR" | "RCM" | "SHARED" | undefined;
  if (parentTaskId) {
    const parent = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, parentTaskId), eq(tasks.projectId, d.projectId)),
      columns: { id: true, phaseId: true, workTrack: true },
    });
    if (!parent) return { error: "That parent task is not on this project." };
    phaseId = parent.phaseId;
    workTrack = parent.workTrack;
  }

  const requestedVisibility = resolveVisibilityForActor(actor, d.visibility);
  const defaults = liveTaskCreateDefaults({
    ownerSide: d.ownerSide,
    visibility: requestedVisibility,
    parentTaskId,
  });
  const ownerSide = defaults.ownerSide;
  const visibility = defaults.visibility;

  try {
    const order = await nextSiblingOrder(d.projectId, phaseId, parentTaskId);
    const [task] = await db
      .insert(tasks)
      .values({
        projectId: d.projectId,
        phaseId,
        parentTaskId,
        title: d.title,
        description: d.description || null,
        status: d.status ?? "TODO",
        priority: d.priority ?? "MEDIUM",
        visibility,
        ownerSide,
        assigneeId: d.assigneeId || null,
        dueDate: d.dueDate,
        estimateHours: d.estimateHours,
        createdById: actor.id,
        order,
        workTrack: workTrack ?? "EHR",
      })
      .returning({ id: tasks.id });

    const assigned = await resolveCreateAssignees({
      projectId: d.projectId,
      phaseId,
      title: d.title,
      ownerSide,
      explicitAssigneeId: d.assigneeId || null,
    });
    if (assigned.length > 0) {
      await addAssigneesToTask({
        taskId: task.id,
        userIds: assigned,
        actorId: actor.id,
        source: d.assigneeId ? "MANUAL" : "AUTO_ROLE",
      });
    }

    await refreshProjectCounters(d.projectId);
    await syncMilestonesFromTaskCompletion(d.projectId);
    await audit({
      actor,
      action: "task.created",
      entityType: "task",
      entityId: task.id,
      summary: parentTaskId ? `${d.title} (sub-task)` : d.title,
      metadata: { projectId: d.projectId, visibility, ownerSide, parentTaskId },
    });

    if (assigned.some((id) => id !== actor.id)) {
      await notify({
        userIds: assigned.filter((id) => id !== actor.id),
        type: "TASK_ASSIGNED",
        title: `You were assigned: ${d.title}`,
        linkUrl: `/projects/${d.projectId}/tasks`,
        email: true,
      });
    }
  } catch (err) {
    console.error("createTask failed", err);
    return { error: "Could not create the task. Please try again." };
  }

  revalidatePath(`/projects/${d.projectId}`);
  revalidatePath(`/projects/${d.projectId}/tasks`);
  if (parentTaskId) revalidatePath(`/projects/${d.projectId}/tasks/${parentTaskId}`);
  revalidatePath(`/portal/projects/${d.projectId}`);
  revalidatePath("/my-work");
  return { ok: true };
}

async function nextSiblingOrder(
  projectId: string,
  phaseId: string | null,
  parentTaskId: string | null,
) {
  const sibling = await db.query.tasks.findFirst({
    where: and(
      eq(tasks.projectId, projectId),
      phaseId ? eq(tasks.phaseId, phaseId) : isNull(tasks.phaseId),
      parentTaskId ? eq(tasks.parentTaskId, parentTaskId) : isNull(tasks.parentTaskId),
    ),
    columns: { order: true },
    orderBy: [desc(tasks.order)],
  });
  return (sibling?.order ?? -1) + 1;
}

async function resolveCreateAssignees(opts: {
  projectId: string;
  phaseId: string | null;
  title: string;
  ownerSide: "INTERNAL" | "CUSTOMER";
  explicitAssigneeId: string | null;
}): Promise<string[]> {
  if (opts.explicitAssigneeId) return [opts.explicitAssigneeId];
  const [project, members, phase] = await Promise.all([
    db.query.projects.findFirst({
      where: eq(projects.id, opts.projectId),
      columns: { leadId: true },
    }),
    db.query.projectMembers.findMany({
      where: eq(projectMembers.projectId, opts.projectId),
      columns: { userId: true, role: true },
    }),
    opts.phaseId
      ? db.query.phases.findFirst({
          where: eq(phases.id, opts.phaseId),
          columns: { name: true },
        })
      : Promise.resolve(null),
  ]);
  const assignments: Record<string, string> = {};
  for (const m of members) assignments[m.role] = m.userId;
  if (project?.leadId) assignments.LEAD = project.leadId;
  return newTaskAssigneeIds({
    task: { title: opts.title, ownerSide: opts.ownerSide },
    phaseName: phase?.name ?? null,
    roleAssignments: assignments,
    fallbackLeadId: project?.leadId ?? null,
  });
}

async function loadTaskForActor(actor: Actor, taskId: string) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    with: { phase: { columns: { visibility: true, notApplicable: true } } },
  });
  if (!task) throw new NotFoundError("Task not found.");
  await assertProjectAccess(actor, task.projectId);
  if (isCustomer(actor)) {
    if (task.visibility === "INTERNAL" || isSpecialistSubtask(task)) {
      throw new NotFoundError("Task not found.");
    }
    if (task.phase && (task.phase.visibility !== "SHARED" || task.phase.notApplicable)) {
      throw new NotFoundError("Task not found.");
    }
  }
  return task;
}

/**
 * Status change. Customers may complete tasks assigned to their side — that is
 * the whole point of a portal action item — but may not touch internal work.
 */
export async function setTaskStatus(taskId: string, status: string) {
  const actor = await requireUser();
  const parsed = z
    .enum(["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE", "CANCELLED"])
    .safeParse(status);
  if (!parsed.success) throw new Error("Unknown status.");

  const task = await loadTaskForActor(actor, taskId);

  if (isCustomer(actor)) {
    if (task.ownerSide !== "CUSTOMER") {
      throw new ForbiddenError("This item is handled by your implementation team.");
    }
  } else {
    await assertProjectWrite(actor, task.projectId);
  }

  const next = parsed.data;
  const completedAt = next === "DONE" ? new Date() : null;
  await db
    .update(tasks)
    .set({
      status: next,
      completedAt,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  const syncedIds = await syncConnectedTaskStatus({
    projectId: task.projectId,
    taskId,
    connectKey: task.connectKey,
    overlapKey: task.overlapKey,
    title: task.title,
    status: next,
    completedAt,
  });

  await Promise.all([
    refreshProjectCounters(task.projectId),
    syncMilestonesFromTaskCompletion(task.projectId),
    audit({
      actor,
      action: "task.status.changed",
      entityType: "task",
      entityId: taskId,
      summary: `${task.title}: ${task.status} → ${next}`,
      metadata: {
        projectId: task.projectId,
        from: task.status,
        to: next,
        connectedTaskIds: syncedIds,
      },
    }),
  ]);

  if (next === "DONE") {
    const exposed = await exposePhaseFromCompletedTask({
      projectId: task.projectId,
      taskTitle: task.title,
    });
    if (exposed) {
      revalidatePath(`/projects/${task.projectId}/settings`);
      revalidatePath(`/projects/${task.projectId}/customer-view`);
    }

    await applySupportHandoffOnComplete({
      projectId: task.projectId,
      taskId,
      taskTitle: task.title,
      taskDescription: task.description,
      actor,
    });
    if (isHandOffToSupportTask(task.title)) {
      revalidatePath("/projects");
      revalidatePath("/dashboard");
      revalidatePath("/reports");
    }

    // Email / Teams / in-app rows are not needed to paint the checkbox.
    // Awaiting Resend on B1 App Service is a common multi-second stall.
    after(() => {
      void notifyTaskCompleted({
        actor,
        taskId,
        projectId: task.projectId,
        title: task.title,
        assigneeId: task.assigneeId,
      }).catch((err) => console.error("task completion notify failed", err));
    });
  }

  await applyTrainingStatusSideEffects({
    task: {
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      status: next,
      parentTaskId: task.parentTaskId,
      sessionAt: task.sessionAt,
      dueDate: task.dueDate,
      notApplicable: task.notApplicable,
    },
    nextStatus: next,
  });

  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath(`/projects/${task.projectId}/tasks`);
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  revalidatePath(`/portal/projects/${task.projectId}`);
  revalidatePath(`/portal/projects/${task.projectId}/tasks/${taskId}`);
  revalidatePath("/my-work");
}

async function notifyTaskCompleted(opts: {
  actor: Actor;
  taskId: string;
  projectId: string;
  title: string;
  assigneeId: string | null;
}) {
  const project = await db.query.projects.findFirst({
    where: (p, { eq: e }) => e(p.id, opts.projectId),
    columns: { id: true, leadId: true, name: true, code: true },
  });

  const customerDidIt = isCustomer(opts.actor);
  const who = opts.actor.name ?? opts.actor.email ?? "Someone";

  const audience = new Set<string>();
  if (project?.leadId) audience.add(project.leadId);
  for (const id of await taskAssigneeIds(opts.taskId)) audience.add(id);
  if (opts.assigneeId) audience.add(opts.assigneeId);
  if (audience.size === 0) return;

  await notify({
    userIds: Array.from(audience),
    type: "TASK_COMPLETED",
    title: customerDidIt
      ? `${project?.name ?? "Project"}: customer completed “${opts.title}”`
      : `Completed: ${opts.title}`,
    body: customerDidIt
      ? `${who} marked this action item done. Anything waiting on it can move.`
      : `${who} marked this done.`,
    facts: [
      { name: "Project", value: `${project?.name ?? "—"} (${project?.code ?? "—"})` },
      { name: "Completed by", value: who },
      { name: "Side", value: customerDidIt ? "Customer" : "Implementation team" },
    ],
    linkUrl: `/projects/${opts.projectId}/tasks/${opts.taskId}`,
    portalLinkUrl: `/portal/projects/${opts.projectId}/tasks/${opts.taskId}`,
    ctaLabel: "Open the task",
    email: true,
    teams: customerDidIt,
    teamsTone: "good",
    projectId: opts.projectId,
    exceptUserId: opts.actor.id,
  });
}

const updateTaskSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(10000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().optional(),
  phaseId: z.string().optional(),
  dueDate: optionalDate,
});

export async function updateTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();
  if (isCustomer(actor)) return { error: "Customer contacts cannot edit task details." };

  const parsed = updateTaskSchema.safeParse({
    taskId: formData.get("taskId"),
    title: formData.get("title") || undefined,
    description: formData.get("description") || undefined,
    priority: formData.get("priority") || undefined,
    assigneeId: formData.get("assigneeId") ?? undefined,
    phaseId: formData.get("phaseId") ?? undefined,
    dueDate: formData.get("dueDate")?.toString(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const d = parsed.data;
  const task = await loadTaskForActor(actor, d.taskId);
  await assertProjectWrite(actor, task.projectId);

  await db
    .update(tasks)
    .set({
      ...(d.title ? { title: d.title } : {}),
      ...(d.description !== undefined ? { description: d.description || null } : {}),
      ...(d.priority ? { priority: d.priority } : {}),
      ...(d.phaseId !== undefined ? { phaseId: d.phaseId || null } : {}),
      dueDate: d.dueDate,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, d.taskId));

  if (d.assigneeId) {
    await addAssigneesToTask({
      taskId: d.taskId,
      userIds: [d.assigneeId],
      actorId: actor.id,
      source: "MANUAL",
    });
  }

  await audit({
    actor,
    action: "task.updated",
    entityType: "task",
    entityId: d.taskId,
    summary: d.title ?? task.title,
  });

  if (d.assigneeId && d.assigneeId !== task.assigneeId && d.assigneeId !== actor.id) {
    await notify({
      userIds: [d.assigneeId],
      type: "TASK_ASSIGNED",
      title: `You were assigned: ${d.title ?? task.title}`,
      linkUrl: `/projects/${task.projectId}/tasks`,
      email: true,
    });
  }

  revalidatePath(`/projects/${task.projectId}/tasks`);
  revalidatePath(`/projects/${task.projectId}/tasks/${d.taskId}`);
  revalidatePath("/my-work");
  return { ok: true };
}

/**
 * Staff records the Outlook/calendar slot on Schedule Training N or the
 * Training N parent. Copies `session_at` onto the session task.
 */
export async function bookTrainingSession(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();
  if (isCustomer(actor)) {
    return { error: "Your implementation team records the session date and time." };
  }

  const taskId = String(formData.get("taskId") ?? "");
  const date = String(formData.get("sessionDate") ?? "");
  const time = String(formData.get("sessionTime") ?? "");
  if (!taskId) return { error: "Missing task." };
  const sessionAt = parseSessionDateTime(date, time || null);
  if (!sessionAt) return { error: "Pick a session date." };

  const task = await loadTaskForActor(actor, taskId);
  await assertProjectWrite(actor, task.projectId);
  if (!canBookTrainingSession(task.title)) {
    return { error: "This item is not a training session or schedule task." };
  }

  const result = await applyTrainingBooking({
    sourceTaskId: task.id,
    projectId: task.projectId,
    sessionAt,
  });

  await audit({
    actor,
    action: "training.session.booked",
    entityType: "task",
    entityId: result.sessionTaskId ?? task.id,
    summary: task.title,
    metadata: { projectId: task.projectId, sessionAt: sessionAt.toISOString() },
  });

  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath(`/projects/${task.projectId}/tasks`);
  revalidatePath(`/projects/${task.projectId}/tasks/${task.id}`);
  if (result.sessionTaskId && result.sessionTaskId !== task.id) {
    revalidatePath(`/projects/${task.projectId}/tasks/${result.sessionTaskId}`);
  }
  revalidatePath(`/portal/projects/${task.projectId}`);
  revalidatePath("/my-work");
  return { ok: true };
}

/**
 * Flip a task between internal and customer-visible. Always audited — this is
 * the single most consequential toggle in the product.
 */
export async function setTaskVisibility(taskId: string, visibility: "INTERNAL" | "SHARED") {
  const actor = await requireUser();
  if (!canSeeInternal(actor)) throw new ForbiddenError();

  const task = await loadTaskForActor(actor, taskId);
  await assertProjectWrite(actor, task.projectId);

  if (task.ownerSide === "CUSTOMER" && visibility === "INTERNAL") {
    throw new ForbiddenError(
      "This is a customer action item. Reassign it to your team before hiding it.",
    );
  }

  await db
    .update(tasks)
    .set({ visibility, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  await audit({
    actor,
    action: "task.visibility.changed",
    entityType: "task",
    entityId: taskId,
    summary: `${task.title}: now ${visibility === "SHARED" ? "visible to customer" : "internal only"}`,
    metadata: { projectId: task.projectId, from: task.visibility, to: visibility },
  });

  revalidatePath(`/projects/${task.projectId}/tasks`);
  revalidatePath(`/portal/projects/${task.projectId}`);
}

/**
 * Staff-only: move a live task (or sub-task) to another section and/or parent.
 * Nested children stay under the moved item and follow its destination phase.
 * Customers cannot reorder or reparent — Dock-style portal lists stay as-is.
 */
export async function moveTask(
  taskId: string,
  toPhaseId: string | null,
  toParentTaskId: string | null,
) {
  const actor = await requireUser();
  if (isCustomer(actor)) {
    throw new ForbiddenError("Only your implementation team can move tasks.");
  }
  const task = await loadTaskForActor(actor, taskId);
  await assertProjectWrite(actor, task.projectId);

  const result = await applyTaskMove({
    taskId,
    toPhaseId: toPhaseId || null,
    toParentTaskId: toParentTaskId || null,
  });

  if (!result.unchanged) {
    await audit({
      actor,
      action: "task.moved",
      entityType: "task",
      entityId: taskId,
      summary: `${result.title}: ${
        result.toParentTaskId ? "moved under another parent" : "moved to top-level in a section"
      }`,
      metadata: {
        projectId: result.projectId,
        fromPhaseId: result.fromPhaseId,
        fromParentTaskId: result.fromParentTaskId,
        toPhaseId: result.toPhaseId,
        toParentTaskId: result.toParentTaskId,
        movedCount: result.movedCount,
      },
    });
  }

  revalidatePath(`/projects/${result.projectId}`);
  revalidatePath(`/projects/${result.projectId}/tasks`);
  revalidatePath(`/projects/${result.projectId}/tasks/${taskId}`);
  if (result.fromParentTaskId) {
    revalidatePath(`/projects/${result.projectId}/tasks/${result.fromParentTaskId}`);
  }
  if (result.toParentTaskId) {
    revalidatePath(`/projects/${result.projectId}/tasks/${result.toParentTaskId}`);
  }
  revalidatePath(`/portal/projects/${result.projectId}`);
  revalidatePath("/my-work");
}

export async function deleteTask(taskId: string) {
  const actor = await requireUser();
  if (isCustomer(actor)) throw new ForbiddenError();
  const task = await loadTaskForActor(actor, taskId);
  await assertProjectWrite(actor, task.projectId);

  await db.delete(tasks).where(eq(tasks.id, taskId));
  await refreshProjectCounters(task.projectId);
  await syncMilestonesFromTaskCompletion(task.projectId);
  await audit({
    actor,
    action: "task.deleted",
    entityType: "task",
    entityId: taskId,
    summary: task.title,
    metadata: { projectId: task.projectId, parentTaskId: task.parentTaskId },
  });
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath(`/projects/${task.projectId}/tasks`);
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  revalidatePath(`/portal/projects/${task.projectId}`);
  revalidatePath("/my-work");
}

/** Marks a task (and its children) N/A on this project only — template unchanged. */
export async function markTaskNotApplicable(taskId: string, notApplicable: boolean) {
  const actor = await requireUser();
  if (isCustomer(actor)) throw new ForbiddenError();
  const task = await loadTaskForActor(actor, taskId);
  await assertProjectWrite(actor, task.projectId);
  await setTaskNotApplicable(taskId, notApplicable);
  await audit({
    actor,
    action: notApplicable ? "task.marked_na" : "task.restored_from_na",
    entityType: "task",
    entityId: taskId,
    summary: `${task.title}: ${notApplicable ? "not applicable on this project" : "restored"}`,
    metadata: { projectId: task.projectId },
  });
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath(`/projects/${task.projectId}/tasks`);
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  revalidatePath(`/portal/projects/${task.projectId}`);
  revalidatePath("/my-work");
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addTaskComment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();
  const taskId = String(formData.get("taskId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!taskId) return { error: "Missing task." };
  if (!body) return { error: "Write a comment first." };
  if (body.length > 10000) return { error: "That comment is too long." };

  const task = await loadTaskForActor(actor, taskId);

  const requested = (formData.get("visibility") as "INTERNAL" | "SHARED") || undefined;
  let visibility = resolveVisibilityForActor(actor, requested);
  // A comment can never be more visible than the task carrying it.
  if (task.visibility === "INTERNAL") visibility = "INTERNAL";

  await db.insert(taskComments).values({
    taskId,
    authorId: actor.id,
    body,
    visibility,
  });

  await audit({
    actor,
    action: "task.commented",
    entityType: "task",
    entityId: taskId,
    summary: task.title,
    metadata: { projectId: task.projectId, visibility },
  });

  // Tell the people who care: whoever owns the task, and the project lead.
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, task.projectId),
    columns: { id: true, leadId: true, name: true },
  });
  const audience = new Set<string>();
  for (const id of await taskAssigneeIds(taskId)) audience.add(id);
  if (task.assigneeId) audience.add(task.assigneeId);
  if (project?.leadId) audience.add(project.leadId);

  if (audience.size > 0) {
    // Never notify a customer about an internal comment.
    let recipients = Array.from(audience);
    if (visibility === "INTERNAL") {
      const rows = await db.query.users.findMany({
        where: inArray(users.id, recipients),
        columns: { id: true, role: true },
      });
      recipients = rows.filter((r) => r.role !== "CUSTOMER").map((r) => r.id);
    }
    await notify({
      userIds: recipients,
      type: "TASK_COMMENTED",
      title: `New comment on "${task.title}"`,
      // The excerpt is quoted rather than inlined, so the email reads like a
      // notification about a comment instead of pretending to be the comment.
      quote: { author: actor.name ?? actor.email ?? "Someone", text: body.slice(0, 400) },
      facts: [{ name: "Project", value: project?.name ?? "—" }],
      linkUrl: `/projects/${task.projectId}/tasks/${taskId}`,
      portalLinkUrl: `/portal/projects/${task.projectId}/tasks/${taskId}`,
      ctaLabel: "Read and reply",
      email: visibility === "SHARED",
      // The Teams channel is a customer-activity feed. Staff talking to each
      // other is already visible in the app; a customer speaking is the thing
      // that needs to reach someone who isn't looking.
      teams: isCustomer(actor),
      projectId: task.projectId,
      exceptUserId: actor.id,
    });
  }

  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  revalidatePath(`/portal/projects/${task.projectId}/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Add someone to a task. Additive — does not wipe other assignees.
 * Customers may add their own teammates on customer-owned SHARED tasks.
 */
export async function addTaskAssignee(taskId: string, userId: string) {
  const actor = await requireUser();
  const task = await loadTaskForActor(actor, taskId);
  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, name: true, role: true, customerAccountId: true, isActive: true },
  });
  if (!target || !target.isActive) throw new NotFoundError("That person is not available.");

  if (isCustomer(actor)) {
    const member = await db.query.projectMembers.findFirst({
      where: and(eq(projectMembers.projectId, task.projectId), eq(projectMembers.userId, target.id)),
    });
    const gate = customerMayChangeAssignee({
      taskOwnerSide: task.ownerSide,
      taskVisibility: task.visibility,
      targetRole: target.role,
      actorAccountId: actor.customerAccountId,
      targetAccountId: target.customerAccountId,
      targetIsProjectMember: Boolean(member),
    });
    if (!gate.ok) throw new ForbiddenError(gate.reason);
  } else {
    await assertProjectWrite(actor, task.projectId);
    if (target.role === "CUSTOMER") {
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
        columns: { customerAccountId: true },
      });
      if (!project?.customerAccountId || target.customerAccountId !== project.customerAccountId) {
        throw new ForbiddenError("That contact belongs to a different customer.");
      }
    }
  }

  const { added } = await addAssigneesToTask({
    taskId,
    userIds: [target.id],
    actorId: actor.id,
    source: "MANUAL",
  });

  if (target.role === "CUSTOMER") {
    await db
      .update(tasks)
      .set({ ownerSide: "CUSTOMER", visibility: "SHARED", updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
  }

  if (added.length > 0) {
    await audit({
      actor,
      action: "task.assigned",
      entityType: "task",
      entityId: taskId,
      summary: `${task.title} + ${target.name ?? target.id}`,
      metadata: { projectId: task.projectId, assigneeRole: target.role },
    });
    if (target.id !== actor.id) {
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, task.projectId),
        columns: { name: true, code: true },
      });
      const facts = [
        { name: "Project", value: `${project?.name ?? "—"} (${project?.code ?? "—"})` },
        { name: "Assigned by", value: actor.name ?? actor.email ?? "—" },
      ];
      if (task.dueDate) facts.push({ name: "Due", value: fmtDate(task.dueDate) });
      await notify({
        userIds: [target.id],
        type: "TASK_ASSIGNED",
        title: `You were assigned: ${task.title}`,
        body:
          target.role === "CUSTOMER"
            ? "This is an action item for your practice. Open it to see what's needed and mark it done when it's finished."
            : undefined,
        facts,
        linkUrl: `/projects/${task.projectId}/tasks/${taskId}`,
        portalLinkUrl: `/portal/projects/${task.projectId}/tasks/${taskId}`,
        ctaLabel: "Open the task",
        email: true,
      });
    }
  }

  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  revalidatePath(`/projects/${task.projectId}/tasks`);
  revalidatePath(`/portal/projects/${task.projectId}/tasks/${taskId}`);
  revalidatePath(`/portal/projects/${task.projectId}`);
  revalidatePath("/my-work");
}

export async function removeTaskAssignee(taskId: string, userId: string) {
  const actor = await requireUser();
  const task = await loadTaskForActor(actor, taskId);

  if (isCustomer(actor)) {
    const target = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true, customerAccountId: true },
    });
    const member = target
      ? await db.query.projectMembers.findFirst({
          where: and(eq(projectMembers.projectId, task.projectId), eq(projectMembers.userId, userId)),
        })
      : null;
    const gate = customerMayChangeAssignee({
      taskOwnerSide: task.ownerSide,
      taskVisibility: task.visibility,
      targetRole: target?.role ?? "SPECIALIST",
      actorAccountId: actor.customerAccountId,
      targetAccountId: target?.customerAccountId ?? null,
      targetIsProjectMember: Boolean(member),
      removingStaff: target?.role !== "CUSTOMER",
    });
    if (!gate.ok) throw new ForbiddenError(gate.reason);
  } else {
    await assertProjectWrite(actor, task.projectId);
  }

  await removeAssigneeFromTask({ taskId, userId });
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  revalidatePath(`/projects/${task.projectId}/tasks`);
  revalidatePath(`/portal/projects/${task.projectId}/tasks/${taskId}`);
  revalidatePath(`/portal/projects/${task.projectId}`);
  revalidatePath("/my-work");
}

/**
 * Assign a task to somebody — including a named contact at the customer.
 *
 * Additive: adding a person does not wipe other assignees. Pass null is a
 * no-op (use removeTaskAssignee to drop one person).
 */
export async function assignTask(taskId: string, userId: string | null) {
  if (!userId) return;
  await addTaskAssignee(taskId, userId);
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function toggleMilestone(milestoneId: string) {
  const actor = await requireUser();
  if (isCustomer(actor)) throw new ForbiddenError();

  const milestone = await db.query.milestones.findFirst({
    where: eq(milestones.id, milestoneId),
  });
  if (!milestone) throw new NotFoundError("Milestone not found.");
  await assertProjectWrite(actor, milestone.projectId);

  const completing = !milestone.completedAt;
  await db
    .update(milestones)
    .set({ completedAt: completing ? new Date() : null, updatedAt: new Date() })
    .where(eq(milestones.id, milestoneId));

  await audit({
    actor,
    action: completing ? "milestone.completed" : "milestone.reopened",
    entityType: "milestone",
    entityId: milestoneId,
    summary: milestone.name,
    metadata: { projectId: milestone.projectId },
  });

  if (completing && milestone.visibility === "SHARED") {
    const project = await db.query.projects.findFirst({
      where: (p, { eq: e }) => e(p.id, milestone.projectId),
      with: { customerAccount: { with: { contacts: { columns: { id: true } } } } },
      columns: { id: true, name: true },
    });
    const contactIds = project?.customerAccount?.contacts.map((c) => c.id) ?? [];
    if (contactIds.length > 0) {
      await notify({
        userIds: contactIds,
        type: "MILESTONE_COMPLETED",
        title: `Milestone complete: ${milestone.name}`,
        body: `${project?.name ?? "Your project"} just cleared a milestone.`,
        linkUrl: `/portal/projects/${milestone.projectId}`,
        email: true,
      });
    }
  }

  revalidatePath(`/projects/${milestone.projectId}`);
  revalidatePath(`/portal/projects/${milestone.projectId}`);
}

export async function createMilestone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();
  if (isCustomer(actor)) return { error: "Not permitted." };

  const projectId = String(formData.get("projectId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const dueRaw = String(formData.get("dueDate") ?? "");
  const visibility = (formData.get("visibility") as "INTERNAL" | "SHARED") || "SHARED";
  if (!projectId || !name) return { error: "Milestone needs a name." };

  await assertProjectWrite(actor, projectId);

  const [{ maxOrder } = { maxOrder: 0 }] = await db
    .select({ maxOrder: milestones.order })
    .from(milestones)
    .where(eq(milestones.projectId, projectId))
    .orderBy(milestones.order)
    .limit(1);

  await db.insert(milestones).values({
    projectId,
    name,
    dueDate: dueRaw ? new Date(dueRaw) : null,
    visibility,
    order: (maxOrder ?? 0) + 1,
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
