/**
 * Mark open tasks complete on time for PATH historical sites.
 *
 * Eligible sites need kickoff + go-live (or actual end) AND one of:
 * COMPLETED, cancelled, archived, post go-live (actualGoLiveDate in the past),
 * or Onboarded. Active WIP without that gate is skipped.
 *
 * Dry-run by default.
 *
 *   npm run db:complete:historical-on-time
 *   npm run db:complete:historical-on-time -- --apply
 *   npm run db:complete:historical-on-time -- --project IMP-9001
 *
 * Azure Cloud Shell: copy DATABASE_URL from App Service Configuration —
 * do not invent the connection string.
 */
import { db } from "@/db";
import { redactDatabaseUrl } from "@/lib/demo-entities";
import { env } from "@/lib/env";
import {
  assessHistoricalComplete,
  completeHistoricalProjectOnTime,
} from "@/lib/historical-complete";

function argValues(flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    if (a === flag && process.argv[i + 1] && !process.argv[i + 1]!.startsWith("--")) {
      out.push(process.argv[i + 1]!);
      i++;
      continue;
    }
    if (a.startsWith(`${flag}=`)) out.push(a.slice(flag.length + 1));
  }
  return out;
}

const apply = process.argv.includes("--apply");
const projectFilters = argValues("--project").map((s) => s.trim()).filter(Boolean);

async function main() {
  console.log("\nPATH historical complete-on-time");
  console.log(`  ${redactDatabaseUrl(env.DATABASE_URL)}`);
  console.log(`  mode: ${apply ? "APPLY (writes DONE + completedAt)" : "DRY-RUN (pass --apply to write)"}\n`);

  const rows = await db.query.projects.findMany({
    columns: {
      id: true,
      code: true,
      name: true,
      crmAcronym: true,
      status: true,
      onboarded: true,
      startDate: true,
      actualGoLiveDate: true,
      targetGoLiveDate: true,
      archivedAt: true,
    },
  });

  const wanted = projectFilters.length
    ? rows.filter((p) => {
        const keys = [p.id, p.code, p.crmAcronym, p.name].filter(Boolean).map((s) => String(s).toLowerCase());
        return projectFilters.some((f) => keys.includes(f.toLowerCase()));
      })
    : rows;

  if (projectFilters.length && wanted.length === 0) {
    console.error(`No projects matched --project ${projectFilters.join(", ")}`);
    process.exit(1);
  }

  let eligible = 0;
  let skipped = 0;
  let plannedTotal = 0;
  let appliedTotal = 0;

  for (const p of wanted) {
    const assessment = assessHistoricalComplete(p);
    if (!assessment.ok) {
      skipped++;
      continue;
    }
    const result = await completeHistoricalProjectOnTime(p.id, { apply });
    const n = result.planned.length;
    if (n === 0) {
      skipped++;
      continue;
    }
    eligible++;
    plannedTotal += n;
    appliedTotal += result.applied;
    const label = p.crmAcronym || p.code;
    console.log(
      `  ${apply ? "APPLIED" : "WOULD"}  ${label.padEnd(12)}  ${p.status.padEnd(12)}  gate=${assessment.gate.padEnd(12)}  tasks=${n}`,
    );
  }

  console.log(`\n  eligible with open tasks: ${eligible}`);
  console.log(`  skipped (gate/dates/no open tasks): ${skipped}`);
  console.log(`  tasks ${apply ? "completed" : "planned"}: ${apply ? appliedTotal : plannedTotal}`);
  if (!apply && plannedTotal > 0) {
    console.log("\n  Re-run with --apply to write.\n");
  } else {
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
