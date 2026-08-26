import { and, eq, count, ne } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";

/**
 * Refresh the denormalized task counters on a project. Called after any task
 * mutation. Keeping these on the row is what lets the portfolio dashboard show
 * progress for hundreds of projects in a single query.
 */
export async function refreshProjectCounters(projectId: string) {
  const [total] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), ne(tasks.status, "CANCELLED")));

  const [done] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "DONE")));

  await db
    .update(projects)
    .set({
      taskCountTotal: total?.n ?? 0,
      taskCountDone: done?.n ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
}

/** Percentage complete, safe against divide-by-zero. */
export function pctComplete(done: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}
