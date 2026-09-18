/**
 * Training booking, recording mirror, and agenda carry-forward.
 * Server-only — imports the Postgres client. Client UI uses training-session.ts.
 */
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { fileAssets, taskChecklistItems, tasks } from "@/db/schema";
import { refreshProjectCounters } from "@/lib/rollup";
import {
  findNextSession,
  isAddDateToTitleTask,
  isRecordingLinkTask,
  matchRecordingNameToSessions,
  normalizeRecordingUrl,
  parseTrainingRef,
  trainingKey,
  trainingSessionsFromTasks,
} from "@/lib/training-session";

export type TrainingLiveTask = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  parentTaskId: string | null;
  sessionAt: Date | null;
  dueDate: Date | null;
  notApplicable: boolean;
};

export async function loadProjectTrainingTasks(projectId: string): Promise<TrainingLiveTask[]> {
  return db.query.tasks.findMany({
    where: eq(tasks.projectId, projectId),
    columns: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      parentTaskId: true,
      sessionAt: true,
      dueDate: true,
      notApplicable: true,
    },
  });
}

export function resolveSessionTask(
  task: TrainingLiveTask,
  all: TrainingLiveTask[],
): TrainingLiveTask | null {
  const ref = parseTrainingRef(task.title);
  if (!ref) return null;
  if (ref.role === "session") return task;
  if (task.parentTaskId) {
    const parent = all.find((t) => t.id === task.parentTaskId);
    if (parent && parseTrainingRef(parent.title)?.role === "session") return parent;
  }
  const key = trainingKey(ref);
  return (
    all.find((t) => {
      const r = parseTrainingRef(t.title);
      return r?.role === "session" && trainingKey(r) === key;
    }) ?? null
  );
}

async function markDoneQuiet(ids: string[]) {
  if (ids.length === 0) return;
  const now = new Date();
  await db
    .update(tasks)
    .set({ status: "DONE", completedAt: now, updatedAt: now })
    .where(inArray(tasks.id, ids));
}

/**
 * Stamp the booked slot on the schedule row and the Training N parent.
 * Completes Dock “Add Date to Training Task Title”. Moves the parent to
 * IN_PROGRESS when it was still TODO.
 */
export async function applyTrainingBooking(opts: {
  sourceTaskId: string;
  projectId: string;
  sessionAt: Date;
}): Promise<{ sessionTaskId: string | null }> {
  const all = await loadProjectTrainingTasks(opts.projectId);
  const source = all.find((t) => t.id === opts.sourceTaskId);
  if (!source) return { sessionTaskId: null };

  const session = resolveSessionTask(source, all);
  const ids = new Set<string>([source.id]);
  if (session) ids.add(session.id);

  const now = new Date();
  await db
    .update(tasks)
    .set({ sessionAt: opts.sessionAt, updatedAt: now })
    .where(inArray(tasks.id, [...ids]));

  if (session && session.status === "TODO") {
    await db
      .update(tasks)
      .set({ status: "IN_PROGRESS", updatedAt: now })
      .where(eq(tasks.id, session.id));
  }

  if (session) {
    const addDateIds = all
      .filter(
        (t) =>
          t.parentTaskId === session.id &&
          isAddDateToTitleTask(t.title) &&
          t.status !== "DONE" &&
          t.status !== "CANCELLED" &&
          !t.notApplicable,
      )
      .map((t) => t.id);
    await markDoneQuiet(addDateIds);
  }

  await refreshProjectCounters(opts.projectId);
  return { sessionTaskId: session?.id ?? null };
}

export async function carryIncompleteAgenda(
  fromTask: TrainingLiveTask,
  all?: TrainingLiveTask[],
): Promise<{ carried: number; nextTaskId: string | null }> {
  const projectTasks = all && all.length > 0 ? all : await loadProjectTrainingTasks(fromTask.projectId);
  const next = findNextSession(fromTask.title, projectTasks);
  if (!next) return { carried: 0, nextTaskId: null };

  const [incomplete, existing] = await Promise.all([
    db.query.taskChecklistItems.findMany({
      where: eq(taskChecklistItems.taskId, fromTask.id),
      orderBy: [asc(taskChecklistItems.order)],
    }),
    db.query.taskChecklistItems.findMany({
      where: eq(taskChecklistItems.taskId, next.id),
      columns: { label: true, order: true },
    }),
  ]);

  const leftover = incomplete.filter((i) => !i.done);
  if (leftover.length === 0) return { carried: 0, nextTaskId: next.id };

  const have = new Set(existing.map((i) => i.label.replace(/\s+/g, " ").trim().toLowerCase()));
  let order = existing.reduce((m, r) => Math.max(m, r.order), -1);
  const rows = leftover
    .filter((i) => {
      const key = i.label.replace(/\s+/g, " ").trim().toLowerCase();
      if (!key || have.has(key)) return false;
      have.add(key);
      return true;
    })
    .map((i) => {
      order += 1;
      return {
        taskId: next.id,
        label: i.label,
        order,
        visibility: i.visibility,
        done: false,
        carriedFromTaskId: fromTask.id,
      };
    });

  if (rows.length === 0) return { carried: 0, nextTaskId: next.id };
  await db.insert(taskChecklistItems).values(rows);
  return { carried: rows.length, nextTaskId: next.id };
}

/**
 * After a status change: schedule completion drives parent IN_PROGRESS;
 * completing a session parent carries leftover agenda items; finishing every
 * nested child auto-completes the session parent.
 */
export async function applyTrainingStatusSideEffects(opts: {
  task: TrainingLiveTask;
  nextStatus: string;
}): Promise<{ carried: number; parentCompleted: boolean }> {
  if (opts.nextStatus !== "DONE") return { carried: 0, parentCompleted: false };

  const selfRef = parseTrainingRef(opts.task.title);
  if (selfRef?.role !== "schedule" && selfRef?.role !== "session") {
    if (!opts.task.parentTaskId) return { carried: 0, parentCompleted: false };
    const parent = await db.query.tasks.findFirst({
      where: eq(tasks.id, opts.task.parentTaskId),
      columns: { title: true },
    });
    if (parseTrainingRef(parent?.title ?? "")?.role !== "session") {
      return { carried: 0, parentCompleted: false };
    }
  }

  const all = await loadProjectTrainingTasks(opts.task.projectId);
  const live = all.find((t) => t.id === opts.task.id) ?? { ...opts.task, status: opts.nextStatus };
  const ref = parseTrainingRef(live.title);
  const now = new Date();

  if (ref?.role === "schedule") {
    const session = resolveSessionTask(live, all);
    if (session && session.status === "TODO") {
      await db
        .update(tasks)
        .set({ status: "IN_PROGRESS", updatedAt: now })
        .where(eq(tasks.id, session.id));
    }
    const stamp = live.sessionAt ?? session?.sessionAt ?? null;
    if (stamp) {
      await applyTrainingBooking({
        sourceTaskId: live.id,
        projectId: live.projectId,
        sessionAt: stamp,
      });
    }
    await refreshProjectCounters(live.projectId);
    return { carried: 0, parentCompleted: false };
  }

  if (ref?.role === "session") {
    const result = await carryIncompleteAgenda(live, all);
    await refreshProjectCounters(live.projectId);
    return { carried: result.carried, parentCompleted: false };
  }

  if (live.parentTaskId) {
    const parent = all.find((t) => t.id === live.parentTaskId);
    if (parent && parseTrainingRef(parent.title)?.role === "session") {
      if (parent.status === "DONE" || parent.status === "CANCELLED" || parent.notApplicable) {
        return { carried: 0, parentCompleted: false };
      }
      const siblings = all.filter((t) => t.parentTaskId === parent.id && !t.notApplicable);
      const allDone = siblings.every(
        (s) => s.id === live.id || s.status === "DONE" || s.status === "CANCELLED",
      );
      if (allDone) {
        await db
          .update(tasks)
          .set({ status: "DONE", completedAt: now, updatedAt: now })
          .where(eq(tasks.id, parent.id));
        const result = await carryIncompleteAgenda({ ...parent, status: "DONE" }, all);
        await refreshProjectCounters(live.projectId);
        return { carried: result.carried, parentCompleted: true };
      }
    }
  }

  return { carried: 0, parentCompleted: false };
}

export type MirrorRecordingInput = {
  projectId: string;
  url: string;
  name: string;
  description?: string | null;
  visibility: "INTERNAL" | "SHARED";
  uploadedById: string;
  hintTaskId?: string | null;
  hintName?: string | null;
};

export type MirrorRecordingResult = {
  assetId: string;
  sessionTaskId: string | null;
  created: boolean;
};

/**
 * One recording row: Recordings tab (`isRecording`) and, when a session
 * matches, the Training N task (`taskId`). Dedupes on project + URL.
 */
export async function mirrorRecordingToSession(
  input: MirrorRecordingInput,
): Promise<MirrorRecordingResult> {
  const all = await loadProjectTrainingTasks(input.projectId);
  const sessions = trainingSessionsFromTasks(all);
  const normalized = normalizeRecordingUrl(input.url);

  let session: TrainingLiveTask | null = null;
  if (input.hintTaskId) {
    const hinted = all.find((t) => t.id === input.hintTaskId);
    if (hinted) session = resolveSessionTask(hinted, all);
  }
  if (!session) {
    const hit = matchRecordingNameToSessions(input.hintName ?? input.name, sessions);
    session = hit ?? null;
  }

  const existing = await db.query.fileAssets.findMany({
    where: and(eq(fileAssets.projectId, input.projectId), eq(fileAssets.isRecording, true)),
    columns: { id: true, url: true, taskId: true },
  });
  const match = existing.find((r) => r.url && normalizeRecordingUrl(r.url) === normalized);

  const sessionTaskId = session?.id ?? null;
  const nowTaskId = sessionTaskId;

  if (match) {
    if (nowTaskId && !match.taskId) {
      await db.update(fileAssets).set({ taskId: nowTaskId }).where(eq(fileAssets.id, match.id));
    }
    if (session) await completeRecordingLinkChildren(session, all);
    return { assetId: match.id, sessionTaskId: match.taskId ?? nowTaskId, created: false };
  }

    const [row] = await db
    .insert(fileAssets)
    .values({
      name: input.name,
      kind: "LINK",
      url: input.url,
      description: input.description || null,
      visibility: input.visibility,
      isRecording: true,
      projectId: input.projectId,
      taskId: nowTaskId,
      uploadedById: input.uploadedById,
    })
    .returning({ id: fileAssets.id });

  if (!row) throw new Error("Could not save that recording.");
  if (session) await completeRecordingLinkChildren(session, all);
  return { assetId: row.id, sessionTaskId: nowTaskId, created: true };
}

async function completeRecordingLinkChildren(session: TrainingLiveTask, all: TrainingLiveTask[]) {
  const kids = all.filter(
    (t) =>
      t.parentTaskId === session.id &&
      isRecordingLinkTask(t.title) &&
      t.status !== "DONE" &&
      t.status !== "CANCELLED" &&
      !t.notApplicable,
  );
  if (kids.length === 0) return;
  await markDoneQuiet(kids.map((t) => t.id));
  for (const kid of kids) {
    await applyTrainingStatusSideEffects({
      task: { ...kid, status: "DONE" },
      nextStatus: "DONE",
    });
  }
}
