/**
 * Learning Center queries. Portal reads go through here so customers only
 * ever see published SHARED items. Staff preview can include drafts.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { learningCenterItems, learningCenterSections, libraryAssets } from "@/db/schema";
import { isCustomer, isStaff, type Actor } from "@/lib/authz";
import {
  LEARNING_TOPIC_META,
  learningSearchHaystack,
  type LearningTopic,
} from "@/db/learning-center-catalog";

export type LearningItemView = {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  kind: string;
  url: string | null;
  hasFile: boolean;
  libraryAssetId: string | null;
  audienceRole: string;
  isPlaceholder: boolean;
  published: boolean;
  visibility: "INTERNAL" | "SHARED";
  sectionId: string;
  sectionTitle: string;
  sectionSlug: string;
  topic: string;
  topicLabel: string;
  order: number;
};

export async function loadLearningCatalog(actor: Actor, opts?: { includeDrafts?: boolean }) {
  const staff = isStaff(actor);
  const includeDrafts = Boolean(opts?.includeDrafts && staff);

  const sections = await db.query.learningCenterSections.findMany({
    orderBy: [asc(learningCenterSections.order)],
    with: {
      items: {
        orderBy: (i, { asc: a }) => [a(i.order), a(i.title)],
        with: { libraryAsset: true },
      },
    },
  });

  const out: Array<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    topic: string;
    topicLabel: string;
    audienceRole: string;
    published: boolean;
    items: LearningItemView[];
  }> = [];

  for (const section of sections) {
    if (!includeDrafts && !section.published) continue;
    const items: LearningItemView[] = [];
    for (const item of section.items) {
      if (!includeDrafts && !item.published) continue;
      if (isCustomer(actor)) {
        if (item.visibility !== "SHARED" || !item.published || !section.published) continue;
      }
      const lib = item.libraryAsset;
      items.push({
        id: item.id,
        title: item.title,
        summary: item.summary,
        body: item.body,
        kind: item.kind,
        url: item.url ?? lib?.url ?? null,
        hasFile: Boolean(item.storageKey || lib?.storageKey),
        libraryAssetId: item.libraryAssetId,
        audienceRole: item.audienceRole,
        isPlaceholder: item.isPlaceholder || (item.kind === "FILE" && Boolean(lib?.isPlaceholder)),
        published: item.published,
        visibility: item.visibility,
        sectionId: section.id,
        sectionTitle: section.title,
        sectionSlug: section.slug,
        topic: section.topic,
        topicLabel: LEARNING_TOPIC_META[section.topic as LearningTopic]?.label ?? section.topic,
        order: item.order,
      });
    }
    if (items.length === 0 && !includeDrafts) continue;
    out.push({
      id: section.id,
      slug: section.slug,
      title: section.title,
      description: section.description,
      topic: section.topic,
      topicLabel: LEARNING_TOPIC_META[section.topic as LearningTopic]?.label ?? section.topic,
      audienceRole: section.audienceRole,
      published: section.published,
      items,
    });
  }

  return out;
}

export async function loadLearningItem(actor: Actor, itemId: string) {
  const row = await db.query.learningCenterItems.findFirst({
    where: eq(learningCenterItems.id, itemId),
    with: {
      section: true,
      libraryAsset: true,
    },
  });
  if (!row) return null;
  if (isCustomer(actor)) {
    if (!row.published || !row.section.published || row.visibility !== "SHARED") return null;
  }
  return row;
}

export function filterLearningCatalog<T extends { title: string; items: LearningItemView[] }>(
  sections: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  return sections
    .map((section) => {
      const items = section.items.filter((item) =>
        learningSearchHaystack({
          title: item.title,
          summary: item.summary,
          body: item.body,
          sectionTitle: item.sectionTitle,
          topicLabel: item.topicLabel,
          audienceRole: item.audienceRole,
        }).includes(q),
      );
      const sectionHit = `${section.title}`.toLowerCase().includes(q);
      return { ...section, items: sectionHit ? section.items : items };
    })
    .filter((s) => s.items.length > 0);
}

export async function assertLearningFileAccess(actor: Actor, itemId: string) {
  const item = await loadLearningItem(actor, itemId);
  if (!item) return null;
  if (isCustomer(actor) && item.visibility !== "SHARED") return null;
  const key = item.storageKey || item.libraryAsset?.storageKey;
  if (!key) return null;
  return {
    item,
    storageKey: key,
    name: item.libraryAsset?.name ?? item.title,
    mimeType: item.mimeType ?? item.libraryAsset?.mimeType ?? "application/octet-stream",
  };
}

/** Staff-only library download. Customers never hit this table directly. */
export async function loadLibraryAssetForStaff(actor: Actor, assetId: string) {
  if (!isStaff(actor)) return null;
  return db.query.libraryAssets.findFirst({
    where: eq(libraryAssets.id, assetId),
  });
}
