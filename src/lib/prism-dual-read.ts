/**
 * v1.11 hook — dual-read Prism Azure SQL before any write cutover.
 *
 * v1.10 Forecast reads native Postgres only. Do not connect or POST
 * Prism `saveState` from this app. When Director / Pipeline routines
 * move over, dual-read live Prism (`pimsy-prism-sql.database.windows.net`,
 * database `prism`) *before* writes leave purple-beach / nice-rock.
 *
 * Set PRISM_SQL_CONNECTION_STRING only when implementing that slice.
 * Standalone Prism (nice-rock / purple-beach) stays writable by humans
 * until dual-read is proven, then write cutover, then retire.
 */

export const PRISM_DUAL_READ_PLANNED = true;

/** Always false in v1.10 — flip only after a proven dual-read slice. */
export function prismDualReadEnabled(): boolean {
  return false;
}

export function prismSqlConfigured(): boolean {
  return Boolean(process.env.PRISM_SQL_CONNECTION_STRING?.trim());
}
