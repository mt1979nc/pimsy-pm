/**
 * Playbook paths, optional areas, and materializing a template onto a project.
 *
 * Creating a site copies the chosen template. Later N/A on a live project
 * only flips `notApplicable` on that project's rows — the template is unchanged.
 *
 * Client-safe constants live in playbook-meta.ts so the new-project form
 * does not pull the database into the browser bundle.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  phases,
  projects,
  projectMembers,
  projectTemplates,
  tasks,
  milestones,
  taskChecklistItems,
  templateTaskChecklistItems,
  templateTaskAttachments,
  type PlaybookPath,
  type ProjectMemberRole,
  type WorkTrack,
} from "@/db/schema";
import { dockPlaybookDescriptionForTitle } from "@/db/dock-playbook-copy";
import { recommendPhaseSchedule, scheduleFromOffsets } from "@/lib/project-timeline";
import type { ForecastSectionInput } from "@/lib/project-timeline";
import { canonicalStaffingRole } from "@/lib/staffing";
import { insertTaskAssigneeRows, newTaskAssigneeIds } from "@/lib/task-assignees";
import { refreshProjectCounters } from "@/lib/rollup";
import { syncMilestonesFromTaskCompletion } from "@/lib/milestone-rollup";
import { copyLibraryAssetToTask, ensureDefaultAttachmentsOnTask } from "@/lib/template-attachments";
import {
  PLAYBOOK_PATHS,
  PLAYBOOK_PATH_META,
  OPTIONAL_AREA_CATALOG,
  optionalAreaLabel,
  shouldIncludeByArea,
  normalizeOverlapTitle,
} from "@/lib/playbook-meta";

export {
  PLAYBOOK_PATHS,
  PLAYBOOK_PATH_META,
  OPTIONAL_AREA_CATALOG,
  optionalAreaLabel,
  shouldIncludeByArea,
  normalizeOverlapTitle,
  normalizeAreaKey,
  collectTemplateAreaRows,
  uniqueTemplateCode,
  suggestedCopyName,
  orderTemplateTasksForClone,
  isActiveWork,
} from "@/lib/playbook-meta";

export type LoadedTemplate = {
  id: string;
  name: string;
  durationDays: number;
  playbookPath: PlaybookPath | null;
  code: string | null;
  phases: Array<{
    id: string;
    name: string;
    description: string | null;
    order: number;
    visibility: "INTERNAL" | "SHARED";
    offsetDays: number;
    durationDays: number;
    isOptional: boolean;
    areaKey: string | null;
    workTrack: WorkTrack;
    tasks: Array<{
      id: string;
      parentTaskId: string | null;
      title: string;
      description: string | null;
      order: number;
      priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      visibility: "INTERNAL" | "SHARED";
      ownerSide: "INTERNAL" | "CUSTOMER";
      offsetDays: number;
      durationDays: number;
      estimateHours: number | null;
      isOptional: boolean;
      areaKey: string | null;
      defaultRole: ProjectMemberRole | null;
      workTrack: WorkTrack;
      overlapKey: string | null;
    }>;
  }>;
  milestones: Array<{
    name: string;
    description: string | null;
    order: number;
    offsetDays: number;
    visibility: "INTERNAL" | "SHARED";
    isGoLive: boolean;
  }>;
};

export type RoleAssignments = Record<string, string>;

export async function loadTemplateById(id: string): Promise<LoadedTemplate | null> {
  const row = await db.query.projectTemplates.findFirst({
    where: eq(projectTemplates.id, id),
    with: {
      phases: { with: { tasks: true }, orderBy: (p, { asc }) => [asc(p.order)] },
      milestones: { orderBy: (m, { asc }) => [asc(m.order)] },
    },
  });
  return row ? (row as LoadedTemplate) : null;
}

export async function resolveTemplatesForPath(path: PlaybookPath): Promise<LoadedTemplate[]> {
  const meta = PLAYBOOK_PATH_META[path];
  const byCode = await db.query.projectTemplates.findFirst({
    where: eq(projectTemplates.code, meta.code),
    with: {
      phases: { with: { tasks: true }, orderBy: (p, { asc }) => [asc(p.order)] },
      milestones: { orderBy: (m, { asc }) => [asc(m.order)] },
    },
  });
  if (byCode) return [byCode as LoadedTemplate];

  for (const name of meta.fallbackNames) {
    const byName = await db.query.projectTemplates.findFirst({
      where: eq(projectTemplates.name, name),
      with: {
        phases: { with: { tasks: true }, orderBy: (p, { asc }) => [asc(p.order)] },
        milestones: { orderBy: (m, { asc }) => [asc(m.order)] },
      },
    });
    if (byName) return [byName as LoadedTemplate];
  }

  // Compose EHR + RCM when the combined template has not been reseeded yet.
  if (path === "EHR_RCM") {
    const parts: LoadedTemplate[] = [];
    for (const other of ["EHR", "RCM_LEGACY"] as const) {
      const found = await resolveTemplatesForPath(other);
      parts.push(...found);
    }
    return parts;
  }

  return [];
}

export function collectOptionalAreas(templates: LoadedTemplate[]): {
  key: string;
  label: string;
  hint: string;
  taskCount: number;
}[] {
  const counts = new Map<string, number>();
  for (const tpl of templates) {
    for (const phase of tpl.phases) {
      if (phase.isOptional && phase.areaKey) {
        counts.set(phase.areaKey, (counts.get(phase.areaKey) ?? 0) + phase.tasks.length);
      }
      for (const task of phase.tasks) {
        if (task.isOptional && task.areaKey && !(phase.isOptional && phase.areaKey === task.areaKey)) {
          counts.set(task.areaKey, (counts.get(task.areaKey) ?? 0) + 1);
        }
      }
    }
  }
  return [...counts.entries()]
    .map(([key, taskCount]) => ({
      key,
      label: optionalAreaLabel(key),
      hint: OPTIONAL_AREA_CATALOG[key]?.hint ?? "",
      taskCount,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function materializeTemplatesOnProject(opts: {
  tx: Tx;
  projectId: string;
  templates: LoadedTemplate[];
  actorId: string;
  start: Date;
  scaleFactor: number;
  excludedAreaKeys: readonly string[];
  roleAssignments: RoleAssignments;
  defaultInternalAssigneeId: string | null;
  /** When adding an RCM track onto an existing site, start phase order after current max. */
  orderOffset?: number;
  forceWorkTrack?: WorkTrack;
  skipUsFederalHolidays?: boolean;
  forecastProjection?: ForecastSectionInput | null;
  /** Holiday-aware projected go-live; used for the isGoLive milestone. */
  goLive?: Date | null;
}): Promise<{ phaseCount: number; taskCount: number; skipped: number }> {
  const excluded = opts.excludedAreaKeys;
  const skipUsFederalHolidays = opts.skipUsFederalHolidays ?? true;
  let phaseCount = 0;
  let taskCount = 0;
  let skipped = 0;
  let phaseOrderBase = opts.orderOffset ?? 0;

  for (const template of opts.templates) {
    const orderedPhases = [...template.phases].sort((a, b) => a.order - b.order);
    const includedPhaseRows = orderedPhases.filter((tp) => shouldIncludeByArea(tp, excluded));
    const phaseDates = recommendPhaseSchedule({
      phases: includedPhaseRows.map((tp) => ({
        name: tp.name,
        offsetDays: tp.offsetDays,
        durationDays: tp.durationDays,
      })),
      kickoff: opts.start,
      scaleFactor: opts.scaleFactor,
      forecast: opts.forecastProjection ?? null,
      skipUsFederalHolidays,
    });
    for (const tp of orderedPhases) {
      if (!shouldIncludeByArea(tp, excluded)) {
        skipped += tp.tasks.length;
        continue;
      }
      const includedTasks = [...tp.tasks]
        .sort((a, b) => a.order - b.order)
        .filter((tt) => {
          if (!shouldIncludeByArea(tt, excluded)) {
            skipped += 1;
            return false;
          }
          return true;
        });

      const scheduled = phaseDates.get(tp.name) ?? scheduleFromOffsets({
        anchor: opts.start,
        offsetDays: tp.offsetDays,
        durationDays: tp.durationDays,
        scaleFactor: opts.scaleFactor,
        skipUsFederalHolidays,
        minDate: opts.start,
      });
      const phaseStart = scheduled.startDate;
      const phaseDue = scheduled.dueDate;
      const [phase] = await opts.tx
        .insert(phases)
        .values({
          projectId: opts.projectId,
          name: tp.name,
          description: tp.description,
          order: phaseOrderBase + tp.order,
          visibility: tp.visibility,
          startDate: phaseStart,
          dueDate: phaseDue,
          workTrack: opts.forceWorkTrack ?? tp.workTrack ?? "EHR",
          areaKey: tp.areaKey,
        })
        .returning({ id: phases.id });

      phaseCount += 1;
      const templateIdToTaskId = new Map<string, string>();
      const parents = includedTasks.filter((tt) => !tt.parentTaskId);
      const children = includedTasks.filter((tt) => tt.parentTaskId);
      for (const tt of [...parents, ...children]) {
        const { startDate: taskStart, dueDate: taskDue } = scheduleFromOffsets({
          anchor: phaseStart,
          offsetDays: tt.offsetDays,
          durationDays: tt.durationDays,
          scaleFactor: opts.scaleFactor,
          skipUsFederalHolidays,
          minDate: opts.start,
        });
        const parentLiveId = tt.parentTaskId ? (templateIdToTaskId.get(tt.parentTaskId) ?? null) : null;
        const assigneeIds = newTaskAssigneeIds({
          task: {
            title: tt.title,
            ownerSide: tt.ownerSide,
            defaultRole: tt.defaultRole,
            overlapKey: tt.overlapKey,
            areaKey: tt.areaKey,
          },
          phaseName: tp.name,
          roleAssignments: opts.roleAssignments,
          fallbackLeadId: opts.defaultInternalAssigneeId,
        });
        const assigneeId = assigneeIds[0] ?? null;
        const [created] = await opts.tx
          .insert(tasks)
          .values({
            projectId: opts.projectId,
            phaseId: phase.id,
            parentTaskId: parentLiveId,
            title: tt.title,
            description: tt.description?.trim() || dockPlaybookDescriptionForTitle(tt.title),
            priority: tt.priority,
            visibility: tt.ownerSide === "CUSTOMER" ? ("SHARED" as const) : tt.visibility,
            ownerSide: tt.ownerSide,
            order: tt.order,
            startDate: taskStart,
            dueDate: taskDue,
            estimateHours: tt.estimateHours,
            assigneeId,
            createdById: opts.actorId,
            workTrack: opts.forceWorkTrack ?? tt.workTrack ?? "EHR",
            defaultRole: tt.defaultRole,
            overlapKey: tt.overlapKey,
            areaKey: tt.areaKey,
          })
          .returning({ id: tasks.id });
        templateIdToTaskId.set(tt.id, created.id);
        taskCount += 1;
        if (assigneeIds.length > 0) {
          await insertTaskAssigneeRows(opts.tx, {
            taskId: created.id,
            userIds: assigneeIds,
            actorId: opts.actorId,
            source: "AUTO_ROLE",
          });
        }

        const checklist = await opts.tx.query.templateTaskChecklistItems.findMany({
          where: eq(templateTaskChecklistItems.templateTaskId, tt.id),
          orderBy: (c, { asc }) => [asc(c.order)],
        });
        if (checklist.length > 0) {
          await opts.tx.insert(taskChecklistItems).values(
            checklist.map((c) => ({
              taskId: created.id,
              label: c.label,
              order: c.order,
              visibility: c.visibility,
              done: false,
            })),
          );
        }
        const defaults = await opts.tx.query.templateTaskAttachments.findMany({
          where: eq(templateTaskAttachments.templateTaskId, tt.id),
        });
        for (const att of defaults) {
          await copyLibraryAssetToTask(opts.tx, {
            taskId: created.id,
            projectId: opts.projectId,
            libraryAssetId: att.libraryAssetId,
            uploadedById: opts.actorId,
          });
        }
        // Catalog fallback: even if template_task_attachment rows are missing,
        // Discovery Wizard / billing sheets still land on the matching title.
        await ensureDefaultAttachmentsOnTask(opts.tx, {
          taskId: created.id,
          projectId: opts.projectId,
          title: tt.title,
          uploadedById: opts.actorId,
        });
      }
    }

    if (template.milestones.length > 0) {
      const existingMs = await opts.tx.query.milestones.findMany({
        where: eq(milestones.projectId, opts.projectId),
        columns: { order: true },
      });
      const msOffset = existingMs.reduce((m, row) => Math.max(m, row.order), -1) + 1;
      await opts.tx.insert(milestones).values(
        template.milestones.map((tm, i) => {
          const { startDate: msDue } = scheduleFromOffsets({
            anchor: opts.start,
            offsetDays: tm.offsetDays,
            durationDays: 0,
            scaleFactor: opts.scaleFactor,
            skipUsFederalHolidays,
            minDate: opts.start,
          });
          return {
            projectId: opts.projectId,
            name: tm.name,
            description: tm.description,
            order: msOffset + (tm.order ?? i),
            visibility: tm.visibility,
            isGoLive: tm.isGoLive,
            dueDate: tm.isGoLive && opts.goLive ? opts.goLive : msDue,
          };
        }),
      );
    }

    phaseOrderBase += orderedPhases.length;
  }

  return { phaseCount, taskCount, skipped };
}

export async function applyRoleMemberships(opts: {
  tx: Tx;
  projectId: string;
  roleAssignments: RoleAssignments;
  leadId: string | null;
}): Promise<void> {
  const seen = new Set<string>();
  if (opts.leadId) {
    await opts.tx
      .insert(projectMembers)
      .values({ projectId: opts.projectId, userId: opts.leadId, role: "LEAD" })
      .onConflictDoNothing();
    seen.add(opts.leadId);
  }

  for (const [role, userId] of Object.entries(opts.roleAssignments)) {
    if (!userId) continue;
    const stored = (canonicalStaffingRole(role) ?? role) as ProjectMemberRole;
    if (seen.has(userId)) {
      // Already the lead — keep LEAD, do not downgrade.
      continue;
    }
    await opts.tx
      .insert(projectMembers)
      .values({ projectId: opts.projectId, userId, role: stored })
      .onConflictDoNothing();
    seen.add(userId);
  }
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeOverlapTitle(a);
  const nb = normalizeOverlapTitle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export const RCM_TRACK_ALREADY_PRESENT = "This project already has an RCM track.";

function projectHasRcmTrack(
  playbookPath: PlaybookPath | null | undefined,
  taskRows: { workTrack: string }[],
): boolean {
  return playbookPath === "RCM_PRISM" || taskRows.some((t) => t.workTrack === "RCM");
}

/**
 * Path 4: add RCM work to an existing EHR site, auto-complete overlapping
 * standard-implementation tasks, reactivate if needed, keep EHR dates.
 */
export async function addRcmTrackToProject(opts: {
  projectId: string;
  actorId: string;
  templates: LoadedTemplate[];
  excludedAreaKeys: readonly string[];
  roleAssignments: RoleAssignments;
  rcmStart: Date;
  rcmTargetGoLive: Date | null;
  scaleFactor: number;
  skipUsFederalHolidays?: boolean;
}): Promise<{ addedTasks: number; autoCompleted: number }> {
  const existing = await db.query.projects.findFirst({
    where: eq(projects.id, opts.projectId),
    columns: {
      id: true,
      status: true,
      startDate: true,
      initialGoLiveDate: true,
      targetGoLiveDate: true,
      playbookPath: true,
      rcmStartedAt: true,
    },
  });
  if (!existing) throw new Error("Project not found.");

  const existingPhases = await db.query.phases.findMany({
    where: eq(phases.projectId, opts.projectId),
    columns: { order: true },
  });
  const orderOffset = existingPhases.reduce((m, p) => Math.max(m, p.order), -1) + 1;

  const existingTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, opts.projectId),
    columns: {
      id: true,
      title: true,
      status: true,
      overlapKey: true,
      workTrack: true,
      notApplicable: true,
    },
  });

  if (projectHasRcmTrack(existing.playbookPath, existingTasks)) {
    throw new Error(RCM_TRACK_ALREADY_PRESENT);
  }

  let autoCompleted = 0;
  const result = await db.transaction(async (tx) => {
    const materialized = await materializeTemplatesOnProject({
      tx,
      projectId: opts.projectId,
      templates: opts.templates,
      actorId: opts.actorId,
      start: opts.rcmStart,
      scaleFactor: opts.scaleFactor,
      excludedAreaKeys: opts.excludedAreaKeys,
      roleAssignments: opts.roleAssignments,
      defaultInternalAssigneeId: opts.roleAssignments.RCM_IMPLEMENTATION_SPECIALIST
        ?? opts.roleAssignments.RCM
        ?? opts.roleAssignments.IMPLEMENTATION_SPECIALIST
        ?? null,
      orderOffset,
      forceWorkTrack: "RCM",
      skipUsFederalHolidays: opts.skipUsFederalHolidays,
      goLive: opts.rcmTargetGoLive,
    });

    await applyRoleMemberships({
      tx,
      projectId: opts.projectId,
      roleAssignments: opts.roleAssignments,
      leadId: null,
    });

    const newRcmTasks = await tx.query.tasks.findMany({
      where: and(eq(tasks.projectId, opts.projectId), eq(tasks.workTrack, "RCM")),
      columns: { id: true, title: true, overlapKey: true, status: true },
    });

    const completeIds = new Set<string>();
    for (const rcm of newRcmTasks) {
      const match = existingTasks.find((ehr) => {
        if (ehr.notApplicable) return false;
        if (ehr.workTrack === "RCM") return false;
        if (rcm.overlapKey && ehr.overlapKey && rcm.overlapKey === ehr.overlapKey) return true;
        if (rcm.overlapKey && ehr.overlapKey) return false;
        return titlesMatch(rcm.title, ehr.title);
      });
      if (!match) continue;
      if (match.status !== "DONE" && match.status !== "CANCELLED") {
        completeIds.add(match.id);
      }
      // Overlapping RCM item is already covered by the EHR implementation.
      completeIds.add(rcm.id);
    }

    if (completeIds.size > 0) {
      await tx
        .update(tasks)
        .set({ status: "DONE", completedAt: new Date(), updatedAt: new Date() })
        .where(inArray(tasks.id, [...completeIds]));
      autoCompleted = completeIds.size;
    }

    const nextStatus =
      existing.status === "COMPLETED" || existing.status === "CANCELLED" || existing.status === "ON_HOLD"
        ? "IN_PROGRESS"
        : existing.status === "NOT_STARTED"
          ? "IN_PROGRESS"
          : existing.status;

    await tx
      .update(projects)
      .set({
        playbookPath: "RCM_PRISM",
        sourceProjectId: opts.projectId,
        rcmStartedAt: existing.rcmStartedAt ?? opts.rcmStart,
        rcmTargetGoLiveDate: opts.rcmTargetGoLive,
        status: nextStatus,
        // EHR timeline fields are intentionally not touched.
        updatedAt: new Date(),
      })
      .where(eq(projects.id, opts.projectId));

    return materialized;
  });

  await refreshProjectCounters(opts.projectId);
  await syncMilestonesFromTaskCompletion(opts.projectId);
  return { addedTasks: result.taskCount, autoCompleted };
}

export function parseExcludedAreaKeys(formData: FormData): string[] {
  const raw = formData.get("excludedAreaKeys")?.toString();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
    } catch {
      /* fall through */
    }
  }
  const included = new Set(
    formData
      .getAll("includeArea")
      .map((v) => String(v))
      .filter(Boolean),
  );
  const known = formData
    .getAll("optionalArea")
    .map((v) => String(v))
    .filter(Boolean);
  if (known.length === 0) return [];
  return known.filter((key) => !included.has(key));
}

export function parseRoleAssignments(formData: FormData): RoleAssignments {
  const out: RoleAssignments = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("roleAssignment:")) continue;
    const role = key.slice("roleAssignment:".length);
    const userId = String(value);
    if (role && userId) out[role] = userId;
  }
  return out;
}

/** Parse a playbook path from form input; ignore unknown values. */
export function parsePlaybookPath(raw: string | undefined | null): PlaybookPath | null {
  if (!raw) return null;
  return PLAYBOOK_PATHS.includes(raw as PlaybookPath) ? (raw as PlaybookPath) : null;
}

export async function setPhaseNotApplicable(phaseId: string, notApplicable: boolean) {
  const phase = await db.query.phases.findFirst({
    where: eq(phases.id, phaseId),
    columns: { id: true, projectId: true, name: true },
  });
  if (!phase) return null;
  await db.transaction(async (tx) => {
    await tx
      .update(phases)
      .set({ notApplicable, status: notApplicable ? "SKIPPED" : "NOT_STARTED", updatedAt: new Date() })
      .where(eq(phases.id, phaseId));
    await tx
      .update(tasks)
      .set({ notApplicable, updatedAt: new Date() })
      .where(eq(tasks.phaseId, phaseId));
  });
  await refreshProjectCounters(phase.projectId);
  await syncMilestonesFromTaskCompletion(phase.projectId);
  return phase;
}

export async function setTaskNotApplicable(taskId: string, notApplicable: boolean) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { id: true, projectId: true, title: true, parentTaskId: true },
  });
  if (!task) return null;
  const ids = [task.id];
  const children = await db.query.tasks.findMany({
    where: eq(tasks.parentTaskId, task.id),
    columns: { id: true },
  });
  ids.push(...children.map((c) => c.id));
  await db
    .update(tasks)
    .set({ notApplicable, updatedAt: new Date() })
    .where(inArray(tasks.id, ids));
  await refreshProjectCounters(task.projectId);
  await syncMilestonesFromTaskCompletion(task.projectId);
  return task;
}

