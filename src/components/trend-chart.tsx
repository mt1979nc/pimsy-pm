/** One sparkline. Null days are skipped so a gap does not draw a zero. */

export function TrendChart({
  label,
  points,
}: {
  label: string;
  points: { date: string; value: number | null }[];
}) {
  const nums = points.map((point) => point.value).filter((value): value is number => value != null);
  const latest = [...points].reverse().find((point) => point.value != null);
  const min = nums.length ? Math.min(...nums) : 0;
  const max = nums.length ? Math.max(...nums) : 1;
  const span = max - min || 1;
  const width = 280;
  const height = 56;
  const plotted = points.flatMap((point, index) => {
    if (point.value == null) return [];
    const x = points.length <= 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - ((point.value - min) / span) * (height - 8) - 4;
    return [`${x.toFixed(1)},${y.toFixed(1)}`];
  });

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-2">{label}</span>
        <span className="text-[16px] font-semibold tabular-nums text-ink">{latest?.value ?? "—"}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-14 w-full text-brand" role="img" aria-label={label}>
        {plotted.length > 1 ? (
          <polyline fill="none" stroke="currentColor" strokeWidth="2" points={plotted.join(" ")} />
        ) : null}
      </svg>
    </div>
  );
}
