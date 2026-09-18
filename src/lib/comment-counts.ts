/**
 * Per-task comment counts from live `task_comment` rows.
 * No denormalized count column — one GROUP BY, not a migrate.
 */
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { taskComments } from "@/db/schema";

export async function commentCountsByTaskIds(
  taskIds: string[],
  opts: { sharedOnly?: boolean } = {},
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (taskIds.length === 0) return counts;

  const conditions = [inArray(taskComments.taskId, taskIds), isNull(taskComments.deletedAt)];
  if (opts.sharedOnly) conditions.push(eq(taskComments.visibility, "SHARED"));

  const rows = await db
    .select({
      taskId: taskComments.taskId,
      n: count(),
    })
    .from(taskComments)
    .where(and(...conditions))
    .groupBy(taskComments.taskId);

  for (const row of rows) counts.set(row.taskId, Number(row.n));
  return counts;
}
