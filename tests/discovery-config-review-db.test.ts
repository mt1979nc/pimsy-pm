import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { fileAssets, phases, tasks } from "@/db/schema";
import { buildFixture } from "./fixtures";
import { hashUploadBytes, spawnConfigurationReviewTasks, attachWizardWorkbookToConfiguration, findProjectByDiscoveryCode, authorizeDiscoveryWizardWebhook } from "@/lib/discovery-config-review-tasks";
import { cleanUploadedFileTitle, DISCOVERY_WIZARD_CONSUMER_TITLES } from "@/lib/discovery-config-review";
import type { Actor } from "@/lib/authz";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("Discovery multi-file upload → Configuration review tasks (postgres)", () => {
  let projectId: string;
  let projectBId: string;
  let discoveryPhaseId: string;
  let configPhaseId: string;
  let submitDocsId: string;
  let customer: Actor;
  let specialist: Actor;

  beforeAll(async () => {
    const f = await buildFixture();
    projectId = f.projects.a;
    projectBId = f.projects.b;
    discoveryPhaseId = f.phases.shared;
    customer = f.actors.customerA;
    specialist = f.actors.specialist;

    await db.update(phases).set({ name: "Discovery" }).where(eq(phases.id, discoveryPhaseId));

    const [config] = await db
      .insert(phases)
      .values({
        projectId,
        name: "Site Configuration",
        order: 2,
        visibility: "INTERNAL",
      })
      .returning({ id: phases.id });
    configPhaseId = config.id;

    const [submit] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: discoveryPhaseId,
        title: "Submit Documents",
        visibility: "SHARED",
        ownerSide: "CUSTOMER",
        order: 20,
      })
      .returning({ id: tasks.id });
    submitDocsId = submit.id;
  });

  function packet(files: Array<{ name: string; body: string }>) {
    return files.map((f) => {
      const bytes = Buffer.from(f.body);
      return {
        name: f.name,
        mimeType: "application/pdf",
        sizeBytes: bytes.length,
        kind: "FILE" as const,
        contentHash: hashUploadBytes(bytes),
        visibility: "SHARED" as const,
        bytes,
      };
    });
  }

  it("creates one Configuration review task per uploaded file with flag + attachment", async () => {
    const files = packet([
      { name: "Authorization_Form.pdf", body: "auth-form-v1" },
      { name: "ROI.pdf", body: "roi-v1" },
      { name: "Consent_Form.pdf", body: "consent-v1" },
      { name: "Notice-of-Privacy-Practices.pdf", body: "npp-v1" },
      { name: "Sliding_Fee_Scale.xlsx", body: "sfs-v1" },
    ]);

    const result = await spawnConfigurationReviewTasks({
      actor: customer,
      sourceTask: {
        id: submitDocsId,
        title: "Submit Documents",
        projectId,
        phaseId: discoveryPhaseId,
      },
      phaseName: "Discovery",
      files,
    });

    expect(result.createdTaskIds).toHaveLength(5);
    expect(result.skipped).toBe(0);
    expect(result.reason).toBeUndefined();

    const created = await db.query.tasks.findMany({
      where: eq(tasks.phaseId, configPhaseId),
    });
    const review = created.filter((t) => t.reviewRequired);
    expect(review).toHaveLength(5);
    expect(review.map((t) => t.title).sort()).toEqual(
      [
        "Authorization Form",
        "ROI",
        "Consent Form",
        "Notice of Privacy Practices",
        "Sliding Fee Scale",
      ].sort(),
    );
    for (const t of review) {
      expect(t.status).toBe("IN_REVIEW");
      expect(t.visibility).toBe("INTERNAL");
      expect(t.ownerSide).toBe("INTERNAL");
      expect(t.priority).toBe("HIGH");
      expect(t.assigneeId).toBe(specialist.id);
      expect(t.phaseId).toBe(configPhaseId);
      const attached = await db.query.fileAssets.findMany({
        where: eq(fileAssets.taskId, t.id),
      });
      expect(attached).toHaveLength(1);
      expect(attached[0]!.contentHash).toBeTruthy();
      expect(attached[0]!.visibility).toBe("INTERNAL");
      expect(cleanUploadedFileTitle(attached[0]!.name)).toBe(t.title);
    }
  });

  it("does not spawn infinite duplicates on re-upload of the same names+hashes", async () => {
    const files = packet([
      { name: "Authorization_Form.pdf", body: "auth-form-v1" },
      { name: "ROI.pdf", body: "roi-v1" },
    ]);
    const again = await spawnConfigurationReviewTasks({
      actor: customer,
      sourceTask: {
        id: submitDocsId,
        title: "Submit Documents",
        projectId,
        phaseId: discoveryPhaseId,
      },
      phaseName: "Discovery",
      files,
    });
    expect(again.createdTaskIds).toHaveLength(0);
    expect(again.skipped).toBe(2);

    const created = await db.query.tasks.findMany({
      where: eq(tasks.phaseId, configPhaseId),
    });
    expect(created.filter((t) => t.reviewRequired)).toHaveLength(5);
  });

  it("does not spawn from a staff upload on the same Discovery task", async () => {
    const files = packet([{ name: "Staff_Only_Notes.pdf", body: "staff-notes" }]);
    const result = await spawnConfigurationReviewTasks({
      actor: specialist,
      sourceTask: {
        id: submitDocsId,
        title: "Submit Documents",
        projectId,
        phaseId: discoveryPhaseId,
      },
      phaseName: "Discovery",
      files,
    });
    expect(result.createdTaskIds).toHaveLength(0);
    expect(result.reason).toBe("not-customer");
    const titles = (
      await db.query.tasks.findMany({ where: eq(tasks.phaseId, configPhaseId) })
    ).map((t) => t.title);
    expect(titles).not.toContain("Staff Only Notes");
  });

  it("does not spawn from a customer upload outside Discovery", async () => {
    const files = packet([{ name: "Kickoff_Agenda.pdf", body: "agenda" }]);
    const result = await spawnConfigurationReviewTasks({
      actor: customer,
      sourceTask: {
        id: submitDocsId,
        title: "Shared: kickoff recording",
        projectId,
        phaseId: discoveryPhaseId,
      },
      phaseName: "Kickoff",
      files,
    });
    expect(result.createdTaskIds).toHaveLength(0);
    expect(result.reason).toBe("not-discovery");
  });

  it("leaves the Discovery upload alone when the site has no Configuration phase", async () => {
    const files = packet([{ name: "Orphan.pdf", body: "orphan" }]);
    const result = await spawnConfigurationReviewTasks({
      actor: customer,
      sourceTask: {
        id: submitDocsId,
        title: "Submit Documents",
        projectId: projectBId,
        phaseId: null,
      },
      phaseName: "Discovery",
      files,
    });
    expect(result.createdTaskIds).toHaveLength(0);
    expect(result.reason).toBe("no-config-phase");
    const spawned = await db.query.tasks.findMany({
      where: eq(tasks.projectId, projectBId),
    });
    expect(spawned.filter((t) => t.reviewRequired)).toHaveLength(0);
  });
});

describe.skipIf(!dbOk)("Discovery Wizard workbook → Configuration consumers (postgres)", () => {
  let projectId: string;
  let projectBId: string;
  let configPhaseId: string;
  let orgDetailsId: string;
  let specialist: Actor;
  const consumerIds: string[] = [];

  beforeAll(async () => {
    const f = await buildFixture();
    projectId = f.projects.a;
    projectBId = f.projects.b;
    specialist = f.actors.specialist;

    const discoveryPhaseId = f.phases.shared;
    await db.update(phases).set({ name: "Discovery" }).where(eq(phases.id, discoveryPhaseId));

    const [config] = await db
      .insert(phases)
      .values({
        projectId,
        name: "Site Configuration",
        order: 2,
        visibility: "INTERNAL",
      })
      .returning({ id: phases.id });
    configPhaseId = config.id;

    const [org] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: discoveryPhaseId,
        title: "Organization Details Form",
        visibility: "SHARED",
        ownerSide: "CUSTOMER",
        order: 1,
      })
      .returning({ id: tasks.id });
    orgDetailsId = org.id;

    await db.insert(tasks).values({
      projectId,
      phaseId: configPhaseId,
      title: "Guided Discovery Meeting",
      visibility: "INTERNAL",
      ownerSide: "INTERNAL",
      order: 0,
    });

    let order = 1;
    for (const title of DISCOVERY_WIZARD_CONSUMER_TITLES) {
      const [row] = await db
        .insert(tasks)
        .values({
          projectId,
          phaseId: configPhaseId,
          title,
          visibility: "INTERNAL",
          ownerSide: "INTERNAL",
          order,
        })
        .returning({ id: tasks.id });
      consumerIds.push(row.id);
      order += 1;
    }

    await db.insert(tasks).values({
      projectId,
      phaseId: configPhaseId,
      title: "Payer Setup",
      visibility: "INTERNAL",
      ownerSide: "INTERNAL",
      order,
    });
  });

  it("copies the full workbook onto each Configuration consumer (internal, deduped)", async () => {
    const bytes = Buffer.from("wizard-workbook-bytes-v1");
    const result = await attachWizardWorkbookToConfiguration({
      actor: specialist,
      projectId,
      sourceTask: { id: orgDetailsId, title: "Organization Details Form" },
      workbook: {
        kind: "FILE",
        name: "CEDAR Discovery Wizard.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: bytes.length,
        contentHash: hashUploadBytes(bytes),
        bytes,
      },
    });

    expect(result.reason).toBeUndefined();
    expect(result.consumerCount).toBe(DISCOVERY_WIZARD_CONSUMER_TITLES.length);
    expect(result.attachedTaskIds.sort()).toEqual([...consumerIds].sort());
    expect(result.skipped).toBe(0);

    const storageKeys = new Set<string>();
    for (const id of consumerIds) {
      const attached = await db.query.fileAssets.findMany({ where: eq(fileAssets.taskId, id) });
      expect(attached).toHaveLength(1);
      expect(attached[0]!.visibility).toBe("INTERNAL");
      expect(attached[0]!.kind).toBe("FILE");
      expect(attached[0]!.name).toBe("CEDAR Discovery Wizard.xlsx");
      expect(attached[0]!.contentHash).toBe(hashUploadBytes(bytes));
      expect(attached[0]!.storageKey).toBeTruthy();
      storageKeys.add(attached[0]!.storageKey!);
    }
    expect(storageKeys.size).toBe(consumerIds.length);

    const guidedRow = (
      await db.query.tasks.findMany({ where: eq(tasks.phaseId, configPhaseId) })
    ).find((t) => t.title === "Guided Discovery Meeting");
    expect(guidedRow).toBeTruthy();
    const guidedFiles = await db.query.fileAssets.findMany({
      where: eq(fileAssets.taskId, guidedRow!.id),
    });
    expect(guidedFiles).toHaveLength(0);

    const payer = (await db.query.tasks.findMany({ where: eq(tasks.phaseId, configPhaseId) })).find(
      (t) => t.title === "Payer Setup",
    );
    const payerFiles = await db.query.fileAssets.findMany({
      where: eq(fileAssets.taskId, payer!.id),
    });
    expect(payerFiles).toHaveLength(0);

    const again = await attachWizardWorkbookToConfiguration({
      actor: specialist,
      projectId,
      sourceTask: { id: orgDetailsId, title: "Organization Details Form" },
      workbook: {
        kind: "FILE",
        name: "CEDAR Discovery Wizard.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: bytes.length,
        contentHash: hashUploadBytes(bytes),
        bytes,
      },
    });
    expect(again.attachedTaskIds).toHaveLength(0);
    expect(again.skipped).toBe(DISCOVERY_WIZARD_CONSUMER_TITLES.length);
  });

  it("fans out a durable workbook link and skips the same URL on re-attach", async () => {
    const url =
      "https://contoso.sharepoint.com/sites/impl/Shared%20Documents/CEDAR.xlsx";
    const first = await attachWizardWorkbookToConfiguration({
      actor: specialist,
      projectId,
      sourceTask: { id: orgDetailsId, title: "Guided Discovery Meeting" },
      workbook: { kind: "LINK", name: "CEDAR.xlsx", url },
    });
    expect(first.attachedTaskIds).toHaveLength(DISCOVERY_WIZARD_CONSUMER_TITLES.length);
    for (const id of consumerIds) {
      const links = (await db.query.fileAssets.findMany({ where: eq(fileAssets.taskId, id) })).filter(
        (a) => a.kind === "LINK",
      );
      expect(links).toHaveLength(1);
      expect(links[0]!.url).toBe(url);
      expect(links[0]!.visibility).toBe("INTERNAL");
    }
    const again = await attachWizardWorkbookToConfiguration({
      actor: specialist,
      projectId,
      workbook: { kind: "LINK", name: "CEDAR.xlsx", url },
    });
    expect(again.skipped).toBe(DISCOVERY_WIZARD_CONSUMER_TITLES.length);
    expect(again.attachedTaskIds).toHaveLength(0);
  });

  it("looks up the project by code and does not invent consumers on a site without Configuration", async () => {
    const found = await findProjectByDiscoveryCode("imp-t001");
    expect(found?.id).toBe(projectId);

    const miss = await attachWizardWorkbookToConfiguration({
      actor: specialist,
      projectId: projectBId,
      workbook: {
        kind: "LINK",
        name: "x.xlsx",
        url: "https://contoso.sharepoint.com/sites/x/w.xlsx",
      },
    });
    expect(miss.attachedTaskIds).toHaveLength(0);
    expect(miss.reason).toBe("no-config-phase");
  });

  it("accepts Bearer DISCOVERY_WIZARD_WEBHOOK_SECRET or PRISM_READ_API_KEY", () => {
    const prevDedicated = process.env.DISCOVERY_WIZARD_WEBHOOK_SECRET;
    const prevPrism = process.env.PRISM_READ_API_KEY;
    process.env.DISCOVERY_WIZARD_WEBHOOK_SECRET = "wizard-secret";
    process.env.PRISM_READ_API_KEY = "prism-key";
    expect(authorizeDiscoveryWizardWebhook("Bearer wizard-secret")).toBe(true);
    expect(authorizeDiscoveryWizardWebhook("Bearer prism-key")).toBe(true);
    expect(authorizeDiscoveryWizardWebhook("Bearer other")).toBe(false);
    expect(authorizeDiscoveryWizardWebhook(null)).toBe(false);
    if (prevDedicated === undefined) delete process.env.DISCOVERY_WIZARD_WEBHOOK_SECRET;
    else process.env.DISCOVERY_WIZARD_WEBHOOK_SECRET = prevDedicated;
    if (prevPrism === undefined) delete process.env.PRISM_READ_API_KEY;
    else process.env.PRISM_READ_API_KEY = prevPrism;
  });
});
