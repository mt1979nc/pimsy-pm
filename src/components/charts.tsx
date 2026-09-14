import { Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtShort } from "@/lib/dates";
import {
  buildHeadroomPlot,
  numericHours,
  weekDayKey,
  worseHeadroomTone,
  type HeadroomWeekTone,
} from "@/lib/headroom-chart";

function utilizationTone(pct: number, exempt: boolean) {
  if (exempt) return { bar: "bg-border-strong", label: "Exempt", badge: "amber" as const };
  if (pct > 110) return { bar: "bg-red", label: "Over capacity", badge: "red" as const };
  if (pct >= 85) return { bar: "bg-amber", label: "Near capacity", badge: "amber" as const };
  return { bar: "bg-green", label: "Has room", badge: "green" as const };
}

export type HeadroomWeek = {
  weekOf: Date | string;
  billableHours: number;
  headroom: number;
  utilization?: number;
};

function loadStroke(tone: HeadroomWeekTone) {
  if (tone === "over") return "var(--color-red)";
  if (tone === "near") return "var(--color-amber)";
  return "var(--color-brand)";
}

/** Weekly billable load vs department capacity — line + dashed cap, not bars. */
export function HeadroomChart({
  weeks,
  capacityHours,
  peakWeekOf,
  className,
}: {
  weeks: HeadroomWeek[];
  capacityHours: number;
  peakWeekOf?: Date | string | null;
  className?: string;
}) {
  if (weeks.length === 0) {
    return <p className="px-4 py-6 text-[13px] text-ink-3">No weekly hours on the calendar yet.</p>;
  }

  const plot = buildHeadroomPlot(weeks, capacityHours, peakWeekOf);
  const labelPad = `${(plot.padX / plot.viewWidth) * 100}%`;

  return (
    <div className={cn("px-4 pb-4 pt-3", className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-3">
        <span>Billable hours / week (exempt excluded)</span>
        <span className="tabular-nums">Cap {numericHours(capacityHours)}h</span>
      </div>
      <svg
        viewBox={`0 0 ${plot.viewWidth} ${plot.viewHeight}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Weekly load against ${numericHours(capacityHours)} hour department capacity`}
        preserveAspectRatio="xMidYMid meet"
        overflow="visible"
      >
        {plot.capY != null ? (
          <line
            x1={plot.padX}
            x2={plot.viewWidth - plot.padX}
            y1={plot.capY}
            y2={plot.capY}
            stroke="var(--color-ink-3)"
            strokeOpacity={0.55}
            strokeWidth={1.25}
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
            aria-hidden
          />
        ) : null}
        {plot.points.slice(1).map((p, i) => {
          const prev = plot.points[i]!;
          return (
            <line
              key={`${prev.key}-${p.key}`}
              x1={prev.x}
              y1={prev.y}
              x2={p.x}
              y2={p.y}
              stroke={loadStroke(worseHeadroomTone(prev.tone, p.tone))}
              strokeWidth={2}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {plot.points.map((p, i) => {
          const week = weeks[i]!;
          return (
            <g key={p.key}>
              {p.isPeak ? (
                <>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={9}
                    fill="none"
                    stroke="var(--color-amber)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={p.x}
                    y={Math.max(11, p.y - 14)}
                    textAnchor="middle"
                    fill="var(--color-ink-2)"
                    fontSize={10}
                  >
                    Peak
                  </text>
                </>
              ) : null}
              <circle
                cx={p.x}
                cy={p.y}
                r={p.isPeak ? 4.5 : 3.25}
                fill={loadStroke(p.tone)}
                stroke="var(--color-surface)"
                strokeWidth={1.25}
                vectorEffect="non-scaling-stroke"
              >
                <title>
                  {`${fmtShort(week.weekOf)}: ${p.hours}h load, ${p.headroom}h headroom`}
                </title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex gap-1" style={{ paddingLeft: labelPad, paddingRight: labelPad }}>
        {weeks.map((w) => (
          <div
            key={weekDayKey(w.weekOf)}
            className="min-w-0 flex-1 text-center text-[10px] leading-tight text-ink-3"
          >
            {fmtShort(w.weekOf)}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-3.5 bg-brand" aria-hidden /> Load
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber" aria-hidden /> Near / peak
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-red" aria-hidden /> Over cap
        </span>
        <span className="text-ink-3">Dashed line = department capacity</span>
      </div>
    </div>
  );
}

export type MemberLoad = {
  id: string;
  name: string | null;
  email?: string | null;
  image?: string | null;
  capacityHoursPerWeek: number;
  capacityExempt: boolean;
  isDirector?: boolean;
  thisWeekHours: number;
  peakHours?: number;
};

function hoursText(n: unknown) {
  const hours = numericHours(n);
  return hours === 0 ? "0" : hours % 1 === 0 ? String(hours) : hours.toFixed(1);
}

/** Prism Capacity-style per-person headroom cards. */
export function MemberLoadCards({ members }: { members: MemberLoad[] }) {
  if (members.length === 0) {
    return (
      <p className="px-4 py-6 text-[13px] text-ink-3">
        No rostered people to show. Add staff under Staffing → Team.
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((m) => {
        const cap = numericHours(m.capacityHoursPerWeek);
        const thisHrs = numericHours(m.thisWeekHours);
        const peakHrs = m.peakHours != null ? numericHours(m.peakHours) : null;
        const pct = cap > 0 ? Math.round((thisHrs / cap) * 100) : 0;
        const tone = utilizationTone(pct, m.capacityExempt);
        const headroom = m.capacityExempt ? null : Math.round((cap - thisHrs) * 10) / 10;
        const barPct = Math.min(Math.max(pct, 0), 100);
        return (
          <div key={m.id} className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Avatar name={m.name ?? m.email} image={m.image} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-medium text-ink">{m.name ?? m.email}</span>
                  {m.isDirector ? <Badge tone="violet">Director</Badge> : null}
                  {m.capacityExempt ? <Badge tone="amber">Exempt</Badge> : null}
                </div>
                <div className="text-[12px] text-ink-3">{hoursText(cap)}h/wk declared</div>
              </div>
              <Badge tone={tone.badge}>{m.capacityExempt ? "n/a" : `${pct}%`}</Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
              <div
                className={cn("h-full min-h-2 rounded-full", tone.bar)}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between gap-2 text-[12px] text-ink-2">
              <span>
                This wk{" "}
                <span className="tabular-nums font-medium text-ink">
                  {hoursText(thisHrs)}h
                  {cap > 0 ? ` / ${hoursText(cap)}h` : ""}
                </span>
              </span>
              {peakHrs != null ? (
                <span>
                  Peak <span className="tabular-nums font-medium text-ink">{hoursText(peakHrs)}h</span>
                </span>
              ) : headroom != null ? (
                <span>
                  Headroom <span className="tabular-nums font-medium text-ink">{headroom}h</span>
                </span>
              ) : (
                <span className="text-ink-3">{tone.label}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal rate bar (Analysis on-time / mix). */
export function RateBar({
  value,
  max = 100,
  label,
  hint,
  tone,
}: {
  value: number;
  max?: number;
  hint?: string;
  label: string;
  tone?: "green" | "amber" | "red" | "brand";
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const color =
    tone === "red"
      ? "bg-red"
      : tone === "amber"
        ? "bg-amber"
        : tone === "green"
          ? "bg-green"
          : "bg-brand";
  return (
    <div className="flex items-center gap-3">
      <div className="w-[140px] shrink-0 truncate text-[13px] font-medium text-ink">{label}</div>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="w-[88px] shrink-0 text-right text-[12.5px] tabular-nums text-ink-2">
        {hint ?? `${value}${max === 100 ? "%" : ""}`}
      </div>
    </div>
  );
}
