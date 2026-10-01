"use client";

import { useEffect, useRef, useState } from "react";

import { MemberLoadCard, type MemberLoad } from "@/components/charts";
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
 * Team headroom cards with a browser-local order.
 * Drag the grip, or use Up / Down. Card hours are unchanged.
 * Drag chrome is toggled on the node so a re-render does not cancel the drag.
 */
export function ReorderableMemberLoadCards({ members }: { members: MemberLoad[] }) {
  const [preferred, setPreferred] = useState<string[] | null>(null);
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

  function commit(nextIds: string[]) {
    setPreferred(nextIds);
    writeStoredOrder(nextIds);
  }

  function move(id: string, delta: -1 | 1) {
    commit(moveIdBy(ordered.map((member) => member.id), id, delta));
  }

  return (
    <div ref={gridRef} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((member, index) => {
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
              commit(reorderIds(ordered.map((item) => item.id), fromId, member.id));
            }}
          >
            <MemberLoadCard
              member={member}
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
                    disabled={index === ordered.length - 1}
                    onClick={() => move(member.id, 1)}
                    className="text-[10px] font-medium leading-none text-ink-3 hover:text-ink disabled:opacity-30"
                  >
                    Down
                  </button>
                </div>
              }
            />
          </div>
        );
      })}
    </div>
  );
}
