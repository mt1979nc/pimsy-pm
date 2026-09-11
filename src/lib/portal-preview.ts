/**
 * Staff "Customer view" — same SHARED filters as the portal, without requiring
 * a CUSTOMER actor. Callers must assert project access first.
 */
import { and, eq, ne, asc, desc, isNull } from "drizzle-orm";
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
    where: and(eq(phases.projectId, projectId), eq(phases.visibility, "SHARED")),
    orderBy: [asc(phases.order)],
    with: {
      tasks: {
        where: and(eq(tasks.visibility, "SHARED"), ne(tasks.status, "CANCELLED")),
        orderBy: [asc(tasks.order)],
        with: {
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
      eq(tasks.visibility, "SHARED"),
      ne(tasks.status, "CANCELLED"),
    ),
    orderBy: [asc(tasks.order)],
    with: {
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

export async function previewPortalPhaseTabs(projectId: string) {
  return db.query.phases.findMany({
    where: and(eq(phases.projectId, projectId), eq(phases.visibility, "SHARED")),
    orderBy: [asc(phases.order)],
    columns: { id: true, name: true, order: true },
  });
}
