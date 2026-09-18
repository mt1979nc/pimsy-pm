import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";

/** Re-export for server callers. Client components must import `@/lib/pct-complete` directly. */
export { pctComplete } from "@/lib/pct-complete";

/**
 * Refresh the denormalized task counters on a project. Called after any task
 * mutation. Keeping these on the row is what lets the portfolio dashboard show
 * progress for hundreds of projects in a single query.
 *
 * N/A items are excluded — they were removed from this project only.
 * EHR and RCM tracks are counted separately so a reactivated RCM engagement
 * does not rewrite the implementation timeline numbers.
 *
 * One grouped `FILTER` query (not six sequential `COUNT`s) — task complete
 * already has a remote-Postgres RTT budget, and this used to spend six of them.
 */
export async function refreshProjectCounters(projectId: string) {
  const [row] = await db
    .select({
      total: sql<number>`count(*) filter (where ${tasks.status} <> 'CANCELLED' and ${tasks.notApplicable} = false)::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'DONE' and ${tasks.notApplicable} = false)::int`,
      ehrTotal: sql<number>`count(*) filter (where ${tasks.status} <> 'CANCELLED' and ${tasks.notApplicable} = false and ${tasks.workTrack} <> 'RCM')::int`,
      ehrDone: sql<number>`count(*) filter (where ${tasks.status} = 'DONE' and ${tasks.notApplicable} = false and ${tasks.workTrack} <> 'RCM')::int`,
      rcmTotal: sql<number>`count(*) filter (where ${tasks.status} <> 'CANCELLED' and ${tasks.notApplicable} = false and ${tasks.workTrack} = 'RCM')::int`,
      rcmDone: sql<number>`count(*) filter (where ${tasks.status} = 'DONE' and ${tasks.notApplicable} = false and ${tasks.workTrack} = 'RCM')::int`,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));

  await db
    .update(projects)
    .set({
      taskCountTotal: row?.total ?? 0,
      taskCountDone: row?.done ?? 0,
      ehrTaskCountTotal: row?.ehrTotal ?? 0,
      ehrTaskCountDone: row?.ehrDone ?? 0,
      rcmTaskCountTotal: row?.rcmTotal ?? 0,
      rcmTaskCountDone: row?.rcmDone ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
}

