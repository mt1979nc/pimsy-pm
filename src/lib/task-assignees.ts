/**
 * Multi-assignee writes + role auto-assignment.
 *
 * Additive: assigning a specialist / billing person / customer lead adds them
 * to matching tasks and does not remove anyone already on the row.
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { phases, projects, projectMembers, taskAssignees, tasks } from "@/db/schema";
import { notify } from "@/lib/notify";
import {
  autoAssignKindForRole,
  staffingIdsFromAssignments,
  taskMatchesAutoAssign,
  userIdsForNewTask,
  type RoleMatchTask,
} from "@/lib/task-role-match";
import { resolveAssigneeForRole } from "@/lib/staffing";

export type AssigneePerson = {
  id: string;
  name: string | null;
  email?: string;
  image?: string | null;
  role?: string;
  title?: string | null;
  isActive?: boolean;
};

type Writer = {
  insert: typeof db.insert;
  update: typeof db.update;
  query: typeof db.query;
};

const ASSIGNEE_USER_COLUMNS = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  title: true,
  isActive: true,
} as const;

export async function insertTaskAssigneeRows(
  client: Writer,
  opts: {
    taskId: string;
    userIds: string[];
    actorId?: string | null;
    source?: "AUTO_ROLE" | "MANUAL";
  },
): Promise<string[]> {
  const unique = [...new Set(opts.userIds.filter(Boolean))];
  if (unique.length === 0) return [];
  await client
    .insert(taskAssignees)
    .values(
      unique.map((userId) => ({
        taskId: opts.taskId,
        userId,
        assignedById: opts.actorId ?? null,
        source: opts.source ?? "MANUAL",
      })),
    )
    .onConflictDoNothing();
  return unique;
}

export async function syncPrimaryAssignee(client: Writer, taskId: string): Promise<string | null> {
  const task = await client.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { assigneeId: true },
  });
  const rows = await client.query.taskAssignees.findMany({
    where: eq(taskAssignees.taskId, taskId),
    orderBy: [asc(taskAssignees.assignedAt)],
    columns: { userId: true },
  });
  const ids = rows.map((r) => r.userId);
  const primary =
    task?.assigneeId && ids.includes(task.assigneeId) ? task.assigneeId : (ids[0] ?? null);
  if (primary !== (task?.assigneeId ?? null)) {
    await client
      .update(tasks)
      .set({ assigneeId: primary, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
  }
  return primary;
}

export async function addAssigneesToTask(opts: {
  taskId: string;
  userIds: string[];
  actorId?: string | null;
  source?: "AUTO_ROLE" | "MANUAL";
  client?: Writer;
}): Promise<{ added: string[] }> {
  const client = opts.client ?? db;
  const before = await client.query.taskAssignees.findMany({
    where: eq(taskAssignees.taskId, opts.taskId),
    columns: { userId: true },
  });
  const have = new Set(before.map((r) => r.userId));
  const fresh = [...new Set(opts.userIds.filter((id) => id && !have.has(id)))];
  if (fresh.length === 0) return { added: [] };
  await insertTaskAssigneeRows(client, {
    taskId: opts.taskId,
    userIds: fresh,
    actorId: opts.actorId,
    source: opts.source,
  });
  await syncPrimaryAssignee(client, opts.taskId);
  return { added: fresh };
}

export async function removeAssigneeFromTask(opts: {
  taskId: string;
  userId: string;
  client?: Writer;
}): Promise<void> {
  const client = opts.client ?? db;
  await db
    .delete(taskAssignees)
    .where(and(eq(taskAssignees.taskId, opts.taskId), eq(taskAssignees.userId, opts.userId)));
  await syncPrimaryAssignee(client, opts.taskId);
}

export async function taskAssigneeIds(taskId: string): Promise<string[]> {
  const rows = await db.query.taskAssignees.findMany({
    where: eq(taskAssignees.taskId, taskId),
    columns: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function loadAssigneesByTaskIds(
  taskIds: string[],
): Promise<Map<string, AssigneePerson[]>> {
  const map = new Map<string, AssigneePerson[]>();
  if (taskIds.length === 0) return map;
  const rows = await db.query.taskAssignees.findMany({
    where: inArray(taskAssignees.taskId, taskIds),
    orderBy: [asc(taskAssignees.assignedAt)],
    with: { user: { columns: ASSIGNEE_USER_COLUMNS } },
  });
  for (const row of rows) {
    if (!row.user) continue;
    const list = map.get(row.taskId) ?? [];
    list.push(row.user);
    map.set(row.taskId, list);
  }
  return map;
}

export function assigneesOf(task: {
  id: string;
  assignee?: AssigneePerson | null;
  assignees?: { user: AssigneePerson | null }[];
}): AssigneePerson[] {
  if (task.assignees && task.assignees.length > 0) {
    return task.assignees.map((a) => a.user).filter((u): u is AssigneePerson => Boolean(u));
  }
  return task.assignee ? [task.assignee] : [];
}

export function isAssignedTo(
  people: AssigneePerson[] | undefined,
  userId: string | null | undefined,
  fallbackAssigneeId?: string | null,
): boolean {
  if (!userId) return false;
  if (people?.some((p) => p.id === userId)) return true;
  return fallbackAssigneeId === userId;
}

const TASK_MATCH_COLUMNS = {
  id: true,
  title: true,
  ownerSide: true,
  defaultRole: true,
  overlapKey: true,
  areaKey: true,
  phaseId: true,
  assigneeId: true,
} as const;

export async function autoAssignForProjectRole(opts: {
  projectId: string;
  userId: string;
  role: string;
  actorId?: string | null;
  notify?: boolean;
  client?: Writer;
}): Promise<number> {
  const kind = autoAssignKindForRole(opts.role);
  if (!kind) return 0;
  const client = opts.client ?? db;
  const [projectTasks, projectPhases] = await Promise.all([
    client.query.tasks.findMany({
      where: eq(tasks.projectId, opts.projectId),
      columns: TASK_MATCH_COLUMNS,
    }),
    client.query.phases.findMany({
      where: eq(phases.projectId, opts.projectId),
      columns: { id: true, name: true },
    }),
  ]);
  const phaseName = new Map(projectPhases.map((p) => [p.id, p.name]));
  const matching = projectTasks.filter((t) =>
    taskMatchesAutoAssign(t as RoleMatchTask, t.phaseId ? (phaseName.get(t.phaseId) ?? null) : null, kind),
  );
  let addedCount = 0;
  for (const task of matching) {
    const { added } = await addAssigneesToTask({
      taskId: task.id,
      userIds: [opts.userId],
      actorId: opts.actorId,
      source: "AUTO_ROLE",
      client,
    });
    addedCount += added.length;
  }

  if (opts.notify !== false && addedCount > 0 && opts.actorId !== opts.userId) {
    const project = await client.query.projects.findFirst({
      where: eq(projects.id, opts.projectId),
      columns: { name: true, code: true },
    });
    await notify({
      userIds: [opts.userId],
      type: "TASK_ASSIGNED",
      title: `Assigned to ${addedCount} task${addedCount === 1 ? "" : "s"} on ${project?.name ?? "a project"}`,
      body: "PATH added you because of the role you were given on this site. Existing assignees were kept.",
      facts: [
        { name: "Project", value: `${project?.name ?? "—"} (${project?.code ?? "—"})` },
        { name: "Tasks", value: String(addedCount) },
      ],
      linkUrl: `/projects/${opts.projectId}/tasks`,
      portalLinkUrl: `/portal/projects/${opts.projectId}`,
      ctaLabel: "Open the project",
      email: true,
    });
  }
  return addedCount;
}

export async function autoAssignFromRoleAssignments(opts: {
  projectId: string;
  roleAssignments: Record<string, string>;
  leadId?: string | null;
  actorId?: string | null;
  notify?: boolean;
  client?: Writer;
}): Promise<number> {
  const ids = staffingIdsFromAssignments(opts.roleAssignments);
  const specialist = ids.specialistId || opts.leadId || null;
  let n = 0;
  if (specialist) {
    n += await autoAssignForProjectRole({
      projectId: opts.projectId,
      userId: specialist,
      role: "IMPLEMENTATION_SPECIALIST",
      actorId: opts.actorId,
      notify: opts.notify,
      client: opts.client,
    });
  }
  if (ids.billingSupportId) {
    n += await autoAssignForProjectRole({
      projectId: opts.projectId,
      userId: ids.billingSupportId,
      role: "T1_BILLING_SUPPORT",
      actorId: opts.actorId,
      notify: opts.notify,
      client: opts.client,
    });
  }
  if (ids.t2BillingId && ids.t2BillingId !== ids.billingSupportId) {
    n += await autoAssignForProjectRole({
      projectId: opts.projectId,
      userId: ids.t2BillingId,
      role: "T2_BILLING_SUPPORT",
      actorId: opts.actorId,
      notify: opts.notify,
      client: opts.client,
    });
  }
  if (ids.customerLeadId) {
    n += await autoAssignForProjectRole({
      projectId: opts.projectId,
      userId: ids.customerLeadId,
      role: "CUSTOMER_PROJECT_LEAD",
      actorId: opts.actorId,
      notify: opts.notify,
      client: opts.client,
    });
  }
  if (ids.customerBillingId) {
    n += await autoAssignForProjectRole({
      projectId: opts.projectId,
      userId: ids.customerBillingId,
      role: "CUSTOMER_BILLING",
      actorId: opts.actorId,
      notify: opts.notify,
      client: opts.client,
    });
  }
  return n;
}

export function newTaskAssigneeIds(opts: {
  task: RoleMatchTask;
  phaseName?: string | null;
  roleAssignments: Record<string, string>;
  fallbackLeadId: string | null;
}): string[] {
  const ids = staffingIdsFromAssignments(opts.roleAssignments);
  const defaultRoleAssigneeId = resolveAssigneeForRole(
    opts.task.defaultRole,
    opts.roleAssignments,
    opts.fallbackLeadId,
    opts.task.ownerSide === "CUSTOMER" ? "CUSTOMER" : "INTERNAL",
  );
  return userIdsForNewTask(opts.task, opts.phaseName, {
    specialistId: ids.specialistId || opts.fallbackLeadId,
    billingSupportId: ids.billingSupportId,
    t2BillingId: ids.t2BillingId,
    defaultRoleAssigneeId,
    customerLeadId: ids.customerLeadId,
    customerBillingId: ids.customerBillingId,
  });
}

export async function listCustomerProjectTeam(projectId: string): Promise<AssigneePerson[]> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { customerAccountId: true },
  });
  if (!project?.customerAccountId) return [];
  const members = await db.query.projectMembers.findMany({
    where: eq(projectMembers.projectId, projectId),
    with: { user: { columns: ASSIGNEE_USER_COLUMNS } },
  });
  return members
    .filter((m) => m.user && m.user.role === "CUSTOMER" && m.user.isActive !== false)
    .map((m) => m.user)
    .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
}

/** Copy task.assignee_id into the join table for seed / import rows. */
export async function backfillPrimaryAssignees(): Promise<void> {
  await db.execute(sql`
    INSERT INTO "task_assignee" ("task_id", "user_id", "source")
    SELECT "id", "assignee_id", 'MANUAL'
    FROM "task"
    WHERE "assignee_id" IS NOT NULL
    ON CONFLICT DO NOTHING
  `);
}
