/**
 * Aggregate training recordings for the Recordings tab.
 *
 * Source of truth is still each training task (and its Recording Link child).
 * This module does not store a second copy — it collects those same links.
 */
import {
  looksLikeZoomRecording,
  matchRecordingNameToSessions,
  normalizeRecordingUrl,
  parseTrainingRef,
  trainingSessionsFromTasks,
} from "@/lib/training-session";

export type RecordingTaskInput = {
  id: string;
  title: string;
  parentTaskId: string | null;
  sessionAt: Date | string | null;
  visibility?: "INTERNAL" | "SHARED";
};

export type RecordingAssetInput = {
  id: string;
  name: string;
  url: string | null;
  kind: "FILE" | "IMAGE" | "LINK" | string;
  visibility: "INTERNAL" | "SHARED";
  isRecording: boolean;
  taskId: string | null;
  createdAt: Date | string;
};

export type AggregatedRecording = {
  id: string;
  title: string;
  url: string;
  sessionLabel: string | null;
  sessionAt: Date | null;
  postedAt: Date;
  visibility: "INTERNAL" | "SHARED";
  taskId: string | null;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

function tryUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function resolveSession(
  asset: RecordingAssetInput,
  tasksById: Map<string, RecordingTaskInput>,
  sessions: RecordingTaskInput[],
): RecordingTaskInput | null {
  if (asset.taskId) {
    const task = tasksById.get(asset.taskId);
    if (task) {
      const ref = parseTrainingRef(task.title);
      if (ref?.role === "session") return task;
      if (task.parentTaskId) {
        const parent = tasksById.get(task.parentTaskId);
        if (parent && parseTrainingRef(parent.title)?.role === "session") return parent;
      }
    }
  }
  return matchRecordingNameToSessions(asset.name, sessions);
}

function isTrainingRecordingAsset(
  asset: RecordingAssetInput,
  task: RecordingTaskInput | null,
): boolean {
  if (asset.isRecording) return true;
  if (asset.kind !== "LINK" || !asset.url) return false;
  if (!task) return false;
  const ref = parseTrainingRef(task.title);
  if (ref?.role === "recording") return true;
  if (ref?.role === "session") {
    const parsed = tryUrl(asset.url);
    if (parsed && looksLikeZoomRecording(parsed)) return true;
    if (/recording/i.test(asset.name)) return true;
  }
  return false;
}

function rank(asset: RecordingAssetInput, session: RecordingTaskInput | null): number {
  let score = 0;
  if (asset.isRecording) score += 4;
  if (session) score += 2;
  if (asset.taskId) score += 1;
  return score;
}

/**
 * Collect recordings already attached to training tasks / flagged as recordings.
 * Dedupes on normalized URL. `sharedOnly` is the customer/portal view.
 */
export function aggregateRecordings(
  assets: RecordingAssetInput[],
  tasks: RecordingTaskInput[],
  opts?: { sharedOnly?: boolean },
): AggregatedRecording[] {
  const sharedOnly = opts?.sharedOnly === true;
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const sessions = trainingSessionsFromTasks(tasks);
  const byUrl = new Map<string, { asset: RecordingAssetInput; session: RecordingTaskInput | null }>();

  for (const asset of assets) {
    const url = asset.url?.trim() ?? "";
    if (!url) continue;
    const attached = asset.taskId ? (tasksById.get(asset.taskId) ?? null) : null;
    if (!isTrainingRecordingAsset(asset, attached)) continue;
    if (sharedOnly && asset.visibility !== "SHARED") continue;
    if (sharedOnly && attached?.visibility === "INTERNAL") continue;

    const session = resolveSession(asset, tasksById, sessions);
    if (sharedOnly && session?.visibility === "INTERNAL") continue;

    const key = normalizeRecordingUrl(url);
    const existing = byUrl.get(key);
    if (!existing || rank(asset, session) > rank(existing.asset, existing.session)) {
      byUrl.set(key, { asset, session });
    }
  }

  const rows: AggregatedRecording[] = [];
  for (const { asset, session } of byUrl.values()) {
    const sessionAt = asDate(session?.sessionAt ?? null);
    const postedAt = asDate(asset.createdAt) ?? new Date(0);
    const sessionLabel = session ? (parseTrainingRef(session.title)?.sessionLabel ?? null) : null;
    rows.push({
      id: asset.id,
      title: asset.name.trim() || sessionLabel || "Recording",
      url: asset.url!.trim(),
      sessionLabel,
      sessionAt,
      postedAt,
      visibility: asset.visibility,
      taskId: session?.id ?? asset.taskId,
    });
  }

  rows.sort((a, b) => {
    const aKey = (a.sessionAt ?? a.postedAt).getTime();
    const bKey = (b.sessionAt ?? b.postedAt).getTime();
    if (aKey !== bKey) return bKey - aKey;
    return a.title.localeCompare(b.title);
  });
  return rows;
}
