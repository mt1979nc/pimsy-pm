/**
 * Owner scorecard for Prism Analysis.
 * Completed sites count for the implementation lead only. Prism completed
 * history has no co-lead or percent split.
 * Active staff are always listed. Former staff are optional.
 */

export type ScorecardStaff = {
  id: string;
  name: string | null;
  email?: string | null;
  isActive: boolean;
};

export type ScorecardStat = {
  leadId: string;
  name: string;
  completed: number;
  onTimeRate: number;
  avgVariance: number | null;
  avgDaysLateOnMisses: number | null;
  misses: number;
};

export type ScorecardRow = {
  leadId: string;
  name: string;
  isActive: boolean;
  completed: number;
  /** Null when this person has no completed sites with a recorded forecast. */
  onTimeRate: number | null;
  avgVariance: number | null;
  avgDaysLateOnMisses: number | null;
  misses: number;
  empty: boolean;
};

function label(person: { name: string | null; email?: string | null }, fallback: string): string {
  return person.name?.trim() || person.email?.trim() || fallback;
}

export function assembleOwnerScorecard(
  stats: readonly ScorecardStat[],
  staff: readonly ScorecardStaff[],
  includeFormer: boolean,
): ScorecardRow[] {
  const byId = new Map(stats.map((stat) => [stat.leadId, stat]));
  const seen = new Set<string>();
  const rows: ScorecardRow[] = [];

  for (const person of staff) {
    if (!person.isActive && !includeFormer) continue;
    seen.add(person.id);
    const stat = byId.get(person.id);
    if (!stat || stat.completed === 0) {
      rows.push({
        leadId: person.id,
        name: label(person, stat?.name ?? "Unnamed"),
        isActive: person.isActive,
        completed: 0,
        onTimeRate: null,
        avgVariance: null,
        avgDaysLateOnMisses: null,
        misses: 0,
        empty: true,
      });
      continue;
    }
    rows.push({
      leadId: person.id,
      name: label(person, stat.name),
      isActive: person.isActive,
      completed: stat.completed,
      onTimeRate: stat.onTimeRate,
      avgVariance: stat.avgVariance,
      avgDaysLateOnMisses: stat.avgDaysLateOnMisses,
      misses: stat.misses,
      empty: false,
    });
  }

  if (includeFormer) {
    for (const stat of stats) {
      if (seen.has(stat.leadId) || stat.completed === 0) continue;
      rows.push({
        leadId: stat.leadId,
        name: stat.name,
        isActive: false,
        completed: stat.completed,
        onTimeRate: stat.onTimeRate,
        avgVariance: stat.avgVariance,
        avgDaysLateOnMisses: stat.avgDaysLateOnMisses,
        misses: stat.misses,
        empty: false,
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.empty !== b.empty) return a.empty ? 1 : -1;
    if (!a.empty && !b.empty && a.onTimeRate !== b.onTimeRate) return (b.onTimeRate ?? 0) - (a.onTimeRate ?? 0);
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
