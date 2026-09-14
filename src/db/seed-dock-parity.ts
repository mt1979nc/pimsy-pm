/**
 * Seed Dock-parity catalogs: reusable library files, template checklists /
 * default attachments, and the customer Learning Center IA.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { eq } from "drizzle-orm";
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
import { checklistForTaskTitle, trainingDescriptionForTitle } from "@/db/dock-training-checklists";
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

export async function applyTemplateDockExtras() {
  const allTasks = await db.query.templateTasks.findMany({
    columns: { id: true, title: true, description: true },
  });
  const libs = await db.query.libraryAssets.findMany();
  const libBySlug = new Map(libs.map((l) => [l.slug, l]));

  let checklists = 0;
  let attachments = 0;
  let descriptions = 0;

  for (const task of allTasks) {
    const items = checklistForTaskTitle(task.title);
    if (items.length > 0) {
      await db
        .delete(templateTaskChecklistItems)
        .where(eq(templateTaskChecklistItems.templateTaskId, task.id));
      await db.insert(templateTaskChecklistItems).values(
        items.map((item, i) => ({
          templateTaskId: task.id,
          label: item.label,
          order: i,
          visibility: item.visibility,
        })),
      );
      checklists += items.length;
      const nextDescription = trainingDescriptionForTitle(task.title);
      if (nextDescription && (!task.description || task.description.length < 40)) {
        await db
          .update(templateTasks)
          .set({ description: nextDescription })
          .where(eq(templateTasks.id, task.id));
        descriptions += 1;
      }
    }

    await db
      .delete(templateTaskAttachments)
      .where(eq(templateTaskAttachments.templateTaskId, task.id));
    for (const def of libraryDefsForTaskTitle(task.title)) {
      const lib = libBySlug.get(def.slug);
      if (!lib) continue;
      await db.insert(templateTaskAttachments).values({
        templateTaskId: task.id,
        libraryAssetId: lib.id,
      });
      attachments += 1;
    }
  }

  console.log(
    `  ✓ template extras: ${checklists} checklist items, ${attachments} default attachments, ${descriptions} training descriptions`,
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
        upsertedIds.add(match.id);
        continue;
      }

      const url = item.url ?? lib?.url ?? null;
      const kind = item.kind;
      const isPlaceholder =
        item.isPlaceholder ??
        (kind === "FILE" && !(lib && !lib.isPlaceholder && lib.storageKey));

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
