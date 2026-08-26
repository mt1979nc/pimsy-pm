import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  customerAccounts,
  users,
  projects,
  projectMembers,
  phases,
  tasks,
  milestones,
  messageThreads,
  messages,
  threadParticipants,
  statusUpdates,
  taskComments,
  fileAssets,
} from "@/db/schema";
import type { Actor } from "@/lib/authz";
import type { CustomerActor } from "@/lib/portal";

/**
 * Two customers, two projects, and content at every visibility level.
 * The point of the fixture is that customer A must never be able to reach
 * anything belonging to customer B, nor anything marked INTERNAL on their own.
 */
export type Fixture = Awaited<ReturnType<typeof buildFixture>>;

export async function resetDb() {
  await db.execute(sql`
    TRUNCATE TABLE
      "mention", "thread_participant", "message", "message_thread",
      "task_comment", "task_dependency", "time_entry", "file_asset",
      "notification", "audit_log", "status_update", "risk",
      "task", "phase", "milestone", "project_member", "project",
      "template_task", "template_phase", "template_milestone", "project_template",
      "session", "account", "verification_token", "user", "customer_account"
    RESTART IDENTITY CASCADE
  `);
}

export async function buildFixture() {
  await resetDb();

  const [acctA, acctB] = await db
    .insert(customerAccounts)
    .values([
      { name: "Acme Behavioral", slug: "acme-behavioral", internalNotes: "secret note A" },
      { name: "Bravo Recovery", slug: "bravo-recovery", internalNotes: "secret note B" },
    ])
    .returning({ id: customerAccounts.id });

  const [specialist, manager, memberUser, contactA, contactB] = await db
    .insert(users)
    .values([
      { email: "spec@pimsyehr.com", name: "Sam Specialist", role: "SPECIALIST" },
      { email: "coo@pimsyehr.com", name: "Morgan Manager", role: "MANAGER" },
      { email: "member@pimsyehr.com", name: "Micah Member", role: "MEMBER" },
      {
        email: "contact@acme.example.com",
        name: "Avery Acme",
        role: "CUSTOMER",
        customerAccountId: acctA.id,
      },
      {
        email: "contact@bravo.example.com",
        name: "Blake Bravo",
        role: "CUSTOMER",
        customerAccountId: acctB.id,
      },
    ])
    .returning({ id: users.id });

  const [projA, projB, projInternal, projPortalOff, projManagerOnly] = await db
    .insert(projects)
    .values([
      {
        name: "Acme implementation",
        code: "IMP-T001",
        customerAccountId: acctA.id,
        leadId: specialist.id,
        portalEnabled: true,
      },
      {
        name: "Bravo implementation",
        code: "IMP-T002",
        customerAccountId: acctB.id,
        leadId: specialist.id,
        portalEnabled: true,
      },
      {
        name: "Internal tooling",
        code: "INT-T003",
        type: "INTERNAL",
        leadId: specialist.id,
        portalEnabled: false,
      },
      {
        name: "Acme phase 2 (portal off)",
        code: "IMP-T004",
        customerAccountId: acctA.id,
        leadId: specialist.id,
        portalEnabled: false,
      },
      {
        // Deliberately has no relationship to `specialist` at all — proves a
        // specialist is scoped to their own assignments, not the whole
        // portfolio, while a manager (a leadership/read-all role) still
        // reaches it.
        name: "Bravo phase 2 (manager-led, no specialist)",
        code: "IMP-T005",
        customerAccountId: acctB.id,
        leadId: manager.id,
        portalEnabled: true,
      },
    ])
    .returning({ id: projects.id });

  await db.insert(projectMembers).values([
    { projectId: projA.id, userId: specialist.id, role: "LEAD" },
    { projectId: projA.id, userId: contactA.id, role: "CUSTOMER_CONTACT" },
    { projectId: projB.id, userId: specialist.id, role: "LEAD" },
    { projectId: projB.id, userId: contactB.id, role: "CUSTOMER_CONTACT" },
  ]);

  const [sharedPhase, internalPhase] = await db
    .insert(phases)
    .values([
      { projectId: projA.id, name: "Discovery", order: 0, visibility: "SHARED" },
      { projectId: projA.id, name: "Internal prep", order: 1, visibility: "INTERNAL" },
    ])
    .returning({ id: phases.id });

  const [sharedTask, internalTask, customerTask, internalPhaseTask] = await db
    .insert(tasks)
    .values([
      {
        projectId: projA.id,
        phaseId: sharedPhase.id,
        title: "Shared: kickoff recording",
        visibility: "SHARED",
        ownerSide: "INTERNAL",
        order: 0,
      },
      {
        projectId: projA.id,
        phaseId: sharedPhase.id,
        title: "INTERNAL: margin review",
        visibility: "INTERNAL",
        ownerSide: "INTERNAL",
        order: 1,
      },
      {
        projectId: projA.id,
        phaseId: sharedPhase.id,
        title: "Customer: submit org details form",
        visibility: "SHARED",
        ownerSide: "CUSTOMER",
        order: 2,
      },
      {
        projectId: projA.id,
        phaseId: internalPhase.id,
        title: "INTERNAL: staffing plan",
        visibility: "INTERNAL",
        ownerSide: "INTERNAL",
        order: 0,
      },
    ])
    .returning({ id: tasks.id });

  // Comments and attachments at both visibility levels, on a SHARED task.
  await db.insert(taskComments).values([
    {
      taskId: sharedTask.id,
      authorId: specialist.id,
      body: "Shared comment the customer should read.",
      visibility: "SHARED",
    },
    {
      taskId: sharedTask.id,
      authorId: specialist.id,
      body: "INTERNAL comment about pricing.",
      visibility: "INTERNAL",
    },
  ]);

  const [sharedAsset, internalAsset, otherAsset] = await db
    .insert(fileAssets)
    .values([
      {
        name: "shared-guide.pdf",
        kind: "FILE",
        storageKey: "test/shared-guide.pdf",
        visibility: "SHARED",
        taskId: sharedTask.id,
        projectId: projA.id,
        uploadedById: specialist.id,
      },
      {
        name: "INTERNAL-margins.xlsx",
        kind: "FILE",
        storageKey: "test/internal-margins.xlsx",
        visibility: "INTERNAL",
        taskId: sharedTask.id,
        projectId: projA.id,
        uploadedById: specialist.id,
      },
      {
        name: "bravo-only.pdf",
        kind: "FILE",
        storageKey: "test/bravo-only.pdf",
        visibility: "SHARED",
        projectId: projB.id,
        uploadedById: specialist.id,
      },
    ])
    .returning({ id: fileAssets.id });

  await db.insert(milestones).values([
    { projectId: projA.id, name: "Go-Live", visibility: "SHARED", isGoLive: true, order: 0 },
    { projectId: projA.id, name: "INTERNAL: margin checkpoint", visibility: "INTERNAL", order: 1 },
  ]);

  await db.insert(statusUpdates).values([
    {
      projectId: projA.id,
      authorId: specialist.id,
      summary: "Shared update the customer should see",
      visibility: "SHARED",
      publishedAt: new Date(),
    },
    {
      projectId: projA.id,
      authorId: specialist.id,
      summary: "INTERNAL update about account risk",
      visibility: "INTERNAL",
      publishedAt: new Date(),
    },
  ]);

  const [sharedThread, internalThread, otherCustomerThread] = await db
    .insert(messageThreads)
    .values([
      {
        subject: "Shared: kickoff follow-ups",
        visibility: "SHARED",
        projectId: projA.id,
        createdById: specialist.id,
        messageCount: 1,
      },
      {
        subject: "INTERNAL: this account is at risk",
        visibility: "INTERNAL",
        projectId: projA.id,
        createdById: specialist.id,
        messageCount: 1,
      },
      {
        subject: "Shared: Bravo kickoff",
        visibility: "SHARED",
        projectId: projB.id,
        createdById: specialist.id,
        messageCount: 1,
      },
    ])
    .returning({ id: messageThreads.id });

  await db.insert(messages).values([
    { threadId: sharedThread.id, authorId: specialist.id, body: "Visible to the customer." },
    {
      threadId: internalThread.id,
      authorId: specialist.id,
      body: "Customer must never read this.",
    },
    { threadId: otherCustomerThread.id, authorId: specialist.id, body: "Bravo only." },
  ]);

  await db.insert(threadParticipants).values([
    { threadId: sharedThread.id, userId: specialist.id },
    { threadId: sharedThread.id, userId: contactA.id },
    { threadId: internalThread.id, userId: specialist.id },
    { threadId: otherCustomerThread.id, userId: contactB.id },
  ]);

  const actorFor = (id: string, role: string, customerAccountId: string | null): Actor => ({
    id,
    email: `${id}@test`,
    name: "Test",
    role: role as Actor["role"],
    customerAccountId,
    isActive: true,
  });

  const customerActorFor = (id: string, customerAccountId: string): CustomerActor => ({
    ...actorFor(id, "CUSTOMER", customerAccountId),
    customerAccountId,
  });

  return {
    accounts: { a: acctA.id, b: acctB.id },
    projects: {
      a: projA.id,
      b: projB.id,
      internal: projInternal.id,
      portalOff: projPortalOff.id,
      managerOnly: projManagerOnly.id,
    },
    phases: { shared: sharedPhase.id, internal: internalPhase.id },
    tasks: {
      shared: sharedTask.id,
      internal: internalTask.id,
      customer: customerTask.id,
      internalPhase: internalPhaseTask.id,
    },
    assets: {
      shared: sharedAsset.id,
      internal: internalAsset.id,
      otherCustomer: otherAsset.id,
    },
    threads: {
      shared: sharedThread.id,
      internal: internalThread.id,
      otherCustomer: otherCustomerThread.id,
    },
    actors: {
      specialist: actorFor(specialist.id, "SPECIALIST", null),
      manager: actorFor(manager.id, "MANAGER", null),
      member: actorFor(memberUser.id, "MEMBER", null),
      customerA: customerActorFor(contactA.id, acctA.id),
      customerB: customerActorFor(contactB.id, acctB.id),
    },
  };
}
