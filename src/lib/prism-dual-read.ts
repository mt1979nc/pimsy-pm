/**
 * Optional short dual-read bridge — OFF by default after v1.11 cutover.
 *
 * PM Postgres is the source of truth. Do not POST Prism `saveState`.
 * Director / Pipeline / morning snapshot routines should call
 * GET /api/prism/snapshot (see v1.11-PRISM-CUTOVER.md).
 *
 * Dual-read is CLI-only: `npm run db:dump:prism` then `npm run db:import:prism`.
 * Setting PRISM_SQL_CONNECTION_STRING on the App Service is not required
 * and does not change runtime reads.
 */

export const PRISM_DUAL_READ_PLANNED = false;

export function prismDualReadEnabled(): boolean {
  return process.env.PRISM_DUAL_READ === "1" || process.env.PRISM_DUAL_READ === "true";
}

export function prismSqlConfigured(): boolean {
  return Boolean(process.env.PRISM_SQL_CONNECTION_STRING?.trim());
}

/** Runtime snapshot always comes from PM. Dual-read never merges into live pages. */
export function prismRuntimeSource(): "pimsy-pm" {
  return "pimsy-pm";
}
