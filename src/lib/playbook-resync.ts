/**
 * One-time (idempotent) playbook resync: add missing Dock nested tasks /
 * checklists / default attachments / descriptions onto existing WIP projects
 * without wiping completion state or staff-authored notes. Match by
 * normalized title within a phase (catalog pass also matches live title).
 *
 * Dry-run used to hang because each template task issued several sequential
 * queries. This path batch-loads catalogs and live rows, logs progress, and
 * stops at a deadline instead of spinning until Cloud Shell times out.
 * It never calls the Dock API.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  fileAssets,
  phases,
  projects,
  taskChecklistItems,
  tasks,
  templateTaskAttachments,
  templateTaskChecklistItems,
} from "@/db/schema";
import { loadTemplateById, type LoadedTemplate } from "@/lib/playbook";
import { findByPlaybookTitle, normalizeOverlapTitle } from "@/lib/playbook-meta";
import { copyLibraryAssetToTask, ensureDefaultAttachmentsOnTask } from "@/lib/template-attachments";
import { alreadyHasLibraryCoverage, fileCoversLibraryAsset, libraryDefsForTaskTitle } from "@/db/dock-default-attachments";
import { dockPlaybookDescriptionForTitle, shouldReplacePlaybookDescription } from "@/db/dock-playbook-copy";
import { checklistForTaskTitle } from "@/db/dock-training-checklists";
import { scheduleFromOffsets, resolvePlaybookScale } from "@/lib/project-timeline";
import {
  DEFAULT_RESYNC_DEADLINE_MS,
  formatResyncSeconds,
  resyncElapsedMs,
  resyncTimedOut,
} from "@/lib/resync-deadline";

export type ResyncOpts = {
  apply: boolean;
  /** Limit to these project ids or acronyms/codes. Empty = all playbook projects. */
  only?: string[];
  /** Scan at most this many eligible WIP projects (after --only). */
  limit?: number;
  actorId: string | null;
  /** Abort after this many ms. 0 / undefined with useDefaultDeadline=false = no cap. */
  deadlineMs?: number;
  /** When true (CLI default), apply DEFAULT_RESYNC_DEADLINE_MS if deadlineMs omitted. */
  useDefaultDeadline?: boolean;
  onProgress?: (message: string) => void;
};

export type ResyncTaskPlan = {
  projectId: string;
  projectCode: string;
  phaseName: string;
  title: string;
  action: "insert" | "relink-parent" | "add-checklist" | "add-attachment" | "set-description" | "skip";
  detail: string;
  librarySlug?: string;
};

export type ResyncPlan = {
  projectsScanned: number;
  projectsTouched: number;
  rows: ResyncTaskPlan[];
  timedOut: boolean;
  elapsedMs: number;
};

function titleKey(s: string) {
  return normalizeOverlapTitle(s);
}

function wanted(only: string[] | undefined, p: { id: string; code: string; crmAcronym: string | null; prismClientId: string | null }) {
  if (!only || only.length === 0) return true;
  const keys = new Set(only.map((x) => x.trim().toUpperCase()));
  return (
    keys.has(p.id.toUpperCase()) ||
    keys.has(p.code.toUpperCase()) ||
    (p.crmAcronym && keys.has(p.crmAcronym.toUpperCase())) ||
    (p.prismClientId && keys.has(p.prismClientId.toUpperCase()))
  );
}

function deadlineOf(opts: ResyncOpts): number | undefined {
  if (opts.deadlineMs != null) return opts.deadlineMs;
  if (opts.useDefaultDeadline === false) return undefined;
  return DEFAULT_RESYNC_DEADLINE_MS;
}

async function loadAllInChunks<T>(
  ids: string[],
  load: (chunk: string[]) => Promise<T[]>,
  chunkSize = 400,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    out.push(...(await load(ids.slice(i, i + chunkSize))));
  }
  return out;
}

type ChecklistSeed = { templateTaskId: string; label: string; order: number; visibility: "INTERNAL" | "SHARED" };
type AttachmentSeed = { templateTaskId: string; libraryAssetId: string };

export async function planPlaybookResync(opts: ResyncOpts): Promise<ResyncPlan> {
  const startedAt = Date.now();
  const deadlineMs = deadlineOf(opts);
  const log = opts.onProgress ?? (() => undefined);

  log("Loading playbooks…");
  const templates = await db.query.projectTemplates.findMany({
    columns: { id: true, code: true, name: true },
  });
  const byId = new Map<string, LoadedTemplate>();
  for (const t of templates) {
    const loaded = await loadTemplateById(t.id);
    if (loaded) byId.set(t.id, loaded);
  }

  const templateTaskIds = [...byId.values()].flatMap((tpl) => tpl.phases.flatMap((p) => p.tasks.map((tk) => tk.id)));

  log(`Loading ${templateTaskIds.length} template extras (checklists + attachments)…`);
  const [allTemplateChecks, allTemplateAtt, libs] = await Promise.all([
    loadAllInChunks(templateTaskIds, (chunk) =>
      db.query.templateTaskChecklistItems.findMany({
        where: inArray(templateTaskChecklistItems.templateTaskId, chunk),
      }),
    ),
    loadAllInChunks(templateTaskIds, (chunk) =>
      db.query.templateTaskAttachments.findMany({
        where: inArray(templateTaskAttachments.templateTaskId, chunk),
      }),
    ),
    db.query.libraryAssets.findMany(),
  ]);

  const checksByTemplateTask = new Map<string, ChecklistSeed[]>();
  for (const row of allTemplateChecks) {
    const list = checksByTemplateTask.get(row.templateTaskId) ?? [];
    list.push(row);
    checksByTemplateTask.set(row.templateTaskId, list);
  }
  const attByTemplateTask = new Map<string, AttachmentSeed[]>();
  for (const row of allTemplateAtt) {
    const list = attByTemplateTask.get(row.templateTaskId) ?? [];
    list.push(row);
    attByTemplateTask.set(row.templateTaskId, list);
  }
  const libBySlug = new Map(libs.map((l) => [l.slug, l]));
  const libById = new Map(libs.map((l) => [l.id, l]));

  const live = await db.query.projects.findMany({
    columns: {
      id: true,
      code: true,
      name: true,
      templateId: true,
      playbookPath: true,
      crmAcronym: true,
      prismClientId: true,
      startDate: true,
      targetGoLiveDate: true,
      status: true,
    },
  });

  const eligible = live.filter((project) => {
    if (!wanted(opts.only, project)) return false;
    if (project.status === "COMPLETED" || project.status === "CANCELLED") return false;
    const template =
      (project.templateId ? byId.get(project.templateId) : null) ??
      [...byId.values()].find((t) => t.code === "ehr") ??
      null;
    return Boolean(template);
  });
  const capped = typeof opts.limit === "number" && opts.limit > 0 ? eligible.slice(0, opts.limit) : eligible;

  log(`Scanning ${capped.length} WIP project(s)${eligible.length !== capped.length ? ` (of ${eligible.length})` : ""}…`);

  const projectIds = capped.map((p) => p.id);
  const livePhases = await loadAllInChunks(projectIds, (chunk) =>
    db.query.phases.findMany({
      where: inArray(phases.projectId, chunk),
      with: { tasks: true },
    }),
  );
  const phasesByProject = new Map<string, typeof livePhases>();
  for (const phase of livePhases) {
    const list = phasesByProject.get(phase.projectId) ?? [];
    list.push(phase);
    phasesByProject.set(phase.projectId, list);
  }

  const liveTaskIds = livePhases.flatMap((p) => p.tasks.map((t) => t.id));
  log(`Loaded ${livePhases.length} phases / ${liveTaskIds.length} live tasks. Batching extras…`);

  const [allLiveChecks, allLiveFiles] = await Promise.all([
    loadAllInChunks(liveTaskIds, (chunk) =>
      db.query.taskChecklistItems.findMany({
        where: inArray(taskChecklistItems.taskId, chunk),
        columns: { taskId: true, label: true },
      }),
    ),
    loadAllInChunks(projectIds, (chunk) =>
      db.query.fileAssets.findMany({
        where: inArray(fileAssets.projectId, chunk),
        columns: { taskId: true, libraryAssetId: true, kind: true, url: true },
      }),
    ),
  ]);

  const liveCheckLabels = new Map<string, Set<string>>();
  for (const row of allLiveChecks) {
    const set = liveCheckLabels.get(row.taskId) ?? new Set();
    set.add(titleKey(row.label));
    liveCheckLabels.set(row.taskId, set);
  }
  const filesByTask = new Map<string, typeof allLiveFiles>();
  for (const f of allLiveFiles) {
    if (!f.taskId) continue;
    const list = filesByTask.get(f.taskId) ?? [];
    list.push(f);
    filesByTask.set(f.taskId, list);
  }

  const rows: ResyncTaskPlan[] = [];
  let scanned = 0;
  const touched = new Set<string>();
  let timedOut = false;

  for (let i = 0; i < capped.length; i++) {
    if (resyncTimedOut(startedAt, deadlineMs)) {
      timedOut = true;
      log(
        `Stopped at ${formatResyncSeconds(resyncElapsedMs(startedAt))} — pass --only CODE or --limit N, or --timeout-sec 0 to disable.`,
      );
      break;
    }

    const project = capped[i]!;
    const template =
      (project.templateId ? byId.get(project.templateId) : null) ??
      [...byId.values()].find((t) => t.code === "ehr") ??
      null;
    if (!template) continue;
    scanned += 1;
    if (i === 0 || (i + 1) % 5 === 0 || i + 1 === capped.length) {
      log(`Project ${i + 1}/${capped.length}: ${project.code}`);
    }

    const projectPhases = phasesByProject.get(project.id) ?? [];
    const phaseByName = new Map(projectPhases.map((p) => [titleKey(p.name), p]));

    for (const tp of template.phases) {
      const livePhase = phaseByName.get(titleKey(tp.name));
      if (!livePhase) continue;

      const liveByTitle = new Map(livePhase.tasks.map((t) => [titleKey(t.title), t]));
      const ordered = [...tp.tasks].sort((a, b) => a.order - b.order);
      const parents = ordered.filter((t) => !t.parentTaskId);
      const children = ordered.filter((t) => t.parentTaskId);

      for (const tt of [...parents, ...children]) {
        const liveTask = findByPlaybookTitle(liveByTitle, tt.title);
        const parentTemplate = tt.parentTaskId
          ? ordered.find((x) => x.id === tt.parentTaskId)
          : null;
        const liveParent = parentTemplate
          ? findByPlaybookTitle(liveByTitle, parentTemplate.title)
          : null;

        const templateChecks = checksByTemplateTask.get(tt.id) ?? [];
        const templateAtt = attByTemplateTask.get(tt.id) ?? [];

        if (!liveTask) {
          rows.push({
            projectId: project.id,
            projectCode: project.code,
            phaseName: tp.name,
            title: tt.title,
            action: "insert",
            detail: parentTemplate ? `nested under “${parentTemplate.title}”` : "top-level",
          });
          if (templateChecks.length > 0) {
            rows.push({
              projectId: project.id,
              projectCode: project.code,
              phaseName: tp.name,
              title: tt.title,
              action: "add-checklist",
              detail: `${templateChecks.length} area(s) to cover`,
            });
          }
          if (templateAtt.length > 0) {
            rows.push({
              projectId: project.id,
              projectCode: project.code,
              phaseName: tp.name,
              title: tt.title,
              action: "add-attachment",
              detail: `${templateAtt.length} default file(s)`,
            });
          }
          const insertDesc = dockPlaybookDescriptionForTitle(tt.title) ?? tt.description;
          if (insertDesc) {
            rows.push({
              projectId: project.id,
              projectCode: project.code,
              phaseName: tp.name,
              title: tt.title,
              action: "set-description",
              detail: "Dock playbook copy",
            });
          }
          touched.add(project.id);
          continue;
        }

        if (liveParent && liveTask.parentTaskId !== liveParent.id) {
          rows.push({
            projectId: project.id,
            projectCode: project.code,
            phaseName: tp.name,
            title: tt.title,
            action: "relink-parent",
            detail: `parent → “${parentTemplate?.title}” (keeps ${liveTask.status})`,
          });
          touched.add(project.id);
        }

        if (templateChecks.length > 0) {
          const have = liveCheckLabels.get(liveTask.id) ?? new Set();
          const missing = templateChecks.filter((c) => !have.has(titleKey(c.label)));
          if (missing.length > 0) {
            rows.push({
              projectId: project.id,
              projectCode: project.code,
              phaseName: tp.name,
              title: tt.title,
              action: "add-checklist",
              detail: `${missing.length} area(s) to cover`,
            });
            touched.add(project.id);
          }
        }

        if (templateAtt.length > 0) {
          const existingFiles = filesByTask.get(liveTask.id) ?? [];
          const missingAtt = templateAtt.filter((a) => {
            const lib = libById.get(a.libraryAssetId);
            if (!lib) return true;
            return !fileCoversLibraryAsset(existingFiles, lib);
          });
          if (missingAtt.length > 0) {
            rows.push({
              projectId: project.id,
              projectCode: project.code,
              phaseName: tp.name,
              title: tt.title,
              action: "add-attachment",
              detail: `${missingAtt.length} default file(s)`,
            });
            touched.add(project.id);
          }
        }

        const nextDesc = dockPlaybookDescriptionForTitle(tt.title) ?? tt.description;
        if (shouldReplacePlaybookDescription(liveTask.description, nextDesc)) {
          rows.push({
            projectId: project.id,
            projectCode: project.code,
            phaseName: tp.name,
            title: tt.title,
            action: "set-description",
            detail: "Dock playbook copy",
          });
          touched.add(project.id);
        }
      }
    }

    for (const livePhase of projectPhases) {
      for (const liveTask of livePhase.tasks) {
        const defs = libraryDefsForTaskTitle(liveTask.title);
        const existing = filesByTask.get(liveTask.id) ?? [];
        for (const def of defs) {
          const lib = libBySlug.get(def.slug);
          if (alreadyHasLibraryCoverage(existing, def, lib)) continue;
          const dup = rows.some(
            (r) =>
              r.projectId === project.id &&
              r.title === liveTask.title &&
              r.action === "add-attachment" &&
              r.librarySlug === def.slug,
          );
          if (dup) continue;
          rows.push({
            projectId: project.id,
            projectCode: project.code,
            phaseName: livePhase.name,
            title: liveTask.title,
            action: "add-attachment",
            detail: def.kind === "LINK" ? `${def.name} (link)` : def.name,
            librarySlug: def.slug,
          });
          touched.add(project.id);
        }

        const catalogChecks = checklistForTaskTitle(liveTask.title);
        if (catalogChecks.length > 0) {
          const have = liveCheckLabels.get(liveTask.id) ?? new Set();
          const missing = catalogChecks.filter((c) => !have.has(titleKey(c.label)));
          if (
            missing.length > 0 &&
            !rows.some(
              (r) =>
                r.projectId === project.id &&
                r.title === liveTask.title &&
                r.action === "add-checklist",
            )
          ) {
            rows.push({
              projectId: project.id,
              projectCode: project.code,
              phaseName: livePhase.name,
              title: liveTask.title,
              action: "add-checklist",
              detail: `${missing.length} area(s) to cover`,
            });
            touched.add(project.id);
          }
        }

        const nextDesc = dockPlaybookDescriptionForTitle(liveTask.title);
        if (
          shouldReplacePlaybookDescription(liveTask.description, nextDesc) &&
          !rows.some(
            (r) =>
              r.projectId === project.id &&
              r.title === liveTask.title &&
              r.action === "set-description",
          )
        ) {
          rows.push({
            projectId: project.id,
            projectCode: project.code,
            phaseName: livePhase.name,
            title: liveTask.title,
            action: "set-description",
            detail: "Dock playbook copy",
          });
          touched.add(project.id);
        }
      }
    }
  }

  const elapsedMs = resyncElapsedMs(startedAt);
  log(`Plan ready in ${formatResyncSeconds(elapsedMs)} (${rows.length} action(s)).`);
  return {
    projectsScanned: scanned,
    projectsTouched: touched.size,
    rows,
    timedOut,
    elapsedMs,
  };
}

export async function applyPlaybookResync(opts: ResyncOpts): Promise<ResyncPlan> {
  const startedAt = Date.now();
  const deadlineMs = deadlineOf(opts);
  const log = opts.onProgress ?? (() => undefined);
  const plan = await planPlaybookResync(opts);
  if (!opts.apply) return plan;
  if (plan.timedOut) {
    log("Dry-run/plan timed out — not applying a partial plan. Re-run with --only or a higher --timeout-sec.");
    return plan;
  }

  const templates = await db.query.projectTemplates.findMany({ columns: { id: true } });
  const byId = new Map<string, LoadedTemplate>();
  for (const t of templates) {
    const loaded = await loadTemplateById(t.id);
    if (loaded) byId.set(t.id, loaded);
  }

  const templateTaskIds = [...byId.values()].flatMap((tpl) => tpl.phases.flatMap((p) => p.tasks.map((tk) => tk.id)));
  const [allTemplateChecks, allTemplateAtt] = await Promise.all([
    loadAllInChunks(templateTaskIds, (chunk) =>
      db.query.templateTaskChecklistItems.findMany({
        where: inArray(templateTaskChecklistItems.templateTaskId, chunk),
      }),
    ),
    loadAllInChunks(templateTaskIds, (chunk) =>
      db.query.templateTaskAttachments.findMany({
        where: inArray(templateTaskAttachments.templateTaskId, chunk),
      }),
    ),
  ]);
  const checksByTemplateTask = new Map<string, typeof allTemplateChecks>();
  for (const row of allTemplateChecks) {
    const list = checksByTemplateTask.get(row.templateTaskId) ?? [];
    list.push(row);
    checksByTemplateTask.set(row.templateTaskId, list);
  }
  const attByTemplateTask = new Map<string, typeof allTemplateAtt>();
  for (const row of allTemplateAtt) {
    const list = attByTemplateTask.get(row.templateTaskId) ?? [];
    list.push(row);
    attByTemplateTask.set(row.templateTaskId, list);
  }

  const grouped = new Map<string, ResyncTaskPlan[]>();
  for (const row of plan.rows) {
    const list = grouped.get(row.projectId) ?? [];
    list.push(row);
    grouped.set(row.projectId, list);
  }

  let index = 0;
  for (const [projectId, projectRows] of grouped) {
    if (resyncTimedOut(startedAt, deadlineMs)) {
      log(
        `Apply stopped after ${formatResyncSeconds(resyncElapsedMs(startedAt))} at project ${index}/${grouped.size}. Re-run --apply --only for remaining sites.`,
      );
      return { ...plan, timedOut: true, elapsedMs: resyncElapsedMs(startedAt) };
    }
    index += 1;
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) continue;
    const template =
      (project.templateId ? byId.get(project.templateId) : null) ??
      [...byId.values()].find((t) => t.code === "ehr") ??
      null;
    if (!template) continue;
    log(`Applying ${project.code} (${index}/${grouped.size}, ${projectRows.length} action(s))…`);

    const livePhases = await db.query.phases.findMany({
      where: eq(phases.projectId, project.id),
      with: { tasks: true },
    });
    const phaseByName = new Map(livePhases.map((p) => [titleKey(p.name), p]));
    const scale = resolvePlaybookScale({
      kickoff: project.startDate ?? new Date(),
      templateDurationDays: template.durationDays,
      forecastCalendarDays: null,
      targetGoLive: project.targetGoLiveDate,
    });

    await db.transaction(async (tx) => {
      for (const tp of template.phases) {
        const livePhase = phaseByName.get(titleKey(tp.name));
        if (!livePhase) continue;
        const liveByTitle = new Map(livePhase.tasks.map((t) => [titleKey(t.title), t]));
        const ordered = [...tp.tasks].sort((a, b) => a.order - b.order);

        for (const tt of ordered.filter((t) => !t.parentTaskId).concat(ordered.filter((t) => t.parentTaskId))) {
          const actions = projectRows.filter((r) => r.phaseName === tp.name && r.title === tt.title);
          if (actions.length === 0) continue;

          let liveTask = findByPlaybookTitle(liveByTitle, tt.title) ?? null;
          const parentTemplate = tt.parentTaskId
            ? ordered.find((x) => x.id === tt.parentTaskId)
            : null;
          const liveParent = parentTemplate
            ? findByPlaybookTitle(liveByTitle, parentTemplate.title) ?? null
            : null;

          if (actions.some((a) => a.action === "insert") && !liveTask) {
            const { startDate: taskStart, dueDate: taskDue } = scheduleFromOffsets({
              anchor: livePhase.startDate ?? project.startDate ?? new Date(),
              offsetDays: tt.offsetDays,
              durationDays: tt.durationDays,
              scaleFactor: scale.scaleFactor,
            });
            const [created] = await tx
              .insert(tasks)
              .values({
                projectId: project.id,
                phaseId: livePhase.id,
                parentTaskId: liveParent?.id ?? null,
                title: tt.title,
                description: dockPlaybookDescriptionForTitle(tt.title) ?? tt.description,
                priority: tt.priority,
                visibility: tt.ownerSide === "CUSTOMER" ? "SHARED" : tt.visibility,
                ownerSide: tt.ownerSide,
                order: tt.order,
                startDate: taskStart,
                dueDate: taskDue,
                estimateHours: tt.estimateHours,
                createdById: opts.actorId,
                workTrack: tt.workTrack,
                defaultRole: tt.defaultRole,
                overlapKey: tt.overlapKey,
                areaKey: tt.areaKey,
              })
              .returning();
            liveTask = created;
            liveByTitle.set(titleKey(tt.title), created);
            livePhase.tasks.push(created);
          }

          if (!liveTask) continue;

          if (actions.some((a) => a.action === "relink-parent") && liveParent) {
            await tx
              .update(tasks)
              .set({ parentTaskId: liveParent.id, updatedAt: new Date() })
              .where(eq(tasks.id, liveTask.id));
          }

          if (actions.some((a) => a.action === "add-checklist")) {
            const templateChecks = checksByTemplateTask.get(tt.id) ?? [];
            const catalogChecks = checklistForTaskTitle(tt.title).map((c, i) => ({
              label: c.label,
              order: i,
              visibility: c.visibility,
            }));
            const wantedChecks = templateChecks.length > 0 ? templateChecks : catalogChecks;
            const existing = await tx.query.taskChecklistItems.findMany({
              where: eq(taskChecklistItems.taskId, liveTask.id),
            });
            const have = new Set(existing.map((c) => titleKey(c.label)));
            const missing = wantedChecks.filter((c) => !have.has(titleKey(c.label)));
            if (missing.length > 0) {
              await tx.insert(taskChecklistItems).values(
                missing.map((c, i) => ({
                  taskId: liveTask!.id,
                  label: c.label,
                  order: existing.length + i,
                  visibility: c.visibility,
                  done: false,
                })),
              );
            }
          }

          if (actions.some((a) => a.action === "add-attachment")) {
            const templateAtt = attByTemplateTask.get(tt.id) ?? [];
            for (const a of templateAtt) {
              await copyLibraryAssetToTask(tx, {
                taskId: liveTask.id,
                projectId: project.id,
                libraryAssetId: a.libraryAssetId,
                uploadedById: opts.actorId,
              });
            }
            await ensureDefaultAttachmentsOnTask(tx, {
              taskId: liveTask.id,
              projectId: project.id,
              title: liveTask.title,
              uploadedById: opts.actorId,
            });
          }

          if (actions.some((a) => a.action === "set-description")) {
            const nextDesc = dockPlaybookDescriptionForTitle(liveTask.title) ?? tt.description;
            if (shouldReplacePlaybookDescription(liveTask.description, nextDesc) && nextDesc) {
              await tx
                .update(tasks)
                .set({ description: nextDesc, updatedAt: new Date() })
                .where(eq(tasks.id, liveTask.id));
              liveTask.description = nextDesc;
            }
          }
        }
      }

      // Catalog rows can land on a live task whose phase name drifted from the
      // template. Apply leftover attachments / checklists / descriptions by title.
      const catalogTitles = new Set(
        projectRows
          .filter(
            (r) =>
              r.action === "add-attachment" ||
              r.action === "add-checklist" ||
              r.action === "set-description",
          )
          .map((r) => r.title),
      );
      if (catalogTitles.size > 0) {
        const refreshed = await tx.query.phases.findMany({
          where: eq(phases.projectId, project.id),
          with: { tasks: true },
        });
        for (const phase of refreshed) {
          for (const task of phase.tasks) {
            if (!catalogTitles.has(task.title)) continue;
            const rowsFor = projectRows.filter((r) => r.title === task.title);

            if (rowsFor.some((r) => r.action === "add-attachment")) {
              await ensureDefaultAttachmentsOnTask(tx, {
                taskId: task.id,
                projectId: project.id,
                title: task.title,
                uploadedById: opts.actorId,
              });
            }

            if (rowsFor.some((r) => r.action === "add-checklist")) {
              const catalogChecks = checklistForTaskTitle(task.title);
              if (catalogChecks.length > 0) {
                const existing = await tx.query.taskChecklistItems.findMany({
                  where: eq(taskChecklistItems.taskId, task.id),
                });
                const have = new Set(existing.map((c) => titleKey(c.label)));
                const missing = catalogChecks.filter((c) => !have.has(titleKey(c.label)));
                if (missing.length > 0) {
                  await tx.insert(taskChecklistItems).values(
                    missing.map((c, i) => ({
                      taskId: task.id,
                      label: c.label,
                      order: existing.length + i,
                      visibility: c.visibility,
                      done: false,
                    })),
                  );
                }
              }
            }

            if (rowsFor.some((r) => r.action === "set-description")) {
              const nextDesc = dockPlaybookDescriptionForTitle(task.title);
              if (nextDesc && shouldReplacePlaybookDescription(task.description, nextDesc)) {
                await tx
                  .update(tasks)
                  .set({ description: nextDesc, updatedAt: new Date() })
                  .where(eq(tasks.id, task.id));
              }
            }
          }
        }
      }
    });
  }

  return { ...plan, elapsedMs: resyncElapsedMs(startedAt), timedOut: false };
}
