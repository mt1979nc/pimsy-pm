/**
 * One-time (idempotent) playbook resync: add missing Dock nested tasks /
 * checklists / default attachments onto existing WIP projects without
 * wiping completion state. Match by normalized title within a phase.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  fileAssets,
  phases,
  projects,
  projectTemplates,
  taskChecklistItems,
  tasks,
  templateTaskAttachments,
  templateTaskChecklistItems,
} from "@/db/schema";
import { loadTemplateById, type LoadedTemplate } from "@/lib/playbook";
import { findByPlaybookTitle, normalizeOverlapTitle } from "@/lib/playbook-meta";
import { copyLibraryAssetToTask } from "@/lib/template-attachments";
import { scheduleFromOffsets, resolvePlaybookScale } from "@/lib/project-timeline";

export type ResyncOpts = {
  apply: boolean;
  /** Limit to these project ids or acronyms/codes. Empty = all playbook projects. */
  only?: string[];
  actorId: string | null;
};

export type ResyncTaskPlan = {
  projectId: string;
  projectCode: string;
  phaseName: string;
  title: string;
  action: "insert" | "relink-parent" | "add-checklist" | "add-attachment" | "skip";
  detail: string;
};

export type ResyncPlan = {
  projectsScanned: number;
  projectsTouched: number;
  rows: ResyncTaskPlan[];
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

export async function planPlaybookResync(opts: ResyncOpts): Promise<ResyncPlan> {
  const templates = await db.query.projectTemplates.findMany({
    columns: { id: true, code: true, name: true },
  });
  const byId = new Map<string, LoadedTemplate>();
  for (const t of templates) {
    const loaded = await loadTemplateById(t.id);
    if (loaded) byId.set(t.id, loaded);
  }

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

  const rows: ResyncTaskPlan[] = [];
  let scanned = 0;
  const touched = new Set<string>();

  for (const project of live) {
    if (!wanted(opts.only, project)) continue;
    const template =
      (project.templateId ? byId.get(project.templateId) : null) ??
      [...byId.values()].find((t) => t.code === "ehr") ??
      null;
    if (!template) continue;
    // Skip completed history — don't reshape post go-live sites.
    if (project.status === "COMPLETED" || project.status === "CANCELLED") continue;
    scanned += 1;

    const livePhases = await db.query.phases.findMany({
      where: eq(phases.projectId, project.id),
      with: { tasks: true },
    });
    const phaseByName = new Map(livePhases.map((p) => [titleKey(p.name), p]));

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

        if (!liveTask) {
          rows.push({
            projectId: project.id,
            projectCode: project.code,
            phaseName: tp.name,
            title: tt.title,
            action: "insert",
            detail: parentTemplate ? `nested under “${parentTemplate.title}”` : "top-level",
          });
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

        const templateChecks = await db.query.templateTaskChecklistItems.findMany({
          where: eq(templateTaskChecklistItems.templateTaskId, tt.id),
        });
        if (templateChecks.length > 0) {
          const existing = await db.query.taskChecklistItems.findMany({
            where: eq(taskChecklistItems.taskId, liveTask.id),
            columns: { label: true },
          });
          const have = new Set(existing.map((c) => titleKey(c.label)));
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

        const templateAtt = await db.query.templateTaskAttachments.findMany({
          where: eq(templateTaskAttachments.templateTaskId, tt.id),
        });
        if (templateAtt.length > 0) {
          const existingFiles = await db.query.fileAssets.findMany({
            where: eq(fileAssets.taskId, liveTask.id),
            columns: { libraryAssetId: true },
          });
          const haveLib = new Set(existingFiles.map((f) => f.libraryAssetId).filter(Boolean));
          const missingAtt = templateAtt.filter((a) => !haveLib.has(a.libraryAssetId));
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
      }
    }
  }

  return {
    projectsScanned: scanned,
    projectsTouched: touched.size,
    rows,
  };
}

export async function applyPlaybookResync(opts: ResyncOpts): Promise<ResyncPlan> {
  const plan = await planPlaybookResync(opts);
  if (!opts.apply) return plan;

  const templates = await db.query.projectTemplates.findMany({ columns: { id: true } });
  const byId = new Map<string, LoadedTemplate>();
  for (const t of templates) {
    const loaded = await loadTemplateById(t.id);
    if (loaded) byId.set(t.id, loaded);
  }

  const grouped = new Map<string, ResyncTaskPlan[]>();
  for (const row of plan.rows) {
    const list = grouped.get(row.projectId) ?? [];
    list.push(row);
    grouped.set(row.projectId, list);
  }

  for (const [projectId, projectRows] of grouped) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) continue;
    const template =
      (project.templateId ? byId.get(project.templateId) : null) ??
      [...byId.values()].find((t) => t.code === "ehr") ??
      null;
    if (!template) continue;

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
                description: tt.description,
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
            const templateChecks = await tx.query.templateTaskChecklistItems.findMany({
              where: eq(templateTaskChecklistItems.templateTaskId, tt.id),
            });
            const existing = await tx.query.taskChecklistItems.findMany({
              where: eq(taskChecklistItems.taskId, liveTask.id),
            });
            const have = new Set(existing.map((c) => titleKey(c.label)));
            const missing = templateChecks.filter((c) => !have.has(titleKey(c.label)));
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
            const templateAtt = await tx.query.templateTaskAttachments.findMany({
              where: eq(templateTaskAttachments.templateTaskId, tt.id),
            });
            for (const a of templateAtt) {
              await copyLibraryAssetToTask(tx, {
                taskId: liveTask.id,
                projectId: project.id,
                libraryAssetId: a.libraryAssetId,
                uploadedById: opts.actorId,
              });
            }
          }
        }
      }
    });
  }

  return plan;
}
