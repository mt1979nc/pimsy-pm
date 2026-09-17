/**
 * Staff chase-list buckets for outstanding customer actions.
 *
 * Discovery / Configuration / Training are the three implementation areas
 * specialists chase. Everything else (Kickoff, Accessing Pimsy, import,
 * Billing, Billing Configuration, ePrescribe, go-live, …) stays on the list
 * under Other — we do not drop those items. Billing Configuration is the
 * billing-team tab, not Site Configuration.
 *
 * Client-safe: no Postgres, rollup, or library server imports.
 */

export const WAITING_ON_HIGHLIGHT_AREAS = ["discovery", "configuration", "training"] as const;
export const WAITING_ON_AREAS = [...WAITING_ON_HIGHLIGHT_AREAS, "other"] as const;

export type WaitingOnHighlightArea = (typeof WAITING_ON_HIGHLIGHT_AREAS)[number];
export type WaitingOnArea = (typeof WAITING_ON_AREAS)[number];

export const WAITING_ON_AREA_LABELS: Record<WaitingOnArea, string> = {
  discovery: "Discovery",
  configuration: "Configuration",
  training: "Training",
  other: "Other",
};

export type WaitingOnAreaTask = {
  phase?: { name?: string | null } | null;
};

export type WaitingOnAreaCounts = Record<WaitingOnArea, number>;

export type WaitingOnAreaGroup<T extends WaitingOnAreaTask> = {
  key: WaitingOnArea;
  label: string;
  tasks: T[];
};

export function emptyWaitingOnAreaCounts(): WaitingOnAreaCounts {
  return { discovery: 0, configuration: 0, training: 0, other: 0 };
}

/**
 * Map a live phase name onto the staff chase buckets.
 *
 * Training is checked first so “Core (Train the Trainer)” and “End-User
 * Training Prep” do not fall through. Billing / Billing Configuration are
 * checked next so “Billing Configuration” does not match the Configuration
 * bucket via “configur*”. Configuration matches Site Configuration (and any
 * remaining “configur*” tab). Discovery matches the Discovery tab — not
 * Guided Discovery meetings that live under Configuration.
 */
export function classifyWaitingOnArea(phaseName?: string | null): WaitingOnArea {
  const t = (phaseName ?? "").trim().toLowerCase();
  if (!t) return "other";
  if (/train/.test(t)) return "training";
  if (/billing/.test(t)) return "other";
  if (/configur/.test(t)) return "configuration";
  if (/discovery/.test(t)) return "discovery";
  return "other";
}

export function countWaitingOnByArea<T extends WaitingOnAreaTask>(tasks: T[]): WaitingOnAreaCounts {
  const counts = emptyWaitingOnAreaCounts();
  for (const task of tasks) {
    counts[classifyWaitingOnArea(task.phase?.name)] += 1;
  }
  return counts;
}

export function groupWaitingOnByArea<T extends WaitingOnAreaTask>(tasks: T[]): WaitingOnAreaGroup<T>[] {
  const buckets: Record<WaitingOnArea, T[]> = {
    discovery: [],
    configuration: [],
    training: [],
    other: [],
  };
  for (const task of tasks) {
    buckets[classifyWaitingOnArea(task.phase?.name)].push(task);
  }
  return WAITING_ON_AREAS.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    label: WAITING_ON_AREA_LABELS[key],
    tasks: buckets[key],
  }));
}

/** Compact leadership hint, e.g. "3 Discovery · 1 Configuration · 2 Training". */
export function formatWaitingOnAreaHint(counts: WaitingOnAreaCounts): string | undefined {
  const parts: string[] = [];
  for (const key of WAITING_ON_HIGHLIGHT_AREAS) {
    if (counts[key] > 0) parts.push(`${counts[key]} ${WAITING_ON_AREA_LABELS[key]}`);
  }
  if (counts.other > 0) parts.push(`${counts.other} other`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** True when the live phase name is more specific than the bucket label. */
export function waitingOnPhaseDetail(phaseName?: string | null, area?: WaitingOnArea): string | null {
  const name = phaseName?.trim();
  if (!name) return null;
  const bucket = area ?? classifyWaitingOnArea(name);
  if (bucket === "other") return name;
  if (name.toLowerCase() === WAITING_ON_AREA_LABELS[bucket].toLowerCase()) return null;
  if (bucket === "configuration" && /^site configuration$/i.test(name)) return null;
  return name;
}
