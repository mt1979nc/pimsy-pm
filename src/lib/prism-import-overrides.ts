/**
 * Alexander's corrections for the Prism → PATH import.
 *
 * Add a row here. Do not scatter one-off checks through the importer.
 * Acronyms are compared trimmed and uppercased. A row in the dump is patched
 * before matching. A row that is not in the dump is still applied to an
 * existing PATH project with that acronym (FBH left Prism after go-live).
 * Nothing is inserted or archived just because an override is missing from
 * the dump. TLA was added in Prism after the 1 Oct 2026 dump; Discovery
 * applies when a dump or an existing PATH project has that acronym.
 */

import type { CapacityPhase } from "@/lib/capacity-phase";
import { acronymKey, type PrismDump, type PrismDumpCompleted, type PrismDumpCustomer } from "@/lib/prism-dump";

export type PrismCustomerStatus = "PROSPECT" | "ONBOARDING" | "LIVE" | "AT_RISK" | "CHURNED";

export type PrismCustomerOverride = {
  /** Prism id or PATH acronym. */
  acronym: string;
  customerStatus?: PrismCustomerStatus;
  /** Capacity phase. "discovery" is the Discovery status. */
  phase?: CapacityPhase;
  /** Current go-live (YYYY-MM-DD). Also stored as the actual go-live when the customer is LIVE. */
  goLive?: string;
  /** Initial go-live (YYYY-MM-DD). Written even when PATH already has one. */
  initialGoLive?: string;
  kickoff?: string;
  note: string;
};

export type PrismTeamExclusion = {
  teamId: string;
  name: string;
  reason: string;
};

export type PrismImportOverrides = {
  excludedTeam: PrismTeamExclusion[];
  customers: PrismCustomerOverride[];
};

export const PRISM_IMPORT_OVERRIDES: PrismImportOverrides = {
  excludedTeam: [
    {
      teamId: "rb",
      name: "ReShawn Beard",
      reason: "Former employee. Not imported and not updated.",
    },
  ],
  customers: [
    {
      acronym: "FBH",
      customerStatus: "LIVE",
      goLive: "2026-10-21",
      initialGoLive: "2026-10-21",
      note: "Alexander: FBH is live. Go-live 2026-10-21 replaces Prism's date and status.",
    },
    {
      acronym: "TLA",
      phase: "discovery",
      note: "Alexander: TLA status is Discovery.",
    },
  ],
};

export function excludedTeam(teamId: string | null | undefined): PrismTeamExclusion | undefined {
  const id = (teamId ?? "").trim().toLowerCase();
  if (!id) return undefined;
  return PRISM_IMPORT_OVERRIDES.excludedTeam.find((row) => row.teamId === id);
}

export function customerOverride(acronym: string | null | undefined): PrismCustomerOverride | undefined {
  const key = acronymKey(acronym);
  if (!key) return undefined;
  return PRISM_IMPORT_OVERRIDES.customers.find((row) => acronymKey(row.acronym) === key);
}

function patchCustomer<T extends PrismDumpCustomer | PrismDumpCompleted>(row: T, override: PrismCustomerOverride): T {
  return {
    ...row,
    goliveDate: override.goLive ?? row.goliveDate,
    kickoffDate: override.kickoff ?? row.kickoffDate,
    initialGolive: override.initialGoLive ?? row.initialGolive,
  };
}

function appliedNote(acronym: string, override: PrismCustomerOverride, prismGoLive: string | null): string {
  const parts = [override.note];
  if (override.customerStatus) parts.push(`customer status ${override.customerStatus}`);
  if (override.phase) parts.push(`status ${override.phase === "discovery" ? "Discovery" : override.phase}`);
  if (override.goLive) {
    parts.push(`go-live ${prismGoLive ?? "—"} → ${override.goLive}`);
  }
  return `${acronym}: Alexander override applied — ${parts.join("; ")}.`;
}

function missingNote(override: PrismCustomerOverride): string {
  if (acronymKey(override.acronym) === "TLA") {
    return (
      "TLA: no TLA was found in this dump. Discovery was not applied. " +
      "TLA was added in Prism after the 1 Oct 2026 dump, so that file does not include it. " +
      "The override is keyed by acronym and will apply when a dump includes TLA."
    );
  }
  const what = [
    override.customerStatus,
    override.goLive ? `go-live ${override.goLive}` : null,
    override.phase ? `phase ${override.phase}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `${override.acronym}: no Prism customer with acronym ${override.acronym} was found in this dump. ${what || override.note} was not applied.`;
}

export function missingOverrideNote(override: PrismCustomerOverride): string {
  return missingNote(override);
}

/**
 * Copy the dump with override dates applied. Does not mutate the input.
 * Notes cover overrides that were in the dump. Absent acronyms are returned
 * so the planner can apply them to an existing PATH project.
 */
export function applyPrismCustomerOverrides(dump: PrismDump): {
  dump: PrismDump;
  notes: string[];
  absent: PrismCustomerOverride[];
} {
  const notes: string[] = [];
  const seen = new Set<string>();

  const customers = dump.customers.map((row) => {
    const override = customerOverride(row.id);
    if (!override) return row;
    seen.add(acronymKey(row.id));
    notes.push(appliedNote(row.id, override, row.goliveDate));
    return patchCustomer(row, override);
  });

  const completed = dump.completed.map((row) => {
    const override = customerOverride(row.id);
    if (!override) return row;
    seen.add(acronymKey(row.id));
    notes.push(appliedNote(row.id, override, row.goliveDate));
    return patchCustomer(row, override);
  });

  const absent = PRISM_IMPORT_OVERRIDES.customers.filter((override) => !seen.has(acronymKey(override.acronym)));

  return {
    dump: { ...dump, customers, completed },
    notes,
    absent,
  };
}
