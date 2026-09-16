import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { projectMembers, projects, slipEvents, tasks, users } from "@/db/schema";
import { buildFixture } from "./fixtures";
import { assertProjectWrite, ForbiddenError } from "@/lib/authz";
import { applyRequiredProjectSlip, SLIP_REQUIRES_PUSH_ERROR } from "@/lib/project-slip";
import { parseDateInput, utcDayKey } from "@/lib/dates";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe("Record slip UI (source)", () => {
  it("project settings uses a dedicated Record slip form, not the general Save", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/settings/page.tsx"),
      "utf8",
    );
    const form = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/settings/settings-forms.tsx"),
      "utf8",
    );
    const slipForm = readFileSync(resolve(process.cwd(), "src/components/record-slip-form.tsx"), "utf8");
    expect(page).toMatch(/RecordSlipForm/);
    expect(page).toMatch(/Record a slip/);
    expect(form).not.toMatch(/name="slipDays"/);
    expect(form).not.toMatch(/name="slipCause"/);
    expect(slipForm).toMatch(/recordProjectSlip/);
    expect(slipForm).toMatch(/Record slip/);
    expect(slipForm).toMatch(/slipSource/);
  });
});

describe.skipIf(!dbOk)("slip persistence + permissions (postgres)", () => {
  let fixture: Awaited<ReturnType<typeof buildFixture>>;
  const goLive = parseDateInput("2027-02-01")!;

  beforeAll(async () => {
    fixture = await buildFixture();
    await db
      .update(projects)
      .set({
        type: "IMPLEMENTATION",
        status: "IN_PROGRESS",
        startDate: parseDateInput("2026-09-01"),
        targetGoLiveDate: goLive,
        initialGoLiveDate: goLive,
      })
      .where(eq(projects.id, fixture.projects.a));
    await db
      .update(tasks)
      .set({
        status: "TODO",
        dueDate: parseDateInput("2026-11-01"),
        startDate: parseDateInput("2026-10-01"),
      })
      .where(eq(tasks.id, fixture.tasks.shared));
  });

  it("specialist lead can record +N days with cause and note", async () => {
    await expect(assertProjectWrite(fixture.actors.specialist, fixture.projects.a)).resolves.toBeTruthy();

    const result = await applyRequiredProjectSlip({
      actor: fixture.actors.specialist,
      projectId: fixture.projects.a,
      requestedGoLive: goLive,
      slipDaysRaw: "7",
      slipCause: "CUSTOMER",
      slipNote: "customer delay — discovery",
      source: "settings",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected slip");
    expect(result.slipped).toBe(true);
    expect(result.days).toBe(7);
    expect(result.message).toMatch(/Slip recorded/);
    expect(result.message).toMatch(/\+7d/);
    expect(utcDayKey(result.nextGoLive)).toBe("2027-02-08");

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, fixture.projects.a),
    });
    expect(utcDayKey(new Date(project!.targetGoLiveDate!))).toBe("2027-02-08");

    const events = await db.query.slipEvents.findMany({
      where: eq(slipEvents.projectId, fixture.projects.a),
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.days).toBe(7);
    expect(events[0]!.cause).toBe("CUSTOMER");
    expect(events[0]!.note).toMatch(/customer delay/);
    expect(events[0]!.createdById).toBe(fixture.actors.specialist.id);

    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, fixture.tasks.shared) });
    expect(task?.dueDate).toBeTruthy();
    expect(utcDayKey(new Date(task!.dueDate!))).not.toBe("2026-11-01");
  });

  it("a covering SPECIALIST can record a slip on a site they do not lead", async () => {
    const coverGoLive = parseDateInput("2027-03-01")!;
    await db
      .update(projects)
      .set({
        type: "IMPLEMENTATION",
        status: "IN_PROGRESS",
        startDate: parseDateInput("2026-10-01"),
        targetGoLiveDate: coverGoLive,
        initialGoLiveDate: coverGoLive,
      })
      .where(eq(projects.id, fixture.projects.managerOnly));

    await expect(
      assertProjectWrite(fixture.actors.otherSpecialist, fixture.projects.managerOnly),
    ).resolves.toBeTruthy();

    const result = await applyRequiredProjectSlip({
      actor: fixture.actors.otherSpecialist,
      projectId: fixture.projects.managerOnly,
      requestedGoLive: coverGoLive,
      slipDaysRaw: "5",
      slipCause: "PIMSY",
      slipNote: "covering specialist",
      source: "settings",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected covering specialist slip");
    expect(result.days).toBe(5);
    expect(utcDayKey(result.nextGoLive)).toBe("2027-03-06");

    const events = await db.query.slipEvents.findMany({
      where: eq(slipEvents.projectId, fixture.projects.managerOnly),
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.createdById).toBe(fixture.actors.otherSpecialist.id);
  });

  it("rejects cause/note without a date move or +N", async () => {
    const current = await db.query.projects.findFirst({
      where: eq(projects.id, fixture.projects.a),
      columns: { targetGoLiveDate: true },
    });
    const result = await applyRequiredProjectSlip({
      actor: fixture.actors.specialist,
      projectId: fixture.projects.a,
      requestedGoLive: current?.targetGoLiveDate ? new Date(current.targetGoLiveDate) : null,
      slipDaysRaw: "",
      slipCause: "PIMSY",
      slipNote: "note only",
      source: "settings",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error).toBe(SLIP_REQUIRES_PUSH_ERROR);

    const events = await db.query.slipEvents.findMany({
      where: eq(slipEvents.projectId, fixture.projects.a),
    });
    expect(events).toHaveLength(1);
  });

  it("observer members cannot write; contributing members can", async () => {
    const [observer] = await db
      .insert(users)
      .values({
        email: "observer@pimsyehr.com",
        name: "Olive Observer",
        role: "MEMBER",
      })
      .returning({ id: users.id });
    await db.insert(projectMembers).values({
      projectId: fixture.projects.a,
      userId: observer.id,
      role: "OBSERVER",
    });
    const observerActor = {
      ...fixture.actors.member,
      id: observer.id,
      email: "observer@pimsyehr.com",
      role: "MEMBER" as const,
    };
    await expect(assertProjectWrite(observerActor, fixture.projects.a)).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    await db.insert(projectMembers).values({
      projectId: fixture.projects.a,
      userId: fixture.actors.member.id,
      role: "CONTRIBUTOR",
    });
    await expect(assertProjectWrite(fixture.actors.member, fixture.projects.a)).resolves.toBeTruthy();

    const result = await applyRequiredProjectSlip({
      actor: fixture.actors.member,
      projectId: fixture.projects.a,
      requestedGoLive: null,
      slipDaysRaw: "3",
      slipCause: "PIMSY",
      slipNote: "staffing",
      source: "weekly",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected member slip");
    expect(result.days).toBe(3);
  });
});
