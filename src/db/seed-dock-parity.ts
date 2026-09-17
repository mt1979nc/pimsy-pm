/**
 * Seed Dock-parity catalogs: reusable library files, template checklists /
 * default attachments, and the customer Learning Center IA.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  learningCenterItems,
  learningCenterSections,
  libraryAssets,
  templateTaskAttachments,
  templateTaskChecklistItems,
  templateTasks,
} from "@/db/schema";
import { DEFAULT_LIBRARY_ASSETS, libraryDefsForTaskTitle } from "@/db/dock-default-attachments";
import { checklistForTaskTitle } from "@/db/dock-training-checklists";
import { dockPlaybookDescriptionForTitle, shouldReplacePlaybookDescription } from "@/db/dock-playbook-copy";
import { LEARNING_CENTER_SECTIONS } from "@/db/learning-center-catalog";
import { putFile } from "@/lib/storage";
import { resolveLibrarySourceFile } from "@/lib/template-attachment-pack";
import { propagateLibraryFileToCopies } from "@/lib/template-attachments";

function mimeForPackFile(fileName: string, fallback: string | null): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return fallback;
}

export async function seedLibraryPlaceholders() {
  for (const def of DEFAULT_LIBRARY_ASSETS) {
    const existing = await db.query.libraryAssets.findFirst({
      where: eq(libraryAssets.slug, def.slug),
    });
    const kind = def.kind ?? "FILE";
    const isLink = kind === "LINK";
    const source = resolveLibrarySourceFile(def);

    if (existing && !existing.isPlaceholder && existing.storageKey && !isLink && !source?.fromPack) {
      console.log(`  · library ${def.slug}: keeping uploaded file`);
      continue;
    }

    let storageKey = existing?.storageKey ?? null;
    let sizeBytes = existing?.sizeBytes ?? null;
    let mimeType = def.mimeType ?? existing?.mimeType ?? null;

    if (!isLink && source) {
      const bytes = readFileSync(source.path);
      const storedName = basename(source.path);
      storageKey = await putFile(storedName, bytes);
      sizeBytes = bytes.length;
      mimeType = source.fromPack ? mimeForPackFile(storedName, mimeType) : (def.mimeType ?? mimeType);
    }

    const isPlaceholder = isLink ? false : source?.fromPack ? false : (def.isPlaceholder ?? true);
    const values = {
      name: def.name,
      description: def.description,
      mimeType,
      adminNotes: def.adminNotes,
      visibility: def.visibility,
      kind,
      url: def.url ?? null,
      storageKey: isLink ? existing?.storageKey ?? null : storageKey,
      sizeBytes: isLink ? existing?.sizeBytes ?? null : sizeBytes,
      isPlaceholder,
      updatedAt: new Date(),
    };

    let libraryId = existing?.id;
    if (existing) {
      await db.update(libraryAssets).set(values).where(eq(libraryAssets.id, existing.id));
    } else {
      const inserted = await db
        .insert(libraryAssets)
        .values({
          slug: def.slug,
          ...values,
        })
        .returning({ id: libraryAssets.id });
      libraryId = inserted[0]!.id;
    }

    if (libraryId && !isLink && source?.fromPack) {
      await propagateLibraryFileToCopies(db, {
        libraryAssetId: libraryId,
        storageKey: values.storageKey,
        mimeType: values.mimeType,
        sizeBytes: values.sizeBytes,
        url: values.url,
        kind,
        name: def.name,
        description: def.description,
      });
    }

    const origin = isLink ? " (link)" : source?.fromPack ? " (content pack)" : storageKey ? " (placeholder)" : " (no file on disk)";
    console.log(`  ✓ library ${def.slug}${origin}`);
  }
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

async function insertInChunks<T extends Record<string, unknown>>(
  table: typeof templateTaskChecklistItems | typeof templateTaskAttachments,
  rows: T[],
  chunkSize = 100,
) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db.insert(table).values(rows.slice(i, i + chunkSize) as never);
  }
}

/**
 * Upsert Dock playbook copy onto template tasks (descriptions, areas-to-cover
 * checklists, default library attachments). Does not delete editor extras.
 */
export async function applyTemplateDockExtras() {
  const allTasks = await db.query.templateTasks.findMany({
    columns: { id: true, title: true, description: true },
  });
  const libs = await db.query.libraryAssets.findMany();
  const libBySlug = new Map(libs.map((l) => [l.slug, l]));
  const ids = allTasks.map((t) => t.id);

  const [existingChecks, existingAtt] = await Promise.all([
    loadAllInChunks(ids, (chunk) =>
      db.query.templateTaskChecklistItems.findMany({
        where: inArray(templateTaskChecklistItems.templateTaskId, chunk),
        columns: { templateTaskId: true, label: true, order: true },
      }),
    ),
    loadAllInChunks(ids, (chunk) =>
      db.query.templateTaskAttachments.findMany({
        where: inArray(templateTaskAttachments.templateTaskId, chunk),
        columns: { templateTaskId: true, libraryAssetId: true },
      }),
    ),
  ]);

  const checksByTask = new Map<string, { label: string; order: number }[]>();
  for (const row of existingChecks) {
    const list = checksByTask.get(row.templateTaskId) ?? [];
    list.push(row);
    checksByTask.set(row.templateTaskId, list);
  }
  const libsByTask = new Map<string, Set<string>>();
  for (const row of existingAtt) {
    const set = libsByTask.get(row.templateTaskId) ?? new Set();
    set.add(row.libraryAssetId);
    libsByTask.set(row.templateTaskId, set);
  }

  const checklistInserts: Array<{
    templateTaskId: string;
    label: string;
    order: number;
    visibility: "INTERNAL" | "SHARED";
  }> = [];
  const attachmentInserts: Array<{ templateTaskId: string; libraryAssetId: string }> = [];
  const descriptionUpdates: Array<{ id: string; description: string }> = [];

  for (const task of allTasks) {
    const items = checklistForTaskTitle(task.title);
    const existing = checksByTask.get(task.id) ?? [];
    const have = new Set(existing.map((c) => c.label.trim().toLowerCase()));
    const missing = items.filter((item) => !have.has(item.label.trim().toLowerCase()));
    const maxOrder = existing.reduce((m, c) => Math.max(m, c.order), -1);
    for (const [i, item] of missing.entries()) {
      checklistInserts.push({
        templateTaskId: task.id,
        label: item.label,
        order: maxOrder + 1 + i,
        visibility: item.visibility,
      });
    }

    const nextDescription = dockPlaybookDescriptionForTitle(task.title);
    if (nextDescription && shouldReplacePlaybookDescription(task.description, nextDescription)) {
      descriptionUpdates.push({ id: task.id, description: nextDescription });
    }

    const haveLib = libsByTask.get(task.id) ?? new Set();
    for (const def of libraryDefsForTaskTitle(task.title)) {
      const lib = libBySlug.get(def.slug);
      if (!lib || haveLib.has(lib.id)) continue;
      attachmentInserts.push({ templateTaskId: task.id, libraryAssetId: lib.id });
      haveLib.add(lib.id);
    }
  }

  await insertInChunks(templateTaskChecklistItems, checklistInserts);
  await insertInChunks(templateTaskAttachments, attachmentInserts);
  for (let i = 0; i < descriptionUpdates.length; i += 50) {
    const chunk = descriptionUpdates.slice(i, i + 50);
    await Promise.all(
      chunk.map((row) =>
        db.update(templateTasks).set({ description: row.description }).where(eq(templateTasks.id, row.id)),
      ),
    );
  }

  console.log(
    `  ✓ template extras: ${checklistInserts.length} checklist items, ${attachmentInserts.length} default attachments, ${descriptionUpdates.length} playbook descriptions`,
  );
}

export async function seedLearningCenter() {
  const libs = await db.query.libraryAssets.findMany();
  const libBySlug = new Map(libs.map((l) => [l.slug, l]));

  for (const section of LEARNING_CENTER_SECTIONS) {
    const existing = await db.query.learningCenterSections.findFirst({
      where: eq(learningCenterSections.slug, section.slug),
    });
    const sectionId = existing
      ? existing.id
      : (
          await db
            .insert(learningCenterSections)
            .values({
              slug: section.slug,
              title: section.title,
              description: section.description,
              topic: section.topic,
              audienceRole: section.audienceRole,
              order: section.order,
              published: true,
            })
            .returning({ id: learningCenterSections.id })
        )[0]!.id;

    if (existing) {
      await db
        .update(learningCenterSections)
        .set({
          title: section.title,
          description: section.description,
          topic: section.topic,
          audienceRole: section.audienceRole,
          order: section.order,
          updatedAt: new Date(),
        })
        .where(eq(learningCenterSections.id, sectionId));
    }

    const currentItems = await db.query.learningCenterItems.findMany({
      where: eq(learningCenterItems.sectionId, sectionId),
    });

    const keepTitles = new Set(section.items.map((i) => i.title.toLowerCase()));
    const upsertedIds = new Set<string>();

    for (const item of section.items) {
      const lib = item.librarySlug ? libBySlug.get(item.librarySlug) : undefined;
      const aliases = new Set(
        [item.title, ...(item.replaceTitles ?? [])].map((t) => t.toLowerCase()),
      );
      const match =
        currentItems.find((r) => aliases.has(r.title.toLowerCase())) ??
        currentItems.find((r) => r.title.toLowerCase() === item.title.toLowerCase());

      if (match && !match.isPlaceholder && match.kind === "FILE" && match.storageKey) {
        await db
          .update(learningCenterItems)
          .set({
            sectionId,
            title: item.title,
            summary: item.summary,
            body: item.body,
            audienceRole: item.audienceRole,
            order: item.order,
            updatedAt: new Date(),
          })
          .where(eq(learningCenterItems.id, match.id));
        upsertedIds.add(match.id);
        continue;
      }

      const kind = item.kind;
      const catalogUrl = item.url ?? lib?.url ?? null;
      // Keep a staff-pasted cohort URL (Storylane, etc.) when the catalog has none.
      const url = catalogUrl ?? (match?.url?.trim() || null);
      const liveFile = Boolean(lib && !lib.isPlaceholder && lib.storageKey);
      const isPlaceholder = url || liveFile ? false : (item.isPlaceholder ?? (kind === "FILE" && !liveFile));

      const values = {
        sectionId,
        title: item.title,
        summary: item.summary,
        body: item.body,
        kind,
        url,
        audienceRole: item.audienceRole,
        order: item.order,
        published: true,
        visibility: "SHARED" as const,
        isPlaceholder,
        libraryAssetId: lib?.id ?? null,
        storageKey: kind === "FILE" ? (lib?.storageKey ?? null) : null,
        mimeType: kind === "FILE" ? (lib?.mimeType ?? null) : null,
        sizeBytes: kind === "FILE" ? (lib?.sizeBytes ?? null) : null,
        updatedAt: new Date(),
      };

      if (match) {
        await db.update(learningCenterItems).set(values).where(eq(learningCenterItems.id, match.id));
        upsertedIds.add(match.id);
      } else {
        const inserted = await db
          .insert(learningCenterItems)
          .values(values)
          .returning({ id: learningCenterItems.id });
        upsertedIds.add(inserted[0]!.id);
      }
    }

    for (const row of currentItems) {
      if (upsertedIds.has(row.id)) continue;
      if (!row.isPlaceholder) continue;
      if (keepTitles.has(row.title.toLowerCase())) continue;
      await db.delete(learningCenterItems).where(eq(learningCenterItems.id, row.id));
    }
  }
  console.log(`  ✓ Learning Center: ${LEARNING_CENTER_SECTIONS.length} sections`);
}

export async function seedDockParityCatalogs() {
  console.log("\nSeeding Dock parity catalogs…");
  await seedLibraryPlaceholders();
  await applyTemplateDockExtras();
  await seedLearningCenter();
}
