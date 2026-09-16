/**
 * Portal data access. Every function here is written for a CUSTOMER actor and
 * filters on BOTH the customer account and `visibility = SHARED`. Specialist
 * nested sub-tasks are omitted even if SHARED — customers see parent status
 * (and customer-owned nested actions) only. Nothing in the portal should query
 * the database except through this module.
 */

import { and, eq, ne, asc, desc, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks, phases, milestones, statusUpdates, fileAssets, taskComments } from "@/db/schema";
import type { Actor } from "./authz";
import { isCustomerVisiblePhase, portalFacingTaskSql } from "./task-visibility";
import { loadProjectAbout } from "./about-query";
import { toPortalAbout } from "./about-profile";
import type { PortalAboutPayload } from "./about-profile";

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
  const rows = await db.query.tasks.findMany({
    where: and(
      inArray(tasks.projectId, ids),
      eq(tasks.ownerSide, "CUSTOMER"),
      eq(tasks.visibility, "SHARED"),
      ne(tasks.status, "CANCELLED"),
      eq(tasks.notApplicable, false),
    ),
    orderBy: [asc(tasks.dueDate)],
    with: {
      project: { columns: { id: true, name: true } },
      phase: { columns: { id: true, name: true, order: true, visibility: true, notApplicable: true } },
      // Only SHARED comments — INTERNAL notes stay invisible to the portal.
      comments: {
        where: and(eq(taskComments.visibility, "SHARED"), isNull(taskComments.deletedAt)),
        columns: { id: true },
      },
    },
  });
  return rows.filter((t) => isCustomerVisiblePhase(t.phase));
}

/** Shared phases with their shared tasks, for one project. */
export async function portalPlan(actor: CustomerActor, projectId: string) {
  const ids = await portalProjectIds(actor);
  if (!ids.includes(projectId)) return { phases: [], looseTasks: [] };

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

/** Lightweight phase list for the tab bar — name/order only, SHARED only. */
export async function portalPhaseTabs(actor: CustomerActor, projectId: string) {
  const ids = await portalProjectIds(actor);
  if (!ids.includes(projectId)) return [];
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

/** One SHARED phase with its SHARED tasks, for that phase's own tab. Null if
 *  the phase doesn't exist, isn't SHARED, or belongs to another project. */
export async function portalPhase(actor: CustomerActor, projectId: string, phaseId: string) {
  const ids = await portalProjectIds(actor);
  if (!ids.includes(projectId)) return null;

  const phase = await db.query.phases.findFirst({
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

/** One SHARED task the customer may open. Null if hidden, internal, or other project. */
export async function portalTask(actor: CustomerActor, projectId: string, taskId: string) {
  const ids = await portalProjectIds(actor);
  if (!ids.includes(projectId)) return null;

  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.projectId, projectId), portalFacingTaskSql()),
    with: {
      assignee: { columns: { id: true, name: true, email: true, image: true, role: true, title: true } },
      phase: { columns: { id: true, name: true, visibility: true, notApplicable: true } },
    },
  });
  if (!task) return null;
  if (!isCustomerVisiblePhase(task.phase)) return null;
  return task;
}

/** Portal-safe About snapshot. HubSpot, CRM key, Prism id, and extras stay off. */
export async function portalAbout(actor: CustomerActor, projectId: string): Promise<PortalAboutPayload | null> {
  const project = await portalProject(actor, projectId);
  if (!project) return null;
  const loaded = await loadProjectAbout(projectId);
  if (!loaded) return null;
  return toPortalAbout({
    projectName: loaded.project.name,
    customerName: loaded.project.customerAccount?.name ?? null,
    crmAcronym: loaded.project.crmAcronym,
    kickoffDate: loaded.project.startDate,
    goLiveDate: loaded.project.targetGoLiveDate,
    zoomBookingUrl: loaded.project.zoomBookingUrl,
    aboutNotes: loaded.project.aboutNotes,
    kickoff: loaded.kickoff,
    implementationTeam: loaded.implementationTeam,
    customerContacts: loaded.customerInputs,
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
