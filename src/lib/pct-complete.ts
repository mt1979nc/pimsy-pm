/**
 * Pure percentage helper — safe for client components.
 *
 * Do not move this back into `rollup.ts`. That module talks to Postgres, and
 * importing it from a `"use client"` file (as v1.13.5 did) pulls `postgres`
 * into the webpack browser bundle (`Can't resolve 'fs'` / `net` / `tls`).
 */
export function pctComplete(done: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}
