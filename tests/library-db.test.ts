import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { resetDb } from "./fixtures";
import {
  customerAccounts,
  fileAssets,
  libraryAssets,
  projects,
  projectTemplates,
  templatePhases,
  templateTaskAttachments,
  templateTasks,
  tasks,
  users,
} from "@/db/schema";
import {
  attachLibraryToLiveTask,
  attachLibraryToTemplateTask,
  createLibraryFile,
  createLibraryLink,
  listLibraryAssets,
  updateLibraryLink,
} from "@/lib/library";
import { putFile } from "@/lib/storage";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("file library create / list / attach (postgres)", () => {
  let actorId: string;
  let projectId: string;
  let liveTaskId: string;
  let templateTaskId: string;
  let fileId: string;
  let linkId: string;

  beforeAll(async () => {
    await resetDb();
    const [acct] = await db
      .insert(customerAccounts)
      .values({ name: "Cedar Library", slug: "cedar-lib" })
      .returning({ id: customerAccounts.id });
    const [owner] = await db
      .insert(users)
      .values({ email: "alexander@pimsyehr.com", name: "Alexander", role: "OWNER" })
      .returning({ id: users.id });
    actorId = owner.id;

    const [tpl] = await db
      .insert(projectTemplates)
      .values({
        name: "PIMSY Implementation",
        code: "ehr-lib",
        playbookPath: "EHR",
        type: "IMPLEMENTATION",
        durationDays: 30,
      })
      .returning({ id: projectTemplates.id });
    const [phase] = await db
      .insert(templatePhases)
      .values({
        templateId: tpl.id,
        name: "Discovery",
        order: 0,
        offsetDays: 0,
        durationDays: 14,
        visibility: "SHARED",
      })
      .returning({ id: templatePhases.id });
    const [tt] = await db
      .insert(templateTasks)
      .values({
        phaseId: phase.id,
        title: "Billing Questionnaire",
        order: 0,
        ownerSide: "CUSTOMER",
        visibility: "SHARED",
      })
      .returning({ id: templateTasks.id });
    templateTaskId = tt.id;

    const [project] = await db
      .insert(projects)
      .values({
        name: "Library site",
        code: "LIBATT",
        customerAccountId: acct.id,
        leadId: actorId,
        playbookPath: "EHR",
        templateId: tpl.id,
        status: "IN_PROGRESS",
      })
      .returning({ id: projects.id });
    projectId = project.id;
    const [live] = await db
      .insert(tasks)
      .values({
        projectId: project.id,
        title: "Billing Questionnaire",
        status: "TODO",
        visibility: "SHARED",
        ownerSide: "CUSTOMER",
      })
      .returning({ id: tasks.id });
    liveTaskId = live.id;
  });

  it("creates a FILE and a Link/Form, then lists both", async () => {
    const key = await putFile("library-note.md", Buffer.from("# placeholder sheet\n"));
    const file = await createLibraryFile(db, {
      name: "Billing questionnaire sheet",
      storageKey: key,
      mimeType: "text/markdown",
      sizeBytes: 22,
      description: "Placeholder until the live xlsx is dropped.",
    });
    expect(file).toMatchObject({ ok: true });
    if (!("asset" in file) || !file.asset) throw new Error("file create failed");
    fileId = file.asset.id;
    expect(file.asset.kind).toBe("FILE");
    expect(file.asset.url).toBeNull();
    expect(file.asset.storageKey).toBeTruthy();
    expect(file.asset.slug).toMatch(/billing-questionnaire-sheet/);

    const link = await createLibraryLink(db, {
      name: "Billing questionnaire form",
      url: "https://example.com/forms/billing-questionnaire",
      description: "Staff-pasted online form.",
    });
    expect(link).toMatchObject({ ok: true });
    if (!("asset" in link) || !link.asset) throw new Error("link create failed");
    linkId = link.asset.id;
    expect(link.asset.kind).toBe("LINK");
    expect(link.asset.url).toBe("https://example.com/forms/billing-questionnaire");
    expect(link.asset.storageKey).toBeNull();
    expect(link.asset.isPlaceholder).toBe(false);

    const listed = await listLibraryAssets();
    expect(listed.some((a) => a.id === fileId && a.kind === "FILE")).toBe(true);
    expect(listed.some((a) => a.id === linkId && a.kind === "LINK")).toBe(true);
  });

  it("rejects a javascript: library URL", async () => {
    const bad = await createLibraryLink(db, {
      name: "Nope",
      url: "javascript:alert(1)",
    });
    expect(bad).toMatchObject({ error: expect.stringMatching(/http/i) });
  });

  it("attaches file and link to a playbook row and a live task", async () => {
    const playbookFile = await attachLibraryToTemplateTask(db, {
      templateTaskId,
      libraryAssetId: fileId,
    });
    const playbookLink = await attachLibraryToTemplateTask(db, {
      templateTaskId,
      libraryAssetId: linkId,
    });
    expect(playbookFile).toMatchObject({ ok: true });
    expect(playbookLink).toMatchObject({ ok: true });

    const again = await attachLibraryToTemplateTask(db, {
      templateTaskId,
      libraryAssetId: linkId,
    });
    expect(again).toMatchObject({ error: expect.stringMatching(/already/i) });

    const wired = await db.query.templateTaskAttachments.findMany({
      where: eq(templateTaskAttachments.templateTaskId, templateTaskId),
    });
    expect(wired.map((r) => r.libraryAssetId).sort()).toEqual([fileId, linkId].sort());

    const liveFile = await attachLibraryToLiveTask(db, {
      taskId: liveTaskId,
      projectId,
      libraryAssetId: fileId,
      uploadedById: actorId,
    });
    const liveLink = await attachLibraryToLiveTask(db, {
      taskId: liveTaskId,
      projectId,
      libraryAssetId: linkId,
      uploadedById: actorId,
    });
    expect(liveFile).toMatchObject({ ok: true });
    expect(liveLink).toMatchObject({ ok: true });

    const copies = await db.query.fileAssets.findMany({
      where: eq(fileAssets.taskId, liveTaskId),
    });
    const fileCopy = copies.find((f) => f.libraryAssetId === fileId);
    const linkCopy = copies.find((f) => f.libraryAssetId === linkId);
    expect(fileCopy?.kind).toBe("FILE");
    expect(fileCopy?.storageKey).toBeTruthy();
    expect(fileCopy?.url).toBeNull();
    expect(linkCopy?.kind).toBe("LINK");
    expect(linkCopy?.url).toBe("https://example.com/forms/billing-questionnaire");
    expect(linkCopy?.storageKey).toBeNull();
  });

  it("updates a Link/Form URL and copies it onto existing task clones", async () => {
    const updated = await updateLibraryLink(db, {
      id: linkId,
      url: "https://example.com/forms/billing-questionnaire-v2",
      name: "Billing questionnaire form",
    });
    expect(updated).toMatchObject({ ok: true });

    const lib = await db.query.libraryAssets.findFirst({
      where: eq(libraryAssets.id, linkId),
    });
    expect(lib?.url).toBe("https://example.com/forms/billing-questionnaire-v2");

    const copies = await db.query.fileAssets.findMany({
      where: eq(fileAssets.libraryAssetId, linkId),
    });
    expect(copies.length).toBeGreaterThan(0);
    expect(copies.every((c) => c.kind === "LINK")).toBe(true);
    expect(copies.every((c) => c.url === "https://example.com/forms/billing-questionnaire-v2")).toBe(
      true,
    );
  });
});
