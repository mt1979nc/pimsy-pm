/**
 * Go-live dates from the capacity / slip flow.
 *
 * Weekends are not go-live days. A suggested date (slip of +N days) prefers
 * the following Monday. An explicit weekday the user picked is kept.
 * Pulling a date earlier snaps a weekend back to Friday so the slip stays
 * earlier. Client-safe.
 */

import { addDays, parseDateInput, utcCalendarDaysBetween, utcDayKey } from "@/lib/dates";

export type GoLiveDirection = "later" | "earlier" | "same";

export function utcWeekday(date: Date): number {
  return date.getUTCDay();
}

export function isWeekendGoLive(date: Date): boolean {
  const day = utcWeekday(date);
  return day === 0 || day === 6;
}

export function goLiveDirection(from: Date, proposed: Date): GoLiveDirection {
  const days = utcCalendarDaysBetween(from, proposed);
  if (days > 0) return "later";
  if (days < 0) return "earlier";
  return "same";
}

/** Next Monday on or after `date`. Monday stays put. */
export function nextMondayOnOrAfter(date: Date): Date {
  const delta = (8 - utcWeekday(date)) % 7;
  return delta === 0 ? date : addDays(date, delta);
}

/** Previous Friday on or before `date`. Friday stays put. */
export function previousFridayOnOrBefore(date: Date): Date {
  const day = utcWeekday(date);
  if (day === 5) return date;
  if (day === 6) return addDays(date, -1);
  if (day === 0) return addDays(date, -2);
  const delta = (day + 2) % 7;
  return delta === 0 ? date : addDays(date, -delta);
}

export type FinalGoLive = {
  date: Date;
  weekendSnapped: boolean;
  movedToMonday: boolean;
  snapNote: string | null;
};

/**
 * Constrain a proposed go-live.
 * `preferMonday` moves a later suggestion onto Monday.
 * Earlier slips only leave the weekend (back to Friday).
 */
export function finalizeGoLiveDate(
  proposed: Date,
  opts?: { preferMonday?: boolean; direction?: GoLiveDirection },
): FinalGoLive {
  const direction = opts?.direction ?? "later";
  const weekend = isWeekendGoLive(proposed);
  let date = proposed;
  let weekendSnapped = false;
  let movedToMonday = false;

  if (direction === "earlier") {
    if (weekend) {
      date = previousFridayOnOrBefore(proposed);
      weekendSnapped = true;
    }
  } else if (opts?.preferMonday) {
    const monday = nextMondayOnOrAfter(proposed);
    movedToMonday = utcDayKey(monday) !== utcDayKey(proposed);
    weekendSnapped = weekend;
    date = monday;
  } else if (weekend) {
    date = nextMondayOnOrAfter(proposed);
    weekendSnapped = true;
  }

  return {
    date,
    weekendSnapped,
    movedToMonday,
    snapNote: snapNote({ weekendSnapped, movedToMonday, direction }),
  };
}

function snapNote(input: {
  weekendSnapped: boolean;
  movedToMonday: boolean;
  direction: GoLiveDirection;
}): string | null {
  if (input.movedToMonday) return "Suggested Monday.";
  if (input.weekendSnapped && input.direction === "earlier") return "Weekend moved to Friday.";
  if (input.weekendSnapped) return "Weekend moved to Monday.";
  return null;
}

const SLIP_REQUIRES_DATE =
  "A slip must push the go-live: enter a new target date or slip days (+N). Cause/note alone is not a slip.";

export type SlipPreview =
  | {
      ok: true;
      from: Date;
      next: Date;
      days: number;
      snapNote: string | null;
      preferMonday: boolean;
    }
  | { ok: false; error: string };

/**
 * What the approval prompt should show, and what the server will store.
 * +N days prefers Monday. An explicit weekday is kept. Weekends snap.
 */
export function previewSlipGoLive(input: {
  currentGoLive: Date | null;
  slipDaysRaw?: string | null;
  requestedGoLive?: Date | null;
}): SlipPreview {
  if (!input.currentGoLive) {
    return { ok: false, error: "Set a current go-live before recording a slip." };
  }
  const from = input.currentGoLive;
  const raw = input.slipDaysRaw?.trim() ?? "";
  let proposed: Date;
  let preferMonday = false;

  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n === 0) {
      return { ok: false, error: "Slip days must be a non-zero whole number (e.g. +7 or -3)." };
    }
    proposed = addDays(from, n);
    preferMonday = n > 0;
  } else if (input.requestedGoLive && utcDayKey(input.requestedGoLive) !== utcDayKey(from)) {
    proposed = input.requestedGoLive;
  } else {
    return { ok: false, error: SLIP_REQUIRES_DATE };
  }

  const direction = goLiveDirection(from, proposed);
  const finalized = finalizeGoLiveDate(proposed, {
    preferMonday: preferMonday && direction === "later",
    direction,
  });
  const days = utcCalendarDaysBetween(from, finalized.date);
  if (days === 0) {
    return { ok: false, error: "That date does not move the go-live." };
  }
  return {
    ok: true,
    from,
    next: finalized.date,
    days,
    snapNote: finalized.snapNote,
    preferMonday: preferMonday && direction === "later",
  };
}

export function previewSlipGoLiveFromInputs(input: {
  currentGoLive: string;
  slipDaysRaw?: string | null;
  requestedGoLive?: string | null;
}): SlipPreview {
  return previewSlipGoLive({
    currentGoLive: input.currentGoLive ? parseDateInput(input.currentGoLive) : null,
    slipDaysRaw: input.slipDaysRaw,
    requestedGoLive: input.requestedGoLive ? parseDateInput(input.requestedGoLive) : null,
  });
}
