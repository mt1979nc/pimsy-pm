/**
 * One-time pull of Dock account logos into PATH customers.
 *
 * Dock (https://pimsyehr.dock.us) keeps the mark on the Account (`logo` URL).
 * This matches that URL to PATH customers by acronym (project crmAcronym,
 * prism client id, or a short crm key). It does not read HubSpot.
 *
 * Dry-run by default. --apply writes customer_account.logo_url.
 * A logo already uploaded in PATH is kept unless you pass --overwrite.
 *
 * Auth: Dock → Settings → API → Create new secret key (account admin).
 * Put it in .env.local as DOCK_API_KEY. Never commit the key.
 *
 *   npm run db:import:dock-logos
 *   npm run db:import:dock-logos -- --apply
 *   npm run db:import:dock-logos -- --apply --overwrite
 *   npm run db:import:dock-logos -- ./dock-logos.json
 *   DOCK_LOGOS_JSON=./dock-logos.json npm run db:import:dock-logos -- --apply
 *
 * JSON shape (same fields the Dock API returns, or the normalized form):
 *   { "accounts": [{ "id", "name", "logo", "customFields": [{ "name", "variableName", "value" }] }],
 *     "workspaces": [{ "id", "name", "accountId", "account": { "logo", "name" }, "customFields": [] }] }
 *
 * Live pull uses GET https://api.dock.us/v1/accounts and /v1/workspaces
 * with account.logo and acronym custom fields. Optional DOCK_API_BASE.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts } from "@/db/schema";
import { deleteFile } from "@/lib/storage";
import {
  dockAccountFromApi,
  dockListUrl,
  dockPageHasNext,
  dockWorkspaceFromApi,
  pathLogoKeys,
  planDockLogoImport,
  rowsFromDockPage,
  type DockLogoAccount,
  type DockLogoWorkspace,
} from "@/lib/dock-account-logos";

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

function jsonPath(): string | null {
  const fromEnv = process.env.DOCK_LOGOS_JSON?.trim();
  if (fromEnv) return resolve(fromEnv);
  const positional = process.argv.slice(2).find((a) => a && !a.startsWith("--"));
  return positional ? resolve(positional) : null;
}

async function dockGet(url: string, token: string): Promise<unknown> {
  let last = "Dock request failed";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 429) {
      last = "Dock rate limit (429)";
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Dock ${res.status} for ${url}: ${text.slice(0, 400)}`);
    }
    return text ? JSON.parse(text) : {};
  }
  throw new Error(last);
}

async function listResource(
  resource: "accounts" | "workspaces",
  base: string,
  token: string,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = dockListUrl(base, resource, page, PAGE_LIMIT);
    const body = await dockGet(url, token);
    const pageRows = rowsFromDockPage(body, resource);
    rows.push(...pageRows);
    if (!dockPageHasNext(body, pageRows.length, PAGE_LIMIT)) break;
    if (pageRows.length === 0) break;
  }
  return rows;
}

async function loadDockCatalog(): Promise<{ accounts: DockLogoAccount[]; workspaces: DockLogoWorkspace[] }> {
  const file = jsonPath();
  if (file) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      accounts?: unknown[];
      workspaces?: unknown[];
    };
    const accounts = (parsed.accounts ?? []).map(dockAccountFromApi).filter((a): a is DockLogoAccount => !!a);
    const workspaces = (parsed.workspaces ?? []).map(dockWorkspaceFromApi).filter((w): w is DockLogoWorkspace => !!w);
    console.log(`Read ${file}`);
    return { accounts, workspaces };
  }

  const token = process.env.DOCK_API_KEY?.trim() ?? "";
  if (!token) {
    console.error(`Dock logo import needs a catalog.

Create a secret key in the PIMSY Dock workspace (https://pimsyehr.dock.us):
  Settings → API → Create new secret key
Then either:

  DOCK_API_KEY=... npm run db:import:dock-logos
  npm run db:import:dock-logos -- ./dock-logos.json

Dry-run is the default. Add --apply to write. Add --overwrite to replace a PATH upload or a different URL.
`);
    process.exit(1);
  }

  const base = (process.env.DOCK_API_BASE || "https://api.dock.us").replace(/\/$/, "");
  console.log(`Fetching Dock accounts and workspaces from ${base}`);
  const [accountRows, workspaceRows] = await Promise.all([
    listResource("accounts", base, token),
    listResource("workspaces", base, token),
  ]);
  return {
    accounts: accountRows.map(dockAccountFromApi).filter((a): a is DockLogoAccount => !!a),
    workspaces: workspaceRows.map(dockWorkspaceFromApi).filter((w): w is DockLogoWorkspace => !!w),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const overwrite = process.argv.includes("--overwrite");
  if (process.argv.includes("--help")) {
    console.log("See the comment at the top of scripts/import-dock-logos.ts");
    return;
  }

  const catalog = await loadDockCatalog();
  const customers = await db.query.customerAccounts.findMany({
    where: isNull(customerAccounts.archivedAt),
    columns: { id: true, name: true, logoUrl: true, logoStorageKey: true },
    with: {
      projects: {
        columns: { crmAcronym: true, prismClientId: true, crmKey: true, code: true },
      },
    },
  });

  const plan = planDockLogoImport({
    accounts: catalog.accounts,
    workspaces: catalog.workspaces,
    overwrite,
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      logoUrl: c.logoUrl,
      logoStorageKey: c.logoStorageKey,
      acronyms: [
        ...new Set(c.projects.flatMap((p) => pathLogoKeys(p))),
      ],
    })),
  });

  console.log(
    `\nDock logo import (${apply ? "apply" : "dry-run"})${overwrite ? " --overwrite" : ""}`,
  );
  console.log(
    `Accounts ${catalog.accounts.length} · workspaces ${catalog.workspaces.length} · PATH customers ${customers.length}`,
  );

  const writes = plan.updates.filter((u) => u.action !== "unchanged");
  for (const row of plan.updates) {
    if (row.action === "unchanged") {
      console.log(`  unchanged  ${row.acronym.padEnd(12)} ${row.customerName}`);
    } else {
      console.log(`  ${row.action.padEnd(10)} ${row.acronym.padEnd(12)} ${row.customerName}  ${row.logoUrl}`);
    }
  }
  for (const row of plan.skipped) {
    console.log(`  skip ${row.reason.padEnd(13)} ${row.acronym.padEnd(12)} ${row.customerName}  ${row.detail}`);
  }
  if (plan.unmatchedDock.length > 0) {
    console.log("\nDock acronyms with a logo and no PATH customer:");
    for (const row of plan.unmatchedDock) {
      console.log(`  ${row.acronym.padEnd(12)} ${row.label}  ${row.logoUrl}`);
    }
  }

  console.log(
    `\n${writes.length} to write · ${plan.updates.filter((u) => u.action === "unchanged").length} already matched · ${plan.skipped.length} skipped`,
  );

  if (!apply) {
    console.log("No writes. Re-run with --apply to set customer_account.logo_url.");
    return;
  }

  let written = 0;
  for (const row of writes) {
    await db
      .update(customerAccounts)
      .set({
        logoUrl: row.logoUrl,
        logoStorageKey: null,
        updatedAt: new Date(),
      })
      .where(eq(customerAccounts.id, row.customerId));
    if (row.clearsUpload) {
      const previous = customers.find((c) => c.id === row.customerId)?.logoStorageKey;
      if (previous) await deleteFile(previous);
    }
    written++;
  }
  console.log(`Updated ${written} customer logo URL${written === 1 ? "" : "s"}.`);
}

main().catch((err) => {
  console.error("\nimport-dock-logos failed:", err);
  process.exit(1);
});
