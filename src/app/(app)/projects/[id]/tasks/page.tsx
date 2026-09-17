import { notFound } from "next/navigation";
import { and, eq, ne, asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { phases, projects, tasks, users, fileAssets, taskChecklistItems } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess } from "@/lib/authz";
import { ProjectTaskBoard, type ProjectTaskListItem } from "@/components/project-task-list";
import {
  addRcmEligibility,
  billingRcmAssignmentsFromMembers,
  isHandoffComplete,
} from "@/lib/add-rcm";
import { orderTasksForNesting } from "@/lib/task-tree";
import { resolveTaskDescription } from "@/lib/task-description";
import { connectedKeyOf } from "@/lib/connected-tasks";
import type { TaskActionAsset } from "@/lib/playbook-resources";
import type { ChecklistItemView } from "@/components/task-checklist";
import { loadAssigneesByTaskIds } from "@/lib/task-assignees";
import { resolveProjectBookingUrls } from "@/lib/booking-urls";

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

  const [project, projectPhases, allTasks, staff] = await Promise.all([
    db.query.projects.findFirst({
      where: eq(projects.id, id),
      columns: {
        id: true,
        code: true,
        type: true,
        status: true,
        onboarded: true,
        archivedAt: true,
        playbookPath: true,
        rcmStartedAt: true,
        rcmTargetGoLiveDate: true,
        rcmTaskCountDone: true,
        rcmTaskCountTotal: true,
        bookingUrls: true,
        zoomBookingUrl: true,
      },
      with: {
        members: { columns: { userId: true, role: true } },
        lead: { columns: { zoomBookingUrl: true } },
      },
    }),
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
  if (!project) notFound();

  const taskIds = allTasks.map((t) => t.id);
  const [attachmentRows, checklistRows, assigneesByTask] = await Promise.all([
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
            storageKey: true,
          },
        })
      : Promise.resolve([]),
    taskIds.length
      ? db.query.taskChecklistItems.findMany({
          where: inArray(taskChecklistItems.taskId, taskIds),
          orderBy: [asc(taskChecklistItems.order)],
        })
      : Promise.resolve([]),
    loadAssigneesByTaskIds(taskIds),
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
      hasBlob: Boolean(a.storageKey),
    });
    assetsByTaskId[a.taskId] = list;
  }

  const titleById = new Map(allTasks.map((t) => [t.id, t.title]));
  const checklistByTaskId: Record<string, ChecklistItemView[]> = {};
  for (const c of checklistRows) {
    const list = checklistByTaskId[c.taskId] ?? [];
    const fromTitle = c.carriedFromTaskId ? titleById.get(c.carriedFromTaskId) : null;
    list.push({
      id: c.id,
      label: c.label,
      done: c.done,
      visibility: c.visibility,
      carriedFromLabel: fromTitle ?? null,
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
      const key = connectedKeyOf(t);
      const peers = key
        ? allTasks.filter((other) => other.id !== t.id && connectedKeyOf(other) === key)
        : [];
      const peerPhases = peers
        .map((p) => projectPhases.find((ph) => ph.id === p.phaseId)?.name)
        .filter((n): n is string => Boolean(n));
      const connectedNote =
        peerPhases.length > 0
          ? `Connected · ${[...new Set(peerPhases)].join(", ")}`
          : key && peers.length > 0
            ? "Connected"
            : null;
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
        sessionAt: iso(t.sessionAt),
        completedAt: iso(t.completedAt),
        assignee: t.assignee,
        assignees: assigneesByTask.get(t.id) ?? (t.assignee ? [t.assignee] : []),
        assigneeId: t.assigneeId,
        assigneeIds: (assigneesByTask.get(t.id) ?? []).map((p) => p.id),
        notApplicable: t.notApplicable,
        workTrack: t.workTrack,
        parentTaskId: t.parentTaskId,
        depth: t.depth,
        phaseId: t.phaseId,
        reviewRequired: t.reviewRequired,
        connectKey: t.connectKey,
        connectedNote,
        order: t.order,
        projectCode: project?.code,
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

  const addRcm = addRcmEligibility({
    type: project.type,
    status: project.status,
    onboarded: project.onboarded,
    archivedAt: project.archivedAt,
    playbookPath: project.playbookPath,
    rcmTaskCountTotal: project.rcmTaskCountTotal,
    hasRcmWorkTrack: allTasks.some((t) => t.workTrack === "RCM"),
    handoffComplete: isHandoffComplete(
      projectPhases.map((p) => ({
        name: p.name,
        status: p.status,
        notApplicable: p.notApplicable,
        tasks: (byPhase.get(p.id) ?? []).map((t) => ({
          status: t.status,
          notApplicable: t.notApplicable,
        })),
      })),
    ),
  });

  return (
    <ProjectTaskBoard
      projectId={id}
      currentUserId={actor.id}
      defaultAssigneeId={actor.id}
      staff={staff}
      phases={phaseBlocks}
      unphased={toItems(byPhase.get(null) ?? [])}
      assetsByTaskId={assetsByTaskId}
      bookingUrls={resolveProjectBookingUrls(project ?? {})}
      checklistByTaskId={checklistByTaskId}
      addRcm={
        addRcm.ok
          ? {
              defaultAssignments: billingRcmAssignmentsFromMembers(project.members),
            }
          : null
      }
      rcmSummary={
        !addRcm.ok && addRcm.reason === "already-on"
          ? {
              startedAt: iso(project.rcmStartedAt),
              targetGoLiveDate: iso(project.rcmTargetGoLiveDate),
              taskCountDone: project.rcmTaskCountDone,
              taskCountTotal: project.rcmTaskCountTotal,
            }
          : null
      }
    />
  );
}
