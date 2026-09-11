import { and, eq, count, ne } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";

function countable(projectId: string) {
  return and(
    eq(tasks.projectId, projectId),
    ne(tasks.status, "CANCELLED"),
    eq(tasks.notApplicable, false),
  );
}

/**
 * Refresh the denormalized task counters on a project. Called after any task
 * mutation. Keeping these on the row is what lets the portfolio dashboard show
 * progress for hundreds of projects in a single query.
 *
 * N/A items are excluded — they were removed from this project only.
 * EHR and RCM tracks are counted separately so a reactivated RCM engagement
 * does not rewrite the implementation timeline numbers.
 */
export async function refreshProjectCounters(projectId: string) {
  const [total] = await db.select({ n: count() }).from(tasks).where(countable(projectId));

  const [done] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(countable(projectId), eq(tasks.status, "DONE")));

  const [ehrTotal] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(countable(projectId), ne(tasks.workTrack, "RCM")));

  const [ehrDone] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(countable(projectId), ne(tasks.workTrack, "RCM"), eq(tasks.status, "DONE")));

  const [rcmTotal] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(countable(projectId), eq(tasks.workTrack, "RCM")));

  const [rcmDone] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(countable(projectId), eq(tasks.workTrack, "RCM"), eq(tasks.status, "DONE")));

  await db
    .update(projects)
    .set({
      taskCountTotal: total?.n ?? 0,
      taskCountDone: done?.n ?? 0,
      ehrTaskCountTotal: ehrTotal?.n ?? 0,
      ehrTaskCountDone: ehrDone?.n ?? 0,
      rcmTaskCountTotal: rcmTotal?.n ?? 0,
      rcmTaskCountDone: rcmDone?.n ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
}

/** Percentage complete, safe against divide-by-zero. */
export function pctComplete(done: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}
