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
