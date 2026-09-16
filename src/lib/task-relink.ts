/**
 * Server-only: persist a live-task move (section + parent). Keep descendants
 * nested under the moved item; they inherit the destination phase.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { phases, tasks } from "@/db/schema";
import { NotFoundError } from "@/lib/authz";
import { resolveTaskMove, type MoveTaskNode } from "@/lib/task-move";

export type AppliedTaskMove = {
  projectId: string;
  title: string;
  fromPhaseId: string | null;
  fromParentTaskId: string | null;
  toPhaseId: string | null;
  toParentTaskId: string | null;
  movedCount: number;
  unchanged: boolean;
};

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

export async function applyTaskMove(input: {
  taskId: string;
  toPhaseId: string | null;
  toParentTaskId: string | null;
}): Promise<AppliedTaskMove> {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, input.taskId),
    columns: {
      id: true,
      projectId: true,
      title: true,
      phaseId: true,
      parentTaskId: true,
      workTrack: true,
    },
  });
  if (!task) throw new NotFoundError("Task not found.");

  const [projectTasks, projectPhases] = await Promise.all([
    db.query.tasks.findMany({
      where: eq(tasks.projectId, task.projectId),
      columns: { id: true, title: true, phaseId: true, parentTaskId: true, workTrack: true },
    }),
    db.query.phases.findMany({
      where: eq(phases.projectId, task.projectId),
      columns: { id: true, workTrack: true },
    }),
  ]);

  const nodes: MoveTaskNode[] = projectTasks.map((t) => ({
    id: t.id,
    title: t.title,
    phaseId: t.phaseId,
    parentTaskId: t.parentTaskId,
  }));

  const resolved = resolveTaskMove({
    taskId: input.taskId,
    toPhaseId: input.toPhaseId,
    toParentTaskId: input.toParentTaskId,
    tasks: nodes,
    phaseIds: new Set(projectPhases.map((p) => p.id)),
  });
  if (!resolved.ok) throw new Error(resolved.error);

  const { phaseId, parentTaskId, movingIds } = resolved.value;
  if (task.phaseId === phaseId && task.parentTaskId === parentTaskId) {
    return {
      projectId: task.projectId,
      title: task.title,
      fromPhaseId: task.phaseId,
      fromParentTaskId: task.parentTaskId,
      toPhaseId: phaseId,
      toParentTaskId: parentTaskId,
      movedCount: movingIds.length,
      unchanged: true,
    };
  }

  const destParent = parentTaskId
    ? projectTasks.find((t) => t.id === parentTaskId)
    : null;
  const destPhase = phaseId ? projectPhases.find((p) => p.id === phaseId) : null;
  const workTrack = destParent?.workTrack ?? destPhase?.workTrack ?? task.workTrack;
  const order = await nextSiblingOrder(task.projectId, phaseId, parentTaskId);
  const descendantIds = movingIds.filter((id) => id !== task.id);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        phaseId,
        parentTaskId,
        order,
        workTrack,
        updatedAt: now,
      })
      .where(eq(tasks.id, task.id));

    if (descendantIds.length > 0) {
      await tx
        .update(tasks)
        .set({
          phaseId,
          workTrack,
          updatedAt: now,
        })
        .where(inArray(tasks.id, descendantIds));
    }
  });

  return {
    projectId: task.projectId,
    title: task.title,
    fromPhaseId: task.phaseId,
    fromParentTaskId: task.parentTaskId,
    toPhaseId: phaseId,
    toParentTaskId: parentTaskId,
    movedCount: movingIds.length,
    unchanged: false,
  };
}
