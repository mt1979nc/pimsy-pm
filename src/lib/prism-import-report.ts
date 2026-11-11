/**
 * Human-readable Prism import plan. Dry-run and apply print this.
 * Nothing here writes.
 */

import type { ImportPlan, ImportPlanRow } from "@/lib/prism-import";

const VIA_LABEL: Record<string, string> = {
  prismClientId: "prism id",
  code: "code",
  crmAcronym: "acronym",
  name: "account name",
};

function mark(action: string): string {
  if (action === "insert") return "+";
  if (action === "update" || action === "protect-wip") return "~";
  return ".";
}

function identity(row: ImportPlanRow): string | null {
  if (!row.projectId) return null;
  const name = row.projectName?.trim() || "—";
  const acronym = row.projectAcronym?.trim() || "—";
  return `${row.projectId}  ${name}  (${acronym})`;
}

function formatSlip(slip: ImportPlanRow): string[] {
  const summary = slip.slipSummary ?? slip.key;
  const who = identity(slip);
  if (slip.matchLabel === "NEW") {
    return [`    slip  ${summary}`, "      NEW"];
  }
  if (slip.matchLabel === "AMBIGUOUS") {
    return [`    slip  ${summary}`, "      AMBIGUOUS"];
  }
  if (slip.matchLabel === "SKIPPED") {
    const reason = slip.detail ? `  ${slip.detail}` : "";
    return [`    slip  ${summary}`, `      SKIPPED${who ? `  ${who}` : ""}${reason}`];
  }
  return [`    slip  ${summary}`, `      MATCHED  ${who ?? slip.key}`];
}

function formatEngagement(row: ImportPlanRow, slips: ImportPlanRow[]): string[] {
  const lines: string[] = [];
  const title = row.accountName ? `${row.key}  ${row.accountName}` : row.key;
  lines.push(`  ${title}`);
  if (row.matchLabel === "MATCHED") {
    const via = row.via ? `  via ${VIA_LABEL[row.via] ?? row.via}` : "";
    lines.push(`    MATCHED  ${identity(row) ?? row.key}${via}`);
    if (row.action === "protect-wip") lines.push("    Playbook and tasks stay. Prism fields still update.");
    if (row.detail) lines.push(`    ${row.detail}`);
  } else {
    lines.push(`    ${row.matchLabel ?? row.action}`);
    if (row.detail) lines.push(`    ${row.detail}`);
  }
  if (row.changes && row.changes.length) {
    lines.push("    changes:");
    for (const change of row.changes) lines.push(`      ${change}`);
  } else {
    lines.push("    changes:  (none)");
  }
  for (const slip of slips) {
    if (slip.parentKey === row.key) lines.push(...formatSlip(slip));
  }
  return lines;
}

export function formatPrismImportPlan(plan: ImportPlan): string {
  const lines: string[] = [
    "Prism → PATH import",
    "People already in PATH keep lead, exempt, and director. People added in Settings are not rewritten. Nothing is deleted.",
    "",
    "Team",
  ];
  if (!plan.team.length) lines.push("  (none)");
  for (const row of plan.team) {
    lines.push(`  ${mark(row.action)} ${row.key}  ${row.detail}`);
  }

  lines.push("", "Customers");
  if (!plan.customers.length) lines.push("  (none)");
  for (const row of plan.customers) lines.push(...formatEngagement(row, plan.slips));

  lines.push("", "Completed");
  if (!plan.completed.length) lines.push("  (none)");
  for (const row of plan.completed) lines.push(...formatEngagement(row, []));

  lines.push("", "Overrides");
  if (!plan.overrideNotes.length) lines.push("  (none)");
  for (const note of plan.overrideNotes) lines.push(`  ${note}`);

  lines.push("", "Roster shells that look like Oct 1 duplicates (report only — nothing is deleted)");
  if (!plan.duplicateShells.length) lines.push("  (none)");
  for (const dup of plan.duplicateShells) {
    const archived = dup.shellArchived ? "  (already archived)" : "";
    lines.push(`  ${dup.shellId}  ${dup.shellCode}  ${dup.shellName}${archived}`);
    lines.push(`    same customer as ${dup.siblingId}  ${dup.siblingAcronym || dup.siblingCode}  ${dup.siblingName}`);
  }

  if (plan.warnings.length) {
    lines.push("", "Warnings");
    for (const warning of plan.warnings) lines.push(`  ! ${warning}`);
  }
  return lines.join("\n");
}
