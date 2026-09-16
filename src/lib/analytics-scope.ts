/**
 * Server-only SQL helpers for Prism / portfolio / capacity analytics.
 * Do not import from client components (uses `@/db` + schema).
 */

import { eq, or, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts, projects } from "@/db/schema";

/**
 * Project participates in Prism / portfolio / capacity / go-live reporting.
 * False when the project flag is set, or when its customer account is flagged.
 */
export function includedInAnalytics() {
  return sql`(
    ${projects.excludeFromAnalytics} = false
    and (
      ${projects.customerAccountId} is null
      or not exists (
        select 1 from ${customerAccounts}
        where ${customerAccounts.id} = ${projects.customerAccountId}
          and ${customerAccounts.excludeFromAnalytics} = true
      )
    )
  )`;
}

/** Project ids that reporting queries must skip. Null means none are flagged. */
export async function analyticsExcludedProjectIds(): Promise<string[] | null> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .leftJoin(customerAccounts, eq(projects.customerAccountId, customerAccounts.id))
    .where(
      or(eq(projects.excludeFromAnalytics, true), eq(customerAccounts.excludeFromAnalytics, true)),
    );
  const ids = rows.map((r) => r.id);
  return ids.length === 0 ? null : ids;
}

export function notInExcludedProjects(
  column: Parameters<typeof notInArray>[0],
  excludedIds: string[] | null,
) {
  if (!excludedIds || excludedIds.length === 0) return undefined;
  return notInArray(column, excludedIds);
}
