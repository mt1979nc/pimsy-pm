/**
 * Portal data access. Every function here is written for a CUSTOMER actor and
 * filters on BOTH the customer account and `visibility = SHARED`. Nothing in
 * the portal should query the database except through this module.
 */

import { and, eq, ne, asc, desc, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks, phases, milestones, statusUpdates, fileAssets } from "@/db/schema";
import type { Actor } from "./authz";

export type CustomerActor = Actor & { customerAccountId: string };

/** Every project this contact may open. */
export async function portalProjects(actor: CustomerActor) {
  return db.query.projects.findMany({
    where: and(
      eq(projects.customerAccountId, actor.customerAccountId),
      eq(projects.portalEnabled, true),
      isNull(projects.archivedAt),
    ),
    orderBy: [asc(projects.targetGoLiveDate)],
    with: {
      lead: { columns: { id: true, name: true, image: true, email: true, title: true } },
    },
  });
}

async function portalProjectIds(actor: CustomerActor) {
  const rows = await portalProjects(actor);
  return rows.map((r) => r.id);
}

/** Open action items assigned to the customer's side, across their projects. */
export async function portalActionItems(actor: CustomerActor) {
  const ids = await portalProjectIds(actor);
  if (ids.length === 0) return [];
  return db.query.tasks.findMany({
    where: and(
      inArray(tasks.projectId, ids),
      eq(tasks.ownerSide, "CUSTOMER"),
      eq(tasks.visibility, "SHARED"),
      ne(tasks.status, "CANCELLED"),
    ),
    orderBy: [asc(tasks.dueDate)],
    with: { project: { columns: { id: true, name: true } } },
  });
}

/** Shared phases with their shared tasks, for one project. */
export async function portalPlan(actor: CustomerActor, projectId: string) {
  const ids = await portalProjectIds(actor);
  if (!ids.includes(projectId)) return { phases: [], looseTasks: [] };

  const rows = await db.query.phases.findMany({
    where: and(eq(phases.projectId, projectId), eq(phases.visibility, "SHARED")),
    orderBy: [asc(phases.order)],
    with: {
      tasks: {
        where: and(eq(tasks.visibility, "SHARED"), ne(tasks.status, "CANCELLED")),
        orderBy: [asc(tasks.order)],
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
  });

  return { phases: rows, looseTasks };
}

/** Lightweight phase list for the tab bar — name/order only, SHARED only. */
export async function portalPhaseTabs(actor: CustomerActor, projectId: string) {
  const ids = await portalProjectIds(actor);
  if (!ids.includes(projectId)) return [];
  return db.query.phases.findMany({
    where: and(eq(phases.projectId, projectId), eq(phases.visibility, "SHARED")),
    orderBy: [asc(phases.order)],
    columns: { id: true, name: true, order: true },
  });
}

/** One SHARED phase with its SHARED tasks, for that phase's own tab. Null if
 *  the phase doesn't exist, isn't SHARED, or belongs to another project. */
export async function portalPhase(actor: CustomerActor, projectId: string, phaseId: string) {
  const ids = await portalProjectIds(actor);
  if (!ids.includes(projectId)) return null;

  const phase = await db.query.phases.findFirst({
    where: and(eq(phases.id, phaseId), eq(phases.projectId, projectId), eq(phases.visibility, "SHARED")),
    with: {
      tasks: {
        where: and(eq(tasks.visibility, "SHARED"), ne(tasks.status, "CANCELLED")),
        orderBy: [asc(tasks.order)],
      },
    },
  });
  return phase ?? null;
}

export async function portalMilestones(actor: CustomerActor, projectId: string) {
  const ids = await portalProjectIds(actor);
  if (!ids.includes(projectId)) return [];
  return db.query.milestones.findMany({
    where: and(eq(milestones.projectId, projectId), eq(milestones.visibility, "SHARED")),
    orderBy: [asc(milestones.order), asc(milestones.dueDate)],
  });
}

export async function portalStatusUpdates(actor: CustomerActor, projectId: string, limit = 6) {
  const ids = await portalProjectIds(actor);
  if (!ids.includes(projectId)) return [];
  return db.query.statusUpdates.findMany({
    where: and(
      eq(statusUpdates.projectId, projectId),
      eq(statusUpdates.visibility, "SHARED"),
    ),
    orderBy: [desc(statusUpdates.publishedAt)],
    limit,
    with: { author: { columns: { id: true, name: true, image: true, title: true } } },
  });
}

export async function portalFiles(actor: CustomerActor, projectId: string) {
  const ids = await portalProjectIds(actor);
  if (!ids.includes(projectId)) return [];
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

/** Shared training-session recordings for one project — the Recordings tab. */
export async function portalRecordings(actor: CustomerActor, projectId: string) {
  const ids = await portalProjectIds(actor);
  if (!ids.includes(projectId)) return [];
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

/** Portal-safe project fetch. Returns null rather than leaking existence. */
export async function portalProject(actor: CustomerActor, projectId: string) {
  const row = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.customerAccountId, actor.customerAccountId),
      eq(projects.portalEnabled, true),
      isNull(projects.archivedAt),
    ),
    with: {
      lead: { columns: { id: true, name: true, image: true, email: true, title: true } },
      customerAccount: { columns: { id: true, name: true } },
    },
  });
  return row ?? null;
}
