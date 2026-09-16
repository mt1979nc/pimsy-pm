import { describe, expect, it, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { phases, tasks, users } from "@/db/schema";
import { buildFixture, type Fixture } from "./fixtures";
import { loadProjectAbout } from "@/lib/about-query";
import { portalAbout } from "@/lib/portal";

let f: Fixture;

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

beforeAll(async () => {
  if (!dbOk) return;
  f = await buildFixture();
});

describe.skipIf(!dbOk)("About contact cards stay in sync with live contacts", () => {
  it("shows the impl team from memberships and kickoff assignees", async () => {
    const [kickoffPhase] = await db
      .insert(phases)
      .values({
        projectId: f.projects.a,
        name: "Kickoff",
        order: -1,
        visibility: "SHARED",
      })
      .returning({ id: phases.id });
    await db.insert(tasks).values({
      projectId: f.projects.a,
      phaseId: kickoffPhase.id,
      title: "Schedule Kickoff",
      ownerSide: "INTERNAL",
      visibility: "SHARED",
      assigneeId: f.actors.specialist.id,
    });

    const loaded = await loadProjectAbout(f.projects.a);
    expect(loaded).not.toBeNull();
    expect(loaded!.implementationTeam.some((c) => c.id === f.actors.specialist.id)).toBe(true);
    expect(loaded!.customerContacts.some((c) => c.id === f.actors.customerA.id)).toBe(true);
    expect(loaded!.kickoff.items.some((i) => i.title === "Schedule Kickoff")).toBe(true);
  });

  it("updates customer About cards when the contact name changes", async () => {
    await db
      .update(users)
      .set({ name: "Avery Renamed", title: "Office manager", phone: "555-0142" })
      .where(eq(users.id, f.actors.customerA.id));

    const loaded = await loadProjectAbout(f.projects.a);
    const card = loaded!.customerContacts.find((c) => c.id === f.actors.customerA.id);
    expect(card?.name).toBe("Avery Renamed");
    expect(card?.title).toBe("Office manager");
    expect(card?.phone).toBe("555-0142");

    const portal = await portalAbout(f.actors.customerA, f.projects.a);
    expect(portal?.customerContacts.find((c) => c.id === f.actors.customerA.id)?.name).toBe(
      "Avery Renamed",
    );
  });

  it("does not leak another customer's contacts or HubSpot through portal About", async () => {
    const leaked = await portalAbout(f.actors.customerA, f.projects.b);
    expect(leaked).toBeNull();

    const own = await portalAbout(f.actors.customerA, f.projects.a);
    expect(own).not.toBeNull();
    expect(own!.customerContacts.every((c) => c.id !== f.actors.customerB.id)).toBe(true);
    expect(JSON.stringify(own)).not.toMatch(/hubspot|crmKey|prismClient/i);
  });
});
