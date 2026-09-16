import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, users } from "@/db/schema";
import { buildFixture } from "./fixtures";
import { resolveProjectBookingUrls } from "@/lib/booking-urls";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("per-meeting-type booking URLs (postgres)", () => {
  let fixture: Awaited<ReturnType<typeof buildFixture>>;

  beforeAll(async () => {
    fixture = await buildFixture();
  });

  it("stores booking_urls jsonb and keeps kickoff in sync with zoom_booking_url", async () => {
    const urls = {
      workflowDiscovery: "https://inbed.example/workflow",
      training1: "https://inbed.example/t1",
      kickoff: "https://zoom.us/book/site",
    };
    await db
      .update(projects)
      .set({
        bookingUrls: urls,
        zoomBookingUrl: urls.kickoff,
      })
      .where(eq(projects.id, fixture.projects.a));

    const row = await db.query.projects.findFirst({
      where: eq(projects.id, fixture.projects.a),
      columns: { bookingUrls: true, zoomBookingUrl: true, leadId: true },
    });
    expect(row?.bookingUrls).toMatchObject(urls);
    expect(row?.zoomBookingUrl).toBe(urls.kickoff);
  });

  it("kickoff falls back to the assigned specialist when About kickoff is blank", async () => {
    await db
      .update(users)
      .set({ zoomBookingUrl: "https://zoom.us/book/sam" })
      .where(eq(users.id, fixture.actors.specialist.id));
    await db
      .update(projects)
      .set({
        leadId: fixture.actors.specialist.id,
        bookingUrls: { training2: "https://inbed.example/t2" },
        zoomBookingUrl: null,
      })
      .where(eq(projects.id, fixture.projects.a));

    const row = await db.query.projects.findFirst({
      where: eq(projects.id, fixture.projects.a),
      columns: { bookingUrls: true, zoomBookingUrl: true },
      with: { lead: { columns: { zoomBookingUrl: true } } },
    });
    const resolved = resolveProjectBookingUrls(row ?? {});
    expect(resolved.kickoff).toBe("https://zoom.us/book/sam");
    expect(resolved.training2).toBe("https://inbed.example/t2");
    expect(row?.zoomBookingUrl).toBeNull();
  });
});
