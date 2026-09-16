/**
 * Server: Discovery file intake onto Configuration.
 *
 * 1. Customer Discovery uploads spawn Configuration review-required tasks
 *    (one per form-named file, with a copy of the attachment).
 * 2. Discovery Wizard Excel (file or durable link) fans out onto existing
 *    Configuration consumer tasks (Org Info, Create Users, …).
 *
 * Dedupe: open review-required tasks in Configuration keyed by content hash,
 * then by cleaned title. Same hash does not spawn another task. Same title
 * with a new hash attaches the new file to the existing open task. A completed
 * review task does not block a later re-upload (a new review row is created).
 *
 * Wizard workbook copies are INTERNAL, one storage object per consumer so
 * delete on one task cannot yank the others. Same hash or URL on a consumer
 * is skipped.
 *
 * Missing Site Configuration phase: Discovery upload still succeeds; no review
 * tasks and no wizard fan-out.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { fileAssets, phases, projects, tasks } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/authz";
import {
  cleanUploadedFileTitle,
  isConfigurationPhaseName,
  isDiscoveryPhaseName,
  isWizardConsumerTaskTitle,
  normalizeReviewTitle,
} from "@/lib/discovery-config-review";
import { env } from "@/lib/env";
import { defaultLinkLabel, parseHttpUrl } from "@/lib/http-url";
import { notify } from "@/lib/notify";
import { refreshProjectCounters } from "@/lib/rollup";
import { putFile } from "@/lib/storage";

export function hashUploadBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type DiscoveryUploadFile = {
  name: string;
  mimeType: string | null;
  sizeBytes: number;
  kind: "FILE" | "IMAGE";
  contentHash: string;
  visibility: "INTERNAL" | "SHARED";
  description?: string | null;
  /** Original bytes so the Configuration copy is a separate storage object. */
  bytes: Buffer;
};

export type SpawnReviewResult = {
  createdTaskIds: string[];
  reusedTaskIds: string[];
  skipped: number;
  reason?: "not-customer" | "not-discovery" | "no-config-phase";
};

const REVIEW_DESCRIPTION =
  "Review required. The practice uploaded this file during Discovery. Open the attachment, complete the configuration work in PIMSY, then mark this task done.";

export async function spawnConfigurationReviewTasks(opts: {
  actor: Actor;
  sourceTask: {
    id: string;
    title: string;
    projectId: string;
    phaseId: string | null;
  };
  phaseName: string | null | undefined;
  files: DiscoveryUploadFile[];
}): Promise<SpawnReviewResult> {
  const empty: SpawnReviewResult = { createdTaskIds: [], reusedTaskIds: [], skipped: 0 };
  if (opts.files.length === 0) return empty;
  if (opts.actor.role !== "CUSTOMER") {
    return { ...empty, skipped: opts.files.length, reason: "not-customer" };
  }
  if (!isDiscoveryPhaseName(opts.phaseName)) {
    return { ...empty, skipped: opts.files.length, reason: "not-discovery" };
  }

  const projectPhases = await db.query.phases.findMany({
    where: eq(phases.projectId, opts.sourceTask.projectId),
    columns: { id: true, name: true, notApplicable: true },
  });
  const configPhase = projectPhases.find(
    (p) => !p.notApplicable && isConfigurationPhaseName(p.name),
  );
  if (!configPhase) {
    return { ...empty, skipped: opts.files.length, reason: "no-config-phase" };
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, opts.sourceTask.projectId),
    columns: { id: true, name: true, leadId: true },
  });

  const openReviews = await db.query.tasks.findMany({
    where: and(
      eq(tasks.projectId, opts.sourceTask.projectId),
      eq(tasks.phaseId, configPhase.id),
      eq(tasks.reviewRequired, true),
      ne(tasks.status, "DONE"),
      ne(tasks.status, "CANCELLED"),
      eq(tasks.notApplicable, false),
    ),
    columns: { id: true, title: true },
  });
  const openIds = openReviews.map((t) => t.id);
  const attachmentsOnOpen =
    openIds.length === 0
      ? []
      : await db.query.fileAssets.findMany({
          where: inArray(fileAssets.taskId, openIds),
          columns: { taskId: true, contentHash: true },
        });

  const hashToTask = new Map<string, string>();
  for (const a of attachmentsOnOpen) {
    if (a.taskId && a.contentHash && !hashToTask.has(a.contentHash)) {
      hashToTask.set(a.contentHash, a.taskId);
    }
  }
  const titleToTask = new Map<string, string>();
  for (const t of openReviews) {
    const key = normalizeReviewTitle(t.title);
    if (key && !titleToTask.has(key)) titleToTask.set(key, t.id);
  }

  let order = await nextTopLevelOrder(opts.sourceTask.projectId, configPhase.id);
  const createdTaskIds: string[] = [];
  const reusedTaskIds: string[] = [];
  let skipped = 0;

  for (const file of opts.files) {
    const title = cleanUploadedFileTitle(file.name);
    const titleKey = normalizeReviewTitle(title);
    const existingByHash = hashToTask.get(file.contentHash);
    if (existingByHash) {
      skipped += 1;
      continue;
    }
    let taskId = titleToTask.get(titleKey) ?? null;
    if (!taskId) {
      const [created] = await db
        .insert(tasks)
        .values({
          projectId: opts.sourceTask.projectId,
          phaseId: configPhase.id,
          title,
          description: REVIEW_DESCRIPTION,
          status: "IN_REVIEW",
          priority: "HIGH",
          visibility: "INTERNAL",
          ownerSide: "INTERNAL",
          reviewRequired: true,
          assigneeId: project?.leadId ?? null,
          createdById: opts.actor.id,
          order,
          workTrack: "EHR",
        })
        .returning({ id: tasks.id });
      taskId = created.id;
      order += 1;
      createdTaskIds.push(taskId);
      titleToTask.set(titleKey, taskId);
      await audit({
        actor: opts.actor,
        action: "task.created",
        entityType: "task",
        entityId: taskId,
        summary: `${title} (Discovery → Configuration review)`,
        metadata: {
          projectId: opts.sourceTask.projectId,
          sourceTaskId: opts.sourceTask.id,
          reviewRequired: true,
          fromFile: file.name,
        },
      });
    } else {
      reusedTaskIds.push(taskId);
    }

    const configStorageKey = await putFile(file.name, file.bytes);
    await db.insert(fileAssets).values({
      name: file.name.slice(0, 200),
      kind: file.kind,
      storageKey: configStorageKey,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      contentHash: file.contentHash,
      description: file.description || `Uploaded on Discovery task “${opts.sourceTask.title}”.`,
      visibility: "INTERNAL",
      taskId,
      projectId: opts.sourceTask.projectId,
      uploadedById: opts.actor.id,
    });
    hashToTask.set(file.contentHash, taskId);
  }

  if (createdTaskIds.length > 0) {
    await refreshProjectCounters(opts.sourceTask.projectId);
  }

  if ((createdTaskIds.length > 0 || reusedTaskIds.length > 0) && project?.leadId) {
    const audience = new Set<string>([project.leadId]);
    audience.delete(opts.actor.id);
    if (audience.size > 0) {
      const n = createdTaskIds.length + reusedTaskIds.length;
      const who = opts.actor.name ?? opts.actor.email ?? "The practice";
      await notify({
        userIds: Array.from(audience),
        type: "FILE_UPLOADED",
        title:
          n === 1
            ? `${who} submitted a Discovery document for Configuration review`
            : `${who} submitted ${n} Discovery documents for Configuration review`,
        body: `${opts.files.length} file(s) on “${opts.sourceTask.title}”.`,
        facts: [
          { name: "Project", value: project.name ?? "—" },
          { name: "Discovery task", value: opts.sourceTask.title },
          { name: "Configuration", value: configPhase.name },
        ],
        linkUrl: `/projects/${opts.sourceTask.projectId}/tasks`,
        ctaLabel: "Open Configuration tasks",
        email: true,
        teams: true,
        projectId: opts.sourceTask.projectId,
        exceptUserId: opts.actor.id,
      });
    }
  }

  return { createdTaskIds, reusedTaskIds, skipped };
}

async function nextTopLevelOrder(projectId: string, phaseId: string): Promise<number> {
  const sibling = await db.query.tasks.findFirst({
    where: and(
      eq(tasks.projectId, projectId),
      eq(tasks.phaseId, phaseId),
      isNull(tasks.parentTaskId),
    ),
    columns: { order: true },
    orderBy: [desc(tasks.order)],
  });
  return (sibling?.order ?? -1) + 1;
}

// ---------------------------------------------------------------------------
// Discovery Wizard workbook fan-out
// ---------------------------------------------------------------------------

const WIZARD_FILE_DESCRIPTION =
  "Discovery Wizard workbook. Open this spreadsheet and complete this Configuration task from the matching tab (organization, locations, users, billing codes, rates).";

const WIZARD_LINK_DESCRIPTION =
  "Discovery Wizard workbook (durable link). Open the spreadsheet and complete this Configuration task from the matching tab.";

export type WizardWorkbookFile = {
  kind: "FILE";
  name: string;
  mimeType: string | null;
  sizeBytes: number;
  contentHash: string;
  bytes: Buffer;
};

export type WizardWorkbookLink = {
  kind: "LINK";
  name: string;
  url: string;
};

export type WizardWorkbook = WizardWorkbookFile | WizardWorkbookLink;

export type AttachWizardResult = {
  attachedTaskIds: string[];
  skipped: number;
  consumerCount: number;
  reason?: "no-config-phase" | "no-consumers";
};

export type DiscoveryProjectRef = {
  id: string;
  name: string;
  code: string;
  leadId: string | null;
  prismClientId: string | null;
  crmAcronym: string | null;
};

/** Lookup by PATH code, Prism client id, or CRM acronym (case-insensitive). */
export async function findProjectByDiscoveryCode(
  raw: string,
): Promise<DiscoveryProjectRef | null> {
  const key = raw.trim();
  if (!key) return null;
  const lower = key.toLowerCase();
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      leadId: projects.leadId,
      prismClientId: projects.prismClientId,
      crmAcronym: projects.crmAcronym,
    })
    .from(projects)
    .where(
      sql`lower(${projects.code}) = ${lower}
        or lower(coalesce(${projects.prismClientId}, '')) = ${lower}
        or lower(coalesce(${projects.crmAcronym}, '')) = ${lower}`,
    )
    .limit(8);
  if (rows.length === 0) return null;
  const exactCode = rows.find((r) => r.code.toLowerCase() === lower);
  return exactCode ?? rows[0]!;
}

function tokenEquals(provided: string, configured: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Bearer DISCOVERY_WIZARD_WEBHOOK_SECRET, falling back to PRISM_READ_API_KEY
 * when the dedicated secret is unset. Same 404-not-403 convention as snapshot.
 */
export function authorizeDiscoveryWizardWebhook(authorizationHeader: string | null): boolean {
  const header = authorizationHeader ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = m?.[1]?.trim() || "";
  if (!token) return false;
  const dedicated = env.DISCOVERY_WIZARD_WEBHOOK_SECRET.trim();
  const fallback = env.PRISM_READ_API_KEY.trim();
  const secrets = [dedicated, fallback].filter(Boolean);
  if (secrets.length === 0) return false;
  return secrets.some((s) => tokenEquals(token, s));
}

export async function attachWizardWorkbookToConfiguration(opts: {
  actor: Actor | null;
  projectId: string;
  sourceTask?: { id: string; title: string } | null;
  workbook: WizardWorkbook;
}): Promise<AttachWizardResult> {
  const empty: AttachWizardResult = { attachedTaskIds: [], skipped: 0, consumerCount: 0 };

  const projectPhases = await db.query.phases.findMany({
    where: eq(phases.projectId, opts.projectId),
    columns: { id: true, name: true, notApplicable: true },
  });
  const configPhase = projectPhases.find(
    (p) => !p.notApplicable && isConfigurationPhaseName(p.name),
  );
  if (!configPhase) {
    return { ...empty, reason: "no-config-phase" };
  }

  const configTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.projectId, opts.projectId),
      eq(tasks.phaseId, configPhase.id),
      eq(tasks.notApplicable, false),
      ne(tasks.status, "CANCELLED"),
    ),
    columns: { id: true, title: true, assigneeId: true },
  });
  const consumers = configTasks.filter(
    (t) => isWizardConsumerTaskTitle(t.title) && t.id !== opts.sourceTask?.id,
  );
  if (consumers.length === 0) {
    return { ...empty, reason: "no-consumers" };
  }

  const consumerIds = consumers.map((t) => t.id);
  const existing = await db.query.fileAssets.findMany({
    where: inArray(fileAssets.taskId, consumerIds),
    columns: { taskId: true, contentHash: true, url: true, kind: true },
  });
  const hashOnTask = new Set(
    existing
      .filter((a) => a.taskId && a.contentHash)
      .map((a) => `${a.taskId}:${a.contentHash}`),
  );
  const urlOnTask = new Set(
    existing
      .filter((a) => a.taskId && a.kind === "LINK" && a.url)
      .map((a) => `${a.taskId}:${a.url}`),
  );

  const workbookName =
    opts.workbook.kind === "FILE"
      ? opts.workbook.name.slice(0, 200)
      : opts.workbook.name.slice(0, 200);
  const description =
    opts.workbook.kind === "FILE" ? WIZARD_FILE_DESCRIPTION : WIZARD_LINK_DESCRIPTION;
  const sourceNote = opts.sourceTask
    ? ` From “${opts.sourceTask.title}”.`
    : " Delivered by the Discovery Wizard webhook.";

  const attachedTaskIds: string[] = [];
  let skipped = 0;

  for (const consumer of consumers) {
    if (opts.workbook.kind === "FILE") {
      if (hashOnTask.has(`${consumer.id}:${opts.workbook.contentHash}`)) {
        skipped += 1;
        continue;
      }
      const storageKey = await putFile(workbookName, opts.workbook.bytes);
      await db.insert(fileAssets).values({
        name: workbookName,
        kind: "FILE",
        storageKey,
        mimeType: opts.workbook.mimeType,
        sizeBytes: opts.workbook.sizeBytes,
        contentHash: opts.workbook.contentHash,
        description: description + sourceNote,
        visibility: "INTERNAL",
        taskId: consumer.id,
        projectId: opts.projectId,
        uploadedById: opts.actor?.id ?? null,
      });
      hashOnTask.add(`${consumer.id}:${opts.workbook.contentHash}`);
    } else {
      if (urlOnTask.has(`${consumer.id}:${opts.workbook.url}`)) {
        skipped += 1;
        continue;
      }
      await db.insert(fileAssets).values({
        name: workbookName,
        kind: "LINK",
        url: opts.workbook.url,
        description: description + sourceNote,
        visibility: "INTERNAL",
        taskId: consumer.id,
        projectId: opts.projectId,
        uploadedById: opts.actor?.id ?? null,
      });
      urlOnTask.add(`${consumer.id}:${opts.workbook.url}`);
    }
    attachedTaskIds.push(consumer.id);
  }

  if (attachedTaskIds.length > 0) {
    await audit({
      actor: opts.actor,
      action: "task.wizard_workbook.attached",
      entityType: "project",
      entityId: opts.projectId,
      summary: `${workbookName} → ${attachedTaskIds.length} Configuration task(s)`,
      metadata: {
        projectId: opts.projectId,
        sourceTaskId: opts.sourceTask?.id ?? null,
        attachedTaskIds,
        skipped,
        kind: opts.workbook.kind,
      },
    });
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, opts.projectId),
    columns: { id: true, name: true, leadId: true },
  });
  if (attachedTaskIds.length > 0 && project?.leadId) {
    const audience = new Set<string>([project.leadId]);
    if (opts.actor?.id) audience.delete(opts.actor.id);
    if (audience.size > 0) {
      const n = attachedTaskIds.length;
      await notify({
        userIds: Array.from(audience),
        type: "FILE_UPLOADED",
        title:
          n === 1
            ? "Discovery Wizard workbook is on a Configuration task"
            : `Discovery Wizard workbook is on ${n} Configuration tasks`,
        body: workbookName,
        facts: [
          { name: "Project", value: project.name ?? "—" },
          {
            name: "Source",
            value: opts.sourceTask?.title ?? "Discovery Wizard webhook",
          },
          { name: "Configuration", value: configPhase.name },
        ],
        linkUrl: `/projects/${opts.projectId}/tasks`,
        ctaLabel: "Open Configuration tasks",
        email: true,
        teams: true,
        projectId: opts.projectId,
        exceptUserId: opts.actor?.id,
      });
    }
  }

  return { attachedTaskIds, skipped, consumerCount: consumers.length };
}

export function workbookLinkFromUrl(rawUrl: string, name?: string | null): WizardWorkbookLink | { error: string } {
  const parsed = parseHttpUrl(rawUrl);
  if (!parsed.ok) return { error: parsed.error };
  return {
    kind: "LINK",
    name: defaultLinkLabel(parsed.url, name),
    url: parsed.url.toString(),
  };
}
