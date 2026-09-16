import { describe, expect, it } from "vitest";
import {
  BILLING_CONFIGURATION_PHASE,
  comparativeBillingPairs,
  connectKeyForTitle,
  connectedKeyOf,
  isBillingConfigurationPhase,
  isRcmMoveKey,
  rcmMoveKeys,
} from "@/lib/connected-tasks";
import { flattenSeedTasks } from "@/db/template-implementation";
import { EHR_PLAYBOOK, EHR_RCM_PLAYBOOK, RCM_PRISM_PLAYBOOK } from "@/db/template-playbooks";
import { dockDefaultPhaseVisibility } from "@/lib/dock-phase-visibility";

function walk(
  phases: typeof EHR_PLAYBOOK.phases,
): Array<{ phase: string; title: string; connectKey?: string; overlapKey?: string; workTrack?: string }> {
  const rows: Array<{
    phase: string;
    title: string;
    connectKey?: string;
    overlapKey?: string;
    workTrack?: string;
  }> = [];
  const rec = (
    phase: string,
    t: (typeof EHR_PLAYBOOK.phases)[number]["tasks"][number],
  ) => {
    rows.push({
      phase,
      title: t.title,
      connectKey: t.connectKey,
      overlapKey: t.overlapKey,
      workTrack: t.workTrack,
    });
    for (const child of t.children ?? []) rec(phase, child);
  };
  for (const p of phases) {
    for (const t of p.tasks) rec(p.name, t);
  }
  return rows;
}

describe("connected billing / RCM catalog", () => {
  it("maps Discovery and Configuration billing titles to shared keys", () => {
    expect(connectKeyForTitle("Billing Questionnaire")).toBe("billing_questionnaire");
    expect(connectKeyForTitle("Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers")).toBe(
      "billing_spreadsheet",
    );
    expect(connectKeyForTitle("Payer Setup")).toBe("payer_setup");
    expect(connectKeyForTitle("Payer setup and validation")).toBe("payer_setup");
    expect(connectKeyForTitle("ClaimMD Enrollment")).toBe("claimmd_enrollment");
    expect(connectKeyForTitle("Billing workflow walkthrough")).toBe("billing_workflow_discovery");
    expect(connectedKeyOf({ title: "Billing Questionnaire" })).toBe("billing_questionnaire");
    expect(connectedKeyOf({ connectKey: "custom", title: "Billing Questionnaire" })).toBe("custom");
    expect(isRcmMoveKey("payer_setup")).toBe(true);
    expect(isRcmMoveKey("billing_questionnaire")).toBe(false);
    expect(rcmMoveKeys().sort()).toEqual(
      ["billing_workflow_discovery", "claimmd_enrollment", "payer_setup"].sort(),
    );
  });

  it("lists comparative Billing vs Discovery+Configuration pairs", () => {
    const pairs = comparativeBillingPairs();
    expect(pairs.some((p) => p.key === "billing_questionnaire")).toBe(true);
    expect(pairs.some((p) => p.key === "payer_setup")).toBe(true);
    expect(pairs.some((p) => p.key === "claimmd_enrollment")).toBe(false);
    expect(isBillingConfigurationPhase(BILLING_CONFIGURATION_PHASE)).toBe(true);
    expect(dockDefaultPhaseVisibility(BILLING_CONFIGURATION_PHASE)).toBe("INTERNAL");
  });
});

describe("EHR playbook Billing Configuration team area", () => {
  it("seeds a Billing Configuration tab with connected Discovery and Config copies", () => {
    const billing = EHR_PLAYBOOK.phases.find((p) => p.name === BILLING_CONFIGURATION_PHASE);
    expect(billing).toBeTruthy();
    expect(billing?.isOptional).toBe(false);
    expect(billing?.areaKey).toBe("billing_configuration");
    expect(billing?.visibility).toBe("INTERNAL");

    const rows = walk(EHR_PLAYBOOK.phases);
    const byKey = (key: string) => rows.filter((r) => r.connectKey === key);
    expect(byKey("billing_questionnaire").map((r) => r.phase).sort()).toEqual(
      ["Billing Configuration", "Discovery"].sort(),
    );
    expect(byKey("billing_spreadsheet").map((r) => r.phase).sort()).toEqual(
      ["Billing Configuration", "Discovery"].sort(),
    );
    expect(byKey("payer_setup").map((r) => r.phase).sort()).toEqual(
      ["Billing Configuration", "Site Configuration"].sort(),
    );
    expect(byKey("billing_code_setup").map((r) => r.phase).sort()).toEqual(
      ["Billing Configuration", "Site Configuration"].sort(),
    );
    expect(rows.some((r) => r.title === 'Expose the "Billing Configuration" tab')).toBe(true);

    const billingTasks = rows.filter((r) => r.phase === BILLING_CONFIGURATION_PHASE);
    expect(billingTasks.every((r) => r.connectKey)).toBe(true);
    expect(
      billingTasks.find((r) => r.title === "Billing Questionnaire")?.workTrack,
    ).toBe("EHR");
  });

  it("keeps ClaimMD on the Billing training tab (connected to RCM, not copied into Billing Configuration)", () => {
    const rows = walk(EHR_PLAYBOOK.phases);
    const claim = rows.filter((r) => r.connectKey === "claimmd_enrollment");
    expect(claim.map((r) => r.phase)).toEqual(["Billing"]);
    expect(flattenSeedTasks(EHR_PLAYBOOK.phases).some((r) => r.title === "ClaimMD Enrollment")).toBe(
      true,
    );
  });
});

describe("EHR+RCM playbook moves overlapping work onto the RCM tab", () => {
  it("drops EHR payer / ClaimMD / workflow duplicates and keeps the RCM rows", () => {
    const rows = walk(EHR_RCM_PLAYBOOK.phases);
    const claim = rows.filter((r) => r.connectKey === "claimmd_enrollment");
    expect(claim.length).toBeGreaterThan(0);
    expect(claim.every((r) => r.phase === "Payer & Enrollment" || r.workTrack === "RCM")).toBe(true);
    expect(claim.some((r) => r.phase === "Billing")).toBe(false);

    const payer = rows.filter((r) => r.connectKey === "payer_setup");
    expect(payer.every((r) => r.workTrack === "RCM" || /payer/i.test(r.phase))).toBe(true);
    expect(payer.some((r) => r.phase === "Site Configuration")).toBe(false);
    expect(payer.some((r) => r.phase === BILLING_CONFIGURATION_PHASE)).toBe(false);

    const workflow = rows.filter((r) => r.connectKey === "billing_workflow_discovery");
    expect(workflow.some((r) => r.phase === "Workflow & Handoff")).toBe(true);
    expect(workflow.some((r) => r.phase === "Site Configuration")).toBe(false);

    expect(rows.some((r) => r.phase === BILLING_CONFIGURATION_PHASE && r.connectKey === "billing_questionnaire")).toBe(
      true,
    );
  });

  it("keeps RCM-only playbook tasks on RCM tabs", () => {
    const rows = walk(RCM_PRISM_PLAYBOOK.phases);
    expect(rows.every((r) => r.workTrack === "RCM")).toBe(true);
    expect(rows.some((r) => r.connectKey === "claimmd_enrollment" && r.phase === "Payer & Enrollment")).toBe(
      true,
    );
    expect(rows.some((r) => r.phase === BILLING_CONFIGURATION_PHASE)).toBe(false);
  });
});
