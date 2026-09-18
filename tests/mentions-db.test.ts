import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { listMentionCandidates } from "@/lib/mention-candidates";
import { notifyBodyMentions } from "@/lib/mention-notify";
import { mentionToken } from "@/lib/mentions";
import { buildFixture, type Fixture } from "./fixtures";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendEmail: async () => ({ id: "test-mail", skipped: true as const }),
  };
});

describe.skipIf(!dbOk)("comment/update mentions (postgres)", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await buildFixture();
  });

  it("staff can mention PATH teammates and this site’s contacts; portal cannot see the whole staff book", async () => {
    const staff = await listMentionCandidates(f.projects.a, "staff");
    const portal = await listMentionCandidates(f.projects.a, "portal");

    expect(staff.some((c) => c.id === f.actors.specialist.id && c.kind === "staff")).toBe(true);
    expect(staff.some((c) => c.id === f.actors.manager.id && c.kind === "staff")).toBe(true);
    expect(staff.some((c) => c.id === f.actors.member.id && c.kind === "staff")).toBe(true);
    expect(staff.some((c) => c.id === f.actors.customerA.id && c.kind === "customer")).toBe(true);
    expect(staff.some((c) => c.id === f.actors.customerB.id)).toBe(false);

    expect(portal.some((c) => c.id === f.actors.specialist.id)).toBe(true);
    expect(portal.some((c) => c.id === f.actors.customerA.id)).toBe(true);
    expect(portal.some((c) => c.id === f.actors.member.id)).toBe(false);
    expect(portal.some((c) => c.id === f.actors.customerB.id)).toBe(false);
  });

  it("SHARED comment mentions write MENTIONED in-app rows with staff and portal links", async () => {
    const token = mentionToken("Morgan", f.actors.manager.id);
    await notifyBodyMentions({
      actor: f.actors.specialist,
      projectId: f.projects.a,
      texts: [`Please review ${token}`],
      visibility: "SHARED",
      quote: `Please review ${token}`,
      linkUrl: `/projects/${f.projects.a}/tasks/${f.tasks.shared}`,
      portalLinkUrl: `/portal/projects/${f.projects.a}/tasks/${f.tasks.shared}`,
      ctaLabel: "Read and reply",
      projectName: "Acme implementation",
    });

    const rows = await db.query.notifications.findMany({
      where: eq(notifications.userId, f.actors.manager.id),
    });
    const mention = rows.find((r) => r.type === "MENTIONED" && r.title.includes("mentioned you"));
    expect(mention).toBeTruthy();
    expect(mention?.linkUrl).toBe(`/projects/${f.projects.a}/tasks/${f.tasks.shared}`);
    expect(mention?.body).toContain("@Morgan");
    expect(mention?.body).not.toContain("(user:");
  });

  it("INTERNAL comments do not notify customer contacts", async () => {
    const token = mentionToken("Avery", f.actors.customerA.id);
    await notifyBodyMentions({
      actor: f.actors.specialist,
      projectId: f.projects.a,
      texts: [`Internal only ${token}`],
      visibility: "INTERNAL",
      quote: `Internal only ${token}`,
      linkUrl: `/projects/${f.projects.a}/tasks/${f.tasks.internal}`,
      portalLinkUrl: `/portal/projects/${f.projects.a}/tasks/${f.tasks.shared}`,
    });

    const rows = await db.query.notifications.findMany({
      where: eq(notifications.userId, f.actors.customerA.id),
    });
    expect(rows.some((r) => r.type === "MENTIONED" && r.body?.includes("Internal only"))).toBe(false);
  });

  it("does not re-notify mentions already in the previous body", async () => {
    const token = mentionToken("Morgan", f.actors.manager.id);
    const before = await db.query.notifications.findMany({
      where: eq(notifications.userId, f.actors.manager.id),
    });
    await notifyBodyMentions({
      actor: f.actors.specialist,
      projectId: f.projects.a,
      texts: [`Still ${token}`],
      previousTexts: [`Please review ${token}`],
      visibility: "SHARED",
      quote: `Still ${token}`,
      linkUrl: `/projects/${f.projects.a}`,
      portalLinkUrl: `/portal/projects/${f.projects.a}`,
    });
    const after = await db.query.notifications.findMany({
      where: eq(notifications.userId, f.actors.manager.id),
    });
    expect(after.filter((r) => r.type === "MENTIONED")).toHaveLength(
      before.filter((r) => r.type === "MENTIONED").length,
    );
  });
});
