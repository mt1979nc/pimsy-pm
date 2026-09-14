import { beforeAll, describe, expect, it } from "vitest";
import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { buildFixture } from "./fixtures";
import {
  learningCenterItems,
  learningCenterSections,
  taskChecklistItems,
  tasks,
} from "@/db/schema";
import { loadLearningCatalog, loadLearningItem } from "@/lib/learning-center";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("Dock parity postgres (checklists + Learning Center)", () => {
  let fixture: Awaited<ReturnType<typeof buildFixture>>;
  let sharedItemId = "";
  let draftItemId = "";
  let internalCheckId = "";
  let sharedCheckId = "";

  beforeAll(async () => {
    fixture = await buildFixture();
    const [section] = await db
      .insert(learningCenterSections)
      .values({
        slug: "test-discovery",
        title: "Discovery",
        description: "Test",
        topic: "discovery",
        audienceRole: "all",
        order: 0,
        published: true,
      })
      .returning({ id: learningCenterSections.id });

    const [shared, draft] = await db
      .insert(learningCenterItems)
      .values([
        {
          sectionId: section.id,
          title: "Public wizard",
          summary: "Customer can see",
          body: "No PHI.",
          kind: "ARTICLE",
          published: true,
          visibility: "SHARED",
          isPlaceholder: false,
          order: 0,
        },
        {
          sectionId: section.id,
          title: "Staff draft",
          summary: "Not published",
          body: "Still no PHI.",
          kind: "ARTICLE",
          published: false,
          visibility: "SHARED",
          isPlaceholder: false,
          order: 1,
        },
      ])
      .returning({ id: learningCenterItems.id });
    sharedItemId = shared.id;
    draftItemId = draft.id;

    const sharedTask = await db.query.tasks.findFirst({
      where: eq(tasks.projectId, fixture.projects.a),
      columns: { id: true },
    });
    if (!sharedTask) throw new Error("fixture task missing");
    const [internalRow, sharedRow] = await db
      .insert(taskChecklistItems)
      .values([
        {
          taskId: sharedTask.id,
          label: "Internal cue",
          visibility: "INTERNAL",
          order: 0,
        },
        {
          taskId: sharedTask.id,
          label: "Logging in",
          visibility: "SHARED",
          order: 1,
        },
      ])
      .returning({ id: taskChecklistItems.id, visibility: taskChecklistItems.visibility });
    internalCheckId = internalRow.id;
    sharedCheckId = sharedRow.id;
  });

  it("hides unpublished Learning Center items from customers", async () => {
    const catalog = await loadLearningCatalog(fixture.actors.customerA);
    const titles = catalog.flatMap((s) => s.items.map((i) => i.title));
    expect(titles).toContain("Public wizard");
    expect(titles).not.toContain("Staff draft");
    expect(await loadLearningItem(fixture.actors.customerA, draftItemId)).toBeNull();
    expect((await loadLearningItem(fixture.actors.customerA, sharedItemId))?.title).toBe(
      "Public wizard",
    );
  });

  it("lets staff preview drafts when includeDrafts is on", async () => {
    const catalog = await loadLearningCatalog(fixture.actors.specialist, { includeDrafts: true });
    const titles = catalog.flatMap((s) => s.items.map((i) => i.title));
    expect(titles).toContain("Staff draft");
  });

  it("stores SHARED vs INTERNAL checklist items for portal filtering", async () => {
    const rows = await db.query.taskChecklistItems.findMany({
      where: eq(taskChecklistItems.id, sharedCheckId),
    });
    expect(rows[0]?.visibility).toBe("SHARED");
    const hidden = await db.query.taskChecklistItems.findFirst({
      where: eq(taskChecklistItems.id, internalCheckId),
    });
    expect(hidden?.visibility).toBe("INTERNAL");
  });
});
