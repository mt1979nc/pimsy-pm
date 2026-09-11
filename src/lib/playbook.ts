/**
 * Playbook paths, optional areas, and materializing a template onto a project.
 *
 * Creating a site copies the chosen template. Later N/A on a live project
 * only flips `notApplicable` on that project's rows — the template is unchanged.
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
  type PlaybookPath,
  type ProjectMemberRole,
  type WorkTrack,
} from "@/db/schema";
import { scheduleFromOffsets } from "@/lib/project-timeline";
import { resolveAssigneeForRole, canonicalStaffingRole } from "@/lib/staffing";
import { refreshProjectCounters } from "@/lib/rollup";

export const PLAYBOOK_PATHS: PlaybookPath[] = ["EHR", "EHR_RCM", "RCM_LEGACY", "RCM_PRISM"];

export const PLAYBOOK_PATH_META: Record<
  PlaybookPath,
  { title: string; subtitle: string; code: string; fallbackNames: string[] }
> = {
  EHR: {
    title: "EHR Implementation only",
    subtitle: "Full PIMSY implementation playbook — kickoff through post-go-live.",
    code: "ehr",
    fallbackNames: ["PIMSY Implementation"],
  },
  EHR_RCM: {
    title: "EHR + RCM",
    subtitle: "Standard implementation plus the RCM onboarding track on the same site.",
    code: "ehr_rcm",
    fallbackNames: ["EHR + RCM Implementation"],
  },
  RCM_LEGACY: {
    title: "Existing EHR + RCM Legacy (No Prism data)",
    subtitle: "Lite plan: basic overview plus RCM items only. No Prism history to carry forward.",
    code: "rcm_legacy",
    fallbackNames: ["RCM Legacy (No Prism data)", "RCM (Existing Customer)"],
  },
  RCM_PRISM: {
    title: "Existing EHR + RCM (Yes Prism data)",
    subtitle:
      "Add RCM work to an existing site, auto-complete overlapping implementation tasks, and track RCM separately.",
    code: "rcm_prism",
    fallbackNames: ["Existing EHR + RCM (Prism data)"],
  },
};

export const OPTIONAL_AREA_CATALOG: Record<string, { label: string; hint: string }> = {
  data_import: {
    label: "Demographic / data import",
    hint: "Skip when there is no prior-system client import.",
  },
  eprescribe: {
    label: "ePrescribe",
    hint: "DrFirst site account, ID proofing, EPCS and PDMP.",
  },
  inpatient_mat: {
    label: "Inpatient / MAT",
    hint: "Beds, eMAR, inventory, messaging, eFax, labs, EVV.",
  },
  group_notes: {
    label: "Group notes training",
    hint: "Training 4 — only if the practice uses group notes.",
  },
  payroll: {
    label: "Payroll",
    hint: "Payroll training track.",
  },
};

export function optionalAreaLabel(key: string): string {
  return OPTIONAL_AREA_CATALOG[key]?.label ?? key.replaceAll("_", " ");
}

export function shouldIncludeByArea(
  row: { isOptional?: boolean | null; areaKey?: string | null },
  excludedAreaKeys: readonly string[],
): boolean {
  if (!row.isOptional || !row.areaKey) return true;
  return !excludedAreaKeys.includes(row.areaKey);
}

export function normalizeOverlapTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isActiveWork(row: { status: string; notApplicable?: boolean | null }): boolean {
  if (row.notApplicable) return false;
  return row.status !== "DONE" && row.status !== "CANCELLED" && row.status !== "SKIPPED";
}

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
}): Promise<{ phaseCount: number; taskCount: number; skipped: number }> {
  const excluded = opts.excludedAreaKeys;
  let phaseCount = 0;
  let taskCount = 0;
  let skipped = 0;
  let phaseOrderBase = opts.orderOffset ?? 0;

  for (const template of opts.templates) {
    const orderedPhases = [...template.phases].sort((a, b) => a.order - b.order);
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

      const { startDate: phaseStart, dueDate: phaseDue } = scheduleFromOffsets({
        anchor: opts.start,
        offsetDays: tp.offsetDays,
        durationDays: tp.durationDays,
        scaleFactor: opts.scaleFactor,
      });
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
        });
        const parentLiveId = tt.parentTaskId ? (templateIdToTaskId.get(tt.parentTaskId) ?? null) : null;
        const assigneeId = resolveAssigneeForRole(
          tt.defaultRole,
          opts.roleAssignments,
          opts.defaultInternalAssigneeId,
          tt.ownerSide,
        );
        const [created] = await opts.tx
          .insert(tasks)
          .values({
            projectId: opts.projectId,
            phaseId: phase.id,
            parentTaskId: parentLiveId,
            title: tt.title,
            description: tt.description,
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
          });
          return {
            projectId: opts.projectId,
            name: tm.name,
            description: tm.description,
            order: msOffset + (tm.order ?? i),
            visibility: tm.visibility,
            isGoLive: tm.isGoLive,
            dueDate: msDue,
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
  return task;
}

