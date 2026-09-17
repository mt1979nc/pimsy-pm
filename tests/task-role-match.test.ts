import { describe, expect, it } from "vitest";
import {
  autoAssignKindForRole,
  customerMayChangeAssignee,
  defaultRoleMatchesMemberRole,
  isBillingRelatedTask,
  taskMatchesAutoAssign,
  userIdsForNewTask,
} from "@/lib/task-role-match";

describe("billing vs specialist vs customer matching", () => {
  it("treats playbook defaultRole T1/T2 as billing-related", () => {
    expect(
      isBillingRelatedTask({
        title: "Kickoff call",
        ownerSide: "INTERNAL",
        defaultRole: "T1_BILLING_SUPPORT",
      }),
    ).toBe(true);
    expect(
      isBillingRelatedTask({
        title: "Post go-live billing check",
        ownerSide: "INTERNAL",
        defaultRole: "T2_BILLING_SUPPORT",
      }),
    ).toBe(true);
  });

  it("uses Billing phase, title, and overlapKey from the Dock playbook", () => {
    expect(
      isBillingRelatedTask(
        { title: "User Setup", ownerSide: "INTERNAL" },
        "Billing",
      ),
    ).toBe(true);
    expect(
      isBillingRelatedTask({
        title: "Billing Questionnaire",
        ownerSide: "CUSTOMER",
      }),
    ).toBe(true);
    expect(
      isBillingRelatedTask({
        title: "Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers",
        ownerSide: "CUSTOMER",
        overlapKey: "billing_spreadsheet",
      }),
    ).toBe(true);
    expect(
      isBillingRelatedTask({
        title: "Organization Details Form",
        ownerSide: "CUSTOMER",
      }),
    ).toBe(false);
    expect(
      isBillingRelatedTask({
        title: "Schedule Kickoff",
        ownerSide: "INTERNAL",
        defaultRole: "IMPLEMENTATION_SPECIALIST",
      }),
    ).toBe(false);
  });

  it("maps project roles to auto-assign kinds", () => {
    expect(autoAssignKindForRole("LEAD")).toBe("STAFF_ALL");
    expect(autoAssignKindForRole("IMPLEMENTATION_SPECIALIST")).toBe("STAFF_ALL");
    expect(autoAssignKindForRole("SPECIALIST")).toBe("STAFF_ALL");
    expect(autoAssignKindForRole("T1_BILLING_SUPPORT")).toBe("STAFF_BILLING");
    expect(autoAssignKindForRole("BILLING_SUPPORT")).toBe("STAFF_BILLING");
    expect(autoAssignKindForRole("CUSTOMER_PROJECT_LEAD")).toBe("CUSTOMER_ALL");
    expect(autoAssignKindForRole("CUSTOMER_BILLING")).toBe("CUSTOMER_BILLING");
    expect(autoAssignKindForRole("CUSTOMER_CONTACT")).toBeNull();
    expect(autoAssignKindForRole("CONTRIBUTOR")).toBeNull();
  });

  it("splits staff-all vs billing vs customer billing", () => {
    const kickoff = { title: "Schedule Kickoff", ownerSide: "INTERNAL" as const };
    const claimmd = {
      title: "ClaimMD Enrollment",
      ownerSide: "INTERNAL" as const,
      defaultRole: "T1_BILLING_SUPPORT",
    };
    const logos = { title: "Upload Company Logo(s)", ownerSide: "CUSTOMER" as const };
    const billingQ = { title: "Billing Questionnaire", ownerSide: "CUSTOMER" as const };

    expect(taskMatchesAutoAssign(kickoff, "Kickoff", "STAFF_ALL")).toBe(true);
    expect(taskMatchesAutoAssign(claimmd, "Billing", "STAFF_ALL")).toBe(true);
    expect(taskMatchesAutoAssign(kickoff, "Kickoff", "STAFF_BILLING")).toBe(false);
    expect(taskMatchesAutoAssign(claimmd, "Billing", "STAFF_BILLING")).toBe(true);
    expect(taskMatchesAutoAssign(logos, "Discovery", "CUSTOMER_ALL")).toBe(true);
    expect(taskMatchesAutoAssign(billingQ, "Discovery", "CUSTOMER_ALL")).toBe(true);
    expect(taskMatchesAutoAssign(logos, "Discovery", "CUSTOMER_BILLING")).toBe(false);
    expect(taskMatchesAutoAssign(billingQ, "Discovery", "CUSTOMER_BILLING")).toBe(true);
    expect(taskMatchesAutoAssign(billingQ, "Discovery", "STAFF_BILLING")).toBe(true);
    expect(taskMatchesAutoAssign(logos, "Discovery", "STAFF_BILLING")).toBe(false);
    expect(taskMatchesAutoAssign(kickoff, "Kickoff", "CUSTOMER_ALL")).toBe(false);
  });

  it("adds specialist to every internal task and billing support on billing rows", () => {
    const ids = userIdsForNewTask(
      {
        title: "ClaimMD Enrollment",
        ownerSide: "INTERNAL",
        defaultRole: "T1_BILLING_SUPPORT",
      },
      "Billing",
      {
        specialistId: "sam",
        billingSupportId: "anna",
        defaultRoleAssigneeId: "anna",
      },
    );
    expect(ids).toEqual(["sam", "anna"]);
  });

  it("keeps the customer lead on billing tasks when a billing contact is also named (additive)", () => {
    const billing = userIdsForNewTask(
      { title: "Billing Questionnaire", ownerSide: "CUSTOMER" },
      "Discovery",
      { customerLeadId: "pat", customerBillingId: "lee", billingSupportId: "anna" },
    );
    expect(billing).toEqual(["pat", "lee", "anna"]);
    const logos = userIdsForNewTask(
      { title: "Upload Company Logo(s)", ownerSide: "CUSTOMER" },
      "Discovery",
      { customerLeadId: "pat", customerBillingId: "lee" },
    );
    expect(logos).toEqual(["pat"]);
  });

  it("resolves a customer task's template defaultRole when the lead was not also named", () => {
    expect(
      userIdsForNewTask(
        {
          title: "Upload Company Logo(s)",
          ownerSide: "CUSTOMER",
          defaultRole: "CUSTOMER_PROJECT_LEAD",
        },
        "Discovery",
        { defaultRoleAssigneeId: "pat" },
      ),
    ).toEqual(["pat"]);
    expect(
      userIdsForNewTask(
        {
          title: "Upload Company Logo(s)",
          ownerSide: "CUSTOMER",
          defaultRole: "CUSTOMER_PROJECT_LEAD",
        },
        "Discovery",
        {},
      ),
    ).toEqual([]);
  });

  it("matches template defaultRole to the project member role, including aliases", () => {
    expect(defaultRoleMatchesMemberRole("RCM_IMPLEMENTATION_SPECIALIST", "RCM")).toBe(true);
    expect(defaultRoleMatchesMemberRole("T1_BILLING_SUPPORT", "BILLING_SUPPORT")).toBe(true);
    expect(defaultRoleMatchesMemberRole("CUSTOMER_PROJECT_LEAD", "CUSTOMER_PROJECT_LEAD")).toBe(true);
    expect(defaultRoleMatchesMemberRole("IMPLEMENTATION_SPECIALIST", "RCM_MANAGER")).toBe(false);
    expect(defaultRoleMatchesMemberRole(null, "IMPLEMENTATION_SPECIALIST")).toBe(false);
  });

  it("lets customers reassign among their project team only", () => {
    expect(
      customerMayChangeAssignee({
        taskOwnerSide: "CUSTOMER",
        taskVisibility: "SHARED",
        targetRole: "CUSTOMER",
        actorAccountId: "acct",
        targetAccountId: "acct",
        targetIsProjectMember: true,
      }).ok,
    ).toBe(true);
    expect(
      customerMayChangeAssignee({
        taskOwnerSide: "INTERNAL",
        taskVisibility: "INTERNAL",
        targetRole: "CUSTOMER",
        actorAccountId: "acct",
        targetAccountId: "acct",
        targetIsProjectMember: true,
      }).ok,
    ).toBe(false);
    expect(
      customerMayChangeAssignee({
        taskOwnerSide: "CUSTOMER",
        taskVisibility: "SHARED",
        targetRole: "SPECIALIST",
        actorAccountId: "acct",
        targetAccountId: null,
        targetIsProjectMember: true,
        removingStaff: true,
      }).ok,
    ).toBe(false);
    expect(
      customerMayChangeAssignee({
        taskOwnerSide: "CUSTOMER",
        taskVisibility: "SHARED",
        targetRole: "CUSTOMER",
        actorAccountId: "acct",
        targetAccountId: "other",
        targetIsProjectMember: true,
      }).ok,
    ).toBe(false);
  });
});
