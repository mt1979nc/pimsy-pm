/**
 * Fill CEO executive book fields from Alexander's implementations sheet.
 *
 * Match: uppercase Abbreviation ↔ projects.crmAcronym, projects.prismClientId,
 * or projects.code. Prefer the implementation project that would show on
 * Executive. Do not create projects. Do not change Assigned IS / lead.
 * Empty sheet cells leave PATH unchanged.
 *
 * Dry-run unless --apply is passed.
 *
 *   npm run db:sync:executive-sheet
 *   npm run db:sync:executive-sheet -- --apply
 *   npm run db:sync:executive-sheet -- --csv data/executive-contract-dates.csv --apply
 *
 * Azure: copy DATABASE_URL from App Service configuration, deploy this build
 * (migrate 0028_ceo_comments first), then:
 *   npm run db:sync:executive-sheet -- --apply
 *
 * Go-live writes update the date columns only. They do not insert slip events
 * or move task dates.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

import {
  EXECUTIVE_SHEET_FIELD_LABELS,
  dedupeExecutiveSheetRows,
  executiveUpdateValues,
  parseExecutiveSheetCsv,
  pickExecutiveProject,
  planExecutiveSheetUpdate,
  type ExecutiveMatchCandidate,
  type ExecutiveSheetField,
  type PlannedCell,
} from "@/lib/executive-sheet";

const DEFAULT_CSV = "data/executive-contract-dates.csv";

function printHelp() {
  console.log(`Usage: npm run db:sync:executive-sheet -- [--dry-run | --apply] [--csv path]

Default CSV: ${DEFAULT_CSV}
Default mode: dry-run (no writes).

--apply   Write matched projects. Empty sheet cells are not cleared.
--csv     Path to the executive contract-dates CSV.
`);
}

function parseArgs(argv: string[]): { apply: boolean; csvPath: string } {
  let apply = false;
  let dryRun = false;
  let csvPath = DEFAULT_CSV;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--csv") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw new Error("--csv needs a path");
      csvPath = next;
      i++;
      continue;
    }
    if (arg.startsWith("--csv=")) {
      csvPath = arg.slice("--csv=".length);
      continue;
    }
    throw new Error(`Unknown argument ${arg}`);
  }
  if (apply && dryRun) throw new Error("Pass either --apply or --dry-run, not both.");
  return { apply, csvPath: resolve(csvPath) };
}

function chars(value: string | null): string {
  if (!value) return "—";
  return `${value.length} characters`;
}

function formatValue(field: ExecutiveSheetField, value: string | null): string {
  if (field === "ceoComments") return chars(value);
  return value ?? "—";
}

function describe(candidate: ExecutiveMatchCandidate): string {
  const flags = [
    candidate.type,
    candidate.status,
    candidate.archivedAt ? "archived" : null,
    candidate.prismStatus ? `prism=${candidate.prismStatus}` : null,
    candidate.excludeFromAnalytics || candidate.customerExcluded ? "excluded-from-analytics" : null,
    candidate.crmAcronym ? `crm=${candidate.crmAcronym}` : null,
    candidate.prismClientId ? `prismId=${candidate.prismClientId}` : null,
  ].filter(Boolean);
  const name = candidate.customerName?.trim() || candidate.name;
  return `${candidate.code}  ${name}  (${flags.join(", ")})`;
}

function detailLine(cell: PlannedCell): string | null {
  const label = EXECUTIVE_SHEET_FIELD_LABELS[cell.field].padEnd(24);
  if (cell.action === "update") {
    const note = cell.note ? `  (${cell.note})` : "";
    return `    ${label} ${formatValue(cell.field, cell.from)} → ${formatValue(cell.field, cell.to)}${note}`;
  }
  if (cell.action === "skip-invalid") {
    const shown = cell.field === "ceoComments" ? chars(cell.raw) : cell.raw;
    return `    ${label} skipped ${JSON.stringify(shown)} — ${cell.detail}; left unchanged`;
  }
  return null;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.csvPath)) {
    console.error(`CSV not found: ${args.csvPath}`);
    return 1;
  }

  const text = readFileSync(args.csvPath, "utf8");
  const parsed = parseExecutiveSheetCsv(text);
  const { rows, duplicates } = dedupeExecutiveSheetRows(parsed);

  const { db } = await import("@/db");
  const { projects } = await import("@/db/schema");
  const { redactDatabaseUrl } = await import("@/lib/demo-entities");
  const { env } = await import("@/lib/env");

  console.log("\nPATH executive sheet sync");
  console.log(`  csv: ${args.csvPath}`);
  console.log(`  ${redactDatabaseUrl(env.DATABASE_URL)}`);
  console.log(`  mode: ${args.apply ? "APPLY" : "DRY-RUN (pass --apply to write)"}`);
  console.log("  Assigned IS is not read from the sheet.");
  console.log("  Empty sheet cells are left unchanged on PATH.\n");

  if (duplicates.length > 0) {
    console.log("Duplicate abbreviations (last row wins):");
    for (const duplicate of duplicates) {
      console.log(
        `  ${duplicate.abbreviation} kept row ${duplicate.keptRow}, dropped ${duplicate.droppedRows.join(", ")}`,
      );
    }
    console.log("");
  }

  const projectsRows = await db.query.projects.findMany({
    columns: {
      id: true,
      name: true,
      code: true,
      crmAcronym: true,
      prismClientId: true,
      type: true,
      status: true,
      archivedAt: true,
      prismStatus: true,
      excludeFromAnalytics: true,
      contractDate: true,
      expectedArr: true,
      ceoStatus: true,
      ceoComments: true,
      initialGoLiveDate: true,
      targetGoLiveDate: true,
      actualGoLiveDate: true,
    },
    with: {
      customerAccount: { columns: { name: true, excludeFromAnalytics: true } },
    },
  });

  const candidates: ExecutiveMatchCandidate[] = projectsRows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    customerName: row.customerAccount?.name ?? null,
    crmAcronym: row.crmAcronym,
    prismClientId: row.prismClientId,
    type: row.type,
    status: row.status,
    archivedAt: row.archivedAt,
    prismStatus: row.prismStatus,
    excludeFromAnalytics: row.excludeFromAnalytics,
    customerExcluded: Boolean(row.customerAccount?.excludeFromAnalytics),
    stored: {
      contractDate: row.contractDate,
      expectedArr: row.expectedArr,
      initialGoLiveDate: row.initialGoLiveDate,
      targetGoLiveDate: row.targetGoLiveDate,
      actualGoLiveDate: row.actualGoLiveDate,
      ceoStatus: row.ceoStatus,
      ceoComments: row.ceoComments,
    },
  }));

  let updatedProjects = 0;
  let fieldWrites = 0;
  let skippedEmpty = 0;
  let skippedInvalid = 0;
  let unchangedFields = 0;
  const unmatched: string[] = [];
  const blankAbbreviations: string[] = [];
  const ambiguous: string[] = [];
  const ineligible: string[] = [];
  const emptyByField = new Map<ExecutiveSheetField, string[]>();
  const writes: { id: string; abbreviation: string; values: NonNullable<ReturnType<typeof executiveUpdateValues>> }[] =
    [];

  for (const row of rows) {
    if (!row.abbreviation) {
      blankAbbreviations.push(`row ${row.rowNumber} ${row.name || "(no name)"}`);
      continue;
    }
    const pick = pickExecutiveProject(row.abbreviation, candidates);
    if (pick.kind === "unmatched") {
      unmatched.push(`${row.abbreviation}  ${row.name}  (row ${row.rowNumber})`);
      continue;
    }
    if (pick.kind === "ambiguous") {
      ambiguous.push(
        `${row.abbreviation}  ${pick.candidates.length} ${pick.tier} projects; not written\n${pick.candidates
          .map((candidate) => `    - ${describe(candidate)}`)
          .join("\n")}`,
      );
      continue;
    }
    if (pick.kind === "ineligible") {
      ineligible.push(
        `${row.abbreviation}  only archived, cancelled, or non-implementation; not written\n${pick.candidates
          .map((candidate) => `    - ${describe(candidate)}`)
          .join("\n")}`,
      );
      continue;
    }

    const plan = planExecutiveSheetUpdate(row, pick.project.stored);
    const values = executiveUpdateValues(plan);
    const lines = plan.map(detailLine).filter((line): line is string => Boolean(line));
    for (const cell of plan) {
      if (cell.action === "skip-empty") {
        skippedEmpty++;
        const list = emptyByField.get(cell.field) ?? [];
        list.push(row.abbreviation);
        emptyByField.set(cell.field, list);
      } else if (cell.action === "skip-invalid") skippedInvalid++;
      else if (cell.action === "unchanged") unchangedFields++;
      else fieldWrites++;
    }

    const label = pick.project.customerName?.trim() || pick.project.name;
    const tierNote = pick.tier === "implementation" ? "  (not on the Executive book)" : "";
    const alternateNote =
      pick.alternates.length > 0 ? `  also matched ${pick.alternates.length} other project(s)` : "";
    if (values || lines.length > 0 || pick.alternates.length > 0) {
      console.log(`  ${values ? "UPDATE" : "WARN"}  ${row.abbreviation}  →  ${pick.project.code}  ${label}${tierNote}${alternateNote}`);
      for (const alternate of pick.alternates) console.log(`    alternate  ${describe(alternate)}`);
      for (const line of lines) console.log(line);
    }

    if (values) {
      updatedProjects++;
      writes.push({ id: pick.project.id, abbreviation: row.abbreviation, values });
    }
  }

  if (args.apply && writes.length > 0) {
    await db.transaction(async (tx) => {
      for (const write of writes) {
        await tx
          .update(projects)
          .set({ ...write.values, updatedAt: new Date() })
          .where(eq(projects.id, write.id));
      }
    });
  }

  console.log("\nUnmatched acronyms (no project created):");
  if (unmatched.length === 0) console.log("  (none)");
  else for (const line of unmatched) console.log(`  ${line}`);

  if (blankAbbreviations.length > 0) {
    console.log("\nBlank abbreviations:");
    for (const line of blankAbbreviations) console.log(`  ${line}`);
  }
  if (ambiguous.length > 0) {
    console.log("\nAmbiguous (skipped):");
    for (const line of ambiguous) console.log(`  ${line}`);
  }
  if (ineligible.length > 0) {
    console.log("\nMatched but not an active implementation (skipped):");
    for (const line of ineligible) console.log(`  ${line}`);
  }

  console.log("\nEmpty sheet cells left unchanged:");
  if (emptyByField.size === 0) console.log("  (none)");
  for (const [field, acronyms] of emptyByField) {
    console.log(`  ${EXECUTIVE_SHEET_FIELD_LABELS[field]}: ${acronyms.join(", ")}`);
  }

  console.log(`\n  rows: ${rows.length}`);
  console.log(`  updated projects: ${updatedProjects}`);
  console.log(`  fields ${args.apply ? "written" : "to write"}: ${fieldWrites}`);
  console.log(`  skipped empty cells: ${skippedEmpty}`);
  console.log(`  invalid cells left unchanged: ${skippedInvalid}`);
  console.log(`  already up to date: ${unchangedFields}`);
  console.log(`  unmatched: ${unmatched.length}`);
  console.log(`  ambiguous: ${ambiguous.length}`);
  console.log(`  ineligible: ${ineligible.length}`);

  if (!args.apply && fieldWrites > 0) {
    console.log("\n  Re-run with --apply to write.\n");
  } else {
    console.log("");
  }

  const considered = rows.filter((row) => row.abbreviation).length;
  if (considered > 0 && unmatched.length === considered) {
    console.error("No acronyms matched a PATH project. Nothing was written. Check DATABASE_URL.\n");
    return 1;
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
