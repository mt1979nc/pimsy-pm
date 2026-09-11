"use client";

import { useTransition } from "react";
import { deleteSlipEvent } from "@/actions/projects";
import { Badge, Button } from "@/components/ui";
import { fmtDate } from "@/lib/dates";

export type SlipHistoryItem = {
  id: string;
  fromDate: Date | string;
  toDate: Date | string;
  days: number;
  cause: "CUSTOMER" | "PIMSY" | null;
  note: string | null;
  createdAt: Date | string;
};

export function SlipHistoryList({
  slips,
  allowDelete = true,
}: {
  slips: SlipHistoryItem[];
  /** Newest-first. Only the first (most recent) row gets a Delete control. */
  allowDelete?: boolean;
}) {
  if (slips.length === 0) return null;

  const newestId = slips[0]?.id;

  return (
    <div className="space-y-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">
        Slip history
      </h3>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {slips.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px]"
          >
            <span className="tabular-nums text-ink">
              {fmtDate(s.fromDate)} → {fmtDate(s.toDate)}
            </span>
            <Badge tone={s.days > 0 ? "amber" : "green"}>
              {s.days > 0 ? "+" : ""}
              {s.days}d
            </Badge>
            {s.cause ? <Badge>{s.cause}</Badge> : <Badge tone="neutral">untagged</Badge>}
            {s.note ? <span className="min-w-0 flex-1 text-ink-3">{s.note}</span> : null}
            {allowDelete && s.id === newestId ? <DeleteSlipButton slipId={s.id} /> : null}
          </li>
        ))}
      </ul>
      {allowDelete ? (
        <p className="text-[11.5px] text-ink-3">
          Deleting the latest slip restores go-live to the prior date and rescales open work.
        </p>
      ) : null}
    </div>
  );
}

function DeleteSlipButton({ slipId }: { slipId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="danger"
      type="button"
      disabled={pending}
      className="ml-auto"
      onClick={() => {
        if (!confirm("Delete this slip and restore the previous go-live date?")) return;
        start(async () => {
          const res = await deleteSlipEvent(slipId);
          if (res.error) alert(res.error);
        });
      }}
    >
      {pending ? "Undoing…" : "Delete"}
    </Button>
  );
}
