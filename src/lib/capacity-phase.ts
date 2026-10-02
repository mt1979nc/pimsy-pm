/**
 * Prism Capacity Dashboard phase + site placement.
 * Client-safe: no Postgres imports.
 *
 * Phase keys match Prism v6.4 `.phase-sel` (kickoff / discovery / config /
 * training / pregolive / complete). A null `currentPhase` is the unrecorded
 * state — the model guess is a suggestion and is never written on render.
 */

import type { PrismStatus } from "@/lib/prism-status";
import { utcCalendarDaysBetween, utcDayKey } from "@/lib/dates";

export const CAPACITY_PHASES = [
  "kickoff",
  "discovery",
  "config",
  "training",
  "pregolive",
  "complete",
] as const;

export type CapacityPhase = (typeof CAPACITY_PHASES)[number];

export const CAPACITY_PHASE_LABELS: Record<CapacityPhase, string> = {
  kickoff: "Kickoff",
  discovery: "Discovery",
  config: "Config",
  training: "Training",
  pregolive: "Pre Go-Live",
  complete: "Complete",
};

export function isCapacityPhase(value: string | null | undefined): value is CapacityPhase {
  return !!value && (CAPACITY_PHASES as readonly string[]).includes(value);
}

/** Active and pre-kickoff sit on the capacity cards. Pipeline does not. */
export function countsOnCapacityCards(status: PrismStatus): boolean {
  return status === "active" || status === "pre-kickoff";
}

/**
 * Model estimate of where a site is in the window. Never persisted.
 * Returns null when there is no kickoff and no go-live to guess from.
 */
export function modelCapacityPhase(input: {
  asOf: Date;
  kickoff: Date | null;
  goLive: Date | null;
}): CapacityPhase | null {
  const { asOf, kickoff, goLive } = input;
  if (!kickoff && !goLive) return null;
  const today = utcDayKey(asOf);
  if (goLive && today >= utcDayKey(goLive)) return "complete";
  if (kickoff && today < utcDayKey(kickoff)) return "kickoff";
  if (!kickoff || !goLive) return kickoff ? "discovery" : "kickoff";

  const span = utcCalendarDaysBetween(kickoff, goLive);
  const elapsed = utcCalendarDaysBetween(kickoff, asOf);
  if (span <= 0) return "complete";
  if (elapsed < 7) return "kickoff";
  if (span - elapsed <= 7) return "pregolive";
  const ratio = elapsed / span;
  if (ratio < 0.4) return "discovery";
  if (ratio < 0.72) return "config";
  return "training";
}

export type CapacityNoteBadge = {
  label: "pre-kickoff" | "pre-go-live" | "stalled" | "special";
  tone: "brand" | "amber" | "red" | "violet";
};

/** Prism card badge. Pre-kickoff wins, then note tags. One badge. */
export function capacityNoteBadge(input: {
  prismStatus: PrismStatus | string;
  prismNote: string | null | undefined;
}): CapacityNoteBadge | null {
  const note = (input.prismNote ?? "").trim().toLowerCase();
  if (input.prismStatus === "pre-kickoff") return { label: "pre-kickoff", tone: "brand" };
  if (note === "pre-go-live" || note === "pre go-live" || note === "pregolive") {
    return { label: "pre-go-live", tone: "amber" };
  }
  if (note === "stalled") return { label: "stalled", tone: "red" };
  if (note === "special") return { label: "special", tone: "violet" };
  return null;
}

export type CapacityPlacement = {
  splitPercent: number;
  isSecondary: boolean;
};

/**
 * Share of this site that belongs on one specialist's card.
 * Primary owner gets `ownerSplitPercent`. Co-lead gets the rest.
 * A sole owner gets 100 even if the stored split is lower.
 */
export function placementForMember(
  memberId: string,
  site: {
    leadId: string | null;
    coLeadId: string | null;
    ownerSplitPercent: number;
  },
): CapacityPlacement | null {
  const isPrimary = site.leadId === memberId;
  const isCo = site.coLeadId === memberId && site.leadId !== memberId;
  if (!isPrimary && !isCo) return null;
  if (isPrimary) {
    const split = site.coLeadId ? clampSplit(site.ownerSplitPercent) : 100;
    return { splitPercent: split, isSecondary: false };
  }
  return { splitPercent: 100 - clampSplit(site.ownerSplitPercent), isSecondary: true };
}

function clampSplit(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export type CapacityGroupSite = {
  id: string;
  leadId: string | null;
  coLeadId: string | null;
  ownerSplitPercent: number;
  prismStatus: PrismStatus;
  acronym: string;
};

export type PlacedCapacitySite<T> = T & CapacityPlacement;

/**
 * Site rows under each specialist. A co-led site appears on both cards.
 * Pipeline (and anything else off the board) is dropped. A site with no
 * owner on this roster lands in `unassigned` instead of a flat mixed list.
 */
export function groupSitesUnderSpecialists<T extends CapacityGroupSite>(
  memberIds: readonly string[],
  sites: readonly T[],
): {
  byMember: Record<string, PlacedCapacitySite<T>[]>;
  unassigned: PlacedCapacitySite<T>[];
} {
  const byMember: Record<string, PlacedCapacitySite<T>[]> = {};
  for (const id of memberIds) byMember[id] = [];
  const unassigned: PlacedCapacitySite<T>[] = [];

  const ordered = [...sites].sort((a, b) => a.acronym.localeCompare(b.acronym));
  for (const site of ordered) {
    if (!countsOnCapacityCards(site.prismStatus)) continue;
    let placed = false;
    for (const memberId of memberIds) {
      const placement = placementForMember(memberId, site);
      if (!placement) continue;
      byMember[memberId]!.push({ ...site, ...placement });
      placed = true;
    }
    if (!placed) {
      unassigned.push({ ...site, splitPercent: 100, isSecondary: false });
    }
  }

  return { byMember, unassigned };
}

/** Declined approval still records the slip and does not move go-live. */
export function slipPersistencePlan(approveGoLive: boolean): {
  updateGoLive: boolean;
  recordSlip: true;
  goLiveApplied: boolean;
} {
  return { updateGoLive: approveGoLive, recordSlip: true, goLiveApplied: approveGoLive };
}

/** Deleting an unapplied slip must not roll the go-live date backward. */
export function slipDeleteRestoresGoLive(goLiveApplied: boolean | null | undefined): boolean {
  return goLiveApplied !== false;
}

export type CapacitySlipRow = {
  id: string;
  fromDate: string;
  toDate: string;
  days: number;
  cause: "CUSTOMER" | "PIMSY" | null;
  note: string | null;
  createdAt: string;
  goLiveApplied: boolean;
};

/** One site row under a specialist. Dates are ISO strings so the client can render them. */
export type CapacitySiteRow = {
  id: string;
  acronym: string;
  name: string;
  prismStatus: PrismStatus;
  prismNote: string | null;
  currentPhase: CapacityPhase | null;
  modelPhase: CapacityPhase | null;
  phaseRecordedAt: string | null;
  splitPercent: number;
  isSecondary: boolean;
  weeklyHours: number;
  slipDays: number;
  /** ISO timestamp of the current target go-live, or "" when unset. */
  targetGoLive: string;
  slips: CapacitySlipRow[];
};
