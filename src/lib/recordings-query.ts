/**
 * Load training-task recordings for one project. Server-only (Postgres).
 */
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { fileAssets, tasks } from "@/db/schema";
import { aggregateRecordings, type AggregatedRecording } from "@/lib/recordings";

export async function loadProjectRecordingAggregate(
  projectId: string,
  opts?: { sharedOnly?: boolean },
): Promise<AggregatedRecording[]> {
  const [assets, taskRows] = await Promise.all([
    db.query.fileAssets.findMany({
      where: and(
        eq(fileAssets.projectId, projectId),
        or(eq(fileAssets.isRecording, true), eq(fileAssets.kind, "LINK")),
      ),
      columns: {
        id: true,
        name: true,
        url: true,
        kind: true,
        visibility: true,
        isRecording: true,
        taskId: true,
        createdAt: true,
      },
    }),
    db.query.tasks.findMany({
      where: eq(tasks.projectId, projectId),
      columns: {
        id: true,
        title: true,
        parentTaskId: true,
        sessionAt: true,
        visibility: true,
      },
    }),
  ]);
  return aggregateRecordings(assets, taskRows, opts);
}
