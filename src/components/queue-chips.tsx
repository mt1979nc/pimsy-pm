import Link from "next/link";
import { cn } from "@/lib/cn";

export type QueueChipTone = "maroon" | "slate" | "gold" | "sage";

const chipClass: Record<QueueChipTone, string> = {
  // #90545e on #e9dbd6 is short of AA for small text. Fill and dot keep those
  // hexes; the label is a darker maroon so the word stays readable.
  maroon: "border-ehr-maroon/40 bg-ehr-maroon-soft text-[#7a4550]",
  slate: "border-ehr-slate/30 bg-surface text-ehr-slate",
  gold: "border-transparent bg-ehr-gold text-[#14181d]",
  sage: "border-transparent bg-ehr-sage-soft text-[#14181d]",
};

const dotClass: Record<QueueChipTone, string> = {
  maroon: "bg-ehr-maroon",
  slate: "bg-ehr-slate",
  gold: "bg-[#96610a]",
  sage: "bg-ehr-sage",
};

export function QueueChips({
  chips,
}: {
  chips: { label: string; count: number; href: string; tone: QueueChipTone; title?: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={chip.href}
          title={chip.title}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium",
            chipClass[chip.tone],
          )}
        >
          <span className={cn("size-2 shrink-0 rounded-full", dotClass[chip.tone])} aria-hidden />
          <span>{chip.label}</span>
          <span className="tabular-nums font-semibold">{chip.count}</span>
        </Link>
      ))}
    </div>
  );
}

const AREA_CHIP: Record<
  "discovery" | "configuration" | "training",
  { label: string; tone: QueueChipTone }
> = {
  discovery: { label: "Discovery", tone: "slate" },
  configuration: { label: "Config", tone: "gold" },
  training: { label: "Training", tone: "sage" },
};

/** Short phase/area chip. Color plus the word. Zero counts stay quiet. */
export function AreaChip({
  area,
  count,
}: {
  area: "discovery" | "configuration" | "training";
  count?: number;
}) {
  const meta = AREA_CHIP[area];
  const quiet = count === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium",
        quiet ? "border-border bg-surface text-ink-3" : chipClass[meta.tone],
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", quiet ? "bg-border-strong" : dotClass[meta.tone])}
        aria-hidden
      />
      <span>{meta.label}</span>
      {count != null ? <span className="tabular-nums font-semibold">{count}</span> : null}
    </span>
  );
}
