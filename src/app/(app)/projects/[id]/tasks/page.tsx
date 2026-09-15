import { and, eq, ne, asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { phases, tasks, users, fileAssets, taskChecklistItems } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess } from "@/lib/authz";
import { ProjectTaskBoard, type ProjectTaskListItem } from "@/components/project-task-list";
import { orderTasksForNesting } from "@/lib/task-tree";
import { resolveTaskDescription } from "@/lib/task-description";
import type { TaskActionAsset } from "@/lib/playbook-resources";
import type { ChecklistItemView } from "@/components/task-checklist";

export const dynamic = "force-dynamic";

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default async function ProjectTasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaff();
  await assertProjectAccess(actor, id);

  const [projectPhases, allTasks, staff] = await Promise.all([
    db.query.phases.findMany({
      where: eq(phases.projectId, id),
      orderBy: [asc(phases.order)],
    }),
    db.query.tasks.findMany({
      where: eq(tasks.projectId, id),
      orderBy: [asc(tasks.order), asc(tasks.dueDate)],
      with: { assignee: { columns: { id: true, name: true, image: true } } },
    }),
    db.query.users.findMany({
      where: and(eq(users.isActive, true), ne(users.role, "CUSTOMER")),
      columns: { id: true, name: true },
      orderBy: [asc(users.name)],
    }),
  ]);

  const taskIds = allTasks.map((t) => t.id);
  const [attachmentRows, checklistRows] = await Promise.all([
    taskIds.length
      ? db.query.fileAssets.findMany({
          where: eq(fileAssets.projectId, id),
          columns: {
            id: true,
            taskId: true,
            kind: true,
            name: true,
            url: true,
            libraryAssetId: true,
          },
        })
      : Promise.resolve([]),
    taskIds.length
      ? db.query.taskChecklistItems.findMany({
          where: inArray(taskChecklistItems.taskId, taskIds),
          orderBy: [asc(taskChecklistItems.order)],
        })
      : Promise.resolve([]),
  ]);

  const assetsByTaskId: Record<string, TaskActionAsset[]> = {};
  for (const a of attachmentRows) {
    if (!a.taskId) continue;
    const list = assetsByTaskId[a.taskId] ?? [];
    list.push({
      id: a.id,
      kind: a.kind,
      name: a.name,
      url: a.url,
      libraryAssetId: a.libraryAssetId,
    });
    assetsByTaskId[a.taskId] = list;
  }

  const checklistByTaskId: Record<string, ChecklistItemView[]> = {};
  for (const c of checklistRows) {
    const list = checklistByTaskId[c.taskId] ?? [];
    list.push({
      id: c.id,
      label: c.label,
      done: c.done,
      visibility: c.visibility,
    });
    checklistByTaskId[c.taskId] = list;
  }

  const byPhase = new Map<string | null, typeof allTasks>();
  for (const t of allTasks) {
    const key = t.phaseId ?? null;
    if (!byPhase.has(key)) byPhase.set(key, []);
    byPhase.get(key)!.push(t);
  }

  function toItems(rows: typeof allTasks): ProjectTaskListItem[] {
    return orderTasksForNesting(rows).map((t) => {
      const checks = checklistByTaskId[t.id] ?? [];
      return {
        id: t.id,
        projectId: id,
        title: t.title,
        description: resolveTaskDescription(t.title, t.description, {
          stripChecklist: checks.length > 0,
        }),
        status: t.status,
        priority: t.priority,
        visibility: t.visibility,
        ownerSide: t.ownerSide,
        dueDate: iso(t.dueDate),
        completedAt: iso(t.completedAt),
        assignee: t.assignee,
        assigneeId: t.assigneeId,
        notApplicable: t.notApplicable,
        workTrack: t.workTrack,
        parentTaskId: t.parentTaskId,
        depth: t.depth,
        phaseId: t.phaseId,
        order: t.order,
      };
    });
  }

  const phaseBlocks = projectPhases.map((phase) => ({
    id: phase.id,
    name: phase.name,
    visibility: phase.visibility,
    notApplicable: phase.notApplicable,
    workTrack: phase.workTrack,
    dueDate: iso(phase.dueDate),
    tasks: toItems(byPhase.get(phase.id) ?? []),
  }));

  return (
    <ProjectTaskBoard
      projectId={id}
      currentUserId={actor.id}
      defaultAssigneeId={actor.id}
      staff={staff}
      phases={phaseBlocks}
      unphased={toItems(byPhase.get(null) ?? [])}
      assetsByTaskId={assetsByTaskId}
      checklistByTaskId={checklistByTaskId}
    />
  );
}
