"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export const SHOW_HANDED_OFF_KEY = "path.lists.show-handed-off";

const CHANGE_EVENT = "path-lists-show-handed-off";

/** `undefined` means read localStorage. */
let fallback: boolean | undefined;

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key != null && event.key !== SHOW_HANDED_OFF_KEY) return;
    fallback = undefined;
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readShow(): boolean {
  if (fallback !== undefined) return fallback;
  try {
    return window.localStorage.getItem(SHOW_HANDED_OFF_KEY) === "1";
  } catch {
    return false;
  }
}

function serverShow(): boolean {
  return false;
}

function writeShow(show: boolean) {
  try {
    if (show) window.localStorage.setItem(SHOW_HANDED_OFF_KEY, "1");
    else window.localStorage.removeItem(SHOW_HANDED_OFF_KEY);
    fallback = undefined;
  } catch {
    fallback = show;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useShowHandedOff(): boolean {
  return useSyncExternalStore(subscribe, readShow, serverShow);
}

export function ShowHandedOffToggle() {
  const show = useShowHandedOff();
  return (
    <button
      type="button"
      aria-pressed={show}
      onClick={() => writeShow(!show)}
      className={cn(
        "rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors",
        show ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      Show handed off
    </button>
  );
}

export function HandedOffCount({
  rows,
  noun,
  query,
}: {
  rows: readonly { handedOff: boolean }[];
  noun: "project" | "practice";
  query?: string;
}) {
  const show = useShowHandedOff();
  const n = rows.filter((row) => show || !row.handedOff).length;
  if (query) {
    return (
      <>
        {n} match{n === 1 ? "" : "es"} for “{query}”
      </>
    );
  }
  const label =
    noun === "project" ? (n === 1 ? "project" : "projects") : n === 1 ? "practice" : "practices";
  return (
    <>
      {n} {label}
    </>
  );
}

/** Drops a nested row (a handed-off project under a practice that is still active). */
export function HandedOffRow({
  handedOff,
  children,
}: {
  handedOff: boolean;
  children: ReactNode;
}) {
  const show = useShowHandedOff();
  if (handedOff && !show) return null;
  return children;
}

export function HandedOffEntries({
  entries,
  empty,
  layout = "stack",
  before,
}: {
  entries: readonly { id: string; handedOff: boolean; content: ReactNode }[];
  empty: ReactNode;
  /** Serializable layout. A function prop cannot cross the server/client boundary. */
  layout?: "stack" | "grid" | "divided";
  before?: ReactNode;
}) {
  const show = useShowHandedOff();
  const visible = entries.filter((entry) => show || !entry.handedOff);
  if (visible.length === 0) {
    if (!show && entries.length > 0 && entries.every((entry) => entry.handedOff)) {
      return (
        <p className="text-[13px] text-ink-3">
          Handed-off sites are hidden. Show handed off to see sites that moved to Support.
        </p>
      );
    }
    return empty;
  }
  const nodes = visible.map((entry) => <Fragment key={entry.id}>{entry.content}</Fragment>);
  if (layout === "grid") {
    return <div className="grid gap-4 md:grid-cols-2">{nodes}</div>;
  }
  if (layout === "divided") {
    return (
      <>
        {before}
        <div className="divide-y divide-border">{nodes}</div>
      </>
    );
  }
  return nodes;
}
