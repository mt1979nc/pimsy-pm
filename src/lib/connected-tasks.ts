/**
 * Dock-style connected tasks + billing/RCM area catalog.
 *
 * Client-safe: no Postgres, rollup, or library server imports. Completing a
 * connected copy in one area reflects in the other via the shared key on the
 * live task (`connectKey`, falling back to `overlapKey`).
 *
 * Comparative Billing vs Discovery + Configuration: billing intake lives on
 * Discovery (customer) and Billing Configuration (billing team). Billing Config
 * work lives on Site Configuration (implementation) and the same Billing
 * Configuration tab. EHR+RCM playbooks *move* overlapping payer / ClaimMD /
 * workflow rows to the RCM tab instead of leaving disconnected duplicates.
 */

export const BILLING_CONFIGURATION_PHASE = "Billing Configuration";

export type ConnectedTaskArea = "Discovery" | "Site Configuration" | "Billing" | "RCM";

export type ConnectedTaskDef = {
  key: string;
  titles: readonly string[];
  /** Playbook tabs that already carried this work before the billing team area. */
  sourceAreas: readonly ConnectedTaskArea[];
  /** Copy onto the Billing Configuration team tab (connected duplicate). */
  billingConfigurationCopy: boolean;
  /** On EHR+RCM, drop the EHR copy and keep the RCM tab row. */
  rcmMove: boolean;
};

export const CONNECTED_TASK_DEFS: readonly ConnectedTaskDef[] = [
  {
    key: "billing_questionnaire",
    titles: ["Billing Questionnaire"],
    sourceAreas: ["Discovery"],
    billingConfigurationCopy: true,
    rcmMove: false,
  },
  {
    key: "billing_spreadsheet",
    titles: ["Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers"],
    sourceAreas: ["Discovery"],
    billingConfigurationCopy: true,
    rcmMove: false,
  },
  {
    key: "billing_config_section",
    titles: ["Billing Config"],
    sourceAreas: ["Site Configuration"],
    billingConfigurationCopy: true,
    rcmMove: false,
  },
  {
    key: "billing_workflow_discovery",
    titles: ["Schedule Billing Workflow Discovery Meeting", "Billing workflow walkthrough"],
    sourceAreas: ["Site Configuration", "RCM"],
    billingConfigurationCopy: true,
    rcmMove: true,
  },
  {
    key: "billing_workflow_notes",
    titles: ["Billing Workflow Discovery Meeting Notes & Recording"],
    sourceAreas: ["Site Configuration"],
    billingConfigurationCopy: true,
    rcmMove: false,
  },
  {
    key: "billing_questionnaire_review",
    titles: ["Review Billing Questionnaire Data Sheet"],
    sourceAreas: ["Site Configuration"],
    billingConfigurationCopy: true,
    rcmMove: false,
  },
  {
    key: "billing_code_setup",
    titles: ["Billing Code Setup"],
    sourceAreas: ["Site Configuration"],
    billingConfigurationCopy: true,
    rcmMove: false,
  },
  {
    key: "payer_setup",
    titles: ["Payer Setup", "Payer setup and validation"],
    sourceAreas: ["Site Configuration", "RCM"],
    billingConfigurationCopy: true,
    rcmMove: true,
  },
  {
    key: "claimmd_enrollment",
    titles: ["ClaimMD Enrollment", "ClaimMD enrollment"],
    sourceAreas: ["Billing", "RCM"],
    billingConfigurationCopy: false,
    rcmMove: true,
  },
  {
    key: "rcm_intake",
    titles: ["Complete RCM intake questionnaire"],
    sourceAreas: ["RCM"],
    billingConfigurationCopy: false,
    rcmMove: false,
  },
  {
    key: "payer_list",
    titles: ["Provide payer list and contracts"],
    sourceAreas: ["RCM"],
    billingConfigurationCopy: false,
    rcmMove: false,
  },
];

const TITLE_TO_KEY: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const def of CONNECTED_TASK_DEFS) {
    for (const title of def.titles) {
      map.set(normalizeConnectedTitle(title), def.key);
    }
  }
  return map;
})();

export function normalizeConnectedTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Shared key used to connect duplicate playbook rows. */
export function connectKeyForTitle(title: string): string | null {
  return TITLE_TO_KEY.get(normalizeConnectedTitle(title)) ?? null;
}

export function connectedKeyOf(row: {
  connectKey?: string | null;
  overlapKey?: string | null;
  title?: string | null;
}): string | null {
  const explicit = row.connectKey?.trim() || row.overlapKey?.trim() || "";
  if (explicit) return explicit;
  if (row.title) return connectKeyForTitle(row.title);
  return null;
}

export function isRcmMoveKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return CONNECTED_TASK_DEFS.some((d) => d.rcmMove && d.key === key);
}

export function rcmMoveKeys(): string[] {
  return CONNECTED_TASK_DEFS.filter((d) => d.rcmMove).map((d) => d.key);
}

/** Discovery + Configuration titles that also appear on the Billing Configuration tab. */
export function billingConfigurationCopyDefs(): ConnectedTaskDef[] {
  return CONNECTED_TASK_DEFS.filter((d) => d.billingConfigurationCopy);
}

export function comparativeBillingPairs(): Array<{
  key: string;
  discoveryOrConfigTitles: string[];
  billingTeamTitles: string[];
}> {
  return billingConfigurationCopyDefs().map((d) => ({
    key: d.key,
    discoveryOrConfigTitles: [...d.titles],
    billingTeamTitles: [d.titles[0]!],
  }));
}

export function isBillingConfigurationPhase(name: string): boolean {
  return normalizeConnectedTitle(name) === normalizeConnectedTitle(BILLING_CONFIGURATION_PHASE);
}
