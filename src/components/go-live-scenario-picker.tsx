"use client";

import type { DiscoveryScenario } from "@/db/schema";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import type { GoLiveRecommendation, RecommendedScenario } from "@/lib/go-live-recommendation";
import { historicalCaption } from "@/lib/go-live-recommendation";
import { UsFederalHolidayToggle } from "@/components/us-federal-holiday-toggle";
import { cn } from "@/lib/cn";

export function GoLiveScenarioPicker({
  recommendation,
  scenario,
  onChange,
  name = "discoveryScenario",
  disabled = false,
  skipUsFederalHolidays,
  onSkipUsFederalHolidaysChange,
}: {
  recommendation: GoLiveRecommendation;
  scenario: DiscoveryScenario;
  onChange: (scenario: DiscoveryScenario) => void;
  name?: string;
  disabled?: boolean;
  skipUsFederalHolidays?: boolean;
  onSkipUsFederalHolidaysChange?: (value: boolean) => void;
}) {
  const chosen =
    recommendation.scenarios.find((s) => s.scenario === scenario) ?? recommendation.scenarios[1];
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">
        Projected go-live
      </div>
      <p className="mt-1 text-[12.5px] text-ink-3">{historicalCaption(recommendation.historical)}</p>
      {skipUsFederalHolidays != null && onSkipUsFederalHolidaysChange ? (
        <div className="mt-3 rounded-lg border border-border bg-surface-2/50 px-3 py-2.5">
          <UsFederalHolidayToggle
            checked={skipUsFederalHolidays}
            onChange={onSkipUsFederalHolidaysChange}
            holidayDays={chosen?.holidayDays ?? 0}
          />
        </div>
      ) : null}
      <input type="hidden" name={name} value={scenario} />
      <div className="mt-3 space-y-2">
        {recommendation.scenarios.map((s) => (
          <ScenarioRow
            key={s.scenario}
            row={s}
            selected={scenario === s.scenario}
            disabled={disabled}
            onSelect={() => onChange(s.scenario)}
          />
        ))}
      </div>
    </div>
  );
}

function ScenarioRow({
  row,
  selected,
  disabled,
  onSelect,
}: {
  row: RecommendedScenario;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 transition-colors",
        selected ? "border-brand bg-brand-soft" : "border-border hover:bg-surface-2",
        disabled && "cursor-default opacity-80",
      )}
    >
      <span className="flex items-start gap-2.5">
        <input
          type="radio"
          name="_scenario"
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
          className="mt-0.5"
        />
        <span>
          <span className="block text-[13px] font-medium capitalize text-ink">
            {row.scenario.toLowerCase()}
          </span>
          <span className="block text-[12px] text-ink-3">{row.label}</span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[13px] font-semibold text-ink">{fmtDate(row.goLiveDate)}</span>
        <span className="block text-[11.5px] tabular-nums text-ink-3">
          {row.calendarDays}d · {row.estimatedHours.toFixed(1)}h
          {row.weeklyHours > 0 ? ` · ${row.weeklyHours.toFixed(1)}h/wk` : ""}
          {row.holidayDays > 0 ? ` · +${row.holidayDays} holiday${row.holidayDays === 1 ? "" : "s"}` : ""}
        </span>
      </span>
    </label>
  );
}

export function GoLiveSourceBadge({ recommendation }: { recommendation: GoLiveRecommendation }) {
  const title =
    recommendation.goLiveSource === "model"
      ? "Forecast+ discovery formula"
      : "Forecast+ discovery formula; past-site duration is shown as a caption only";
  return (
    <span title={title}>
      <Badge>Forecast+ model</Badge>
    </span>
  );
}
