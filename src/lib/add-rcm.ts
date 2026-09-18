/**
 * Add RCM onto an existing Implementation WIP project (after create).
 *
 * Client-safe: no Postgres, rollup, or library server imports. The live
 * materialize + membership write lives in playbook.ts / projects actions.
 *
 * Mid-WIP add keeps overlapping Billing ↔ Discovery/Config ↔ RCM rows
 * *connected* (complete in one reflects in the other). Path 4 (new-project
 * attach to an existing site with Prism history) still auto-completes overlap.
 */

import { canonicalStaffingRole, type StaffingRole } from "@/lib/staffing";
import { connectedKeyOf } from "@/lib/connected-tasks";
import { normalizeOverlapTitle } from "@/lib/playbook-meta";

export const RCM_TRACK_ALREADY_ON = "RCM is already on this project.";
export const RCM_TRACK_ALREADY_PRESENT = "This project already has an RCM track.";

/** Staffing roles we may preselect from existing membership — never invent people. */
export const ADD_RCM_ROLES: readonly StaffingRole[] = [
  "T1_BILLING_SUPPORT",
  "T2_BILLING_SUPPORT",
  "RCM_IMPLEMENTATION_SPECIALIST",
  "RCM_MANAGER",
];

export type RcmOverlapMode = "auto-complete" | "connect";

export type AddRcmBlockedReason =
  | "already-on"
  | "completed"
  | "cancelled"
  | "archived"
  | "onboarded"
  | "handoff"
  | "not-implementation";

export type AddRcmEligibility =
  | { ok: true }
  | { ok: false; reason: AddRcmBlockedReason };

export type AddRcmProjectInput = {
  type?: string | null;
  status?: string | null;
  onboarded?: boolean | null;
  archivedAt?: Date | string | null;
  playbookPath?: string | null;
  rcmTaskCountTotal?: number | null;
  hasRcmWorkTrack?: boolean;
  handoffComplete?: boolean;
};

export type OverlapTask = {
  id: string;
  title: string;
  status: string;
  overlapKey?: string | null;
  connectKey?: string | null;
  workTrack?: string | null;
  notApplicable?: boolean | null;
};

export function isHandoffPhaseName(name: string | null | undefined): boolean {
  return Boolean(name && /handoff/i.test(name));
}

export function isHandoffComplete(
  phases: Array<{
    name: string;
    status?: string | null;
    notApplicable?: boolean | null;
    tasks?: Array<{ status: string; notApplicable?: boolean | null }>;
  }>,
): boolean {
  const handoff = phases.find((p) => isHandoffPhaseName(p.name) && !p.notApplicable);
  if (!handoff) return false;
  const status = (handoff.status ?? "").toUpperCase();
  if (status === "COMPLETED" || status === "SKIPPED") return true;
  const tasks = handoff.tasks;
  if (!tasks || tasks.length === 0) return false;
  const applicable = tasks.filter((t) => !t.notApplicable);
  if (applicable.length === 0) return false;
  return applicable.every((t) => {
    const s = (t.status ?? "").toUpperCase();
    return s === "DONE" || s === "CANCELLED" || s === "SKIPPED";
  });
}

/** Create-time EHR+RCM / RCM legacy, or mid-WIP Add RCM (stored as RCM_PRISM). */
const RCM_PLAYBOOK_PATHS = new Set(["EHR_RCM", "RCM_LEGACY", "RCM_PRISM"]);

export function isRcmPlaybookPath(path?: string | null): boolean {
  return Boolean(path && RCM_PLAYBOOK_PATHS.has(path));
}

export function projectHasRcmTrack(input: {
  playbookPath?: string | null;
  rcmTaskCountTotal?: number | null;
  hasRcmWorkTrack?: boolean;
}): boolean {
  if (isRcmPlaybookPath(input.playbookPath)) return true;
  if ((input.rcmTaskCountTotal ?? 0) > 0) return true;
  return Boolean(input.hasRcmWorkTrack);
}

export function addRcmEligibility(project: AddRcmProjectInput): AddRcmEligibility {
  if (projectHasRcmTrack(project)) return { ok: false, reason: "already-on" };
  const type = (project.type ?? "IMPLEMENTATION").toUpperCase();
  if (type !== "IMPLEMENTATION" && type !== "MIGRATION") {
    return { ok: false, reason: "not-implementation" };
  }
  const status = (project.status ?? "").toUpperCase();
  if (status === "COMPLETED") return { ok: false, reason: "completed" };
  if (status === "CANCELLED") return { ok: false, reason: "cancelled" };
  if (project.archivedAt) return { ok: false, reason: "archived" };
  if (project.onboarded) return { ok: false, reason: "onboarded" };
  if (project.handoffComplete) return { ok: false, reason: "handoff" };
  return { ok: true };
}

/** Which Add RCM chrome to render. Form stays hidden until the user expands. */
export type AddRcmPanelView = "hidden" | "trigger" | "form" | "summary";

export function addRcmPanelView(input: {
  eligible: boolean;
  alreadyOn: boolean;
  expanded: boolean;
}): AddRcmPanelView {
  if (input.alreadyOn) return "summary";
  if (!input.eligible) return "hidden";
  return input.expanded ? "form" : "trigger";
}

export const ADD_RCM_HASH = "#add-rcm";

export function addRcmHashShouldExpand(
  hash: string | null | undefined,
  alreadyOn: boolean,
): boolean {
  if (alreadyOn) return false;
  const value = (hash ?? "").trim();
  return value === ADD_RCM_HASH || value === "add-rcm";
}

export function addRcmBlockedMessage(reason: AddRcmBlockedReason): string {
  switch (reason) {
    case "already-on":
      return RCM_TRACK_ALREADY_ON;
    case "completed":
      return "RCM cannot be added after the project is completed.";
    case "cancelled":
      return "RCM cannot be added on a cancelled project.";
    case "archived":
      return "RCM cannot be added on an archived project.";
    case "onboarded":
      return "RCM cannot be added after the site is Onboarded.";
    case "handoff":
      return "RCM cannot be added after Hand-off. Use this on active Implementation WIP.";
    case "not-implementation":
      return "Add RCM is available on Implementation WIP projects.";
  }
}

export function isBillingOrRcmStaffingRole(role: string | null | undefined): boolean {
  const canonical = canonicalStaffingRole(role);
  return (
    canonical === "T1_BILLING_SUPPORT" ||
    canonical === "T2_BILLING_SUPPORT" ||
    canonical === "RCM_IMPLEMENTATION_SPECIALIST" ||
    canonical === "RCM_MANAGER"
  );
}

/**
 * Map existing project members onto Add RCM role selects.
 * First member per canonical role wins. Empty when nobody on the roster
 * already holds that billing/RCM role — never invents a person.
 */
export function billingRcmAssignmentsFromMembers(
  members: Array<{ userId: string; role?: string | null }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const member of members) {
    if (!member.userId) continue;
    const canonical = canonicalStaffingRole(member.role);
    if (!canonical || !isBillingOrRcmStaffingRole(canonical)) continue;
    if (!out[canonical]) out[canonical] = member.userId;
  }
  return out;
}

/** Form values win when non-empty; otherwise keep existing billing/RCM members. */
export function mergeBillingRcmAssignments(
  existing: Record<string, string>,
  fromForm: Record<string, string>,
): Record<string, string> {
  const out = { ...existing };
  for (const [role, userId] of Object.entries(fromForm)) {
    if (userId) out[role] = userId;
  }
  return out;
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeOverlapTitle(a);
  const nb = normalizeOverlapTitle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function findRcmOverlapPeer(
  rcm: OverlapTask,
  existingTasks: OverlapTask[],
): OverlapTask | undefined {
  return existingTasks.find((ehr) => {
    if (ehr.notApplicable) return false;
    if (ehr.id === rcm.id) return false;
    if (ehr.workTrack === "RCM") return false;
    const rcmKey = connectedKeyOf(rcm);
    const ehrKey = connectedKeyOf(ehr);
    if (rcmKey && ehrKey && rcmKey === ehrKey) return true;
    if (rcmKey && ehrKey) return false;
    return titlesMatch(rcm.title, ehr.title);
  });
}

function isClosedStatus(status: string): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "DONE" || s === "CANCELLED";
}

/**
 * Which live task ids to mark DONE when attaching RCM.
 *
 * - `auto-complete` (Path 4 / Prism history): overlapping EHR *and* the new
 *   RCM copy are marked done (historical work already happened).
 * - `connect` (mid-WIP Add RCM): leave open EHR work open; only mark the RCM
 *   copy done when the EHR peer is already DONE/CANCELLED. Open pairs stay
 *   linked via connectKey so complete-in-one still reflects.
 */
export function rcmOverlapCompleteIds(
  existingTasks: OverlapTask[],
  newRcmTasks: OverlapTask[],
  mode: RcmOverlapMode,
): string[] {
  const ids = new Set<string>();
  for (const rcm of newRcmTasks) {
    const match = findRcmOverlapPeer(rcm, existingTasks);
    if (!match) continue;
    const peerDone = isClosedStatus(match.status);
    if (mode === "auto-complete") {
      if (!peerDone) ids.add(match.id);
      ids.add(rcm.id);
    } else if (peerDone) {
      ids.add(rcm.id);
    }
  }
  return [...ids];
}
