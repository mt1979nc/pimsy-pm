import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { resetDb } from "./fixtures";
import {
  libraryAssets,
  projectTemplates,
  templatePhases,
  templateTaskAttachments,
  templateTaskChecklistItems,
  templateTasks,
  users,
} from "@/db/schema";
import { cloneProjectTemplate } from "@/lib/template-clone";
import { seedLibraryPlaceholders } from "@/db/seed-dock-parity";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("duplicate playbook (postgres)", () => {
  let sourceId: string;
  let childTitle = "Schedule kickoff";

  beforeAll(async () => {
    await resetDb();
    await db.insert(users).values({
      email: "alexander@pimsyehr.com",
      name: "Alexander",
      role: "OWNER",
    });
    const [tpl] = await db
      .insert(projectTemplates)
      .values({
        name: "PIMSY Implementation",
        code: "ehr",
        playbookPath: "EHR",
        type: "IMPLEMENTATION",
        durationDays: 30,
        isActive: true,
      })
      .returning({ id: projectTemplates.id });
    sourceId = tpl.id;
    const [phase] = await db
      .insert(templatePhases)
      .values({
        templateId: tpl.id,
        name: "Kickoff",
        order: 0,
        offsetDays: 0,
        durationDays: 7,
        visibility: "SHARED",
        isOptional: false,
        areaKey: "eprescribe",
      })
      .returning({ id: templatePhases.id });
    const [parent] = await db
      .insert(templateTasks)
      .values({
        phaseId: phase.id,
        title: "Pre-Kickoff",
        order: 0,
        ownerSide: "INTERNAL",
        visibility: "INTERNAL",
        isOptional: true,
        areaKey: "eprescribe",
      })
      .returning({ id: templateTasks.id });
    const [child] = await db
      .insert(templateTasks)
      .values({
        phaseId: phase.id,
        parentTaskId: parent.id,
        title: childTitle,
        order: 1,
        ownerSide: "INTERNAL",
        visibility: "SHARED",
        description: "Book the call.",
      })
      .returning({ id: templateTasks.id });
    await db.insert(templateTaskChecklistItems).values({
      templateTaskId: child.id,
      label: "Confirm attendees",
      order: 0,
      visibility: "SHARED",
    });
    await seedLibraryPlaceholders();
    const wizard = await db.query.libraryAssets.findFirst({
      where: eq(libraryAssets.slug, "discovery-wizard"),
    });
    if (wizard) {
      await db.insert(templateTaskAttachments).values({
        templateTaskId: child.id,
        libraryAssetId: wizard.id,
      });
    }
  });

  it("copies nested tasks, checklists, and attachments into a custom inactive playbook", async () => {
    const copy = await cloneProjectTemplate({ sourceId, name: "PIMSY Implementation (copy)" });
    expect(copy.code).toBe("ehr-copy");
    expect(copy.taskCount).toBe(2);

    const row = await db.query.projectTemplates.findFirst({
      where: eq(projectTemplates.id, copy.id),
      with: {
        phases: {
          with: {
            tasks: {
              with: {
                checklistItems: true,
                defaultAttachments: { with: { libraryAsset: true } },
              },
            },
          },
        },
      },
    });
    expect(row?.playbookPath).toBeNull();
    expect(row?.isActive).toBe(false);
    expect(row?.code).toBe("ehr-copy");
    const phase = row?.phases[0];
    expect(phase?.name).toBe("Kickoff");
    expect(phase?.areaKey).toBe("eprescribe");
    const parent = phase?.tasks.find((t) => t.title === "Pre-Kickoff");
    const child = phase?.tasks.find((t) => t.title === childTitle);
    expect(parent).toBeTruthy();
    expect(child?.parentTaskId).toBe(parent?.id);
    expect(child?.description).toBe("Book the call.");
    expect(child?.checklistItems.some((c) => c.label === "Confirm attendees")).toBe(true);
    expect(child?.defaultAttachments.some((a) => a.libraryAsset?.slug === "discovery-wizard")).toBe(
      true,
    );

    const original = await db.query.projectTemplates.findFirst({
      where: eq(projectTemplates.id, sourceId),
      columns: { playbookPath: true, code: true },
    });
    expect(original?.playbookPath).toBe("EHR");
    expect(original?.code).toBe("ehr");
  });
});
