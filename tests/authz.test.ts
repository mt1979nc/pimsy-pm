import { describe, it, expect, beforeAll, vi } from "vitest";
import { buildFixture, type Fixture } from "./fixtures";
import {
  accessibleProjectIds,
  assertProjectAccess,
  assertProjectWrite,
  resolveVisibilityForActor,
  canSeeInternal,
  canSeePortfolio,
  canManageTemplates,
  NotFoundError,
  ForbiddenError,
} from "@/lib/authz";
import { assertThreadAccess, listProjectThreads, listInboxThreads } from "@/lib/threads";
import { listTaskAttachments, assertAttachmentAccess } from "@/lib/attachments";
import { resolveKey } from "@/lib/storage";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { fileAssets, users, notifications, orgSettings } from "@/db/schema";
import { shouldEmail, builtInDefaults, typesFor, getOrgSettings } from "@/lib/notification-prefs";
import { notify } from "@/lib/notify";
import { isAllowedTeamsWebhook, postToTeams } from "@/lib/teams";
import {
  portalProjects,
  portalPlan,
  portalMilestones,
  portalStatusUpdates,
  portalActionItems,
  portalProject,
} from "@/lib/portal";

let f: Fixture;

beforeAll(async () => {
  f = await buildFixture();
});

// ===========================================================================
// The boundary that matters most
// ===========================================================================

describe("customer isolation between accounts", () => {
  it("a customer can only reach their own account's projects", async () => {
    const ids = await accessibleProjectIds(f.actors.customerA);
    expect(ids).toContain(f.projects.a);
    expect(ids).not.toContain(f.projects.b);
    expect(ids).not.toContain(f.projects.internal);
  });

  it("reaching another customer's project throws 404, not 403", async () => {
    // A 403 would confirm the project exists. It must be indistinguishable
    // from a project that isn't there at all.
    await expect(assertProjectAccess(f.actors.customerA, f.projects.b)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("a customer cannot reach an internal project", async () => {
    await expect(
      assertProjectAccess(f.actors.customerA, f.projects.internal),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("portal helpers refuse another customer's project id outright", async () => {
    expect(await portalProject(f.actors.customerA, f.projects.b)).toBeNull();
    const plan = await portalPlan(f.actors.customerA, f.projects.b);
    expect(plan.phases).toHaveLength(0);
    expect(plan.looseTasks).toHaveLength(0);
    expect(await portalMilestones(f.actors.customerA, f.projects.b)).toHaveLength(0);
    expect(await portalStatusUpdates(f.actors.customerA, f.projects.b)).toHaveLength(0);
  });

  it("a customer's action items never include another account's work", async () => {
    const items = await portalActionItems(f.actors.customerA);
    for (const i of items) expect(i.projectId).toBe(f.projects.a);
  });
});

// ===========================================================================
// Portal disabled
// ===========================================================================

describe("portal toggle", () => {
  it("a project with the portal off is unreachable by the customer", async () => {
    await expect(
      assertProjectAccess(f.actors.customerA, f.projects.portalOff),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await portalProject(f.actors.customerA, f.projects.portalOff)).toBeNull();

    const list = await portalProjects(f.actors.customerA);
    expect(list.map((p) => p.id)).not.toContain(f.projects.portalOff);
  });

  it("staff can still open a portal-disabled project", async () => {
    await expect(
      assertProjectAccess(f.actors.specialist, f.projects.portalOff),
    ).resolves.toBeTruthy();
  });
});

// ===========================================================================
// INTERNAL vs SHARED
// ===========================================================================

describe("internal content is never exposed to customers", () => {
  it("portal plan excludes internal phases and internal tasks", async () => {
    const { phases } = await portalPlan(f.actors.customerA, f.projects.a);

    const phaseNames = phases.map((p) => p.name);
    expect(phaseNames).toContain("Discovery");
    expect(phaseNames).not.toContain("Internal prep");

    const titles = phases.flatMap((p) => p.tasks.map((t) => t.title));
    expect(titles).toContain("Shared: kickoff recording");
    expect(titles).toContain("Customer: submit org details form");
    for (const title of titles) expect(title).not.toMatch(/^INTERNAL/);
  });

  it("portal milestones exclude internal milestones", async () => {
    const ms = await portalMilestones(f.actors.customerA, f.projects.a);
    expect(ms.map((m) => m.name)).toContain("Go-Live");
    for (const m of ms) expect(m.name).not.toMatch(/^INTERNAL/);
  });

  it("portal status updates exclude internal updates", async () => {
    const us = await portalStatusUpdates(f.actors.customerA, f.projects.a);
    expect(us).toHaveLength(1);
    expect(us[0].summary).not.toMatch(/^INTERNAL/);
  });

  it("a customer listing project threads sees only shared ones", async () => {
    const threads = await listProjectThreads(f.actors.customerA, f.projects.a);
    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe(f.threads.shared);
    for (const t of threads) expect(t.visibility).toBe("SHARED");
  });

  it("opening an internal thread by id throws 404 for a customer", async () => {
    await expect(
      assertThreadAccess(f.actors.customerA, f.threads.internal),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("opening another customer's shared thread throws for a customer", async () => {
    await expect(
      assertThreadAccess(f.actors.customerA, f.threads.otherCustomer),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a customer's inbox contains no internal threads and no other account's threads", async () => {
    const threads = await listInboxThreads(f.actors.customerA, 100);
    const ids = threads.map((t) => t.id);
    expect(ids).toContain(f.threads.shared);
    expect(ids).not.toContain(f.threads.internal);
    expect(ids).not.toContain(f.threads.otherCustomer);
  });
});

// ===========================================================================
// Staff access
// ===========================================================================

describe("staff access", () => {
  it("staff can read internal content", () => {
    expect(canSeeInternal(f.actors.specialist)).toBe(true);
    expect(canSeeInternal(f.actors.member)).toBe(true);
    expect(canSeeInternal(f.actors.customerA)).toBe(false);
  });

  it("a specialist sees both shared and internal threads on a project", async () => {
    const threads = await listProjectThreads(f.actors.specialist, f.projects.a);
    const ids = threads.map((t) => t.id);
    expect(ids).toContain(f.threads.shared);
    expect(ids).toContain(f.threads.internal);
  });

  it("a plain MEMBER only reaches projects they belong to", async () => {
    const ids = await accessibleProjectIds(f.actors.member);
    expect(ids).not.toContain(f.projects.a);
    await expect(assertProjectAccess(f.actors.member, f.projects.a)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("a SPECIALIST only reaches projects they lead or belong to, not the whole portfolio", async () => {
    const ids = await accessibleProjectIds(f.actors.specialist);
    // Led or a member of these:
    expect(ids).toContain(f.projects.a);
    expect(ids).toContain(f.projects.b);
    // Not led, not a member, no relationship at all:
    expect(ids).not.toContain(f.projects.managerOnly);
    await expect(
      assertProjectAccess(f.actors.specialist, f.projects.managerOnly),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("leadership roles (MANAGER and above) still read the whole portfolio", async () => {
    const ids = await accessibleProjectIds(f.actors.manager);
    expect(ids).toContain(f.projects.managerOnly);
    expect(ids).toContain(f.projects.a);
    await expect(
      assertProjectAccess(f.actors.manager, f.projects.managerOnly),
    ).resolves.toBeTruthy();
  });

  it("only leadership roles see portfolio reporting", () => {
    expect(canSeePortfolio(f.actors.manager)).toBe(true);
    expect(canSeePortfolio(f.actors.specialist)).toBe(false);
    expect(canSeePortfolio(f.actors.customerA)).toBe(false);
  });

  it("templates are an OWNER/ADMIN-only setup concern, hidden from specialists and managers alike", () => {
    // Note: MANAGER sees portfolio reporting but is still not an admin, so
    // templates stay out of reach there too — this isn't the same gate as
    // canSeePortfolio.
    expect(canManageTemplates(f.actors.manager)).toBe(false);
    expect(canManageTemplates(f.actors.specialist)).toBe(false);
    expect(canManageTemplates(f.actors.customerA)).toBe(false);
  });

  it("customers can never write to project structure", async () => {
    await expect(assertProjectWrite(f.actors.customerA, f.projects.a)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

// ===========================================================================
// Visibility coercion
// ===========================================================================

describe("visibility coercion", () => {
  it("a customer can never author internal content, even if they ask for it", () => {
    expect(resolveVisibilityForActor(f.actors.customerA, "INTERNAL")).toBe("SHARED");
    expect(resolveVisibilityForActor(f.actors.customerA, "SHARED")).toBe("SHARED");
  });

  it("staff default to internal unless they opt in to sharing", () => {
    expect(resolveVisibilityForActor(f.actors.specialist)).toBe("INTERNAL");
    expect(resolveVisibilityForActor(f.actors.specialist, "SHARED")).toBe("SHARED");
  });
});

// ===========================================================================
// Task detail: comments and attachments
// ===========================================================================

describe("task attachments", () => {
  it("a customer sees only shared attachments on a shared task", async () => {
    const assets = await listTaskAttachments(f.actors.customerA, f.tasks.shared);
    const names = assets.map((a) => a.name);
    expect(names).toContain("shared-guide.pdf");
    for (const n of names) expect(n).not.toMatch(/^INTERNAL/);
  });

  it("staff see every attachment on the task", async () => {
    const assets = await listTaskAttachments(f.actors.specialist, f.tasks.shared);
    const names = assets.map((a) => a.name);
    expect(names).toContain("shared-guide.pdf");
    expect(names).toContain("INTERNAL-margins.xlsx");
  });

  it("fetching an internal attachment by id throws 404 for a customer", async () => {
    await expect(
      assertAttachmentAccess(f.actors.customerA, f.assets.internal),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("fetching another customer's attachment throws 404", async () => {
    await expect(
      assertAttachmentAccess(f.actors.customerA, f.assets.otherCustomer),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a customer can fetch a shared attachment on their own project", async () => {
    const asset = await assertAttachmentAccess(f.actors.customerA, f.assets.shared);
    expect(asset.name).toBe("shared-guide.pdf");
  });

  it("attachments on an internal task are unreachable even if marked shared", async () => {
    const [sneaky] = await db
      .insert(fileAssets)
      .values({
        name: "leaked.pdf",
        kind: "FILE",
        storageKey: "test/leaked.pdf",
        visibility: "SHARED",
        taskId: f.tasks.internal,
        projectId: f.projects.a,
      })
      .returning({ id: fileAssets.id });

    await expect(
      assertAttachmentAccess(f.actors.customerA, sneaky.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("storage keys", () => {
  it("a traversal key cannot escape the upload root", () => {
    expect(resolveKey("../../etc/passwd")).toBeNull();
    expect(resolveKey("/etc/passwd")).toBeNull();
    expect(resolveKey("2026-08/abc.png")).not.toBeNull();
  });
});

// ===========================================================================
// Alert preferences
// ===========================================================================

describe("notification preferences", () => {
  const org = {
    staffDefaults: builtInDefaults("staff"),
    customerDefaults: builtInDefaults("customer"),
    emailEnabled: true,
  };

  it("falls back to the org default when the person has no preference", () => {
    const staff = { role: "SPECIALIST" as const, notificationPrefs: null };
    expect(shouldEmail(staff, "TASK_ASSIGNED", org)).toBe(true);
    // Staff don't get emailed about every milestone by default; customers do.
    expect(shouldEmail(staff, "MILESTONE_COMPLETED", org)).toBe(false);

    const customer = { role: "CUSTOMER" as const, notificationPrefs: null };
    expect(shouldEmail(customer, "MILESTONE_COMPLETED", org)).toBe(true);
  });

  it("a personal preference beats the org default", () => {
    const optedOut = {
      role: "CUSTOMER" as const,
      notificationPrefs: { emailEnabled: true, types: { MESSAGE_POSTED: false } },
    };
    expect(shouldEmail(optedOut, "MESSAGE_POSTED", org)).toBe(false);
    // Anything they didn't override still follows the default.
    expect(shouldEmail(optedOut, "TASK_ASSIGNED", org)).toBe(true);
  });

  it("the personal master switch silences everything", () => {
    const silent = {
      role: "CUSTOMER" as const,
      notificationPrefs: { emailEnabled: false, types: { TASK_ASSIGNED: true } },
    };
    expect(shouldEmail(silent, "TASK_ASSIGNED", org)).toBe(false);
  });

  it("the org kill switch overrides every personal preference", () => {
    const keen = {
      role: "SPECIALIST" as const,
      notificationPrefs: { emailEnabled: true, types: { TASK_ASSIGNED: true } },
    };
    expect(shouldEmail(keen, "TASK_ASSIGNED", { ...org, emailEnabled: false })).toBe(false);
  });

  it("customers are never offered staff-only alert types", () => {
    const customerTypes = typesFor("customer").map((t) => t.type);
    expect(customerTypes).not.toContain("PROJECT_HEALTH_CHANGED");
    expect(customerTypes).not.toContain("RISK_RAISED");
    expect(customerTypes).toContain("TASK_ASSIGNED");
  });

  it("notify() records who was actually emailed", async () => {
    await db
      .update(users)
      .set({ notificationPrefs: { emailEnabled: false, types: {} } })
      .where(eq(users.id, f.actors.customerA.id));

    await notify({
      userIds: [f.actors.customerA.id, f.actors.specialist.id],
      type: "MESSAGE_POSTED",
      title: "Test notification",
      email: true,
    });

    const rows = await db.query.notifications.findMany({
      where: eq(notifications.title, "Test notification"),
    });

    // Both people get the in-app notification…
    expect(rows).toHaveLength(2);
    const forCustomer = rows.find((r) => r.userId === f.actors.customerA.id)!;
    const forStaff = rows.find((r) => r.userId === f.actors.specialist.id)!;
    // …but only the one who hasn't opted out is emailed.
    expect(forCustomer.emailedAt).toBeNull();
    expect(forStaff.emailedAt).not.toBeNull();

    await db
      .update(users)
      .set({ notificationPrefs: null })
      .where(eq(users.id, f.actors.customerA.id));
  });

  it("routes each recipient to the app they can actually reach", async () => {
    // One audience, two audiences really: staff open /projects/…, customers
    // open /portal/projects/…. Sending everyone the same link means a customer
    // clicks through to a 404 on a route they have no access to.
    await notify({
      userIds: [f.actors.customerA.id, f.actors.specialist.id],
      type: "TASK_COMPLETED",
      title: "Routing check",
      linkUrl: `/projects/${f.projects.a}/tasks/${f.tasks.customer}`,
      portalLinkUrl: `/portal/projects/${f.projects.a}/tasks/${f.tasks.customer}`,
    });

    const rows = await db.query.notifications.findMany({
      where: eq(notifications.title, "Routing check"),
    });
    const forCustomer = rows.find((r) => r.userId === f.actors.customerA.id)!;
    const forStaff = rows.find((r) => r.userId === f.actors.specialist.id)!;

    expect(forCustomer.linkUrl).toMatch(/^\/portal\//);
    expect(forStaff.linkUrl).not.toMatch(/^\/portal\//);
  });

  it("falls back to the staff link when no portal route is given", async () => {
    await notify({
      userIds: [f.actors.customerA.id],
      type: "MESSAGE_POSTED",
      title: "Fallback check",
      linkUrl: "/inbox",
    });
    const row = await db.query.notifications.findFirst({
      where: eq(notifications.title, "Fallback check"),
    });
    expect(row!.linkUrl).toBe("/inbox");
  });

  it("offers the two new event types to the right sides", () => {
    const staff = typesFor("staff").map((t) => t.type);
    const customer = typesFor("customer").map((t) => t.type);

    expect(staff).toContain("TASK_COMPLETED");
    expect(staff).toContain("FILE_UPLOADED");
    expect(customer).toContain("TASK_COMPLETED");

    // A customer completing their own action item must reach the specialist by
    // default — it is what unblocks the next step in the implementation.
    expect(shouldEmail({ role: "SPECIALIST" }, "TASK_COMPLETED", org)).toBe(true);
    // Uploads are noisier, so customers are opted out of them by default.
    expect(shouldEmail({ role: "CUSTOMER" }, "FILE_UPLOADED", org)).toBe(false);
    expect(shouldEmail({ role: "SPECIALIST" }, "FILE_UPLOADED", org)).toBe(true);
  });
});

describe("database client", () => {
  it("is cached on globalThis in production too, not just in dev", async () => {
    // A production build splits the server into separate bundles for pages,
    // route handlers and server actions, and they do not share a module
    // registry. Without this cache each bundle builds its own client — which,
    // on PGlite, means two embedded databases over one folder: reads work, but
    // nothing a server action writes is ever visible, and the app goes quietly
    // read-only. Tick a task in the portal and nothing happens.
    //
    // The usual `if (!IS_PROD)` guard reintroduces exactly that, so this test
    // loads the module with IS_PROD forced on. Asserting against the ambient
    // client would prove nothing: NODE_ENV is "test" here, so the guarded
    // version would pass too.
    const g = globalThis as unknown as { __pimsy_db?: unknown };
    const saved = g.__pimsy_db;
    delete g.__pimsy_db;

    try {
      vi.resetModules();
      const realEnv = (await import("@/lib/env")).env;
      vi.doMock("@/lib/env", () => ({ env: { ...realEnv, IS_PROD: true } }));

      await import("@/db");
      expect(g.__pimsy_db).toBeDefined();
    } finally {
      vi.doUnmock("@/lib/env");
      vi.resetModules();
      g.__pimsy_db = saved;
    }
  });
});

describe("Teams webhook destination", () => {
  // These cards can carry internal detail, so the destination is validated
  // rather than trusted. A wrong URL here forwards the internal back channel
  // to somebody else's server.
  it("accepts Power Automate Workflows endpoints", () => {
    expect(
      isAllowedTeamsWebhook(
        "https://prod-27.westus.logic.azure.com:443/workflows/abc123/triggers/manual/paths/invoke?sig=xyz",
      ),
    ).toBe(true);
    expect(isAllowedTeamsWebhook("https://default.westus.azure-apim.net/apim/teams")).toBe(true);
  });

  it("refuses anything that is not a Microsoft host", () => {
    expect(isAllowedTeamsWebhook("https://evil.example.com/collect")).toBe(false);
    expect(isAllowedTeamsWebhook("https://hooks.slack.com/services/T/B/X")).toBe(false);
    // A lookalike host that merely contains the allowed domain as a substring.
    expect(isAllowedTeamsWebhook("https://logic.azure.com.evil.net/x")).toBe(false);
    expect(isAllowedTeamsWebhook("https://notlogic.azure.com.attacker.io/x")).toBe(false);
  });

  it("refuses plaintext and malformed URLs", () => {
    expect(isAllowedTeamsWebhook("http://prod-27.westus.logic.azure.com/workflows/x")).toBe(false);
    expect(isAllowedTeamsWebhook("not a url")).toBe(false);
    expect(isAllowedTeamsWebhook("")).toBe(false);
    expect(isAllowedTeamsWebhook("javascript:alert(1)")).toBe(false);
  });
});

describe("Teams posting", () => {
  const GOOD =
    "https://prod-27.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x";

  /** Runs a block with fetch stubbed, returning whatever was POSTed. */
  async function capture(fn: () => Promise<unknown>) {
    const calls: { url: string; body: unknown }[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await fn();
    } finally {
      globalThis.fetch = real;
    }
    return calls;
  }

  async function setTeams(enabled: boolean, url: string | null) {
    await getOrgSettings();
    await db
      .update(orgSettings)
      .set({ teamsEnabled: enabled, teamsWebhookUrl: url })
      .where(eq(orgSettings.id, "singleton"));
  }

  it("stays silent until an admin turns it on", async () => {
    await setTeams(false, GOOD);
    const calls = await capture(() => postToTeams({ title: "Should not send" }));
    expect(calls).toHaveLength(0);
  });

  it("refuses to post to a non-Microsoft host even once enabled", async () => {
    // The dangerous case: Teams is on, but the stored URL points somewhere
    // else. These cards can carry internal detail, so this must not send.
    await setTeams(true, "https://evil.example.com/collect");
    const calls = await capture(() => postToTeams({ title: "Should not send" }));
    expect(calls).toHaveLength(0);
  });

  it("posts a well-formed Adaptive Card when configured", async () => {
    await setTeams(true, GOOD);
    const calls = await capture(() =>
      postToTeams({
        title: "Riverbend Counseling: customer completed a task",
        text: "Dana Whitfield marked this action item done.",
        facts: [{ name: "Project", value: "Riverbend Counseling" }],
        linkUrl: "/projects/p1/tasks/t1",
        tone: "good",
      }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(GOOD);

    const payload = calls[0].body as any;
    expect(payload.type).toBe("message");
    const card = payload.attachments[0];
    expect(card.contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(card.content.type).toBe("AdaptiveCard");
    expect(card.content.body[0].text).toMatch(/Riverbend/);
    expect(card.content.body.some((b: any) => b.type === "FactSet")).toBe(true);
    // The button must carry an absolute URL — a Teams card has no site to be
    // relative to.
    expect(card.content.actions[0].url).toMatch(/^https?:\/\/.+\/projects\/p1\/tasks\/t1$/);
  });

  it("a Teams outage never breaks the action that triggered it", async () => {
    await setTeams(true, GOOD);
    const real = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    try {
      await expect(postToTeams({ title: "Boom" })).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = real;
      await setTeams(false, null);
    }
  });
});
