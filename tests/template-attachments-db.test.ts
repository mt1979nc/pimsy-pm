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
  taskChecklistItems,
  templatePhases,
  templateTaskChecklistItems,
  templateTasks,
  tasks,
  users,
} from "@/db/schema";
import { DISCOVERY_WIZARD_URL } from "@/db/dock-default-attachments";
import { TRAINING_SESSION_DESCRIPTION } from "@/db/dock-training-checklists";
import { applyTemplateDockExtras, seedLibraryPlaceholders } from "@/db/seed-dock-parity";
import { loadTemplateById, materializeTemplatesOnProject } from "@/lib/playbook";
import { applyPlaybookResync, planPlaybookResync } from "@/lib/playbook-resync";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("template default attachments (postgres)", () => {
  let actorId: string;
  let customerId: string;
  let templateId: string;

  beforeAll(async () => {
    await resetDb();
    const [acct] = await db
      .insert(customerAccounts)
      .values({ name: "Cedar Test", slug: "cedar-att" })
      .returning({ id: customerAccounts.id });
    customerId = acct.id;
    const [owner] = await db
      .insert(users)
      .values({ email: "alexander@pimsyehr.com", name: "Alexander", role: "OWNER" })
      .returning({ id: users.id });
    actorId = owner.id;

    const [tpl] = await db
      .insert(projectTemplates)
      .values({
        name: "PIMSY Implementation",
        code: "ehr",
        playbookPath: "EHR",
        type: "IMPLEMENTATION",
        durationDays: 30,
      })
      .returning({ id: projectTemplates.id });
    templateId = tpl.id;
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
    await db.insert(templateTasks).values([
      {
        phaseId: phase.id,
        title: "Guided Discovery Meeting",
        order: 0,
        ownerSide: "INTERNAL",
        visibility: "SHARED",
      },
      {
        phaseId: phase.id,
        title: "Billing Questionnaire",
        order: 1,
        ownerSide: "CUSTOMER",
        visibility: "SHARED",
      },
      {
        phaseId: phase.id,
        title: "Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers",
        order: 2,
        ownerSide: "CUSTOMER",
        visibility: "SHARED",
      },
      {
        phaseId: phase.id,
        title: "Training 1: Intro to PIMSY",
        order: 3,
        ownerSide: "INTERNAL",
        visibility: "SHARED",
      },
    ]);

    await seedLibraryPlaceholders();
    await applyTemplateDockExtras();
  });

  it("seeds Discovery Wizard as a library LINK and wires it onto the template task", async () => {
    const wizard = await db.query.libraryAssets.findFirst({
      where: eq(libraryAssets.slug, "discovery-wizard"),
    });
    expect(wizard?.kind).toBe("LINK");
    expect(wizard?.url).toBe(DISCOVERY_WIZARD_URL);
    expect(wizard?.isPlaceholder).toBe(false);

    const loaded = await loadTemplateById(templateId);
    const guided = loaded?.phases[0]?.tasks.find((t) => t.title === "Guided Discovery Meeting");
    expect(guided).toBeTruthy();
    const extras = await db.query.templateTasks.findFirst({
      where: eq(templateTasks.id, guided!.id),
      with: { defaultAttachments: { with: { libraryAsset: true } } },
    });
    expect(extras?.defaultAttachments.some((a) => a.libraryAsset?.slug === "discovery-wizard")).toBe(
      true,
    );
  });

  it("clones the wizard LINK and billing files onto a new project task", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        name: "New site",
        code: "NEWATT",
        customerAccountId: customerId,
        leadId: actorId,
        playbookPath: "EHR",
        templateId,
        status: "IN_PROGRESS",
      })
      .returning({ id: projects.id });

    const loaded = await loadTemplateById(templateId);
    if (!loaded) throw new Error("template missing");

    await db.transaction(async (tx) => {
      await materializeTemplatesOnProject({
        tx,
        projectId: project.id,
        templates: [loaded],
        actorId,
        start: new Date("2026-09-01T12:00:00.000Z"),
        scaleFactor: 1,
        excludedAreaKeys: [],
        roleAssignments: {},
        defaultInternalAssigneeId: actorId,
      });
    });

    const live = await db.query.tasks.findMany({
      where: eq(tasks.projectId, project.id),
    });
    const guided = live.find((t) => t.title === "Guided Discovery Meeting");
    const billing = live.find((t) => t.title === "Billing Questionnaire");
    expect(guided).toBeTruthy();
    expect(billing).toBeTruthy();

    const guidedFiles = await db.query.fileAssets.findMany({
      where: eq(fileAssets.taskId, guided!.id),
    });
    expect(guidedFiles.some((f) => f.kind === "LINK" && f.url === DISCOVERY_WIZARD_URL)).toBe(true);
    expect(guidedFiles.every((f) => f.kind !== "LINK" || f.url !== null)).toBe(true);

    const billingFiles = await db.query.fileAssets.findMany({
      where: eq(fileAssets.taskId, billing!.id),
    });
    expect(billingFiles.some((f) => f.name.toLowerCase().includes("billing questionnaire"))).toBe(
      true,
    );
    expect(billing?.description).toMatch(/billing questionnaire/i);

    const training = live.find((t) => t.title === "Training 1: Intro to PIMSY");
    expect(training?.description).toContain("- [ ] User Profile / Signature Capture");
    const trainingChecks = await db.query.taskChecklistItems.findMany({
      where: eq(taskChecklistItems.taskId, training!.id),
    });
    expect(trainingChecks.some((c) => c.label === "User Profile / Signature Capture")).toBe(true);
  });

  it("resync attaches missing defaults and keeps a user-uploaded file", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        name: "WIP site",
        code: "WIPATT",
        customerAccountId: customerId,
        leadId: actorId,
        playbookPath: "EHR",
        templateId,
        status: "IN_PROGRESS",
      })
      .returning({ id: projects.id });

    const loaded = await loadTemplateById(templateId);
    if (!loaded) throw new Error("template missing");
    await db.transaction(async (tx) => {
      await materializeTemplatesOnProject({
        tx,
        projectId: project.id,
        templates: [loaded],
        actorId,
        start: new Date("2026-09-01T12:00:00.000Z"),
        scaleFactor: 1,
        excludedAreaKeys: [],
        roleAssignments: {},
        defaultInternalAssigneeId: actorId,
      });
    });

    const billing = await db.query.tasks.findFirst({
      where: eq(tasks.projectId, project.id),
    });
    const billingTask = (
      await db.query.tasks.findMany({ where: eq(tasks.projectId, project.id) })
    ).find((t) => t.title === "Billing Questionnaire");
    if (!billingTask) throw new Error("billing task missing");

    // Simulate Dock WIP import: strip playbook clones, leave a user upload.
    await db.delete(fileAssets).where(eq(fileAssets.taskId, billingTask.id));
    await db.insert(fileAssets).values({
      name: "Completed billing questionnaire.xlsx",
      kind: "FILE",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      visibility: "SHARED",
      taskId: billingTask.id,
      projectId: project.id,
      uploadedById: actorId,
    });

    const plan = await planPlaybookResync({ apply: false, actorId, useDefaultDeadline: false });
    expect(plan.timedOut).toBe(false);
    expect(plan.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(
      plan.rows.some(
        (r) =>
          r.projectCode === "WIPATT" &&
          r.title === "Billing Questionnaire" &&
          r.action === "add-attachment",
      ),
    ).toBe(true);

    await applyPlaybookResync({ apply: true, actorId, only: ["WIPATT"], useDefaultDeadline: false });

    const after = await db.query.fileAssets.findMany({
      where: eq(fileAssets.taskId, billingTask.id),
    });
    expect(after.some((f) => f.name === "Completed billing questionnaire.xlsx")).toBe(true);
    expect(after.some((f) => f.libraryAssetId != null)).toBe(true);
    expect(after.length).toBeGreaterThanOrEqual(2);
    expect(billing).toBeTruthy();
  });

  it("fills template descriptions and keeps editor checklist extras", async () => {
    const loaded = await loadTemplateById(templateId);
    const training = loaded?.phases[0]?.tasks.find((t) => t.title === "Training 1: Intro to PIMSY");
    expect(training?.description).toContain("- [ ] User Profile / Signature Capture");
    const checks = await db.query.templateTaskChecklistItems.findMany({
      where: eq(templateTaskChecklistItems.templateTaskId, training!.id),
    });
    expect(checks.some((c) => c.label === "Provider Dashboard")).toBe(true);

    await db.insert(templateTaskChecklistItems).values({
      templateTaskId: training!.id,
      label: "Custom specialist area",
      order: 99,
      visibility: "SHARED",
    });
    await applyTemplateDockExtras();
    const after = await db.query.templateTaskChecklistItems.findMany({
      where: eq(templateTaskChecklistItems.templateTaskId, training!.id),
    });
    expect(after.some((c) => c.label === "Custom specialist area")).toBe(true);
    expect(after.some((c) => c.label === "User Profile / Signature Capture")).toBe(true);
  });

  it("resync backfills blank descriptions and preserves staff-authored notes", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        name: "WIP copy",
        code: "WIPDESC",
        customerAccountId: customerId,
        leadId: actorId,
        playbookPath: "EHR",
        templateId,
        status: "IN_PROGRESS",
      })
      .returning({ id: projects.id });

    const loaded = await loadTemplateById(templateId);
    if (!loaded) throw new Error("template missing");
    await db.transaction(async (tx) => {
      await materializeTemplatesOnProject({
        tx,
        projectId: project.id,
        templates: [loaded],
        actorId,
        start: new Date("2026-09-01T12:00:00.000Z"),
        scaleFactor: 1,
        excludedAreaKeys: [],
        roleAssignments: {},
        defaultInternalAssigneeId: actorId,
      });
    });

    const live = await db.query.tasks.findMany({ where: eq(tasks.projectId, project.id) });
    const billing = live.find((t) => t.title === "Billing Questionnaire");
    const training = live.find((t) => t.title === "Training 1: Intro to PIMSY");
    if (!billing || !training) throw new Error("expected playbook tasks");

    await db.update(tasks).set({ description: null }).where(eq(tasks.id, billing.id));
    await db
      .update(tasks)
      .set({ description: TRAINING_SESSION_DESCRIPTION })
      .where(eq(tasks.id, training.id));
    await db.delete(taskChecklistItems).where(eq(taskChecklistItems.taskId, training.id));

    const [notesProject] = await db
      .insert(projects)
      .values({
        name: "WIP notes",
        code: "WIPNOTE",
        customerAccountId: customerId,
        leadId: actorId,
        playbookPath: "EHR",
        templateId,
        status: "IN_PROGRESS",
      })
      .returning({ id: projects.id });
    await db.transaction(async (tx) => {
      await materializeTemplatesOnProject({
        tx,
        projectId: notesProject.id,
        templates: [loaded],
        actorId,
        start: new Date("2026-09-01T12:00:00.000Z"),
        scaleFactor: 1,
        excludedAreaKeys: [],
        roleAssignments: {},
        defaultInternalAssigneeId: actorId,
      });
    });
    const notesBilling = (
      await db.query.tasks.findMany({ where: eq(tasks.projectId, notesProject.id) })
    ).find((t) => t.title === "Billing Questionnaire");
    if (!notesBilling) throw new Error("notes billing missing");
    await db
      .update(tasks)
      .set({ description: "Specialist notes for Cedar kickoff." })
      .where(eq(tasks.id, notesBilling.id));

    const plan = await planPlaybookResync({
      apply: false,
      actorId,
      only: ["WIPDESC", "WIPNOTE"],
      useDefaultDeadline: false,
    });
    expect(plan.timedOut).toBe(false);
    expect(
      plan.rows.some(
        (r) =>
          r.projectCode === "WIPDESC" &&
          r.title === "Billing Questionnaire" &&
          r.action === "set-description",
      ),
    ).toBe(true);
    expect(
      plan.rows.some(
        (r) =>
          r.projectCode === "WIPDESC" &&
          r.title === "Training 1: Intro to PIMSY" &&
          r.action === "set-description",
      ),
    ).toBe(true);
    expect(
      plan.rows.some(
        (r) =>
          r.projectCode === "WIPDESC" &&
          r.title === "Training 1: Intro to PIMSY" &&
          r.action === "add-checklist",
      ),
    ).toBe(true);
    expect(
      plan.rows.some(
        (r) =>
          r.projectCode === "WIPNOTE" &&
          r.title === "Billing Questionnaire" &&
          r.action === "set-description",
      ),
    ).toBe(false);

    await applyPlaybookResync({
      apply: true,
      actorId,
      only: ["WIPDESC", "WIPNOTE"],
      useDefaultDeadline: false,
    });

    const billingAfter = await db.query.tasks.findFirst({ where: eq(tasks.id, billing.id) });
    const trainingAfter = await db.query.tasks.findFirst({ where: eq(tasks.id, training.id) });
    const notesAfter = await db.query.tasks.findFirst({ where: eq(tasks.id, notesBilling.id) });
    expect(billingAfter?.description).toMatch(/billing questionnaire/i);
    expect(trainingAfter?.description).toContain("- [ ] User Profile / Signature Capture");
    expect(notesAfter?.description).toBe("Specialist notes for Cedar kickoff.");
    const trainingChecks = await db.query.taskChecklistItems.findMany({
      where: eq(taskChecklistItems.taskId, training.id),
    });
    expect(trainingChecks.some((c) => c.label === "Client Create / Term")).toBe(true);
  });
});
