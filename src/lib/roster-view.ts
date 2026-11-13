/**
 * Prism roster sort and filter. Blanks stay last in both directions.
 * The page stores the same shape in the URL query.
 */

export const ROSTER_SORTS = [
  "acronym",
  "customer",
  "owners",
  "users",
  "locations",
  "complexity",
  "hours",
  "kickoff",
  "initialGoLive",
  "goLive",
  "status",
  "slips",
] as const;

export type RosterSortColumn = (typeof ROSTER_SORTS)[number];
export type RosterSortDirection = "asc" | "desc";

export type RosterQuery = {
  q: string;
  owner: string;
  status: string;
  sort: RosterSortColumn | null;
  dir: RosterSortDirection;
};

export type RosterPerson = { id: string; name: string };

export type RosterViewRow = {
  id: string;
  acronym: string;
  customerName: string | null;
  name: string;
  leadId: string | null;
  coLeadId: string | null;
  thirdSpecialistId: string | null;
  leadName: string | null;
  coLeadName: string | null;
  thirdSpecialistName: string | null;
  userCount: number | null;
  locationCount: number | null;
  complexityTier: string | null;
  displayHours: number | null | undefined;
  startDate: Date | string | null;
  initialGoLiveDate: Date | string | null;
  targetGoLiveDate: Date | string | null;
  effectivePrismStatus: string;
  slipDays: number;
};

const SORTS = new Set<string>(ROSTER_SORTS);

export function parseRosterQuery(params: {
  get(name: string): string | null;
}): RosterQuery {
  const sortRaw = params.get("sort") ?? "";
  const dirRaw = params.get("dir") ?? "";
  return {
    q: (params.get("q") ?? "").trim(),
    owner: (params.get("owner") ?? "").trim(),
    status: (params.get("status") ?? "").trim() || "all",
    sort: SORTS.has(sortRaw) ? (sortRaw as RosterSortColumn) : null,
    dir: dirRaw === "desc" ? "desc" : "asc",
  };
}

export function rosterQueryString(query: RosterQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.owner) params.set("owner", query.owner);
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.sort) {
    params.set("sort", query.sort);
    params.set("dir", query.dir);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** First click sorts ascending. The next click flips direction. */
export function nextRosterSort(current: RosterQuery, column: RosterSortColumn): RosterQuery {
  if (current.sort !== column) return { ...current, sort: column, dir: "asc" };
  return { ...current, sort: column, dir: current.dir === "asc" ? "desc" : "asc" };
}

function blankLast(aEmpty: boolean, bEmpty: boolean, cmp: number, dir: RosterSortDirection): number {
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return dir === "asc" ? cmp : -cmp;
}

function textKey(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function timeKey(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function numberKey(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compareRows(a: RosterViewRow, b: RosterViewRow, sort: RosterSortColumn, dir: RosterSortDirection): number {
  switch (sort) {
    case "acronym":
      return blankLast(!textKey(a.acronym), !textKey(b.acronym), (a.acronym ?? "").localeCompare(b.acronym ?? "", undefined, { sensitivity: "base", numeric: true }), dir);
    case "customer": {
      const left = textKey(a.customerName ?? a.name);
      const right = textKey(b.customerName ?? b.name);
      return blankLast(!left, !right, (left ?? "").localeCompare(right ?? "", undefined, { sensitivity: "base" }), dir);
    }
    case "owners": {
      const left = textKey([a.leadName, a.coLeadName, a.thirdSpecialistName].filter(Boolean).join(" "));
      const right = textKey([b.leadName, b.coLeadName, b.thirdSpecialistName].filter(Boolean).join(" "));
      return blankLast(!left, !right, (left ?? "").localeCompare(right ?? "", undefined, { sensitivity: "base" }), dir);
    }
    case "users":
      return blankLast(numberKey(a.userCount) == null, numberKey(b.userCount) == null, (a.userCount ?? 0) - (b.userCount ?? 0), dir);
    case "locations":
      return blankLast(numberKey(a.locationCount) == null, numberKey(b.locationCount) == null, (a.locationCount ?? 0) - (b.locationCount ?? 0), dir);
    case "complexity": {
      const left = textKey(a.complexityTier);
      const right = textKey(b.complexityTier);
      return blankLast(!left, !right, (left ?? "").localeCompare(right ?? "", undefined, { sensitivity: "base" }), dir);
    }
    case "hours":
      return blankLast(numberKey(a.displayHours) == null, numberKey(b.displayHours) == null, (a.displayHours ?? 0) - (b.displayHours ?? 0), dir);
    case "kickoff":
      return blankLast(timeKey(a.startDate) == null, timeKey(b.startDate) == null, (timeKey(a.startDate) ?? 0) - (timeKey(b.startDate) ?? 0), dir);
    case "initialGoLive":
      return blankLast(timeKey(a.initialGoLiveDate) == null, timeKey(b.initialGoLiveDate) == null, (timeKey(a.initialGoLiveDate) ?? 0) - (timeKey(b.initialGoLiveDate) ?? 0), dir);
    case "goLive":
      return blankLast(timeKey(a.targetGoLiveDate) == null, timeKey(b.targetGoLiveDate) == null, (timeKey(a.targetGoLiveDate) ?? 0) - (timeKey(b.targetGoLiveDate) ?? 0), dir);
    case "status":
      return blankLast(!textKey(a.effectivePrismStatus), !textKey(b.effectivePrismStatus), a.effectivePrismStatus.localeCompare(b.effectivePrismStatus), dir);
    case "slips": {
      const left = a.slipDays ? a.slipDays : null;
      const right = b.slipDays ? b.slipDays : null;
      return blankLast(left == null, right == null, (left ?? 0) - (right ?? 0), dir);
    }
  }
}

export function rosterPeople(rows: readonly RosterViewRow[]): RosterPerson[] {
  const people = new Map<string, string>();
  for (const row of rows) {
    const slots = [
      [row.leadId, row.leadName],
      [row.coLeadId, row.coLeadName],
      [row.thirdSpecialistId, row.thirdSpecialistName],
    ] as const;
    for (const [id, name] of slots) {
      if (!id) continue;
      const label = name?.trim() || id;
      if (!people.has(id)) people.set(id, label);
    }
  }
  return [...people.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function filterRosterRows<T extends RosterViewRow>(rows: readonly T[], query: RosterQuery): T[] {
  const q = query.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (query.status && query.status !== "all" && row.effectivePrismStatus !== query.status) return false;
    if (query.owner) {
      const ids = [row.leadId, row.coLeadId, row.thirdSpecialistId];
      if (!ids.includes(query.owner)) return false;
    }
    if (!q) return true;
    const haystack = [row.acronym, row.customerName, row.name].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

export function sortRosterRows<T extends RosterViewRow>(rows: readonly T[], query: RosterQuery): T[] {
  if (!query.sort) return [...rows];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const cmp = compareRows(a.row, b.row, query.sort!, query.dir);
      return cmp === 0 ? a.index - b.index : cmp;
    })
    .map((entry) => entry.row);
}

export function viewRosterRows<T extends RosterViewRow>(rows: readonly T[], query: RosterQuery): T[] {
  return sortRosterRows(filterRosterRows(rows, query), query);
}
