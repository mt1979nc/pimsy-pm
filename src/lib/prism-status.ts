/**
 * Prism roster status ↔ pimsy-pm project/customer enums.
 * Native Postgres only — no Prism Azure SQL.
 */

export const PRISM_STATUSES = ["active", "pre-kickoff", "pipeline"] as const;
export type PrismStatus = (typeof PRISM_STATUSES)[number];

export function isPrismStatus(v: string | null | undefined): v is PrismStatus {
  return !!v && (PRISM_STATUSES as readonly string[]).includes(v);
}

/** Infer a Prism-like status when prismStatus column is null (legacy rows). */
export function inferPrismStatus(input: {
  prismStatus: string | null;
  projectStatus: string;
  customerStatus?: string | null;
  startDate?: Date | string | null;
}): PrismStatus {
  if (isPrismStatus(input.prismStatus)) return input.prismStatus;
  if (input.customerStatus === "PROSPECT") return "pipeline";
  if (input.projectStatus === "NOT_STARTED" && !input.startDate) return "pre-kickoff";
  if (input.projectStatus === "NOT_STARTED") return "pre-kickoff";
  return "active";
}

/** Map prism_status onto project_status + customer_status for persistence. */
export function mapPrismStatusToEnums(status: PrismStatus): {
  projectStatus: "NOT_STARTED" | "IN_PROGRESS";
  customerStatus: "PROSPECT" | "ONBOARDING";
} {
  switch (status) {
    case "pipeline":
      return { projectStatus: "NOT_STARTED", customerStatus: "PROSPECT" };
    case "pre-kickoff":
      return { projectStatus: "NOT_STARTED", customerStatus: "ONBOARDING" };
    case "active":
    default:
      return { projectStatus: "IN_PROGRESS", customerStatus: "ONBOARDING" };
  }
}

export const PRISM_STATUS_LABELS: Record<PrismStatus, string> = {
  active: "Active",
  "pre-kickoff": "Pre-kickoff",
  pipeline: "Pipeline",
};
