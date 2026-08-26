"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { tasks, taskComments, milestones, projects, users } from "@/db/schema";
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
import { fmtDate } from "@/lib/dates";
import type { ActionState } from "./messages";

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? new Date(v) : null));

const createTaskSchema = z.object({
  projectId: z.string().min(1),
  phaseId: z.string().optional(),
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

  // A task assigned to the customer must be visible to them, or it is invisible
  // work nobody will ever do.
  const ownerSide = d.ownerSide ?? "INTERNAL";
  let visibility = resolveVisibilityForActor(actor, d.visibility);
  if (ownerSide === "CUSTOMER") visibility = "SHARED";

  try {
    const [task] = await db
      .insert(tasks)
      .values({
        projectId: d.projectId,
        phaseId: d.phaseId || null,
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
      })
      .returning({ id: tasks.id });

    await refreshProjectCounters(d.projectId);
    await audit({
      actor,
      action: "task.created",
      entityType: "task",
      entityId: task.id,
      summary: d.title,
      metadata: { projectId: d.projectId, visibility, ownerSide },
    });

    if (d.assigneeId && d.assigneeId !== actor.id) {
      await notify({
        userIds: [d.assigneeId],
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
  revalidatePath(`/portal/projects/${d.projectId}`);
  revalidatePath("/my-work");
  return { ok: true };
}

async function loadTaskForActor(actor: Actor, taskId: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new NotFoundError("Task not found.");
  await assertProjectAccess(actor, task.projectId);
  if (isCustomer(actor) && task.visibility === "INTERNAL") {
    throw new NotFoundError("Task not found.");
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
  await db
    .update(tasks)
    .set({
      status: next,
      completedAt: next === "DONE" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  await refreshProjectCounters(task.projectId);
  await audit({
    actor,
    action: "task.status.changed",
    entityType: "task",
    entityId: taskId,
    summary: `${task.title}: ${task.status} → ${next}`,
    metadata: { projectId: task.projectId, from: task.status, to: next },
  });

  if (next === "DONE") {
    const project = await db.query.projects.findFirst({
      where: (p, { eq: e }) => e(p.id, task.projectId),
      columns: { id: true, leadId: true, name: true, code: true },
    });

    const customerDidIt = isCustomer(actor);
    const who = actor.name ?? actor.email ?? "Someone";

    // The lead always wants to know. So does whoever the task sits with, if
    // that isn't the person who just ticked it.
    const audience = new Set<string>();
    if (project?.leadId) audience.add(project.leadId);
    if (task.assigneeId) audience.add(task.assigneeId);

    // A customer completing their own action item is the single event an
    // implementation specialist most wants pushed at them — it is what
    // unblocks the next step. It emails, and it hits the Teams channel.
    if (audience.size > 0) {
      await notify({
        userIds: Array.from(audience),
        type: "TASK_COMPLETED",
        title: customerDidIt
          ? `${project?.name ?? "Project"}: customer completed “${task.title}”`
          : `Completed: ${task.title}`,
        body: customerDidIt
          ? `${who} marked this action item done. Anything waiting on it can move.`
          : `${who} marked this done.`,
        facts: [
          { name: "Project", value: `${project?.name ?? "—"} (${project?.code ?? "—"})` },
          { name: "Completed by", value: who },
          { name: "Side", value: customerDidIt ? "Customer" : "Implementation team" },
        ],
        linkUrl: `/projects/${task.projectId}/tasks/${taskId}`,
        portalLinkUrl: `/portal/projects/${task.projectId}/tasks/${taskId}`,
        ctaLabel: "Open the task",
        email: true,
        teams: customerDidIt,
        teamsTone: "good",
        projectId: task.projectId,
        exceptUserId: actor.id,
      });
    }
  }

  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath(`/projects/${task.projectId}/tasks`);
  revalidatePath(`/portal/projects/${task.projectId}`);
  revalidatePath("/portal");
  revalidatePath("/my-work");
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
      ...(d.assigneeId !== undefined ? { assigneeId: d.assigneeId || null } : {}),
      ...(d.phaseId !== undefined ? { phaseId: d.phaseId || null } : {}),
      dueDate: d.dueDate,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, d.taskId));

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

export async function deleteTask(taskId: string) {
  const actor = await requireUser();
  if (isCustomer(actor)) throw new ForbiddenError();
  const task = await loadTaskForActor(actor, taskId);
  await assertProjectWrite(actor, task.projectId);

  await db.delete(tasks).where(eq(tasks.id, taskId));
  await refreshProjectCounters(task.projectId);
  await audit({
    actor,
    action: "task.deleted",
    entityType: "task",
    entityId: taskId,
    summary: task.title,
    metadata: { projectId: task.projectId },
  });
  revalidatePath(`/projects/${task.projectId}/tasks`);
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
 * Assign a task to somebody — including a named contact at the customer.
 *
 * Assigning to a customer contact is the point of this: "the practice" is not
 * a person and work addressed to everyone gets done by no one. The contact
 * must belong to this project's customer account, and the task becomes a
 * customer-side, customer-visible item as a consequence.
 */
export async function assignTask(taskId: string, userId: string | null) {
  const actor = await requireUser();
  if (isCustomer(actor)) throw new ForbiddenError("Only your implementation team can reassign work.");

  const task = await loadTaskForActor(actor, taskId);
  await assertProjectWrite(actor, task.projectId);

  if (!userId) {
    await db
      .update(tasks)
      .set({ assigneeId: null, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
    revalidatePath(`/projects/${task.projectId}/tasks`);
    return;
  }

  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, name: true, role: true, customerAccountId: true, isActive: true },
  });
  if (!target || !target.isActive) throw new NotFoundError("That person is not available.");

  const patch: Record<string, unknown> = { assigneeId: target.id, updatedAt: new Date() };

  if (target.role === "CUSTOMER") {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, task.projectId),
      columns: { customerAccountId: true },
    });
    if (!project?.customerAccountId || target.customerAccountId !== project.customerAccountId) {
      throw new ForbiddenError("That contact belongs to a different customer.");
    }
    // Customer-owned work must be visible to the customer, or nobody does it.
    patch.ownerSide = "CUSTOMER";
    patch.visibility = "SHARED";
  }

  await db.update(tasks).set(patch).where(eq(tasks.id, taskId));

  await audit({
    actor,
    action: "task.assigned",
    entityType: "task",
    entityId: taskId,
    summary: `${task.title} → ${target.name ?? target.id}`,
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

  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  revalidatePath(`/projects/${task.projectId}/tasks`);
  revalidatePath(`/portal/projects/${task.projectId}`);
  revalidatePath("/my-work");
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
