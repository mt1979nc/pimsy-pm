import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { customerAccounts, notifications, projects, statusUpdates, users } from "@/db/schema";
import { runWeeklyStatusUpdateReminder } from "@/lib/run-weekly-status-update-reminder";
import { resetDb } from "./fixtures";

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

describe.skipIf(!dbOk)("weekly status-update reminder (postgres)", () => {
  let leadId = "";
  let otherLeadId = "";
  let cedarId = "";

  const thursdayMorning = new Date("2026-09-17T14:00:00.000Z"); // 09:00 CDT Thursday
  const wednesday = new Date("2026-09-16T14:00:00.000Z");

  beforeAll(async () => {
    await resetDb();
    const [acct] = await db
      .insert(customerAccounts)
      .values({ name: "Harbor Clinic", slug: "harbor-weekly" })
      .returning({ id: customerAccounts.id });

    const [lead, other] = await db
      .insert(users)
      .values([
        {
          email: "morgan@pimsyehr.com",
          name: "Morgan Davis",
          role: "SPECIALIST",
          timeZone: "America/Chicago",
        },
        {
          email: "jeremy@pimsyehr.com",
          name: "Jeremy",
          role: "SPECIALIST",
          timeZone: "America/Chicago",
        },
      ])
      .returning({ id: users.id });
    leadId = lead.id;
    otherLeadId = other.id;

    const [cedar] = await db
      .insert(projects)
      .values([
        {
          name: "CEDAR Health",
          code: "CEDAR",
          crmAcronym: "CEDAR",
          customerAccountId: acct.id,
          leadId,
          status: "IN_PROGRESS",
          type: "IMPLEMENTATION",
        },
        {
          name: "BridgeHill Crossing",
          code: "BHC",
          crmAcronym: "BHC",
          customerAccountId: acct.id,
          leadId,
          status: "IN_PROGRESS",
          type: "IMPLEMENTATION",
        },
        {
          name: "Triangle Health",
          code: "THS",
          crmAcronym: "THS",
          customerAccountId: acct.id,
          leadId: otherLeadId,
          status: "IN_PROGRESS",
          type: "IMPLEMENTATION",
        },
        {
          name: "Finished Site",
          code: "DONE",
          crmAcronym: "DONE",
          customerAccountId: acct.id,
          leadId,
          status: "COMPLETED",
          type: "IMPLEMENTATION",
        },
      ])
      .returning({ id: projects.id });
    cedarId = cedar.id;

    await db.insert(statusUpdates).values({
      projectId: cedarId,
      authorId: otherLeadId,
      summary: "Covering spec posted Wednesday",
      health: "GREEN",
      visibility: "SHARED",
      publishedAt: new Date("2026-09-16T18:00:00.000Z"),
    });
  });

  it("does not notify on Wednesday", async () => {
    mail.sent.length = 0;
    const result = await runWeeklyStatusUpdateReminder(wednesday);
    expect(result.leadsNotified).toBe(0);
    expect(result.notificationsCreated).toBe(0);
    expect(mail.sent).toEqual([]);
  });

  it("emails the lead for sites still missing this Thursday’s update", async () => {
    mail.sent.length = 0;
    const result = await runWeeklyStatusUpdateReminder(thursdayMorning);
    expect(result.scannedProjects).toBeGreaterThanOrEqual(3);
    expect(result.leadsNotified).toBe(2);
    expect(result.notificationsCreated).toBe(2);

    const morganMail = mail.sent.find((m) => m.to === "morgan@pimsyehr.com");
    expect(morganMail?.subject).toBe("Due today: Provide account updates for sites BHC, CEDAR");
    expect(morganMail?.text ?? morganMail?.html).toMatch(/BHC/);
    expect(morganMail?.text ?? morganMail?.html).toMatch(/CEDAR/);
    expect(morganMail?.subject).not.toMatch(/THS/);
    expect(morganMail?.subject).not.toMatch(/DONE/);

    const jeremyMail = mail.sent.find((m) => m.to === "jeremy@pimsyehr.com");
    expect(jeremyMail?.subject).toBe("Due today: Provide account updates for sites THS");

    const rows = await db.query.notifications.findMany({
      where: eq(notifications.userId, leadId),
    });
    expect(rows.some((n) => n.type === "STATUS_UPDATE_DUE" && n.linkUrl?.startsWith("/projects/"))).toBe(
      true,
    );
  });

  it("is idempotent for the rest of Thursday", async () => {
    mail.sent.length = 0;
    const again = await runWeeklyStatusUpdateReminder(new Date("2026-09-17T18:00:00.000Z"));
    expect(again.leadsNotified).toBe(0);
    expect(again.skippedAlreadyNotified).toBe(2);
    expect(mail.sent).toEqual([]);
  });

  it("skips a site once the lead posts this week’s update", async () => {
    await db.insert(statusUpdates).values({
      projectId: cedarId,
      authorId: leadId,
      summary: "Thursday snapshot",
      health: "GREEN",
      visibility: "SHARED",
      publishedAt: new Date("2026-09-17T14:30:00.000Z"),
    });
    await db.delete(notifications).where(eq(notifications.userId, leadId));
    mail.sent.length = 0;
    const result = await runWeeklyStatusUpdateReminder(new Date("2026-09-17T15:00:00.000Z"));
    const morganMail = mail.sent.find((m) => m.to === "morgan@pimsyehr.com");
    expect(morganMail?.subject).toBe("Due today: Provide account updates for sites BHC");
    expect(result.leadsNotified).toBeGreaterThanOrEqual(1);
  });
});
