import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

/**
 * Two drivers, one interface.
 *
 * - Real Postgres (Neon, Supabase, RDS, local) for anything shared or deployed.
 * - PGlite — Postgres compiled to WebAssembly, running in-process against a
 *   local folder — when DATABASE_URL is a `pglite:` URL. That mode needs no
 *   database server installed at all, which makes "unzip it and look at it" a
 *   single command. It is single-process and NOT for production or for more
 *   than one person at a time.
 *
 * The query API is identical either way, so the rest of the app never branches.
 * A single client is reused across hot reloads in dev and across warm
 * serverless invocations in production.
 */

export const PGLITE_PREFIX = "pglite:";

export function isPglite(url = env.DATABASE_URL) {
  return url.startsWith(PGLITE_PREFIX);
}

/**
 * `pglite://./.pglite` or `pglite:.pglite` → filesystem path.
 *
 * Always forward-slashed. PGlite mounts the directory inside an Emscripten
 * virtual filesystem using `/`-joined paths, so a Windows-style path with
 * backslashes (or a `C:` drive prefix) breaks initialization. Keeping this
 * relative to the working directory sidesteps the whole problem.
 */
export function pgliteDataDir(url = env.DATABASE_URL) {
  const raw = url.slice(PGLITE_PREFIX.length).replace(/^\/\//, "");
  return (raw.length > 0 ? raw : ".pglite").replace(/\\/g, "/");
}

type AppDb = PostgresJsDatabase<typeof schema>;

/**
 * Close the embedded database cleanly when the process is asked to stop.
 *
 * PGlite writes its data to disk like a real Postgres, so being killed
 * mid-write can leave the folder unreadable — the failure looks like an opaque
 * `Aborted()` on next start. Closing on SIGINT/SIGTERM makes an ordinary
 * shutdown (Ctrl+C, a stopped container) safe. A SIGKILL still can't be caught;
 * `npm run setup` detects and rebuilds a damaged folder for that case.
 */
function registerGracefulClose(close: () => Promise<void>) {
  const g = globalThis as unknown as { __pimsy_shutdown_hooked?: boolean };
  if (g.__pimsy_shutdown_hooked) return;
  g.__pimsy_shutdown_hooked = true;

  let closing = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (closing) return;
    closing = true;
    try {
      await close();
    } catch {
      // Nothing useful to do if it was already gone.
    } finally {
      process.exit(signal === "SIGINT" ? 130 : 143);
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

const globalForDb = globalThis as unknown as { __pimsy_db?: AppDb };

function buildDb(): AppDb {
  const url = env.DATABASE_URL;

  if (isPglite(url)) {
    const dir = pgliteDataDir(url);
    try {
      // PGlite's mkdir is not recursive, so make sure the folder exists first.
      mkdirSync(dir, { recursive: true });
      const client = new PGlite(dir);
      registerGracefulClose(() => client.close());
      // Same query surface; the driver types differ only in the connection.
      return drizzlePglite(client, { schema }) as unknown as AppDb;
    } catch (err) {
      // PGlite is single-process. A second copy of the app, or a leftover
      // folder from a run that was killed, produces an opaque WASM abort.
      throw new Error(
        `Could not open the local database at "${dir}".\n\n` +
          `Two things cause this:\n` +
          `  1. Another copy of this app is already running. Only one can use\n` +
          `     the local database at a time — close the other window.\n` +
          `  2. The database folder was damaged by a run that was interrupted.\n` +
          `     Run RESET-DATABASE.bat (or delete the "${dir}" folder) and start again.\n\n` +
          `For anything beyond local evaluation, point DATABASE_URL at a real\n` +
          `Postgres instead — it has none of these limits.\n\n` +
          `Original error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const client = postgres(url, {
    max: env.IS_PROD ? 5 : 3,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
  });
  return drizzlePg(client, { schema, logger: false });
}

/**
 * The client is cached on globalThis in EVERY mode, production included.
 *
 * The usual idiom guards this with `if (!IS_PROD)`, because the only purpose is
 * normally to survive hot reloads. That is wrong here, and was a real bug: a
 * production build splits the server into several bundles — pages, route
 * handlers and server actions do not share a module registry — so without the
 * cache each bundle constructs its own client.
 *
 * With PGlite that means two independent embedded databases over one folder in
 * one process. Reads work, so the app looks fine, but nothing a server action
 * writes is ever visible to the pages, and the session a sign-in creates cannot
 * be found by the next mutation. The symptom is the whole app going quietly
 * read-only: tick a task and nothing happens.
 *
 * With real Postgres the same guard merely created a second connection pool per
 * bundle, which is wasteful rather than broken. One client either way.
 */
export const db: AppDb = globalForDb.__pimsy_db ?? buildDb();
globalForDb.__pimsy_db = db;

export { schema };
export type Db = AppDb;
