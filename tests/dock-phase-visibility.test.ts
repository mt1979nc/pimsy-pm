import { describe, expect, it } from "vitest";
import { IMPLEMENTATION_PHASES, RCM_TEMPLATE } from "@/db/template-implementation";
import { EHR_PLAYBOOK, RCM_LEGACY_PLAYBOOK } from "@/db/template-playbooks";
import {
  dockDefaultPhaseVisibility,
  isCustomerVisiblePhase,
  isDockExposedOnCreatePhase,
  phaseMatchesExposeTarget,
  phaseNameToExposeFromTaskTitle,
} from "@/lib/dock-phase-visibility";

describe("Dock eyelid defaults", () => {
  it("exposes Kickoff and Discovery on create, hides Configuration / Accessing Pimsy / Training", () => {
    expect(dockDefaultPhaseVisibility("Kickoff")).toBe("SHARED");
    expect(dockDefaultPhaseVisibility("Discovery")).toBe("SHARED");
    expect(dockDefaultPhaseVisibility("Site Configuration")).toBe("INTERNAL");
    expect(dockDefaultPhaseVisibility("Accessing Pimsy")).toBe("INTERNAL");
    expect(dockDefaultPhaseVisibility("Core (Train the Trainer)")).toBe("INTERNAL");
    expect(dockDefaultPhaseVisibility("Billing")).toBe("INTERNAL");
    expect(dockDefaultPhaseVisibility("Billing Configuration")).toBe("INTERNAL");
    expect(dockDefaultPhaseVisibility("Go-Live Checklist")).toBe("INTERNAL");
    expect(isDockExposedOnCreatePhase("RCM Kickoff")).toBe(true);
    expect(isDockExposedOnCreatePhase("Payer & Enrollment")).toBe(true);
    expect(isDockExposedOnCreatePhase("Workflow & Handoff")).toBe(false);
  });

  it("seeds Implementation and RCM playbooks with those defaults", () => {
    const byName = Object.fromEntries(IMPLEMENTATION_PHASES.map((p) => [p.name, p.visibility]));
    expect(byName.Kickoff).toBe("SHARED");
    expect(byName.Discovery).toBe("SHARED");
    expect(byName["Accessing Pimsy"]).toBe("INTERNAL");
    expect(byName["Site Configuration"]).toBe("INTERNAL");
    expect(byName["Core (Train the Trainer)"]).toBe("INTERNAL");
    expect(IMPLEMENTATION_PHASES.some((p) => p.name === "Accessing Pimsy")).toBe(true);
    expect(IMPLEMENTATION_PHASES.some((p) => p.name === "Billing Configuration")).toBe(true);
    expect(IMPLEMENTATION_PHASES.find((p) => p.name === "Billing Configuration")?.visibility).toBe(
      "INTERNAL",
    );

    expect(RCM_TEMPLATE.phases.find((p) => p.name === "RCM Kickoff")?.visibility).toBe("SHARED");
    expect(RCM_TEMPLATE.phases.find((p) => p.name === "Workflow & Handoff")?.visibility).toBe("INTERNAL");

    expect(EHR_PLAYBOOK.phases.find((p) => p.name === "Site Configuration")?.visibility).toBe("INTERNAL");
    expect(RCM_LEGACY_PLAYBOOK.phases.find((p) => p.name === "Plan overview")?.visibility).toBe("SHARED");
  });

  it("maps Dock expose-tab reminder titles to live phases", () => {
    expect(phaseNameToExposeFromTaskTitle('Expose the "Configuration" tab')).toBe("Site Configuration");
    expect(phaseNameToExposeFromTaskTitle('Expose "Access" tab')).toBe("Accessing Pimsy");
    expect(phaseNameToExposeFromTaskTitle("Expose Training Tab for Booking")).toBe(
      "Core (Train the Trainer)",
    );
    expect(phaseNameToExposeFromTaskTitle('Expose the "Billing Configuration" tab')).toBe(
      "Billing Configuration",
    );
    expect(phaseNameToExposeFromTaskTitle("Expose Parking Lot")).toBeNull();
    expect(phaseMatchesExposeTarget("Site Configuration", "Site Configuration")).toBe(true);
    expect(phaseMatchesExposeTarget("Billing Configuration", "Site Configuration")).toBe(false);
    expect(phaseMatchesExposeTarget("Billing Configuration", "Billing Configuration")).toBe(true);
    expect(phaseMatchesExposeTarget("Configuration", "Site Configuration")).toBe(true);
    expect(phaseMatchesExposeTarget("Accessing Pimsy", "Accessing Pimsy")).toBe(true);
  });

  it("treats INTERNAL or N/A phases as hidden from the customer", () => {
    expect(isCustomerVisiblePhase({ visibility: "SHARED", notApplicable: false })).toBe(true);
    expect(isCustomerVisiblePhase({ visibility: "INTERNAL", notApplicable: false })).toBe(false);
    expect(isCustomerVisiblePhase({ visibility: "SHARED", notApplicable: true })).toBe(false);
    expect(isCustomerVisiblePhase(null)).toBe(true);
  });
});
