import Link from "next/link";
import { cn } from "@/lib/cn";

export type QueueChipTone = "maroon" | "slate" | "gold" | "sage";

const chipClass: Record<QueueChipTone, string> = {
  maroon: "border-ehr-maroon/25 bg-ehr-maroon-soft text-ehr-maroon",
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
