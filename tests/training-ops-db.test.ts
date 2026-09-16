import { describe, it, expect, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { fileAssets, taskChecklistItems, tasks } from "@/db/schema";
import { buildFixture } from "./fixtures";
import {
  applyTrainingBooking,
  applyTrainingStatusSideEffects,
  carryIncompleteAgenda,
  mirrorRecordingToSession,
} from "@/lib/training-ops";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("training booking, recording mirror, agenda carry-forward (postgres)", () => {
  let projectId: string;
  let t1Id: string;
  let t2Id: string;
  let scheduleId: string;
  let addDateId: string;
  let recLinkId: string;
  let specialistId: string;

  beforeAll(async () => {
    await db.execute(sql`ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "session_at" timestamp with time zone`);
    await db.execute(
      sql`ALTER TABLE "task_checklist_item" ADD COLUMN IF NOT EXISTS "carried_from_task_id" text`,
    );
    const f = await buildFixture();
    projectId = f.projects.a;
    specialistId = f.actors.specialist.id;

    const [t1] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: f.phases.shared,
        title: "Training 1: Intro to PIMSY",
        visibility: "SHARED",
        ownerSide: "INTERNAL",
        order: 40,
      })
      .returning({ id: tasks.id });
    t1Id = t1.id;

    const [t2] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: f.phases.shared,
        title: "Training 2: Client Charts",
        visibility: "SHARED",
        ownerSide: "INTERNAL",
        order: 50,
      })
      .returning({ id: tasks.id });
    t2Id = t2.id;

    const [schedule] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: f.phases.shared,
        parentTaskId: t1Id,
        title: "Schedule Training 1",
        visibility: "SHARED",
        ownerSide: "CUSTOMER",
        order: 41,
      })
      .returning({ id: tasks.id });
    scheduleId = schedule.id;

    const [addDate] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: f.phases.shared,
        parentTaskId: t1Id,
        title: "Add Date to Training Task Title",
        visibility: "INTERNAL",
        ownerSide: "INTERNAL",
        order: 42,
      })
      .returning({ id: tasks.id });
    addDateId = addDate.id;

    const [recLink] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: f.phases.shared,
        parentTaskId: t1Id,
        title: "Training 1 Recording Link",
        visibility: "SHARED",
        ownerSide: "INTERNAL",
        order: 43,
      })
      .returning({ id: tasks.id });
    recLinkId = recLink.id;

    await db.insert(taskChecklistItems).values([
      { taskId: t1Id, label: "User Profile / Signature Capture", order: 0, visibility: "SHARED", done: true },
      { taskId: t1Id, label: "Client Create / Term", order: 1, visibility: "SHARED", done: false },
      { taskId: t1Id, label: "Appointment Widget", order: 2, visibility: "SHARED", done: false },
    ]);
  });

  it("books a calendar slot onto Training 1 and completes Add Date", async () => {
    const slot = new Date("2026-10-08T14:30:00");
    const result = await applyTrainingBooking({
      sourceTaskId: scheduleId,
      projectId,
      sessionAt: slot,
    });
    expect(result.sessionTaskId).toBe(t1Id);

    const [parent, schedule, addDate] = await Promise.all([
      db.query.tasks.findFirst({ where: eq(tasks.id, t1Id) }),
      db.query.tasks.findFirst({ where: eq(tasks.id, scheduleId) }),
      db.query.tasks.findFirst({ where: eq(tasks.id, addDateId) }),
    ]);
    expect(parent?.sessionAt?.toISOString()).toBe(slot.toISOString());
    expect(schedule?.sessionAt?.toISOString()).toBe(slot.toISOString());
    expect(parent?.status).toBe("IN_PROGRESS");
    expect(addDate?.status).toBe("DONE");
  });

  it("mirrors one recording onto the Recordings tab and Training 1", async () => {
    const url = "https://zoom.us/rec/share/training-1-sample";
    const first = await mirrorRecordingToSession({
      projectId,
      url,
      name: "Core Training — Session 1",
      visibility: "SHARED",
      uploadedById: specialistId,
      hintName: "Core Training — Session 1",
    });
    expect(first.created).toBe(true);
    expect(first.sessionTaskId).toBe(t1Id);

    const second = await mirrorRecordingToSession({
      projectId,
      url: url + "/",
      name: "Training 1 recording",
      visibility: "SHARED",
      uploadedById: specialistId,
      hintTaskId: recLinkId,
    });
    expect(second.created).toBe(false);
    expect(second.assetId).toBe(first.assetId);

    const rows = await db.query.fileAssets.findMany({
      where: eq(fileAssets.projectId, projectId),
    });
    const recs = rows.filter((r) => r.isRecording);
    expect(recs).toHaveLength(1);
    expect(recs[0]!.taskId).toBe(t1Id);
    expect(recs[0]!.url).toContain("zoom.us/rec/");

    const recLink = await db.query.tasks.findFirst({ where: eq(tasks.id, recLinkId) });
    expect(recLink?.status).toBe("DONE");
  });

  it("carries incomplete agenda items to Training 2 when Training 1 is completed", async () => {
    const parent = await db.query.tasks.findFirst({ where: eq(tasks.id, t1Id) });
    const result = await carryIncompleteAgenda(
      {
        id: t1Id,
        projectId,
        title: "Training 1: Intro to PIMSY",
        status: "DONE",
        parentTaskId: null,
        sessionAt: parent?.sessionAt ?? null,
        dueDate: parent?.dueDate ?? null,
        notApplicable: false,
      },
      [],
    );
    expect(result.carried).toBe(2);
    expect(result.nextTaskId).toBe(t2Id);

    const t2Items = await db.query.taskChecklistItems.findMany({
      where: eq(taskChecklistItems.taskId, t2Id),
    });
    const labels = t2Items.map((i) => i.label).sort();
    expect(labels).toEqual(["Appointment Widget", "Client Create / Term"]);
    expect(t2Items.every((i) => i.carriedFromTaskId === t1Id)).toBe(true);
    expect(t2Items.every((i) => !i.done)).toBe(true);

    const again = await carryIncompleteAgenda(
      {
        id: t1Id,
        projectId,
        title: "Training 1: Intro to PIMSY",
        status: "DONE",
        parentTaskId: null,
        sessionAt: null,
        dueDate: null,
        notApplicable: false,
      },
      [],
    );
    expect(again.carried).toBe(0);
  });

  it("auto-completes Training 1 when remaining nested children are done", async () => {
    await db.update(tasks).set({ status: "TODO", completedAt: null }).where(eq(tasks.id, t1Id));
    await db.update(tasks).set({ status: "DONE" }).where(eq(tasks.id, scheduleId));

    const recLink = await db.query.tasks.findFirst({ where: eq(tasks.id, recLinkId) });
    const effect = await applyTrainingStatusSideEffects({
      task: {
        id: recLinkId,
        projectId,
        title: "Training 1 Recording Link",
        status: "DONE",
        parentTaskId: t1Id,
        sessionAt: recLink?.sessionAt ?? null,
        dueDate: recLink?.dueDate ?? null,
        notApplicable: false,
      },
      nextStatus: "DONE",
    });
    expect(effect.parentCompleted).toBe(true);
    const parent = await db.query.tasks.findFirst({ where: eq(tasks.id, t1Id) });
    expect(parent?.status).toBe("DONE");
  });
});
