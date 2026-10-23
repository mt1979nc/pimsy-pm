/**
 * Read helpers. They use the cached config and fall back to the seeded defaults
 * so a missing table does not change estimator or capacity output.
 */

import { DEFAULT_PATH_CONFIG, type ConfigStatus, type PathConfig } from "@/lib/path-config-defaults";
import { currentPathConfig } from "@/lib/path-config-store";

function cfg(): PathConfig {
  return currentPathConfig();
}

export function loadModel(): PathConfig["loadModel"] {
  return cfg().loadModel;
}

export function statusRow(status: string): ConfigStatus | undefined {
  return cfg().statuses.find((row) => row.key === status);
}

/** Active and pre-kickoff count. Pipeline does not. Stalled and special count, matching a badged active site. */
export function statusCountsTowardLoad(status: string): boolean {
  const row = statusRow(status);
  if (!row) return status === "active" || status === "pre-kickoff";
  return row.countsTowardLoad;
}

export function statusHoldHrsPerWeek(status: string): number | null {
  const hold = statusRow(status)?.holdHrsPerWeek;
  if (hold == null || !(hold > 0)) return null;
  return hold;
}

export function phaseWeight(phaseKey: string | null | undefined): number | null {
  if (!phaseKey) return null;
  const row = cfg().phases.find((phase) => phase.key === phaseKey);
  return row ? row.hoursWeight : null;
}

export function phaseWeightScale(phaseKey: string | null | undefined): number {
  const weight = phaseWeight(phaseKey);
  if (weight == null) return 1;
  const weights = cfg().phases.map((phase) => phase.hoursWeight).filter((n) => n > 0);
  if (weights.length === 0) return 1;
  const mean = weights.reduce((sum, n) => sum + n, 0) / weights.length;
  if (!(mean > 0)) return 1;
  return weight / mean;
}

export function hiringThresholds(): { now: number; near: number; typicalHours: number } {
  const hiring = cfg().hiring;
  return {
    now: hiring.utilizationPercent / 100,
    near: hiring.nearPercent / 100,
    typicalHours: hiring.typicalHoursPerWeek,
  };
}

export function roleHas(role: string, permission: string): boolean {
  const row = cfg().roles.find((item) => item.kind === "app" && item.key === role);
  const permissions = row?.permissions ?? DEFAULT_PATH_CONFIG.roles.find((item) => item.key === role)?.permissions;
  return Boolean(permissions?.includes(permission));
}

/**
 * True when this go-live change must be approved and the actor is not the approver.
 * Decline (approveGoLive false) stays with whoever can write the site.
 * OWNER can always approve so the workspace cannot lock itself out.
 */
export function slipGoLiveBlocked(input: {
  days: number;
  approveGoLive: boolean;
  role: string;
  isDirector: boolean;
}): boolean {
  if (!input.approveGoLive) return false;
  const rule = cfg().slipApproval;
  if (Math.abs(input.days) < rule.thresholdDays) return false;
  if (input.role === "OWNER") return false;
  if (rule.approverRole === "DIRECTOR") return !input.isDirector;
  return input.role !== rule.approverRole;
}
