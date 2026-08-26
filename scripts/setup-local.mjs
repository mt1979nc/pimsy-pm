/**
 * One-command local setup.
 *
 *   node scripts/setup-local.mjs
 *
 * Creates .env.local if it's missing (pointing at an embedded PGlite database
 * so nothing has to be installed), applies the schema, seeds the PIMSY
 * implementation playbook, and loads PRISM's historical book of business so
 * the Analysis and capacity reports aren't starting cold. Safe to re-run.
 *
 * If .env.local already exists and points at a real Postgres, this respects it
 * and just applies the schema + seed there instead.
 */

import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

const step = (n, msg) => console.log(`\n[${n}/5] ${msg}`);
const ok = (msg) => console.log(`      ✓ ${msg}`);
const fail = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

// ---------------------------------------------------------------------------

const [major] = process.versions.node.split(".").map(Number);
if (major < 20) {
  fail(`Node 20 or newer is required. You have ${process.versions.node}.\n  Install the LTS build from https://nodejs.org and run this again.`);
}

step(1, "Checking configuration");

if (!existsSync(envPath)) {
  const secret = randomBytes(32).toString("base64");
  writeFileSync(
    envPath,
    `# Created by scripts/setup-local.mjs for local evaluation.
#
# The database below is PGlite: Postgres compiled to WebAssembly, stored in the
# .pglite folder next to this file. Nothing to install, nothing to run.
# For a real deployment, replace this with a Postgres connection string.
DATABASE_URL="pglite://.pglite"
DIRECT_URL="pglite://.pglite"

AUTH_SECRET="${secret}"
AUTH_URL="http://localhost:3000"
AUTH_TRUST_HOST="true"

# No email service configured, so magic-link sign-in URLs print to this
# terminal instead of being emailed. That is the intended local behaviour.
EMAIL_FROM="PIMSY Implementations <dev@example.com>"

INTERNAL_EMAIL_DOMAINS="pimsyehr.com"
BOOTSTRAP_OWNER_EMAIL="alexander@pimsyehr.com"
`,
    "utf8",
  );
  ok("created .env.local with an embedded database");
} else {
  ok(".env.local already exists — leaving it alone");
}

const envText = readFileSync(envPath, "utf8");
const dbUrl = envText.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m)?.[1] ?? "";
const usingPglite = dbUrl.startsWith("pglite:");
ok(usingPglite ? "using the embedded database (no server needed)" : `using ${dbUrl.split("@").pop()}`);

// ---------------------------------------------------------------------------

step(2, "Creating the database schema");

const run = (cmd, args, extraEnv = {}) =>
  spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });

if (usingPglite) {
  const { PGlite } = await import("@electric-sql/pglite");

  // PGlite mounts the data directory inside an Emscripten virtual filesystem
  // using `/`-joined paths, so an absolute Windows path (C:\Users\...) breaks
  // initialization. Run from the project root and keep the path relative.
  process.chdir(root);
  const dir = (dbUrl.slice("pglite:".length).replace(/^\/\//, "") || ".pglite").replace(/\\/g, "/");

  if (process.argv.includes("--reset") && existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    ok("removed the previous local database (--reset)");
  }

  // Every generated migration, in order — not just the first one. Applying
  // only 0000_init.sql means any later `drizzle-kit generate` is silently
  // ignored here, and the app then fails at runtime on a column that the
  // schema says exists.
  const drizzleDir = resolve(root, "drizzle");
  const sqlFiles = existsSync(drizzleDir)
    ? readdirSync(drizzleDir)
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => resolve(drizzleDir, f))
    : [];
  if (sqlFiles.length === 0) {
    fail("No SQL found in drizzle/ — run `npx drizzle-kit generate` first.");
  }

  // The embedded database holds demo data only, so when the schema moves on it
  // is rebuilt rather than migrated. Without this, an older local database
  // silently keeps its old columns and the app fails at runtime.
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  for (const f of sqlFiles) hash.update(readFileSync(f));
  const schemaHash = hash.digest("hex").slice(0, 16);
  const stampPath = resolve(dir, ".schema-version");
  if (existsSync(dir) && existsSync(stampPath)) {
    if (readFileSync(stampPath, "utf8").trim() !== schemaHash) {
      rmSync(dir, { recursive: true, force: true });
      ok("the app was updated — rebuilding the local database to match");
    }
  } else if (existsSync(dir)) {
    // Predates the stamp: assume stale and rebuild.
    rmSync(dir, { recursive: true, force: true });
    ok("rebuilding the local database for the updated app");
  }

  const statements = sqlFiles.flatMap((f) =>
    readFileSync(f, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  async function applySchema() {
    // PGlite's own mkdir is not recursive.
    mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    let created = 0;
    let skipped = 0;
    try {
      for (const stmt of statements) {
        try {
          await client.exec(stmt);
          created++;
        } catch (err) {
          // Re-running setup on an existing database is normal and fine.
          if (/already exists/i.test(String(err?.message ?? err))) skipped++;
          else throw err;
        }
      }
    } finally {
      await client.close().catch(() => {});
    }
    return { created, skipped };
  }

  let result;
  try {
    result = await applySchema();
  } catch (err) {
    // A half-written database from an interrupted run can't be opened. It only
    // ever holds local demo data, so rebuilding it is always the right move.
    if (!existsSync(dir)) fail(`Could not create the database:\n${err?.message ?? err}`);
    console.log(`      ! the local database could not be opened — rebuilding it`);
    rmSync(dir, { recursive: true, force: true });
    try {
      result = await applySchema();
      ok("rebuilt the local database from scratch");
    } catch (err2) {
      fail(
        `Could not create the database.\n\n  ${err2?.message ?? err2}\n\n` +
          `  Things worth checking:\n` +
          `   - Is this folder inside OneDrive or another syncing folder? Move it to\n` +
          `     something plain like C:\\dev\\pimsy-pm and try again.\n` +
          `   - Is antivirus blocking writes to this folder?\n` +
          `   - Is the app already running in another window? Close it first.`,
      );
    }
  }
  writeFileSync(stampPath, schemaHash, "utf8");
  ok(`schema applied (${result.created} statements run, ${result.skipped} already present)`);
} else {
  const r = run("npx", ["drizzle-kit", "push", "--force"], {
    DATABASE_URL: dbUrl,
    DIRECT_URL: dbUrl,
  });
  if (r.status !== 0) fail("Could not apply the schema. Check DATABASE_URL in .env.local.");
  ok("schema applied");
}

// ---------------------------------------------------------------------------

step(3, "Loading the PIMSY implementation playbook");

const seed = run("npx", ["tsx", "--env-file-if-exists=.env.local", "src/db/seed.ts"]);
if (seed.status !== 0) fail("Seeding failed. The error above says why.");

// ---------------------------------------------------------------------------

step(4, "Loading PRISM history (past and in-flight implementations)");

const prismImport = run("npx", [
  "tsx",
  "--env-file-if-exists=.env.local",
  "src/db/seed-prism-import.ts",
]);
if (prismImport.status !== 0) {
  fail("Loading PRISM history failed. The error above says why.");
}
ok("Analysis and capacity reports now have real history to show");

// ---------------------------------------------------------------------------

step(5, "Ready");

console.log(`
  Start the app with:

      npm run build
      npm run start

  then open  http://localhost:3000

  Not "npm run dev" — the embedded database is single-process, and dev mode
  runs several render workers that fight over it. Point DATABASE_URL at a real
  Postgres if you want dev mode.

  Sign in with  alexander@pimsyehr.com  — no email is sent. The sign-in link is
  written to SIGN-IN-LINK.txt in this folder and printed in this terminal.
`);
