"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { setCapacityMemberHidden } from "@/actions/capacity-board";
import { CapacityMemberBody, CapacityUnassignedSites } from "@/components/capacity-site-rows";
import { MemberLoadCard, type MemberLoad } from "@/components/charts";
import type { CapacitySiteRow } from "@/lib/capacity-phase";
import { cn } from "@/lib/cn";
import {
  CAPACITY_MEMBER_CARD_ORDER_KEY,
  moveIdBy,
  orderMembersByPreference,
  parseMemberCardOrder,
  reorderIds,
} from "@/lib/member-card-order";

function readStoredOrder(): string[] {
  try {
    return parseMemberCardOrder(window.localStorage.getItem(CAPACITY_MEMBER_CARD_ORDER_KEY));
  } catch {
    return [];
  }
}

function writeStoredOrder(ids: string[]) {
  try {
    window.localStorage.setItem(CAPACITY_MEMBER_CARD_ORDER_KEY, JSON.stringify(ids));
  } catch {
    // Private mode or a full store — the in-memory order still applies this visit.
  }
}

function personLabel(member: MemberLoad): string {
  return member.name?.trim() || member.email?.trim() || "team member";
}

function CapacityHideButton({ member }: { member: MemberLoad }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = personLabel(member);
  const hidden = member.capacityHidden === true;
  const text = hidden ? "Unhide" : "Hide";

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`${text} ${label}`}
      title={error ?? undefined}
      onClick={() => {
        setError(null);
        start(async () => {
          const res = await setCapacityMemberHidden(member.id, !hidden);
          if (res.error) setError(res.error);
        });
      }}
      className="text-[11px] font-medium leading-none text-ink-3 hover:text-ink disabled:opacity-30"
    >
      {pending ? "Saving…" : text}
    </button>
  );
}

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

function clearDragChrome(root: HTMLElement | null) {
  root?.querySelectorAll<HTMLElement>("[data-member-card]").forEach((el) => {
    el.classList.remove("opacity-60", "ring-2", "ring-brand");
  });
}

/**
 * Team capacity cards with a browser-local order.
 * Drag the grip, or use Up / Down. Forecast hours on the card stay as calculated.
 * Drag chrome is toggled on the node so a re-render does not cancel the drag.
 */
function cardBorder(member: MemberLoad): string {
  if (member.capacityExempt) return "border-border";
  const cap = member.capacityHoursPerWeek || 0;
  const weekly = member.thisWeekHours || 0;
  if (cap > 0 && weekly > cap) return "border-red";
  if (cap > 0 && weekly > cap * 0.85) return "border-amber";
  return "border-green";
}

function showSiteBody(member: MemberLoad, sites: CapacitySiteRow[]): boolean {
  if (sites.length > 0) return true;
  return member.canLead !== false && !member.capacityExempt;
}

export function ReorderableMemberLoadCards({
  members,
  sitesByMember,
  unassignedSites = [],
}: {
  members: MemberLoad[];
  /** Site rows under the specialist who owns them. Omitted on pages that only show headroom. */
  sitesByMember?: Record<string, CapacitySiteRow[]>;
  unassignedSites?: CapacitySiteRow[];
}) {
  const [preferred, setPreferred] = useState<string[] | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const dragIdRef = useRef<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPreferred(readStoredOrder());
  }, []);

  if (members.length === 0) {
    return (
      <p className="px-4 py-6 text-[13px] text-ink-3">No people to show. Add staff under Team.</p>
    );
  }

  const ordered = preferred == null ? [...members] : orderMembersByPreference(members, preferred);
  const hiddenCount = ordered.filter((member) => member.capacityHidden).length;
  const shown = showHidden ? ordered : ordered.filter((member) => !member.capacityHidden);

  function commit(nextIds: string[]) {
    setPreferred(nextIds);
    writeStoredOrder(nextIds);
  }

  function persistShown(nextShownIds: string[]) {
    if (showHidden) {
      commit(nextShownIds);
      return;
    }
    const hiddenIds = ordered.filter((member) => member.capacityHidden).map((member) => member.id);
    commit([...nextShownIds, ...hiddenIds]);
  }

  function move(id: string, delta: -1 | 1) {
    persistShown(moveIdBy(shown.map((member) => member.id), id, delta));
  }

  return (
    <>
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-[13.5px] font-semibold text-ink">Team capacity</h2>
      <div className="flex flex-wrap items-center gap-3">
        {hiddenCount > 0 ? (
          <button
            type="button"
            aria-pressed={showHidden}
            onClick={() => setShowHidden((current) => !current)}
            className={cn(
              "text-[12px] font-medium",
              showHidden ? "text-brand" : "text-ink-2 hover:text-ink",
            )}
          >
            Show hidden ({hiddenCount})
          </button>
        ) : null}
        <p className="text-[12px] text-ink-3">Drag to reorder. Saved in this browser.</p>
      </div>
    </div>
    <div ref={gridRef} className="card-grid">
      {shown.map((member, index) => {
        const label = personLabel(member);
        return (
          <div
            key={member.id}
            data-member-card
            data-member-id={member.id}
            className="min-w-0 rounded-xl"
            onDragOver={(event) => {
              if (!dragIdRef.current || dragIdRef.current === member.id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              clearDragChrome(gridRef.current);
              const source = gridRef.current?.querySelector<HTMLElement>(
                `[data-member-card][data-member-id="${CSS.escape(dragIdRef.current)}"]`,
              );
              source?.classList.add("opacity-60");
              event.currentTarget.classList.add("ring-2", "ring-brand");
            }}
            onDrop={(event) => {
              event.preventDefault();
              const fromId = dragIdRef.current;
              dragIdRef.current = null;
              clearDragChrome(gridRef.current);
              if (!fromId || fromId === member.id) return;
              persistShown(reorderIds(shown.map((item) => item.id), fromId, member.id));
            }}
          >
            <div className={cn("overflow-hidden rounded-xl border-2 bg-surface", cardBorder(member))}>
            <MemberLoadCard
              className="rounded-none border-0 shadow-none"
              member={member}
              action={<CapacityHideButton member={member} />}
              leading={
                <div className="flex shrink-0 flex-col items-center gap-0.5">
                  <button
                    type="button"
                    draggable
                    aria-label={`Drag to reorder ${label}`}
                    onDragStart={(event) => {
                      dragIdRef.current = member.id;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", member.id);
                      event.currentTarget.closest<HTMLElement>("[data-member-card]")?.classList.add("opacity-60");
                    }}
                    onDragEnd={() => {
                      dragIdRef.current = null;
                      clearDragChrome(gridRef.current);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        move(member.id, -1);
                      } else if (event.key === "ArrowDown") {
                        event.preventDefault();
                        move(member.id, 1);
                      }
                    }}
                    className="cursor-grab touch-none px-0.5 text-ink-3 hover:text-ink"
                  >
                    <GripIcon />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${label} up`}
                    disabled={index === 0}
                    onClick={() => move(member.id, -1)}
                    className="text-[10px] font-medium leading-none text-ink-3 hover:text-ink disabled:opacity-30"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${label} down`}
                    disabled={index === shown.length - 1}
                    onClick={() => move(member.id, 1)}
                    className="text-[10px] font-medium leading-none text-ink-3 hover:text-ink disabled:opacity-30"
                  >
                    Down
                  </button>
                </div>
              }
            />
            {sitesByMember ? (
              <CapacityMemberBody
                memberId={member.id}
                hoursPerWeek={member.capacityHoursPerWeek}
                sites={sitesByMember[member.id] ?? []}
                showSites={showSiteBody(member, sitesByMember[member.id] ?? [])}
              />
            ) : null}
            </div>
          </div>
        );
      })}
    </div>
    <CapacityUnassignedSites sites={unassignedSites} />
    </>
  );
}
