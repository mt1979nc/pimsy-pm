import { Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtShort } from "@/lib/dates";

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

/** Weekly billable load vs department capacity — Prism Capacity-style headroom graphic. */
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

  const peakKey = peakWeekOf ? new Date(peakWeekOf).toISOString().slice(0, 10) : null;
  const maxLoad = Math.max(capacityHours, ...weeks.map((w) => w.billableHours), 1);
  const chartMax = maxLoad * 1.15;
  const capPct = capacityHours > 0 ? (capacityHours / chartMax) * 100 : 0;

  return (
    <div className={cn("px-4 pb-4 pt-3", className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-3">
        <span>Billable hours / week (exempt excluded)</span>
        <span className="tabular-nums">Cap {capacityHours}h</span>
      </div>
      <div
        className="relative flex h-[160px] items-end gap-1"
        role="img"
        aria-label={`Weekly load against ${capacityHours} hour department capacity`}
      >
        {capacityHours > 0 ? (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-3/50"
            style={{ bottom: `${capPct}%` }}
            aria-hidden
          />
        ) : null}
        {weeks.map((w) => {
          const key = new Date(w.weekOf).toISOString().slice(0, 10);
          const isPeak = peakKey === key;
          const height = Math.max(2, (w.billableHours / chartMax) * 100);
          const over = w.headroom < 0;
          const near = !over && w.headroom < 10;
          return (
            <div key={key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <div
                className={cn(
                  "w-full max-w-[28px] rounded-t-sm",
                  over ? "bg-red" : near ? "bg-amber" : "bg-brand",
                  isPeak && "ring-2 ring-amber ring-offset-1 ring-offset-surface",
                )}
                style={{ height: `${height}%` }}
                title={`${fmtShort(w.weekOf)}: ${w.billableHours}h load, ${w.headroom}h headroom`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1">
        {weeks.map((w) => (
          <div
            key={new Date(w.weekOf).toISOString()}
            className="min-w-0 flex-1 text-center text-[10px] leading-tight text-ink-3"
          >
            {fmtShort(w.weekOf).replace(/ .*/, "")}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-brand" aria-hidden /> Load
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-amber" aria-hidden /> Near / peak
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-red" aria-hidden /> Over cap
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

/** Prism Capacity-style per-person headroom cards. */
export function MemberLoadCards({ members }: { members: MemberLoad[] }) {
  if (members.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((m) => {
        const cap = m.capacityHoursPerWeek;
        const pct = cap > 0 ? Math.round((m.thisWeekHours / cap) * 100) : 0;
        const tone = utilizationTone(pct, m.capacityExempt);
        const headroom = m.capacityExempt ? null : Math.round((cap - m.thisWeekHours) * 10) / 10;
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
                <div className="text-[12px] text-ink-3">{cap}h/wk declared</div>
              </div>
              <Badge tone={tone.badge}>{m.capacityExempt ? "n/a" : `${pct}%`}</Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
              <div
                className={cn("h-full rounded-full", tone.bar)}
                style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[12px] text-ink-2">
              <span>
                This wk <span className="tabular-nums font-medium text-ink">{m.thisWeekHours}h</span>
              </span>
              {m.peakHours != null ? (
                <span>
                  Peak <span className="tabular-nums">{m.peakHours}h</span>
                </span>
              ) : headroom != null ? (
                <span>
                  Headroom <span className="tabular-nums">{headroom}h</span>
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
  label: string;
  hint?: string;
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
