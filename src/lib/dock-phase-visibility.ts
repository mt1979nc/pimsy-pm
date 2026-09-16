/**
 * Dock eyelid / “expose when ready” defaults.
 *
 * On workspace create, customers see Kickoff + Discovery (and RCM kickoff /
 * intake). Configuration, Accessing Pimsy, Training, Billing, and later
 * areas stay hidden until a specialist exposes that tab — same SHARED vs
 * INTERNAL column the portal already filters on. Do not invent a second flag.
 *
 * Client-safe: no Postgres, rollup, or library server imports.
 */

export const DOCK_EXPOSED_ON_CREATE_PHASES = [
  "Kickoff",
  "Discovery",
  "RCM Kickoff",
  "Plan overview",
  "Payer & Enrollment",
] as const;

const EXPOSED = new Set(DOCK_EXPOSED_ON_CREATE_PHASES.map((n) => n.toLowerCase()));

function norm(name: string): string {
  return name.trim().toLowerCase();
}

/** Playbook / live-phase visibility copied onto new workspaces. */
export function dockDefaultPhaseVisibility(phaseName: string): "INTERNAL" | "SHARED" {
  return EXPOSED.has(norm(phaseName)) ? "SHARED" : "INTERNAL";
}

export function isDockExposedOnCreatePhase(phaseName: string): boolean {
  return dockDefaultPhaseVisibility(phaseName) === "SHARED";
}

/**
 * Completing a Dock “Expose … tab” reminder should flip that live phase to
 * SHARED. Parking Lot is a task, not a tab.
 */
export function phaseNameToExposeFromTaskTitle(title: string): string | null {
  const t = title.trim().toLowerCase();
  if (!/\bexpose\b/.test(t)) return null;
  if (/parking lot/.test(t)) return null;
  if (/configuration/.test(t) && !/billing configuration/.test(t)) return "Site Configuration";
  if (/billing configuration/.test(t)) return "Billing Configuration";
  if (/\baccess(ing)?\b/.test(t)) return "Accessing Pimsy";
  if (/training/.test(t)) return "Core (Train the Trainer)";
  return null;
}

export function phaseMatchesExposeTarget(phaseName: string, target: string): boolean {
  const a = norm(phaseName);
  const b = norm(target);
  if (a === b) return true;
  if (b === "site configuration") {
    if (a.includes("billing configuration")) return false;
    return a === "configuration" || a.includes("configuration");
  }
  if (b === "billing configuration") {
    return a === "billing configuration" || a.includes("billing configuration");
  }
  if (b === "accessing pimsy") {
    return a === "access" || a.includes("accessing") || a === "accessing pimsy";
  }
  if (b.includes("train")) {
    return a.includes("train") && !a.includes("end-user");
  }
  return false;
}

/** A customer-visible area tab (portal + staff Customer view). */
export function isCustomerVisiblePhase(phase: {
  visibility?: string | null;
  notApplicable?: boolean | null;
} | null | undefined): boolean {
  if (!phase) return true;
  if (phase.notApplicable) return false;
  return phase.visibility === "SHARED";
}
