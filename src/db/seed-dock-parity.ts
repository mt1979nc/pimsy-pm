/**
 * Seed Dock-parity catalogs: reusable library files, template checklists /
 * default attachments, and the customer Learning Center IA.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
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
import { DEFAULT_LIBRARY_ASSETS } from "@/db/dock-default-attachments";
import { checklistForTaskTitle, trainingDescriptionForTitle } from "@/db/dock-training-checklists";
import { LEARNING_CENTER_SECTIONS } from "@/db/learning-center-catalog";
import { normalizeOverlapTitle } from "@/lib/playbook-meta";
import { putFile } from "@/lib/storage";

function placeholderPath(fileName: string) {
  return resolve(process.cwd(), "content/default-attachments", fileName);
}

export async function seedLibraryPlaceholders() {
  for (const def of DEFAULT_LIBRARY_ASSETS) {
    const existing = await db.query.libraryAssets.findFirst({
      where: eq(libraryAssets.slug, def.slug),
    });
    const kind = def.kind ?? "FILE";
    const isLink = kind === "LINK";

    if (existing && !existing.isPlaceholder && existing.storageKey && !isLink) {
      console.log(`  · library ${def.slug}: keeping uploaded file`);
      continue;
    }

    let storageKey = existing?.storageKey ?? null;
    let sizeBytes = existing?.sizeBytes ?? null;
    let mimeType = def.mimeType ?? existing?.mimeType ?? null;

    if (!isLink && def.fileName) {
      const path = placeholderPath(def.fileName);
      if (existsSync(path)) {
        const bytes = readFileSync(path);
        storageKey = await putFile(def.fileName, bytes);
        sizeBytes = bytes.length;
        mimeType = def.mimeType ?? mimeType;
      }
    }

    const isPlaceholder = def.isPlaceholder ?? !isLink;
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

    if (existing) {
      await db.update(libraryAssets).set(values).where(eq(libraryAssets.id, existing.id));
    } else {
      await db.insert(libraryAssets).values({
        slug: def.slug,
        ...values,
      });
    }
    console.log(
      `  ✓ library ${def.slug}${isLink ? " (link)" : storageKey ? "" : " (no file on disk)"}`,
    );
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
    const key = normalizeOverlapTitle(task.title);
    for (const def of DEFAULT_LIBRARY_ASSETS) {
      if (!def.attachToTitles.some((t) => normalizeOverlapTitle(t) === key)) continue;
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
