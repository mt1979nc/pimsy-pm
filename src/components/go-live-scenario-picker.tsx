"use client";

import type { DiscoveryScenario } from "@/db/schema";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import type { GoLiveRecommendation, RecommendedScenario } from "@/lib/go-live-recommendation";
import { historicalCaption } from "@/lib/go-live-recommendation";
import { cn } from "@/lib/cn";

export function GoLiveScenarioPicker({
  recommendation,
  scenario,
  onChange,
  name = "discoveryScenario",
  disabled = false,
}: {
  recommendation: GoLiveRecommendation;
  scenario: DiscoveryScenario;
  onChange: (scenario: DiscoveryScenario) => void;
  name?: string;
  disabled?: boolean;
}) {
  const usingHistory = recommendation.goLiveSource !== "model";

  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">
        Projected go-live
      </div>
      <p className="mt-1 text-[12.5px] text-ink-3">{historicalCaption(recommendation.historical)}</p>
      <input type="hidden" name={name} value={scenario} />
      <div className="mt-3 space-y-2">
        {recommendation.scenarios.map((s) => (
          <ScenarioRow
            key={s.scenario}
            row={s}
            selected={scenario === s.scenario}
            usingHistory={usingHistory}
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
  usingHistory,
  disabled,
  onSelect,
}: {
  row: RecommendedScenario;
  selected: boolean;
  usingHistory: boolean;
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
          {usingHistory && row.modelCalendarDays !== row.calendarDays ? (
            <span className="mt-0.5 block text-[11.5px] text-ink-3">
              Forecast+ model {row.modelCalendarDays}d
            </span>
          ) : null}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[13px] font-semibold text-ink">{fmtDate(row.goLiveDate)}</span>
        <span className="block text-[11.5px] tabular-nums text-ink-3">
          {row.calendarDays}d · {row.estimatedHours.toFixed(1)}h
          {row.weeklyHours > 0 ? ` · ${row.weeklyHours.toFixed(1)}h/wk` : ""}
        </span>
      </span>
    </label>
  );
}

export function GoLiveSourceBadge({ recommendation }: { recommendation: GoLiveRecommendation }) {
  if (recommendation.goLiveSource === "model") {
    return <Badge>Forecast+ model</Badge>;
  }
  if (recommendation.goLiveSource === "historical-tier") {
    return <Badge tone="green">Past sites · same tier</Badge>;
  }
  return <Badge tone="green">Past sites</Badge>;
}
