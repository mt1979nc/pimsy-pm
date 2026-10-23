/**
 * Normalize one morning snapshot into a daily fact.
 *
 * Dock WIP changed shape on 2026-10-05. Before that, sites have targetEnd
 * and owners. After that, they also have overdue counts, task progress,
 * a targetPassed flag, and team. Both shapes land in the same columns.
 * Weekends are absent on purpose. A weekday with no file is a gap.
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

export function normalizeDailyBrief(input: DailyBriefInput): { ok: true; fact: DailyFactDraft } | { ok: false; error: string } {
  const wip = asObj(input.dockWip);
  const threads = asObj(input.dockThreads);
  const prism = asObj(input.prism);
  const zendesk = asObj(input.zendesk);
  const factDate =
    dayKey(input.date) ||
    dayKey(wip?.retrievedAt) ||
    dayKey(threads?.retrievedAt) ||
    dayKey(prism?.retrievedAt);
  if (!factDate) return { ok: false, error: "A snapshot needs a date (YYYY-MM-DD) or retrievedAt." };

  const shape = detectWipShape(wip);
  const rows = workspacesOf(wip);
  const emptyBoard = wip != null && rows.length === 0 && asNumber(wip.totalIncluded) === 0;
  const notes: string[] = [];
  if (shape === "pre-oct-5") notes.push("Dock WIP shape is pre-Oct 5.");
  if (shape === "post-oct-5") notes.push("Dock WIP shape is post-Oct 5.");

  let overdueTasks: number | null = asNumber(wip?.overdueTaskTotal);
  let sawOverdue = overdueTasks != null;
  let taskDone = 0;
  let taskTotal = 0;
  let sawProgress = false;
  let targetPassed = 0;
  let sawTarget = shape === "pre-oct-5";
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

  const totals = asObj(threads?.totals);
  const waitingPimsy = asNumber(totals?.waiting_on_pimsy ?? totals?.waitingOnPimsy);
  const waitingCustomer = asNumber(totals?.waiting_on_customer ?? totals?.waitingOnCustomer);
  const openThreads = asNumber(totals?.threads ?? totals?.openThreads ?? threads?.threadCount);

  let zendeskOpen: number | null = null;
  if (zendesk) {
    if (zendesk.gap === true || zendesk.tickets == null && zendesk.open == null && zendesk.openTickets == null) {
      notes.push("Zendesk gap.");
    } else if (Array.isArray(zendesk.tickets)) {
      zendeskOpen = zendesk.tickets.length;
    } else {
      zendeskOpen = asNumber(zendesk.open ?? zendesk.openTickets);
    }
  }

  const wipSites = asNumber(wip?.totalIncluded) ?? (rows.length > 0 ? rows.length : wip ? 0 : null);

  return {
    ok: true,
    fact: {
      factDate,
      gap: emptyBoard,
      wipShape: shape,
      wipSites,
      overdueTasks: sawOverdue ? overdueTasks : null,
      taskDone: sawProgress ? taskDone : null,
      taskTotal: sawProgress ? taskTotal : null,
      targetPassed: sawTarget ? targetPassed : null,
      openThreads,
      waitingOnPimsy: waitingPimsy,
      waitingOnCustomer: waitingCustomer,
      prismLoadHours: asNumber(prism?.loadHours ?? prism?.thisWeekLoad ?? prism?.load),
      prismCapacityHours: asNumber(prism?.capacityHours ?? prism?.deptCapacityHours ?? prism?.capacity),
      slipDays: asNumber(prism?.slipDays ?? prism?.slip_days),
      zendeskOpen,
      note: notes.join(" "),
      owners: [...owners.values()].sort((a, b) => b.wipSites - a.wipSites || a.owner.localeCompare(b.owner)),
    },
  };
}
