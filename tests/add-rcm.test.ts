import { describe, expect, it } from "vitest";
import {
  ADD_RCM_ROLES,
  RCM_TRACK_ALREADY_ON,
  addRcmBlockedMessage,
  addRcmEligibility,
  billingRcmAssignmentsFromMembers,
  findRcmOverlapPeer,
  isBillingOrRcmStaffingRole,
  isHandoffComplete,
  isHandoffPhaseName,
  mergeBillingRcmAssignments,
  projectHasRcmTrack,
  rcmOverlapCompleteIds,
} from "@/lib/add-rcm";

describe("Add RCM eligibility (mid-implementation)", () => {
  it("allows active Implementation WIP", () => {
    expect(
      addRcmEligibility({
        type: "IMPLEMENTATION",
        status: "IN_PROGRESS",
        playbookPath: "EHR",
        rcmTaskCountTotal: 0,
      }),
    ).toEqual({ ok: true });
    expect(addRcmEligibility({ status: "NOT_STARTED" })).toEqual({ ok: true });
    expect(addRcmEligibility({ status: "ON_HOLD" })).toEqual({ ok: true });
    expect(addRcmEligibility({ status: "BLOCKED" })).toEqual({ ok: true });
  });

  it("reports already-on without treating it as a hard failure reason for Path 4 throw copy", () => {
    expect(
      addRcmEligibility({ playbookPath: "RCM_PRISM", status: "IN_PROGRESS" }),
    ).toEqual({ ok: false, reason: "already-on" });
    expect(
      addRcmEligibility({ playbookPath: "EHR", rcmTaskCountTotal: 4, status: "IN_PROGRESS" }),
    ).toEqual({ ok: false, reason: "already-on" });
    expect(
      addRcmEligibility({ playbookPath: "EHR", hasRcmWorkTrack: true, status: "IN_PROGRESS" }),
    ).toEqual({ ok: false, reason: "already-on" });
    expect(addRcmBlockedMessage("already-on")).toBe(RCM_TRACK_ALREADY_ON);
    expect(projectHasRcmTrack({ playbookPath: "EHR", rcmTaskCountTotal: 0 })).toBe(false);
  });

  it("blocks Hand-off / COMPLETED / Onboarded / archived / cancelled / non-implementation", () => {
    expect(addRcmEligibility({ status: "COMPLETED" })).toEqual({ ok: false, reason: "completed" });
    expect(addRcmEligibility({ status: "CANCELLED" })).toEqual({ ok: false, reason: "cancelled" });
    expect(addRcmEligibility({ status: "IN_PROGRESS", onboarded: true })).toEqual({
      ok: false,
      reason: "onboarded",
    });
    expect(addRcmEligibility({ status: "IN_PROGRESS", archivedAt: new Date("2026-09-01") })).toEqual({
      ok: false,
      reason: "archived",
    });
    expect(addRcmEligibility({ status: "IN_PROGRESS", handoffComplete: true })).toEqual({
      ok: false,
      reason: "handoff",
    });
    expect(addRcmEligibility({ type: "SUPPORT", status: "IN_PROGRESS" })).toEqual({
      ok: false,
      reason: "not-implementation",
    });
    expect(addRcmBlockedMessage("handoff")).toMatch(/Hand-off/);
    expect(addRcmBlockedMessage("onboarded")).toMatch(/Onboarded/);
  });

  it("detects a finished Workflow & Handoff phase", () => {
    expect(isHandoffPhaseName("Workflow & Handoff")).toBe(true);
    expect(isHandoffPhaseName("Kickoff")).toBe(false);
    expect(
      isHandoffComplete([{ name: "Workflow & Handoff", status: "COMPLETED" }]),
    ).toBe(true);
    expect(
      isHandoffComplete([
        {
          name: "Workflow & Handoff",
          status: "IN_PROGRESS",
          tasks: [
            { status: "DONE" },
            { status: "TODO", notApplicable: true },
          ],
        },
      ]),
    ).toBe(true);
    expect(
      isHandoffComplete([
        {
          name: "Workflow & Handoff",
          status: "IN_PROGRESS",
          tasks: [{ status: "TODO" }, { status: "DONE" }],
        },
      ]),
    ).toBe(false);
    expect(isHandoffComplete([{ name: "Training", status: "COMPLETED" }])).toBe(false);
  });
});

describe("existing billing/RCM membership (do not invent people)", () => {
  it("preselects only members who already hold billing or RCM roles", () => {
    expect(ADD_RCM_ROLES).toContain("T1_BILLING_SUPPORT");
    expect(isBillingOrRcmStaffingRole("BILLING_SUPPORT")).toBe(true);
    expect(isBillingOrRcmStaffingRole("RCM")).toBe(true);
    expect(isBillingOrRcmStaffingRole("IMPLEMENTATION_SPECIALIST")).toBe(false);
    expect(isBillingOrRcmStaffingRole("LEAD")).toBe(false);

    const assigned = billingRcmAssignmentsFromMembers([
      { userId: "sam", role: "IMPLEMENTATION_SPECIALIST" },
      { userId: "anna", role: "T1_BILLING_SUPPORT" },
      { userId: "mindy", role: "RCM" },
      { userId: "other-bill", role: "BILLING_SUPPORT" },
    ]);
    expect(assigned).toEqual({
      T1_BILLING_SUPPORT: "anna",
      RCM_IMPLEMENTATION_SPECIALIST: "mindy",
    });
    expect(assigned.T2_BILLING_SUPPORT).toBeUndefined();
    expect(billingRcmAssignmentsFromMembers([])).toEqual({});
  });

  it("lets the form override an existing member without inventing empty roles", () => {
    expect(
      mergeBillingRcmAssignments(
        { T1_BILLING_SUPPORT: "anna" },
        { T1_BILLING_SUPPORT: "lee", RCM_IMPLEMENTATION_SPECIALIST: "mindy" },
      ),
    ).toEqual({
      T1_BILLING_SUPPORT: "lee",
      RCM_IMPLEMENTATION_SPECIALIST: "mindy",
    });
    expect(mergeBillingRcmAssignments({ T1_BILLING_SUPPORT: "anna" }, {})).toEqual({
      T1_BILLING_SUPPORT: "anna",
    });
  });
});

describe("RCM overlap: Path 4 auto-complete vs mid-WIP connect", () => {
  const ehrOpen = {
    id: "ehr-claimmd",
    title: "ClaimMD Enrollment",
    status: "TODO",
    overlapKey: "claimmd_enrollment",
    connectKey: "claimmd_enrollment",
    workTrack: "EHR",
  };
  const ehrDone = { ...ehrOpen, status: "DONE" };
  const billingOpen = {
    id: "bill-q",
    title: "Billing Questionnaire",
    status: "IN_PROGRESS",
    connectKey: "billing_questionnaire",
    overlapKey: "billing_questionnaire",
    workTrack: "EHR",
  };
  const rcmClaim = {
    id: "rcm-claimmd",
    title: "ClaimMD enrollment",
    status: "TODO",
    overlapKey: "claimmd_enrollment",
    connectKey: "claimmd_enrollment",
    workTrack: "RCM",
  };
  const rcmBilling = {
    id: "rcm-q",
    title: "Billing Questionnaire",
    status: "TODO",
    connectKey: "billing_questionnaire",
    overlapKey: "billing_questionnaire",
    workTrack: "RCM",
  };

  it("matches connected keys across Billing / Discovery / RCM titles", () => {
    expect(findRcmOverlapPeer(rcmClaim, [ehrOpen, billingOpen])?.id).toBe("ehr-claimmd");
    expect(findRcmOverlapPeer(rcmBilling, [ehrOpen, billingOpen])?.id).toBe("bill-q");
    expect(findRcmOverlapPeer(rcmClaim, [{ ...ehrOpen, notApplicable: true }])).toBeUndefined();
  });

  it("Path 4 auto-completes both still-open overlapping sides", () => {
    expect(rcmOverlapCompleteIds([ehrOpen, billingOpen], [rcmClaim, rcmBilling], "auto-complete").sort()).toEqual(
      ["bill-q", "ehr-claimmd", "rcm-claimmd", "rcm-q"].sort(),
    );
  });

  it("mid-WIP connect leaves open overlap open (connected, not duplicated-done)", () => {
    expect(rcmOverlapCompleteIds([ehrOpen, billingOpen], [rcmClaim, rcmBilling], "connect")).toEqual([]);
  });

  it("mid-WIP connect marks only the RCM copy done when the EHR peer is already done", () => {
    expect(rcmOverlapCompleteIds([ehrDone, billingOpen], [rcmClaim, rcmBilling], "connect")).toEqual([
      "rcm-claimmd",
    ]);
  });
});
