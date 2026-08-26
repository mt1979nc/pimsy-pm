/**
 * Adds realistic conversation and task detail to the seeded demo data, so the
 * app can be shown to someone without every screen reading "no items yet".
 *
 * Safe to re-run. Only touches the demo customer accounts.
 *
 *   npx tsx --env-file-if-exists=.env.local demo-content.ts
 */

import { readFileSync } from "node:fs";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  projects,
  tasks,
  taskComments,
  messageThreads,
  messages,
  threadParticipants,
  fileAssets,
  statusUpdates,
} from "@/db/schema";
import { putFile } from "@/lib/storage";
import { addDays } from "@/lib/dates";

const ago = (days: number, hours = 0) =>
  new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);

async function main() {
  const project = await db.query.projects.findFirst({
    where: eq(projects.code, "IMP-9001"),
    with: { customerAccount: { with: { contacts: true } }, lead: true },
  });
  if (!project) throw new Error("Seed the demo data first (npm run setup).");

  const lead = project.lead!;
  const contact = project.customerAccount!.contacts.find((c) => c.isActive)!;

  // ---------------------------------------------------------------- messaging
  await db.delete(messageThreads).where(eq(messageThreads.projectId, project.id));

  const [shared] = await db
    .insert(messageThreads)
    .values({
      subject: "Payer list & billing questionnaire",
      visibility: "SHARED",
      projectId: project.id,
      createdById: lead.id,
      lastMessageAt: ago(0, 3),
      messageCount: 5,
    })
    .returning({ id: messageThreads.id });

  await db.insert(messages).values([
    {
      threadId: shared.id,
      authorId: lead.id,
      body: "Hi Dana — we're ready to start billing configuration. The one thing blocking us is the payer list. Could you send over the plans you're contracted with, plus any modifiers you use routinely?\n\nI've attached the spreadsheet template to the \"Complete & Upload Billing Spreadsheet\" task so you don't have to build it from scratch.",
      createdAt: ago(4, 2),
    },
    {
      threadId: shared.id,
      authorId: contact.id,
      body: "Got it. Our biller is out until Thursday — she owns the contracts. Is Friday soon enough, or does that push the go-live?",
      createdAt: ago(4),
    },
    {
      threadId: shared.id,
      authorId: lead.id,
      body: "Friday is fine. Payer setup takes us about three days, and we don't need it until training week, so there's slack. I'd rather have it right than fast.",
      createdAt: ago(3, 6),
    },
    {
      threadId: shared.id,
      authorId: contact.id,
      body: "Uploaded — 14 payers. Two questions:\n\n1. We bill BCBS under two different NPIs depending on location. Does that need separate entries?\n2. Do you need our Medicaid modifiers now or at go-live?",
      createdAt: ago(1, 4),
    },
    {
      threadId: shared.id,
      authorId: lead.id,
      body: "Perfect, thank you.\n\n1. Yes — separate entries, one per NPI. I'll set both up and label them by location so your billers can tell them apart.\n2. Now is better. Modifiers drive the fee schedule, and fixing them after go-live means reworking claims.",
      createdAt: ago(0, 3),
    },
  ]);

  await db.insert(threadParticipants).values([
    { threadId: shared.id, userId: lead.id, lastReadAt: new Date() },
    { threadId: shared.id, userId: contact.id, lastReadAt: ago(1) },
  ]);

  const [internal] = await db
    .insert(messageThreads)
    .values({
      subject: "Import file quality — hold the go-live date",
      visibility: "INTERNAL",
      projectId: project.id,
      createdById: lead.id,
      lastMessageAt: ago(0, 6),
      messageCount: 3,
    })
    .returning({ id: messageThreads.id });

  await db.insert(messages).values([
    {
      threadId: internal.id,
      authorId: lead.id,
      body: "Flagging early: their TherapyNotes export has ~400 duplicate client records and no consistent DOB format. Cleanup is going to be more than the two days we scoped.\n\nNot telling them the date is at risk yet — I want a real number first.",
      createdAt: ago(2, 5),
    },
    {
      threadId: internal.id,
      authorId: lead.id,
      body: "Update after working the file: dedupe is mechanical, roughly a day. The DOB formats are the problem — three different conventions and about 60 records that are genuinely ambiguous.\n\nPlan: I'll clean what's unambiguous and send the 60 back to them as a task. That keeps us on schedule and puts the judgement calls with the people who know the clients.",
      createdAt: ago(1, 2),
    },
    {
      threadId: internal.id,
      authorId: lead.id,
      body: "Confirmed with the data team — approach works. Go-live date holds. Posting a customer-facing update that says \"data review in progress\" without the detail.",
      createdAt: ago(0, 6),
    },
  ]);

  await db
    .insert(threadParticipants)
    .values({ threadId: internal.id, userId: lead.id, lastReadAt: new Date() });

  // ------------------------------------------------------------- task detail
  const target = await db.query.tasks.findFirst({
    where: and(
      eq(tasks.projectId, project.id),
      eq(tasks.title, "Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers"),
    ),
  });

  const task =
    target ??
    (await db.query.tasks.findFirst({
      where: and(eq(tasks.projectId, project.id), eq(tasks.ownerSide, "CUSTOMER")),
      orderBy: [asc(tasks.order)],
    }))!;

  await db
    .update(tasks)
    .set({
      description:
        "We need the plans you're contracted with, plus the modifiers you bill routinely.\n\nUse the template attached below — it has the columns we need in the order our importer expects. One row per payer/plan combination. If you bill the same payer under more than one NPI, give each NPI its own row.\n\nIf you're unsure about a modifier, leave it blank and add a note. We'd rather ask than guess.",
      assigneeId: contact.id,
      status: "IN_PROGRESS",
      completedAt: null,
      priority: "HIGH",
      visibility: "SHARED",
      ownerSide: "CUSTOMER",
      dueDate: addDays(new Date(), 3),
    })
    .where(eq(tasks.id, task.id));

  await db.delete(taskComments).where(eq(taskComments.taskId, task.id));
  await db.insert(taskComments).values([
    {
      taskId: task.id,
      authorId: lead.id,
      body: "Template attached. Shout if the column headings don't match how you hold this today — happy to map it on our side instead of making you retype anything.",
      visibility: "SHARED",
      createdAt: ago(4, 1),
    },
    {
      taskId: task.id,
      authorId: contact.id,
      body: "One clarification — do you want terminated contracts listed as well, or only active ones?",
      visibility: "SHARED",
      createdAt: ago(2, 3),
    },
    {
      taskId: task.id,
      authorId: lead.id,
      body: "Active only. Terminated payers just create noise in the fee schedule, and we can add one back in minutes if you re-contract.",
      visibility: "SHARED",
      createdAt: ago(2, 1),
    },
    {
      taskId: task.id,
      authorId: lead.id,
      body: "Internal note: their biller mentioned they're mid-renegotiation with Aetna. Don't build the Aetna fee schedule until that lands or we'll do it twice.",
      visibility: "INTERNAL",
      createdAt: ago(1, 5),
    },
  ]);

  await db.delete(fileAssets).where(eq(fileAssets.taskId, task.id));

  const png = readFileSync("/tmp/demo/intake-workflow.png");
  const csv = readFileSync("/tmp/demo/payer-list.csv");
  const pngKey = await putFile("intake-workflow.png", png);
  const csvKey = await putFile("payer-list-template.csv", csv);

  await db.insert(fileAssets).values([
    {
      name: "payer-list-template.csv",
      kind: "FILE",
      storageKey: csvKey,
      mimeType: "text/csv",
      sizeBytes: csv.length,
      description: "Fill this in — one row per payer/plan.",
      visibility: "SHARED",
      taskId: task.id,
      projectId: project.id,
      uploadedById: lead.id,
      createdAt: ago(4, 2),
    },
    {
      name: "intake-workflow.png",
      kind: "IMAGE",
      storageKey: pngKey,
      mimeType: "image/png",
      sizeBytes: png.length,
      description: "Marked up during guided discovery.",
      visibility: "SHARED",
      taskId: task.id,
      projectId: project.id,
      uploadedById: contact.id,
      createdAt: ago(2, 2),
    },
    {
      name: "ClaimMD enrollment portal",
      kind: "LINK",
      url: "https://www.claim.md/",
      description: "Where the enrollment gets submitted once the payer list is final.",
      visibility: "SHARED",
      taskId: task.id,
      projectId: project.id,
      uploadedById: lead.id,
      createdAt: ago(1),
    },
    {
      name: "Internal: margin notes on this account",
      kind: "LINK",
      url: "https://example.com/internal-margin-notes",
      description: "Never visible to the customer.",
      visibility: "INTERNAL",
      taskId: task.id,
      projectId: project.id,
      uploadedById: lead.id,
      createdAt: ago(1),
    },
  ]);

  // --------------------------------------------------------- status update
  await db.delete(statusUpdates).where(eq(statusUpdates.projectId, project.id));
  await db.insert(statusUpdates).values({
    projectId: project.id,
    authorId: lead.id,
    summary:
      "Configuration is on track and we start staff training the week of the 8th. Data review is in progress — no impact to the go-live date.",
    accomplished:
      "Org and user setup complete. Note templates built and moved. Guided discovery signed off.",
    upcoming: "Payer setup, then Training 1 (Intro to PIMSY) with your trainers.",
    needsFromYou:
      "The payer list with modifiers, and confirmation that your three trainers can make the 8th.",
    health: "GREEN",
    visibility: "SHARED",
    publishedAt: ago(1),
  });

  console.log(
    `demo content ready\n  project: ${project.name}\n  task:    ${task.id}\n  thread:  ${shared.id}\n  internal:${internal.id}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("MSG:", e?.message);
    console.error("CAUSE:", e?.cause?.message ?? e?.cause);
    process.exit(1);
  });
