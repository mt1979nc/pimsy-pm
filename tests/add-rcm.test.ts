import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ADD_RCM_ROLES,
  RCM_TRACK_ALREADY_ON,
  addRcmBlockedMessage,
  addRcmEligibility,
  addRcmHashShouldExpand,
  addRcmPanelView,
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
    expect(projectHasRcmTrack({ playbookPath: "EHR_RCM" })).toBe(true);
    expect(projectHasRcmTrack({ playbookPath: "RCM_LEGACY" })).toBe(true);
    expect(
      addRcmEligibility({ playbookPath: "EHR_RCM", rcmTaskCountTotal: 0, status: "IN_PROGRESS" }),
    ).toEqual({ ok: false, reason: "already-on" });
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

  it("hides the RCM fields panel until Add RCM is clicked", () => {
    expect(addRcmPanelView({ eligible: true, alreadyOn: false, expanded: false })).toBe("trigger");
    expect(addRcmPanelView({ eligible: true, alreadyOn: false, expanded: true })).toBe("form");
    expect(addRcmPanelView({ eligible: false, alreadyOn: true, expanded: false })).toBe("summary");
    expect(addRcmPanelView({ eligible: false, alreadyOn: true, expanded: true })).toBe("summary");
    expect(addRcmPanelView({ eligible: false, alreadyOn: false, expanded: true })).toBe("hidden");
    expect(addRcmHashShouldExpand("#add-rcm", false)).toBe(true);
    expect(addRcmHashShouldExpand("add-rcm", false)).toBe(true);
    expect(addRcmHashShouldExpand("#add-rcm", true)).toBe(false);
    expect(addRcmHashShouldExpand("", false)).toBe(false);
  });

  it("keeps the Tasks and Settings RCM form behind Add RCM", () => {
    const tasks = readFileSync(resolve(process.cwd(), "src/components/project-task-list.tsx"), "utf8");
    const settings = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/settings/page.tsx"),
      "utf8",
    );
    const form = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/settings/add-rcm-track-form.tsx"),
      "utf8",
    );
    expect(tasks).toMatch(/rcmView === "form" && addRcm/);
    expect(tasks).toMatch(/"Add RCM"/);
    expect(tasks).not.toMatch(/href="#add-rcm"/);
    expect(settings).toMatch(/<AddRcmPanel/);
    expect(settings).not.toMatch(/AddRcmAlreadyOnNote/);
    expect(form).toMatch(/AddRcmOnSummary/);
    expect(form).toMatch(/view === "trigger"/);
  });

  it("shows an RCM chip on the Projects list and About when the track is on", () => {
    const list = readFileSync(resolve(process.cwd(), "src/components/project-row.tsx"), "utf8");
    const about = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/about/page.tsx"),
      "utf8",
    );
    const kickoff = readFileSync(resolve(process.cwd(), "src/components/about-kickoff-panel.tsx"), "utf8");
    const layout = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/layout.tsx"),
      "utf8",
    );
    expect(list).toMatch(/projectHasRcmTrack/);
    expect(list).toMatch(/Badge tone="violet">RCM/);
    expect(about).toMatch(/projectHasRcmTrack/);
    expect(about).toMatch(/hasRcm=/);
    expect(kickoff).toMatch(/hasRcm/);
    expect(kickoff).toMatch(/Badge tone="violet">On/);
    expect(layout).toMatch(/projectHasRcmTrack/);
    expect(layout).toMatch(/Badge tone="violet">RCM/);
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
