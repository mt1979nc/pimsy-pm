/**
 * Staff "Customer view" — same SHARED filters as the portal, without requiring
 * a CUSTOMER actor. Callers must assert project access first.
 */
import { and, eq, asc, desc, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  tasks,
  phases,
  milestones,
  statusUpdates,
  fileAssets,
  taskComments,
} from "@/db/schema";
import { isCustomerVisiblePhase, portalFacingTaskSql } from "./task-visibility";

export async function previewPortalProject(projectId: string) {
  return (
    (await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), isNull(projects.archivedAt)),
      with: {
        lead: { columns: { id: true, name: true, image: true, email: true, title: true } },
        customerAccount: { columns: { id: true, name: true } },
      },
    })) ?? null
  );
}

export async function previewPortalPlan(projectId: string) {
  const rows = await db.query.phases.findMany({
    where: and(
      eq(phases.projectId, projectId),
      eq(phases.visibility, "SHARED"),
      eq(phases.notApplicable, false),
    ),
    orderBy: [asc(phases.order)],
    with: {
      tasks: {
        where: portalFacingTaskSql(),
        orderBy: [asc(tasks.order)],
        with: {
          assignee: { columns: { id: true, name: true, image: true, title: true } },
          comments: {
            where: and(eq(taskComments.visibility, "SHARED"), isNull(taskComments.deletedAt)),
            columns: { id: true },
          },
        },
      },
    },
  });

  const looseTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.projectId, projectId),
      isNull(tasks.phaseId),
      portalFacingTaskSql(),
    ),
    orderBy: [asc(tasks.order)],
    with: {
      assignee: { columns: { id: true, name: true, image: true, title: true } },
      comments: {
        where: and(eq(taskComments.visibility, "SHARED"), isNull(taskComments.deletedAt)),
        columns: { id: true },
      },
    },
  });

  return { phases: rows, looseTasks };
}

export async function previewPortalMilestones(projectId: string) {
  return db.query.milestones.findMany({
    where: and(eq(milestones.projectId, projectId), eq(milestones.visibility, "SHARED")),
    orderBy: [asc(milestones.order), asc(milestones.dueDate)],
  });
}

export async function previewPortalStatusUpdates(projectId: string, limit = 6) {
  return db.query.statusUpdates.findMany({
    where: and(eq(statusUpdates.projectId, projectId), eq(statusUpdates.visibility, "SHARED")),
    orderBy: [desc(statusUpdates.publishedAt)],
    limit,
    with: { author: { columns: { id: true, name: true, image: true, title: true } } },
  });
}

export async function previewPortalFiles(projectId: string) {
  return db.query.fileAssets.findMany({
    where: and(
      eq(fileAssets.projectId, projectId),
      eq(fileAssets.visibility, "SHARED"),
      eq(fileAssets.isRecording, false),
    ),
    orderBy: [desc(fileAssets.createdAt)],
    limit: 50,
  });
}

export async function previewPortalRecordings(projectId: string) {
  return db.query.fileAssets.findMany({
    where: and(
      eq(fileAssets.projectId, projectId),
      eq(fileAssets.visibility, "SHARED"),
      eq(fileAssets.isRecording, true),
    ),
    orderBy: [desc(fileAssets.createdAt)],
    limit: 100,
  });
}

export async function previewPortalPhaseTabs(projectId: string) {
  return db.query.phases.findMany({
    where: and(
      eq(phases.projectId, projectId),
      eq(phases.visibility, "SHARED"),
      eq(phases.notApplicable, false),
    ),
    orderBy: [asc(phases.order)],
    columns: { id: true, name: true, order: true },
  });
}

export async function previewPortalPhase(projectId: string, phaseId: string) {
  return (
    (await db.query.phases.findFirst({
      where: and(
        eq(phases.id, phaseId),
        eq(phases.projectId, projectId),
        eq(phases.visibility, "SHARED"),
        eq(phases.notApplicable, false),
      ),
      with: {
        tasks: {
          where: portalFacingTaskSql(),
          orderBy: [asc(tasks.order)],
          with: {
            assignee: { columns: { id: true, name: true, image: true, title: true } },
            comments: {
              where: and(eq(taskComments.visibility, "SHARED"), isNull(taskComments.deletedAt)),
              columns: { id: true },
            },
          },
        },
      },
    })) ?? null
  );
}

export async function previewPortalTask(projectId: string, taskId: string) {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.projectId, projectId), portalFacingTaskSql()),
    with: {
      assignee: { columns: { id: true, name: true, image: true, title: true } },
      phase: { columns: { id: true, name: true, visibility: true, notApplicable: true } },
    },
  });
  if (!task) return null;
  if (!isCustomerVisiblePhase(task.phase)) return null;
  return task;
}

/** SHARED comments the customer (and Customer view) may read on a portal-facing task. */
export async function previewPortalTaskComments(taskId: string) {
  return db.query.taskComments.findMany({
    where: and(
      eq(taskComments.taskId, taskId),
      eq(taskComments.visibility, "SHARED"),
      isNull(taskComments.deletedAt),
    ),
    orderBy: [asc(taskComments.createdAt)],
    with: { author: { columns: { id: true, name: true, image: true, role: true } } },
  });
}

/** SHARED files/links on a portal-facing task (Customer view / portal preview). */
export async function previewPortalTaskAttachments(taskId: string) {
  return db.query.fileAssets.findMany({
    where: and(eq(fileAssets.taskId, taskId), eq(fileAssets.visibility, "SHARED")),
    orderBy: [desc(fileAssets.createdAt)],
    with: { uploadedBy: { columns: { id: true, name: true, image: true } } },
  });
}
