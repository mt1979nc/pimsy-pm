import { notFound } from "next/navigation";
import { inArray, eq, and, asc } from "drizzle-orm";
import { requireCustomer } from "@/lib/guard";
import { portalPhase } from "@/lib/portal";
import { PortalPhaseTaskList } from "@/components/portal-task-list";
import { db } from "@/db";
import { fileAssets } from "@/db/schema";
import { resolveTaskDescription } from "@/lib/task-description";
import type { TaskActionAsset } from "@/lib/playbook-resources";
import { orderTasksForNesting } from "@/lib/task-tree";

export const dynamic = "force-dynamic";

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default async function PortalPhasePage({
  params,
}: {
  params: Promise<{ id: string; phaseId: string }>;
}) {
  const { id, phaseId } = await params;
  const actor = await requireCustomer();

  const phase = await portalPhase(actor, id, phaseId);
  if (!phase) notFound();

  const nested = orderTasksForNesting(phase.tasks);
  const taskIds = nested.map((t) => t.id);
  const attachmentRows = taskIds.length
    ? await db.query.fileAssets.findMany({
        where: and(inArray(fileAssets.taskId, taskIds), eq(fileAssets.visibility, "SHARED")),
        columns: {
          id: true,
          taskId: true,
          kind: true,
          name: true,
          url: true,
          libraryAssetId: true,
          storageKey: true,
        },
        orderBy: [asc(fileAssets.createdAt)],
      })
    : [];

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
      hasBlob: Boolean(a.storageKey),
    });
    assetsByTaskId[a.taskId] = list;
  }

  return (
    <PortalPhaseTaskList
      projectId={id}
      phaseName={phase.name}
      phaseDescription={phase.description}
      assetsByTaskId={assetsByTaskId}
      tasks={nested.map((t) => ({
        id: t.id,
        title: t.title,
        description: resolveTaskDescription(t.title, t.description),
        status: t.status,
        dueDate: iso(t.dueDate),
        ownerSide: t.ownerSide,
        parentTaskId: t.parentTaskId,
        assigneeId: t.assigneeId,
        notApplicable: t.notApplicable,
        assignee: t.assignee,
        commentCount: t.comments?.length ?? 0,
      }))}
    />
  );
}
