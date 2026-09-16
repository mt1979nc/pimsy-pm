import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, tasks, users } from "@/db/schema";
import { notify } from "@/lib/notify";
import { runCustomerDigest } from "@/lib/run-customer-digest";
import { portalMessagePath, portalTaskPath } from "@/lib/customer-digest";
import { buildFixture, type Fixture } from "./fixtures";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

const mail = vi.hoisted(() => ({
  sent: [] as { to: string | string[]; subject: string; html: string; text?: string }[],
}));

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendEmail: async (args: { to: string | string[]; subject: string; html: string; text?: string }) => {
      mail.sent.push(args);
      return { id: "test-mail", skipped: true as const };
    },
  };
});

describe.skipIf(!dbOk)("customer email digest (postgres)", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await buildFixture();
  });

  it("notify() still writes per-item in-app rows but holds customer email for messages", async () => {
    mail.sent.length = 0;
    await notify({
      userIds: [f.actors.customerA.id, f.actors.specialist.id],
      type: "MESSAGE_POSTED",
      title: "Digest hold check",
      quote: { author: "Sam Specialist", text: "Please review the org details form." },
      linkUrl: `/projects/${f.projects.a}/messages/${f.threads.shared}`,
      portalLinkUrl: portalMessagePath(f.projects.a, f.threads.shared),
      email: true,
    });

    const rows = await db.query.notifications.findMany({
      where: eq(notifications.title, "Digest hold check"),
    });
    expect(rows).toHaveLength(2);
    const forCustomer = rows.find((r) => r.userId === f.actors.customerA.id)!;
    const forStaff = rows.find((r) => r.userId === f.actors.specialist.id)!;
    expect(forCustomer.emailedAt).toBeNull();
    expect(forCustomer.linkUrl).toBe(portalMessagePath(f.projects.a, f.threads.shared));
    expect(forCustomer.body).toContain("org details form");
    expect(forStaff.emailedAt).not.toBeNull();
    expect(forStaff.linkUrl).toMatch(/^\/projects\//);

    const staffMail = mail.sent.filter((m) =>
      (Array.isArray(m.to) ? m.to : [m.to]).includes("spec@pimsyehr.com"),
    );
    const customerMail = mail.sent.filter((m) =>
      (Array.isArray(m.to) ? m.to : [m.to]).some((t) => t.includes("acme.example.com")),
    );
    expect(staffMail.length).toBeGreaterThanOrEqual(1);
    expect(customerMail).toHaveLength(0);
  });

  it("five due-soon tasks become five in-app flags and one customer email", async () => {
    mail.sent.length = 0;
    const now = new Date("2026-09-16T16:00:00.000Z");
    const due = new Date("2026-09-16T16:00:00.000Z");

    const extras = await db
      .insert(tasks)
      .values(
        [1, 2, 3, 4].map((n) => ({
          projectId: f.projects.a,
          phaseId: f.phases.shared,
          title: `Customer due item ${n}`,
          visibility: "SHARED" as const,
          ownerSide: "CUSTOMER" as const,
          status: "TODO" as const,
          dueDate: due,
          order: 20 + n,
        })),
      )
      .returning({ id: tasks.id });

    await db
      .update(tasks)
      .set({ dueDate: due, status: "TODO", visibility: "SHARED", ownerSide: "CUSTOMER" })
      .where(eq(tasks.id, f.tasks.customer));

    const result = await runCustomerDigest(now);
    expect(result.scannedTasks).toBeGreaterThanOrEqual(5);
    expect(result.notificationsCreated).toBeGreaterThanOrEqual(5);
    expect(result.emailsSent).toBeGreaterThanOrEqual(1);

    const flags = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, f.actors.customerA.id), eq(notifications.type, "TASK_DUE_SOON")),
    });
    const dueFlags = flags.filter((n) => n.linkUrl?.startsWith("/portal/"));
    expect(dueFlags.length).toBeGreaterThanOrEqual(5);
    expect(dueFlags.every((n) => n.linkUrl && n.linkUrl.includes("/portal/projects/"))).toBe(true);
    expect(new Set(dueFlags.map((n) => n.linkUrl)).size).toBe(dueFlags.length);

    const customerMail = mail.sent.filter((m) =>
      (Array.isArray(m.to) ? m.to : [m.to]).some((t) => t.includes("contact@acme.example.com")),
    );
    expect(customerMail).toHaveLength(1);
    expect(customerMail[0]!.subject).toMatch(/tasks due in the next 24 hours|PATH update/i);
    expect(customerMail[0]!.html).toContain("/portal/projects/");
    expect(customerMail[0]!.html).toContain(portalTaskPath(f.projects.a, f.tasks.customer));
    for (const row of extras) {
      expect(customerMail[0]!.html).toContain(portalTaskPath(f.projects.a, row.id));
    }
    expect(customerMail[0]!.html).not.toMatch(/href="[^"]*\/projects\/[^"]+\/tasks\//);
    expect(customerMail[0]!.text).toContain("/portal/projects/");

    const emailed = dueFlags.filter((n) => n.emailedAt);
    expect(emailed.length).toBeGreaterThanOrEqual(5);

    mail.sent.length = 0;
    const second = await runCustomerDigest(now);
    expect(second.notificationsCreated).toBe(0);
    const extraCustomerMail = mail.sent.filter((m) =>
      (Array.isArray(m.to) ? m.to : [m.to]).some((t) => t.includes("contact@acme.example.com")),
    );
    expect(extraCustomerMail).toHaveLength(0);
  });

  it("respects a customer opt-out of due-soon email but still writes the in-app flag", async () => {
    mail.sent.length = 0;
    await db
      .update(users)
      .set({ notificationPrefs: { emailEnabled: true, types: { TASK_DUE_SOON: false } } })
      .where(eq(users.id, f.actors.customerA.id));

    const now = new Date("2026-09-16T16:00:00.000Z");
    const [task] = await db
      .insert(tasks)
      .values({
        projectId: f.projects.a,
        phaseId: f.phases.shared,
        title: "Opt-out due item",
        visibility: "SHARED",
        ownerSide: "CUSTOMER",
        status: "TODO",
        dueDate: now,
        order: 40,
      })
      .returning({ id: tasks.id });

    await runCustomerDigest(now);

    const flag = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.userId, f.actors.customerA.id),
        eq(notifications.title, "Due soon: Opt-out due item"),
      ),
    });
    expect(flag).toBeTruthy();
    expect(flag!.linkUrl).toBe(portalTaskPath(f.projects.a, task.id));
    expect(flag!.emailedAt).toBeNull();

    const customerMail = mail.sent.filter((m) =>
      (Array.isArray(m.to) ? m.to : [m.to]).some((t) => t.includes("contact@acme.example.com")),
    );
    expect(customerMail.every((m) => !m.html.includes("Opt-out due item"))).toBe(true);

    await db.update(users).set({ notificationPrefs: null }).where(eq(users.id, f.actors.customerA.id));
  });

  it("does not leave pending customer MESSAGE_POSTED rows ungrouped on the next digest", async () => {
    mail.sent.length = 0;
    await notify({
      userIds: [f.actors.customerA.id],
      type: "MESSAGE_POSTED",
      title: "New reply in “Kickoff follow-ups”",
      quote: { author: "Sam Specialist", text: "Ping about training dates." },
      linkUrl: `/projects/${f.projects.a}/messages/${f.threads.shared}`,
      portalLinkUrl: portalMessagePath(f.projects.a, f.threads.shared),
      email: true,
    });
    await notify({
      userIds: [f.actors.customerA.id],
      type: "MESSAGE_POSTED",
      title: "New conversation: Billing spreadsheet",
      quote: { author: "Sam Specialist", text: "Please send the completed sheet." },
      linkUrl: `/projects/${f.projects.a}/messages/${f.threads.shared}`,
      portalLinkUrl: portalMessagePath(f.projects.a, f.threads.shared),
      email: true,
    });

    const pendingBefore = await db.query.notifications.findMany({
      where: and(
        eq(notifications.userId, f.actors.customerA.id),
        eq(notifications.type, "MESSAGE_POSTED"),
        isNull(notifications.emailedAt),
      ),
    });
    expect(pendingBefore.length).toBeGreaterThanOrEqual(2);

    await runCustomerDigest(new Date("2026-09-16T16:00:00.000Z"));

    const customerMail = mail.sent.filter((m) =>
      (Array.isArray(m.to) ? m.to : [m.to]).some((t) => t.includes("contact@acme.example.com")),
    );
    expect(customerMail.length).toBe(1);
    expect(customerMail[0]!.html).toContain("Kickoff follow-ups");
    expect(customerMail[0]!.html).toContain("Billing spreadsheet");
    expect(customerMail[0]!.html).toContain(portalMessagePath(f.projects.a, f.threads.shared));
    expect(customerMail[0]!.html).not.toContain(`/projects/${f.projects.a}/messages/`);

    const pendingAfter = await db.query.notifications.findMany({
      where: and(
        eq(notifications.userId, f.actors.customerA.id),
        eq(notifications.type, "MESSAGE_POSTED"),
        isNull(notifications.emailedAt),
      ),
    });
    expect(pendingAfter).toHaveLength(0);
  });
});
