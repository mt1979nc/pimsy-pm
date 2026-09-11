/**
 * Prism `sel` keys ↔ pimsy-pm SERVICE_LINE_* keys used in project_scope.
 * Engagement edit UI stores PM keys; this map is for import/display parity.
 */

import { SERVICE_LINE_LABELS } from "@/lib/estimator";

/** Prism checkbox keys from saveModal / Customers.Data.sel */
export const PRISM_SEL_TO_SERVICE_LINE: Record<string, string> = {
  outpatient: "OUTPATIENT_THERAPY",
  eprescribe: "MEDICATION_MANAGEMENT",
  mat: "MAT",
  iop: "IOP",
  php: "PHP",
  groupnotes: "GROUP_THERAPY",
  inpatient: "INPATIENT_RESIDENTIAL",
  psychtesting: "PSYCH_TESTING",
  psr: "PSR_PSYCHOSOCIAL_REHAB",
  prp: "PRP_PSYCHIATRIC_REHAB",
  messaging: "MESSAGING",
  efax: "EFAX",
  labs: "LABS",
  evv: "EVV",
  payroll: "PAYROLL",
  other: "OTHER_SERVICES",
};

export const SERVICE_LINE_TO_PRISM_SEL: Record<string, string> = Object.fromEntries(
  Object.entries(PRISM_SEL_TO_SERVICE_LINE).map(([prism, pm]) => [pm, prism]),
);

export function prismSelToServiceLines(sel: Record<string, boolean> | null | undefined): string[] {
  if (!sel) return [];
  const out: string[] = [];
  for (const [key, on] of Object.entries(sel)) {
    if (!on) continue;
    const mapped = PRISM_SEL_TO_SERVICE_LINE[key];
    if (mapped) out.push(mapped);
  }
  return out;
}

export function serviceLinesToPrismSel(lines: string[]): Record<string, boolean> {
  const sel: Record<string, boolean> = {};
  for (const key of Object.keys(PRISM_SEL_TO_SERVICE_LINE)) sel[key] = false;
  for (const line of lines) {
    const prism = SERVICE_LINE_TO_PRISM_SEL[line];
    if (prism) sel[prism] = true;
  }
  return sel;
}

export function serviceLineOptions(): { key: string; label: string }[] {
  return Object.entries(SERVICE_LINE_LABELS).map(([key, label]) => ({ key, label }));
}
