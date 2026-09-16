/**
 * Duplicate a playbook (phases, nested tasks, training checklists, default
 * attachments, milestones) into a new custom template. Does not rewrite live
 * projects and does not copy playbookPath — the four site-creation paths stay
 * unique. Rename the copy in the editor if you want a fifth path later.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  projectTemplates,
  templateMilestones,
  templatePhases,
  templateTaskAttachments,
  templateTaskChecklistItems,
  templateTasks,
} from "@/db/schema";
import { orderTemplateTasksForClone, suggestedCopyName, uniqueTemplateCode } from "@/lib/playbook-meta";

export type CloneTemplateResult = {
  id: string;
  name: string;
  code: string;
  phaseCount: number;
  taskCount: number;
};

export async function cloneProjectTemplate(opts: {
  sourceId: string;
  name?: string;
}): Promise<CloneTemplateResult> {
  const source = await db.query.projectTemplates.findFirst({
    where: eq(projectTemplates.id, opts.sourceId),
    with: {
      phases: {
        with: {
          tasks: {
            with: {
              checklistItems: true,
              defaultAttachments: true,
            },
          },
        },
        orderBy: (p, { asc }) => [asc(p.order)],
      },
      milestones: { orderBy: (m, { asc }) => [asc(m.order)] },
    },
  });
  if (!source) throw new Error("Template not found.");

  const existing = await db.query.projectTemplates.findMany({
    columns: { code: true, name: true },
  });
  const name = (opts.name?.trim() || suggestedCopyName(source.name)).slice(0, 200);
  const code = uniqueTemplateCode(source.code ?? source.name, existing.map((t) => t.code ?? ""));

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(projectTemplates)
      .values({
        name,
        description: source.description,
        type: source.type,
        isActive: false,
        durationDays: source.durationDays,
        code,
        playbookPath: null,
        isLocked: false,
      })
      .returning({ id: projectTemplates.id });

    let taskCount = 0;
    for (const phase of [...source.phases].sort((a, b) => a.order - b.order)) {
      const [newPhase] = await tx
        .insert(templatePhases)
        .values({
          templateId: created.id,
          name: phase.name,
          description: phase.description,
          order: phase.order,
          visibility: phase.visibility,
          offsetDays: phase.offsetDays,
          durationDays: phase.durationDays,
          isOptional: phase.isOptional,
          areaKey: phase.areaKey,
          workTrack: phase.workTrack,
        })
        .returning({ id: templatePhases.id });

      const idMap = new Map<string, string>();
      for (const task of orderTemplateTasksForClone(phase.tasks)) {
        const [newTask] = await tx
          .insert(templateTasks)
          .values({
            phaseId: newPhase.id,
            parentTaskId: task.parentTaskId ? (idMap.get(task.parentTaskId) ?? null) : null,
            title: task.title,
            description: task.description,
            order: task.order,
            priority: task.priority,
            visibility: task.visibility,
            ownerSide: task.ownerSide,
            offsetDays: task.offsetDays,
            durationDays: task.durationDays,
            estimateHours: task.estimateHours,
            isOptional: task.isOptional,
            areaKey: task.areaKey,
            defaultRole: task.defaultRole,
            workTrack: task.workTrack,
            overlapKey: task.overlapKey,
            connectKey: task.connectKey,
          })
          .returning({ id: templateTasks.id });
        idMap.set(task.id, newTask.id);
        taskCount += 1;

        if (task.checklistItems.length > 0) {
          await tx.insert(templateTaskChecklistItems).values(
            task.checklistItems.map((c) => ({
              templateTaskId: newTask.id,
              label: c.label,
              order: c.order,
              visibility: c.visibility,
            })),
          );
        }
        if (task.defaultAttachments.length > 0) {
          await tx.insert(templateTaskAttachments).values(
            task.defaultAttachments.map((a) => ({
              templateTaskId: newTask.id,
              libraryAssetId: a.libraryAssetId,
            })),
          );
        }
      }
    }

    if (source.milestones.length > 0) {
      await tx.insert(templateMilestones).values(
        source.milestones.map((m) => ({
          templateId: created.id,
          name: m.name,
          description: m.description,
          order: m.order,
          offsetDays: m.offsetDays,
          visibility: m.visibility,
          isGoLive: m.isGoLive,
        })),
      );
    }

    return {
      id: created.id,
      name,
      code,
      phaseCount: source.phases.length,
      taskCount,
    };
  });
}
