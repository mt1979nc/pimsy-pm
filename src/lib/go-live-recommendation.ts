/**
 * Roster Forecast+ go-live recommendation.
 *
 * Standalone Prism Forecast+ projects kickoff → go-live from the discovery
 * formula in `estimator.ts` (Optimistic / Typical / Pessimistic = how fast
 * the customer returns discovery, not historical percentiles). Hours are the
 * same Prism config + training total on every band; a longer band only
 * dilutes hrs/wk.
 *
 * Historical P25 / median / P75 of completed sites stay as a caption so
 * Analysis outliers remain visible — they do not replace the Forecast+ date.
 * (v1.12.4 briefly used those percentiles as the committed go-live, which
 * diverged from Prism Forecast+.)
 */

import type { ComplexityTier, DiscoveryScenario } from "@/db/schema";
import {
  complexityTier,
  DISCOVERY_SCENARIOS,
  estimateHours,
  forecastImplementation,
  parseDiscoveryScenario,
  parseSkipUsFederalHolidays,
  SCENARIO_LABELS,
  type ForecastOptions,
  type ForecastResult,
  type ImplementationScope,
  type ScenarioProjection,
} from "@/lib/estimator";
import {
  DEFAULT_ANALYSIS_EXCLUSION_CODES,
  isExcludedFromPrimaryAverages,
  round1,
  weeklyHoursForEngagement,
} from "@/lib/forecast";

export { parseDiscoveryScenario, parseSkipUsFederalHolidays };

/** Need this many completed durations before past-site stats appear in the caption. */
export const HISTORICAL_BAND_MIN_SAMPLE = 3;

export const HISTORICAL_SCENARIO_PERCENTILES: Record<DiscoveryScenario, number> = {
  OPTIMISTIC: 0.25,
  TYPICAL: 0.5,
  PESSIMISTIC: 0.75,
};

export type DurationSample = {
  code: string;
  durationDays: number;
  complexityTier: ComplexityTier | string | null;
};

export type HistoricalDurationBands = {
  source: "tier" | "all" | "none";
  n: number;
  excludedCount: number;
  excludedCodes: string[];
  complexityTier: ComplexityTier | string | null;
  /** Arithmetic mean — same statistic Analysis shows as avg. duration. */
  meanDays: number | null;
  optimisticDays: number | null;
  typicalDays: number | null;
  pessimisticDays: number | null;
};

export type RecommendedScenario = ScenarioProjection & {
  estimatedHours: number;
  weeklyHours: number;
};

export type GoLiveRecommendation = Omit<ForecastResult, "scenarios"> & {
  goLiveSource: "historical-tier" | "historical-all" | "model";
  historical: HistoricalDurationBands;
  scenarios: RecommendedScenario[];
};

/** Linear interpolation, Excel PERCENTILE.INC / “inclusive” method. */
export function interpolatedPercentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0]!;
  const clamped = Math.min(1, Math.max(0, p));
  const idx = (sorted.length - 1) * clamped;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const low = sorted[lo]!;
  const high = sorted[hi]!;
  if (lo === hi) return low;
  return low + (high - low) * (idx - lo);
}

function roundDays(n: number): number {
  return Math.max(1, Math.round(n));
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function monotonicDays(opt: number, typ: number, pes: number): {
  optimisticDays: number;
  typicalDays: number;
  pessimisticDays: number;
} {
  const optimisticDays = roundDays(opt);
  const typicalDays = Math.max(optimisticDays, roundDays(typ));
  const pessimisticDays = Math.max(typicalDays, roundDays(pes));
  return { optimisticDays, typicalDays, pessimisticDays };
}

/**
 * P25 / P50 / P75 of completed kickoff → actual go-live durations.
 * Prefers the same complexity tier when that subset meets minSample.
 */
export function historicalDurationBands(
  samples: readonly DurationSample[],
  opts?: {
    exclusions?: readonly string[];
    complexityTier?: string | null;
    minSample?: number;
  },
): HistoricalDurationBands {
  const exclusions = opts?.exclusions ?? DEFAULT_ANALYSIS_EXCLUSION_CODES;
  const minSample = opts?.minSample ?? HISTORICAL_BAND_MIN_SAMPLE;
  const tier = opts?.complexityTier ?? null;

  const excluded: DurationSample[] = [];
  const usable: DurationSample[] = [];
  for (const s of samples) {
    if (!Number.isFinite(s.durationDays) || s.durationDays <= 0) continue;
    if (isExcludedFromPrimaryAverages(s.code, exclusions)) excluded.push(s);
    else usable.push(s);
  }
  const excludedCodes = excluded.map((r) => r.code);

  const empty = (source: HistoricalDurationBands["source"], n: number): HistoricalDurationBands => ({
    source,
    n,
    excludedCount: excludedCodes.length,
    excludedCodes,
    complexityTier: tier,
    meanDays: null,
    optimisticDays: null,
    typicalDays: null,
    pessimisticDays: null,
  });

  const fromPool = (
    pool: typeof usable,
    source: "tier" | "all",
  ): HistoricalDurationBands | null => {
    if (pool.length < minSample) return null;
    const days = pool.map((r) => r.durationDays);
    const { optimisticDays, typicalDays, pessimisticDays } = monotonicDays(
      interpolatedPercentile(days, HISTORICAL_SCENARIO_PERCENTILES.OPTIMISTIC),
      interpolatedPercentile(days, HISTORICAL_SCENARIO_PERCENTILES.TYPICAL),
      interpolatedPercentile(days, HISTORICAL_SCENARIO_PERCENTILES.PESSIMISTIC),
    );
    return {
      source,
      n: pool.length,
      excludedCount: excludedCodes.length,
      excludedCodes,
      complexityTier: source === "tier" ? tier : null,
      meanDays: mean(days),
      optimisticDays,
      typicalDays,
      pessimisticDays,
    };
  };

  if (tier) {
    const sameTier = usable.filter((r) => r.complexityTier === tier);
    const tierBands = fromPool(sameTier, "tier");
    if (tierBands) return tierBands;
  }

  return fromPool(usable, "all") ?? empty("none", usable.length);
}

function scenarioHours(
  scope: ImplementationScope,
  kickoffDate: Date,
  goLiveDate: Date,
  customHoursPerWeek: number | null | undefined,
): { estimatedHours: number; weeklyHours: number } {
  const estimatedHours = estimateHours(scope).totalHours;
  const weeklyHours =
    customHoursPerWeek != null && customHoursPerWeek > 0
      ? round1(customHoursPerWeek)
      : weeklyHoursForEngagement({
          id: "_rec",
          code: "_rec",
          name: "_rec",
          acronym: "_rec",
          prismStatus: "active",
          leadId: null,
          coLeadId: null,
          ownerSplitPercent: 100,
          estimatedHours,
          customHoursPerWeek: customHoursPerWeek ?? null,
          startDate: kickoffDate,
          initialGoLiveDate: goLiveDate,
          targetGoLiveDate: goLiveDate,
        });
  return { estimatedHours, weeklyHours };
}

/**
 * Formula Forecast+ scenarios (same dates as Prism). Historical bands are
 * attached for captions only.
 */
export function recommendGoLive(opts: {
  scope: ImplementationScope;
  kickoffDate: Date;
  samples: readonly DurationSample[];
  exclusions?: readonly string[];
  customHoursPerWeek?: number | null;
  skipUsFederalHolidays?: boolean;
}): GoLiveRecommendation {
  const forecastOpts: ForecastOptions = { skipUsFederalHolidays: opts.skipUsFederalHolidays };
  const model = forecastImplementation(opts.scope, opts.kickoffDate, forecastOpts);
  const tier = complexityTier(opts.scope);
  const historical = historicalDurationBands(opts.samples, {
    exclusions: opts.exclusions,
    complexityTier: tier,
  });
  const useHistory = historical.source !== "none";
  const goLiveSource: GoLiveRecommendation["goLiveSource"] = useHistory
    ? historical.source === "tier"
      ? "historical-tier"
      : "historical-all"
    : "model";

  const scenarios: RecommendedScenario[] = model.scenarios.map((s) => {
    const { estimatedHours, weeklyHours } = scenarioHours(
      opts.scope,
      opts.kickoffDate,
      s.goLiveDate,
      opts.customHoursPerWeek,
    );
    return {
      ...s,
      label: SCENARIO_LABELS[s.scenario],
      modelCalendarDays: s.modelCalendarDays,
      estimatedHours,
      weeklyHours,
    };
  });

  return {
    scope: opts.scope,
    complexityTier: tier,
    hours: estimateHours(opts.scope),
    scenarios,
    goLiveSource,
    historical,
  };
}

export function chosenScenario(
  rec: GoLiveRecommendation,
  scenario: DiscoveryScenario | string | null | undefined,
): RecommendedScenario {
  const key = parseDiscoveryScenario(scenario);
  return rec.scenarios.find((s) => s.scenario === key) ?? rec.scenarios[1]!;
}

/** Submitted date wins; otherwise the selected scenario’s projected go-live. */
export function resolveCommittedGoLive(opts: {
  rec: GoLiveRecommendation;
  scenario: DiscoveryScenario | string | null | undefined;
  requestedGoLive: Date | null;
}): Date {
  if (opts.requestedGoLive) return opts.requestedGoLive;
  return chosenScenario(opts.rec, opts.scenario).goLiveDate;
}

export function kickoffOrToday(kickoff: Date | null | undefined, now = new Date()): Date {
  if (kickoff) return kickoff;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
}

export function historicalCaption(bands: HistoricalDurationBands): string {
  const formula =
    "Projected go-live is Forecast+ (discovery + 14d config + training; config days extend if hours would exceed 4h/day), not the playbook day count.";
  if (bands.source === "none") {
    const need = HISTORICAL_BAND_MIN_SAMPLE;
    const sample =
      bands.n === 0
        ? `Not enough completed history yet to quote past-site duration (need ${need}+ after exclusions).`
        : `Only ${bands.n} completed site${bands.n === 1 ? "" : "s"} after exclusions (need ${need}+) for a past-site quote.`;
    return `${formula} ${sample}`;
  }
  const pool =
    bands.source === "tier" && bands.complexityTier
      ? `${bands.n} past ${String(bands.complexityTier).toLowerCase()} site${bands.n === 1 ? "" : "s"}`
      : `${bands.n} past site${bands.n === 1 ? "" : "s"}`;
  const excl =
    bands.excludedCount > 0
      ? ` Excludes ${bands.excludedCodes.join(", ") || `${bands.excludedCount} outliers`}.`
      : "";
  const avg = bands.meanDays != null ? ` Average duration ${bands.meanDays}d.` : "";
  const bandsTxt =
    bands.optimisticDays != null && bands.typicalDays != null && bands.pessimisticDays != null
      ? ` Past kickoff → actual: P25 ${bands.optimisticDays}d / median ${bands.typicalDays}d / P75 ${bands.pessimisticDays}d (reference only).`
      : "";
  return `${formula} For reference, ${pool}.${avg}${bandsTxt}${excl}`;
}

export { DISCOVERY_SCENARIOS };
