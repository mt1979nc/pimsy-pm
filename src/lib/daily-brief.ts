/**
 * Normalize one morning snapshot into a daily fact.
 *
 * Dock WIP changed shape on 2026-10-05. Before that, sites have targetEnd
 * and owners. After that, they also have overdue counts, task progress,
 * a targetPassed flag, and team. Shape is read from the file's fields,
 * not from the date. Both shapes land in the same columns.
 * A file with `"gap": true` is a gap row (counts stay empty). A Dock WIP
 * file with no thread file is a gap too. Weekends are absent on purpose.
 * A weekday with no file is a gap. Overdue is stored only when present.
 */

export type WipShape = "pre-oct-5" | "post-oct-5" | "unknown";

export type DailyOwnerFact = {
  owner: string;
  team: string;
  wipSites: number;
};

export type DailyFactDraft = {
  factDate: string;
  gap: boolean;
  wipShape: WipShape;
  wipSites: number | null;
  overdueTasks: number | null;
  taskDone: number | null;
  taskTotal: number | null;
  targetPassed: number | null;
  openThreads: number | null;
  waitingOnPimsy: number | null;
  waitingOnCustomer: number | null;
  prismLoadHours: number | null;
  prismCapacityHours: number | null;
  slipDays: number | null;
  zendeskOpen: number | null;
  note: string;
  owners: DailyOwnerFact[];
};

export type DailyBriefInput = {
  date?: string | null;
  dockWip?: unknown;
  dockThreads?: unknown;
  prism?: unknown;
  zendesk?: unknown;
  /** delivery-status.json. Metrics fill thread columns the threads file left empty. */
  deliveryStatus?: unknown;
  /** prism-live markdown. Fills Prism columns the JSON left empty. Status counts go in the note. */
  prismMarkdown?: string | null;
  /** A Dock WIP file was present and dock-threads.json was not. That day is a gap. */
  threadsMissing?: boolean;
};

type Loose = Record<string, unknown>;

function asObj(value: unknown): Loose | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function dayKey(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match?.[1] ?? null;
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function isWeekday(day: string): boolean {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6;
}

/** Weekdays in the inclusive range that have no fact. Weekends are not gaps. */
export function missingWeekdays(present: readonly string[], from: string, to: string): string[] {
  const have = new Set(present);
  const missing: string[] = [];
  if (from > to) return missing;
  let cursor = from;
  while (cursor <= to) {
    if (isWeekday(cursor) && !have.has(cursor)) missing.push(cursor);
    cursor = nextDay(cursor);
  }
  return missing;
}

export function gapFact(factDate: string, note = "Missing weekday snapshot."): DailyFactDraft {
  return {
    factDate,
    gap: true,
    wipShape: "unknown",
    wipSites: null,
    overdueTasks: null,
    taskDone: null,
    taskTotal: null,
    targetPassed: null,
    openThreads: null,
    waitingOnPimsy: null,
    waitingOnCustomer: null,
    prismLoadHours: null,
    prismCapacityHours: null,
    slipDays: null,
    zendeskOpen: null,
    note,
    owners: [],
  };
}

function workspacesOf(wip: Loose | null): Loose[] {
  if (!wip || !Array.isArray(wip.workspaces)) return [];
  return wip.workspaces.map(asObj).filter((row): row is Loose => row != null);
}

/** A capture that says the day failed (`{"gap":true,"reason":"box_no_egress"}`). */
export function isExplicitGap(value: unknown): boolean {
  return asObj(value)?.gap === true;
}

function gapReason(value: unknown): string | null {
  return asText(asObj(value)?.reason);
}

function explicitGapNote(label: string, value: unknown): string | null {
  if (!isExplicitGap(value)) return null;
  const reason = gapReason(value);
  return reason ? `Gap: ${reason}.` : `${label} gap.`;
}

export function detectWipShape(wip: unknown): WipShape {
  const file = asObj(wip);
  if (!file) return "unknown";
  const rows = workspacesOf(file);
  const postField = (row: Loose) =>
    row.taskProgress != null ||
    row.overdueTaskCount != null ||
    row.team != null ||
    row.targetPassed != null;
  if (file.overdueTaskTotal != null || rows.some(postField)) return "post-oct-5";
  if (rows.length > 0 || file.totalIncluded != null) return "pre-oct-5";
  return "unknown";
}

function progressOf(row: Loose): { done: number; total: number } | null {
  const progress = asObj(row.taskProgress);
  if (!progress) return null;
  const done = asNumber(progress.done ?? progress.completed);
  const total = asNumber(progress.total);
  if (done == null && total == null) return null;
  return { done: done ?? 0, total: total ?? 0 };
}

function ownerNames(row: Loose): string[] {
  const raw = row.owners ?? row.owner;
  if (Array.isArray(raw)) {
    return raw.map(asText).filter((name): name is string => name != null);
  }
  const one = asText(raw);
  return one ? [one] : [];
}

function teamName(row: Loose): string {
  const team = row.team;
  if (typeof team === "string") return team.trim();
  if (Array.isArray(team)) return team.map(asText).filter(Boolean).join(", ");
  return "";
}

function passedTarget(row: Loose, factDate: string, shape: WipShape): boolean {
  if (typeof row.targetPassed === "boolean") return row.targetPassed;
  if (shape === "post-oct-5") return false;
  const target = dayKey(row.targetEnd);
  return Boolean(target && target < factDate);
}

/**
 * delivery-status.json. `metrics` holds thread totals and day-over-day
 * counts. `vsWed` is the change versus Wednesday. Day-over-day text stays
 * in the note. There is no column for it.
 */
export function parseDeliveryStatus(value: unknown): {
  openThreads: number | null;
  waitingOnPimsy: number | null;
  waitingOnCustomer: number | null;
  note: string;
} {
  const root = asObj(value);
  const metrics = asObj(root?.metrics) ?? root;
  const vsWed = asObj(root?.vsWed ?? root?.vs_wed);
  const parts: string[] = [];
  const newer = asNumber(metrics?.newThreads ?? metrics?.new_threads);
  const gone = asNumber(metrics?.goneThreads ?? metrics?.gone_threads);
  const moves = asNumber(metrics?.targetMoves ?? metrics?.target_moves);
  if (newer != null) parts.push(`New threads ${newer}.`);
  if (gone != null) parts.push(`Gone threads ${gone}.`);
  if (moves != null) parts.push(`Target moves ${moves}.`);
  const vsThreads = asNumber(vsWed?.threads ?? vsWed?.openThreads);
  if (vsThreads != null) parts.push(`Vs Wed threads ${vsThreads > 0 ? "+" : ""}${vsThreads}.`);
  return {
    openThreads: asNumber(metrics?.threads ?? metrics?.openThreads ?? metrics?.open_threads),
    waitingOnPimsy: asNumber(metrics?.waiting_on_pimsy ?? metrics?.waitingOnPimsy),
    waitingOnCustomer: asNumber(metrics?.waiting_on_customer ?? metrics?.waitingOnCustomer),
    note: parts.join(" "),
  };
}

/**
 * prism-live markdown. Team hours vs cap become load and capacity.
 * Active, stalled, and special counts have no columns, so they stay in
 * the note. The slip summary becomes slip days.
 */
export function parsePrismLiveMarkdown(markdown: string): {
  loadHours: number | null;
  capacityHours: number | null;
  slipDays: number | null;
  note: string;
} {
  const text = markdown.replace(/\r\n/g, "\n");
  let loadHours: number | null = null;
  let capacityHours: number | null = null;
  const ofCap = /(\d+(?:\.\d+)?)\s*h\s+of\s+(\d+(?:\.\d+)?)\s*h/i.exec(text);
  const versus =
    ofCap ??
    /team hours?\s*:?\s*(\d+(?:\.\d+)?)\s*h?\s*(?:vs\.?|\/)\s*(?:cap(?:acity)?\s*)?(\d+(?:\.\d+)?)\s*h?/i.exec(text);
  if (versus) {
    loadHours = Number(versus[1]);
    capacityHours = Number(versus[2]);
  }
  const status: string[] = [];
  const active = /(?:^|[^\w])active\s+(\d+)/im.exec(text);
  const stalled = /(?:^|[^\w])stalled\s+(\d+)/im.exec(text);
  const special = /(?:^|[^\w])special\s+(\d+)/im.exec(text);
  if (active) status.push(`Active ${active[1]}`);
  if (stalled) status.push(`Stalled ${stalled[1]}`);
  if (special) status.push(`Special ${special[1]}`);
  const slip = /slip days?\s*:?\s*(\d+)/i.exec(text) ?? /slip summary[^\d]{0,40}(\d+)/i.exec(text);
  return {
    loadHours,
    capacityHours,
    slipDays: slip ? Number(slip[1]) : null,
    note: status.length ? `${status.join(". ")}.` : "",
  };
}

export function normalizeDailyBrief(input: DailyBriefInput): { ok: true; fact: DailyFactDraft } | { ok: false; error: string } {
  const wip = asObj(input.dockWip);
  const threads = asObj(input.dockThreads);
  const prism = asObj(input.prism);
  const zendesk = asObj(input.zendesk);
  const wipGap = isExplicitGap(wip);
  const threadsGap = isExplicitGap(threads);
  const factDate =
    dayKey(input.date) ||
    dayKey(wip?.retrievedAt) ||
    dayKey(threads?.retrievedAt) ||
    dayKey(prism?.retrievedAt);
  if (!factDate) return { ok: false, error: "A snapshot needs a date (YYYY-MM-DD) or retrievedAt." };

  const shape = detectWipShape(wip);
  const rows = wipGap ? [] : workspacesOf(wip);
  const emptyBoard = !wipGap && wip != null && rows.length === 0 && asNumber(wip.totalIncluded) === 0;
  const notes: string[] = [];
  for (const note of [explicitGapNote("Dock WIP", wip), explicitGapNote("Dock threads", threads)]) {
    if (note && !notes.includes(note)) notes.push(note);
  }
  if (input.threadsMissing) notes.push("Missing thread data.");
  if (!wipGap && shape === "pre-oct-5") notes.push("Dock WIP shape is pre-Oct 5.");
  if (!wipGap && shape === "post-oct-5") notes.push("Dock WIP shape is post-Oct 5.");

  let overdueTasks: number | null = wipGap ? null : asNumber(wip?.overdueTaskTotal);
  let sawOverdue = overdueTasks != null;
  let taskDone = 0;
  let taskTotal = 0;
  let sawProgress = false;
  let targetPassed = 0;
  let sawTarget = !wipGap && shape === "pre-oct-5";
  const owners = new Map<string, DailyOwnerFact>();

  for (const row of rows) {
    const overdue = asNumber(row.overdueTaskCount);
    if (overdue != null) {
      overdueTasks = (overdueTasks ?? 0) + (wip?.overdueTaskTotal == null ? overdue : 0);
      sawOverdue = true;
    }
    const progress = progressOf(row);
    if (progress) {
      sawProgress = true;
      taskDone += progress.done;
      taskTotal += progress.total;
    }
    if (row.targetPassed != null) sawTarget = true;
    if (passedTarget(row, factDate, shape)) targetPassed += 1;

    const names = ownerNames(row);
    const team = teamName(row);
    const labels = names.length > 0 ? names : team ? [team] : [];
    for (const owner of labels) {
      const key = `${owner}\n${team}`;
      const current = owners.get(key) ?? { owner, team, wipSites: 0 };
      current.wipSites += 1;
      owners.set(key, current);
    }
  }

  const totals = threadsGap ? null : asObj(threads?.totals);
  let waitingPimsy = asNumber(totals?.waiting_on_pimsy ?? totals?.waitingOnPimsy);
  let waitingCustomer = asNumber(totals?.waiting_on_customer ?? totals?.waitingOnCustomer);
  let openThreads = asNumber(totals?.threads ?? totals?.openThreads ?? (threadsGap ? null : threads?.threadCount));

  if (input.deliveryStatus != null) {
    const delivery = parseDeliveryStatus(input.deliveryStatus);
    if (openThreads == null) openThreads = delivery.openThreads;
    if (waitingPimsy == null) waitingPimsy = delivery.waitingOnPimsy;
    if (waitingCustomer == null) waitingCustomer = delivery.waitingOnCustomer;
    if (delivery.note) notes.push(delivery.note);
  }

  let zendeskOpen: number | null = null;
  if (zendesk) {
    const zendeskEmpty = zendesk.tickets == null && zendesk.open == null && zendesk.openTickets == null;
    if (isExplicitGap(zendesk) || zendeskEmpty) {
      notes.push("Zendesk gap.");
    } else if (Array.isArray(zendesk.tickets)) {
      zendeskOpen = zendesk.tickets.length;
    } else {
      zendeskOpen = asNumber(zendesk.open ?? zendesk.openTickets);
    }
  }

  const fromMarkdown = input.prismMarkdown ? parsePrismLiveMarkdown(input.prismMarkdown) : null;
  if (fromMarkdown?.note) notes.push(fromMarkdown.note);

  const wipSites = wipGap || !wip ? null : (asNumber(wip.totalIncluded) ?? (rows.length > 0 ? rows.length : 0));

  return {
    ok: true,
    fact: {
      factDate,
      gap: emptyBoard || wipGap || threadsGap || input.threadsMissing === true,
      wipShape: shape,
      wipSites,
      overdueTasks: sawOverdue ? overdueTasks : null,
      taskDone: sawProgress ? taskDone : null,
      taskTotal: sawProgress ? taskTotal : null,
      targetPassed: sawTarget ? targetPassed : null,
      openThreads,
      waitingOnPimsy: waitingPimsy,
      waitingOnCustomer: waitingCustomer,
      prismLoadHours:
        asNumber(prism?.loadHours ?? prism?.thisWeekLoad ?? prism?.load) ?? fromMarkdown?.loadHours ?? null,
      prismCapacityHours:
        asNumber(prism?.capacityHours ?? prism?.deptCapacityHours ?? prism?.capacity) ??
        fromMarkdown?.capacityHours ??
        null,
      slipDays: asNumber(prism?.slipDays ?? prism?.slip_days) ?? fromMarkdown?.slipDays ?? null,
      zendeskOpen,
      note: notes.join(" "),
      owners: [...owners.values()].sort((a, b) => b.wipSites - a.wipSites || a.owner.localeCompare(b.owner)),
    },
  };
}
