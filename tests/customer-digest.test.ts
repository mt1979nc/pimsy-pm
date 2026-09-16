import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { layout, plainText } from "@/lib/email";
import {
  CUSTOMER_DIGEST_TYPES,
  absoluteUrl,
  calendarDaysUntilDue,
  classifyCustomerDue,
  composeCustomerDigest,
  digestSubject,
  holdCustomerEmail,
  isPortalPath,
  notificationToDigestItem,
  portalMessagePath,
  portalTaskPath,
  staffRouteToPortal,
  type DigestItem,
} from "@/lib/customer-digest";

const APP = "https://path.pimsyehr.com";

function fiveDueSoon(): DigestItem[] {
  return [1, 2, 3, 4, 5].map((n) => ({
    kind: "due_soon" as const,
    title: `Submit worksheet ${n}`,
    path: portalTaskPath("proj-acme", `task-${n}`),
    detail: n === 1 ? "Due today · Acme Behavioral" : "Due tomorrow · Acme Behavioral",
  }));
}

describe("customer email digest composition", () => {
  it("holds customer email for due-soon, overdue, and staff messages only", () => {
    expect(CUSTOMER_DIGEST_TYPES).toEqual(["TASK_DUE_SOON", "TASK_OVERDUE", "MESSAGE_POSTED"]);
    expect(holdCustomerEmail("CUSTOMER", "TASK_DUE_SOON")).toBe(true);
    expect(holdCustomerEmail("CUSTOMER", "TASK_OVERDUE")).toBe(true);
    expect(holdCustomerEmail("CUSTOMER", "MESSAGE_POSTED")).toBe(true);
    expect(holdCustomerEmail("CUSTOMER", "TASK_ASSIGNED")).toBe(false);
    expect(holdCustomerEmail("CUSTOMER", "MENTIONED")).toBe(false);
    expect(holdCustomerEmail("SPECIALIST", "MESSAGE_POSTED")).toBe(false);
    expect(holdCustomerEmail("SPECIALIST", "TASK_DUE_SOON")).toBe(false);
  });

  it("builds portal task and message paths, never staff /projects/…", () => {
    expect(portalTaskPath("p1", "t1")).toBe("/portal/projects/p1/tasks/t1");
    expect(portalMessagePath("p1", "m1")).toBe("/portal/projects/p1/messages/m1");
    expect(isPortalPath("/portal/projects/p1/tasks/t1")).toBe(true);
    expect(isPortalPath("/projects/p1/tasks/t1")).toBe(false);
    expect(staffRouteToPortal("/projects/p1/tasks/t1")).toBe("/portal/projects/p1/tasks/t1");
    expect(staffRouteToPortal("/projects/p1/messages/th1")).toBe("/portal/projects/p1/messages/th1");
    expect(staffRouteToPortal("/portal/projects/p1/tasks/t1")).toBe("/portal/projects/p1/tasks/t1");
    expect(staffRouteToPortal("/inbox")).toBeNull();
    expect(absoluteUrl(APP, "/portal/projects/p1/tasks/t1")).toBe(
      `${APP}/portal/projects/p1/tasks/t1`,
    );
  });

  it("treats today and tomorrow as due-soon on the Eastern calendar", () => {
    const now = new Date("2026-09-16T17:00:00.000Z"); // 1pm Eastern (EDT)
    expect(classifyCustomerDue(new Date("2026-09-16T16:00:00.000Z"), now)).toBe("due_soon");
    expect(classifyCustomerDue(new Date("2026-09-17T16:00:00.000Z"), now)).toBe("due_soon");
    expect(classifyCustomerDue(new Date("2026-09-18T16:00:00.000Z"), now)).toBeNull();
    expect(classifyCustomerDue(new Date("2026-09-15T16:00:00.000Z"), now)).toBe("overdue");
    expect(calendarDaysUntilDue(new Date("2026-09-17T16:00:00.000Z"), now)).toBe(1);
  });

  it("one summary email for five due-soon tasks, each with a portal deep link", () => {
    const items = fiveDueSoon();
    expect(digestSubject(items)).toBe("5 tasks due in the next 24 hours");
    const composed = composeCustomerDigest({ items, appUrl: APP });
    expect(composed).not.toBeNull();
    expect(composed!.subject).toBe("5 tasks due in the next 24 hours");
    expect(composed!.opts.heading).toMatch(/PATH/);
    const html = layout(composed!.opts);
    const text = plainText(composed!.opts);
    expect(html).toContain("PATH");
    expect(html).toContain("Due in the next 24 hours");
    for (const n of [1, 2, 3, 4, 5]) {
      expect(html).toContain(`Submit worksheet ${n}`);
      expect(html).toContain(`${APP}/portal/projects/proj-acme/tasks/task-${n}`);
      expect(text).toContain(`${APP}/portal/projects/proj-acme/tasks/task-${n}`);
    }
    expect(html).not.toMatch(/https?:\/\/[^"]+\/projects\/proj-acme\/tasks/);
    expect(html).not.toMatch(/\/projects\/proj-acme\/tasks\/task-1"/);
    expect(text).not.toContain("/projects/proj-acme/tasks/task-1");
    expect(html).toContain(`${APP}/portal`);
  });

  it("mixes overdue tasks and PIMSY staff messages into one email", () => {
    const items: DigestItem[] = [
      {
        kind: "message",
        title: "New reply in “Kickoff follow-ups”",
        path: portalMessagePath("proj-acme", "thread-1"),
        detail: "Please upload the org details form this week.",
      },
      {
        kind: "overdue",
        title: "Submit org details form",
        path: portalTaskPath("proj-acme", "task-org"),
        detail: "2 days overdue · Acme Behavioral",
      },
      {
        kind: "due_soon",
        title: "Schedule Training 1",
        path: portalTaskPath("proj-acme", "task-trn"),
        detail: "Due tomorrow · Acme Behavioral",
      },
    ];
    const composed = composeCustomerDigest({ items, appUrl: APP });
    expect(composed!.subject).toBe("Your PATH update: 2 tasks and 1 message");
    const html = layout(composed!.opts);
    expect(html).toContain("Overdue");
    expect(html).toContain("Messages from the PIMSY team");
    expect(html).toContain(`${APP}/portal/projects/proj-acme/messages/thread-1`);
    expect(html).toContain(`${APP}/portal/projects/proj-acme/tasks/task-org`);
    expect(html).toContain(`${APP}/portal/projects/proj-acme/tasks/task-trn`);
    expect(html).not.toContain("/projects/proj-acme/messages/");
    expect(plainText(composed!.opts)).toContain("Please upload the org details form this week.");
  });

  it("drops staff routes that cannot be rewritten to the portal", () => {
    const composed = composeCustomerDigest({
      items: [
        { kind: "message", title: "Nope", path: "/inbox/abc" },
        { kind: "due_soon", title: "Good", path: portalTaskPath("p", "t") },
      ],
      appUrl: APP,
    });
    expect(composed!.opts.sections.flatMap((s) => s.items).map((i) => i.title)).toEqual(["Good"]);
  });

  it("rewrites a stored staff link into a portal digest item", () => {
    const item = notificationToDigestItem({
      type: "TASK_DUE_SOON",
      title: "Due soon: Submit org details form",
      body: "Due tomorrow · Acme Behavioral",
      linkUrl: "/projects/proj-acme/tasks/task-org",
    });
    expect(item).toEqual({
      kind: "due_soon",
      title: "Submit org details form",
      path: "/portal/projects/proj-acme/tasks/task-org",
      detail: "Due tomorrow · Acme Behavioral",
    });
  });

  it("does not invent PHI in the digest copy", () => {
    const composed = composeCustomerDigest({ items: fiveDueSoon(), appUrl: APP });
    const blob = `${composed!.subject}\n${composed!.opts.paragraphs.join("\n")}\n${composed!.opts.footer}`;
    expect(blob).not.toMatch(/\bMRN\b|\bSSN\b|patient name|diagnosis/i);
    expect(composed!.opts.footer).toMatch(/no patient information/i);
  });
});

describe("customer digest module stays off the Postgres client", () => {
  it("does not import @/db, postgres, or Resend", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/customer-digest.ts"), "utf8");
    expect(src).not.toMatch(/from ["']@\/db["']/);
    expect(src).not.toMatch(/from ["']postgres["']/);
    expect(src).not.toMatch(/from ["']resend["']/);
    expect(src).not.toMatch(/from ["']\.\/email["']/);
    expect(src).not.toMatch(/from ["']\.\/notify["']/);
  });
});
