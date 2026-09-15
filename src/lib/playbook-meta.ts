import type { PlaybookPath } from "@/db/schema";

export const PLAYBOOK_PATHS: PlaybookPath[] = ["EHR", "EHR_RCM", "RCM_LEGACY", "RCM_PRISM"];

export const PLAYBOOK_PATH_META: Record<
  PlaybookPath,
  { title: string; subtitle: string; code: string; fallbackNames: string[] }
> = {
  EHR: {
    title: "EHR Implementation only",
    subtitle: "Full PIMSY implementation playbook — kickoff through post-go-live.",
    code: "ehr",
    fallbackNames: ["PIMSY Implementation"],
  },
  EHR_RCM: {
    title: "EHR + RCM",
    subtitle: "Standard implementation plus the RCM onboarding track on the same site.",
    code: "ehr_rcm",
    fallbackNames: ["EHR + RCM Implementation"],
  },
  RCM_LEGACY: {
    title: "Existing EHR + RCM Legacy (No Prism data)",
    subtitle: "Lite plan: basic overview plus RCM items only. No Prism history to carry forward.",
    code: "rcm_legacy",
    fallbackNames: ["RCM Legacy (No Prism data)", "RCM (Existing Customer)"],
  },
  RCM_PRISM: {
    title: "Existing EHR + RCM (Yes Prism data)",
    subtitle:
      "Add RCM work to an existing site, auto-complete overlapping implementation tasks, and track RCM separately.",
    code: "rcm_prism",
    fallbackNames: ["Existing EHR + RCM (Prism data)"],
  },
};

export const OPTIONAL_AREA_CATALOG: Record<string, { label: string; hint: string }> = {
  data_import: {
    label: "Demographic / data import",
    hint: "Skip when there is no prior-system client import.",
  },
  eprescribe: {
    label: "ePrescribe",
    hint: "DrFirst site account, ID proofing, EPCS and PDMP.",
  },
  inpatient_mat: {
    label: "Inpatient / MAT",
    hint: "Beds, eMAR, inventory, messaging, eFax, labs, EVV.",
  },
  group_notes: {
    label: "Group notes training",
    hint: "Training 4 — only if the practice uses group notes.",
  },
  payroll: {
    label: "Payroll",
    hint: "Payroll training track.",
  },
};

export function optionalAreaLabel(key: string): string {
  return OPTIONAL_AREA_CATALOG[key]?.label ?? key.replaceAll("_", " ");
}

/** Stable area key for optional playbook slices (create-site include/exclude). */
export function normalizeAreaKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type TemplateAreaRow = {
  key: string;
  label: string;
  hint: string;
  phaseCount: number;
  taskCount: number;
  optionalCount: number;
};

/**
 * Roll up optional-area usage on a playbook so the template editor can bulk
 * mark / clear areas without opening every task.
 */
export function collectTemplateAreaRows(
  phases: Array<{
    isOptional?: boolean | null;
    areaKey?: string | null;
    tasks: Array<{ isOptional?: boolean | null; areaKey?: string | null }>;
  }>,
): TemplateAreaRow[] {
  const rows = new Map<
    string,
    { phaseIds: number; taskCount: number; optionalCount: number }
  >();
  const bump = (key: string) => {
    const cur = rows.get(key) ?? { phaseIds: 0, taskCount: 0, optionalCount: 0 };
    rows.set(key, cur);
    return cur;
  };
  for (const phase of phases) {
    if (phase.areaKey) bump(phase.areaKey).phaseIds += 1;
    for (const task of phase.tasks) {
      const key = task.areaKey ?? phase.areaKey;
      if (!key) continue;
      const row = bump(key);
      row.taskCount += 1;
      if (task.isOptional || (phase.isOptional && (task.areaKey == null || task.areaKey === phase.areaKey))) {
        row.optionalCount += 1;
      }
    }
  }
  return [...rows.entries()]
    .map(([key, stats]) => ({
      key,
      label: optionalAreaLabel(key),
      hint: OPTIONAL_AREA_CATALOG[key]?.hint ?? "",
      phaseCount: stats.phaseIds,
      taskCount: stats.taskCount,
      optionalCount: stats.optionalCount,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Unique `project_template.code` for a duplicated playbook. */
export function uniqueTemplateCode(base: string | null | undefined, taken: Iterable<string>): string {
  const existing = new Set(
    [...taken].map((c) => c.trim().toLowerCase()).filter(Boolean),
  );
  const slug =
    (base ?? "playbook")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "playbook";
  const stem = slug.endsWith("-copy") ? slug : `${slug}-copy`;
  if (!existing.has(stem)) return stem;
  let n = 2;
  while (existing.has(`${stem}-${n}`)) n += 1;
  return `${stem}-${n}`;
}

export function suggestedCopyName(name: string): string {
  const trimmed = name.trim() || "Playbook";
  if (/\(copy(?: \d+)?\)$/i.test(trimmed)) {
    const bumped = trimmed.replace(/\(copy\)$/i, "(copy 2)");
    if (bumped !== trimmed) return bumped;
    return trimmed.replace(/\(copy (\d+)\)$/i, (_, n) => `(copy ${Number(n) + 1})`);
  }
  return `${trimmed} (copy)`;
}

/** Parents before children so nested Dock sections clone with remapped ids. */
export function orderTemplateTasksForClone<T extends { id: string; parentTaskId: string | null; order: number }>(
  tasks: T[],
): T[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const out: T[] = [];
  function visit(task: T) {
    if (seen.has(task.id)) return;
    if (task.parentTaskId && byId.has(task.parentTaskId)) {
      visit(byId.get(task.parentTaskId)!);
    }
    seen.add(task.id);
    out.push(task);
  }
  for (const task of [...tasks].sort((a, b) => a.order - b.order)) visit(task);
  return out;
}

export function shouldIncludeByArea(
  row: { isOptional?: boolean | null; areaKey?: string | null },
  excludedAreaKeys: readonly string[],
): boolean {
  if (!row.isOptional || !row.areaKey) return true;
  return !excludedAreaKeys.includes(row.areaKey);
}

export function normalizeOverlapTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dock live titles that mean the same playbook row as a PATH template title.
 * Resync matches either side so THS-style combined Training 1 does not duplicate.
 */
const PLAYBOOK_TITLE_ALIAS_PAIRS: Array<[string, string]> = [
  [
    "Training 1: Intro to PIMSY",
    "Training 1: Intro to PIMSY, Client Charts, Appointments/Calendar",
  ],
];

const PLAYBOOK_TITLE_ALIAS_MAP: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    const key = normalizeOverlapTitle(from);
    const list = map.get(key) ?? [];
    list.push(to);
    map.set(key, list);
  };
  for (const [a, b] of PLAYBOOK_TITLE_ALIAS_PAIRS) {
    add(a, b);
    add(b, a);
  }
  return map;
})();

/** Alternate titles (raw) that should match `title` on a live or template task. */
export function playbookTitleAliases(title: string): string[] {
  return PLAYBOOK_TITLE_ALIAS_MAP.get(normalizeOverlapTitle(title)) ?? [];
}

/** Live-task lookup: exact normalized title, then Dock/PATH aliases. */
export function findByPlaybookTitle<T extends { title: string }>(
  byNormalizedTitle: Map<string, T>,
  title: string,
): T | undefined {
  const direct = byNormalizedTitle.get(normalizeOverlapTitle(title));
  if (direct) return direct;
  for (const alias of playbookTitleAliases(title)) {
    const hit = byNormalizedTitle.get(normalizeOverlapTitle(alias));
    if (hit) return hit;
  }
  return undefined;
}

export function isActiveWork(row: { status: string; notApplicable?: boolean | null }): boolean {
  if (row.notApplicable) return false;
  return row.status !== "DONE" && row.status !== "CANCELLED" && row.status !== "SKIPPED";
}
