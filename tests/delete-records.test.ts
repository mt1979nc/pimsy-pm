import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { canDeletePortfolioRecords, canCreateProjects } from "@/lib/authz";
import {
  confirmationMatches,
  planCustomerDelete,
  planProjectDelete,
  staffUsersBlockingCustomerDelete,
} from "@/lib/delete-records";

const owner = { role: "OWNER" as const };
const admin = { role: "ADMIN" as const };
const manager = { role: "MANAGER" as const };
const specialist = { role: "SPECIALIST" as const };
const customer = { role: "CUSTOMER" as const };

describe("delete authz", () => {
  it("matches create-project: OWNER, ADMIN, and MANAGER may hard-delete", () => {
    expect(canDeletePortfolioRecords(owner)).toBe(true);
    expect(canDeletePortfolioRecords(admin)).toBe(true);
    expect(canDeletePortfolioRecords(manager)).toBe(true);
    expect(canDeletePortfolioRecords(specialist)).toBe(false);
    expect(canDeletePortfolioRecords(customer)).toBe(false);
    expect(canDeletePortfolioRecords(owner)).toBe(canCreateProjects(owner));
    expect(canDeletePortfolioRecords(manager)).toBe(canCreateProjects(manager));
  });
});

describe("typed confirmation", () => {
  it("accepts acronym, code, or name, case-insensitive", () => {
    expect(confirmationMatches("CEDAR", ["Cedar Health", "IMP-0042", "CEDAR"])).toBe(true);
    expect(confirmationMatches("  cedar health ", ["Cedar Health", "IMP-0042"])).toBe(true);
    expect(confirmationMatches("imp-0042", ["Cedar Health", "IMP-0042"])).toBe(true);
    expect(confirmationMatches("wrong", ["CEDAR", "IMP-0042"])).toBe(false);
    expect(confirmationMatches("", ["CEDAR"])).toBe(false);
  });
});

describe("planProjectDelete", () => {
  it("rejects specialists even with a matching token", () => {
    const result = planProjectDelete({
      actor: specialist,
      confirmation: "CEDAR",
      name: "CEDAR Health",
      code: "IMP-0042",
      acronym: "CEDAR",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/owners, admins, and managers/i);
  });

  it("allows a manager who types the acronym", () => {
    const result = planProjectDelete({
      actor: manager,
      confirmation: "CEDAR",
      name: "CEDAR Health",
      code: "IMP-0042",
      acronym: "CEDAR",
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("planCustomerDelete", () => {
  const base = {
    actor: owner,
    confirmation: "Harbor Clinic",
    name: "Harbor Clinic",
    slug: "harbor-clinic",
    projectCount: 0,
    cascadeProjects: false,
    linkedUsers: [{ id: "c1", email: "contact@harbor.example.com", role: "CUSTOMER" }],
  };

  it("blocks when a staff user is linked to the account", () => {
    const result = planCustomerDelete({
      ...base,
      linkedUsers: [
        { id: "c1", email: "contact@harbor.example.com", role: "CUSTOMER" },
        { id: "s1", email: "morgan@pimsyehr.com", role: "SPECIALIST" },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/staff/i);
  });

  it("blocks protected named staff even if role were CUSTOMER", () => {
    const blockers = staffUsersBlockingCustomerDelete([
      { id: "am", email: "alexander@pimsyehr.com", role: "CUSTOMER" },
    ]);
    expect(blockers).toHaveLength(1);
    const result = planCustomerDelete({
      ...base,
      linkedUsers: [{ id: "am", email: "alexander@pimsyehr.com", role: "CUSTOMER" }],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses leftover projects unless cascade is checked", () => {
    const without = planCustomerDelete({ ...base, projectCount: 2, cascadeProjects: false });
    expect(without.ok).toBe(false);
    if (!without.ok) expect(without.error).toMatch(/Also delete projects/);
    const withCascade = planCustomerDelete({ ...base, projectCount: 2, cascadeProjects: true });
    expect(withCascade).toEqual({ ok: true });
  });

  it("allows an empty-roster customer when the name is typed", () => {
    expect(planCustomerDelete(base)).toEqual({ ok: true });
  });
});

describe("FK cascade contract (schema SQL)", () => {
  it("deleting a project cascades tasks, threads, slips, and memberships", () => {
    const init = readFileSync(resolve(process.cwd(), "drizzle/0000_init.sql"), "utf8");
    const prism = readFileSync(resolve(process.cwd(), "drizzle/0002_prism_merge.sql"), "utf8");
    const blob = `${init}\n${prism}`;
    const required = [
      "task_project_id_project_id_fk",
      "phase_project_id_project_id_fk",
      "message_thread_project_id_project_id_fk",
      "project_member_project_id_project_id_fk",
      "slip_event_project_id_project_id_fk",
      "project_scope_project_id_project_id_fk",
      "file_asset_project_id_project_id_fk",
      "status_update_project_id_project_id_fk",
      "risk_project_id_project_id_fk",
      "time_entry_project_id_project_id_fk",
    ];
    for (const name of required) {
      expect(blob).toMatch(new RegExp(`${name}[\\s\\S]{0,200}ON DELETE cascade`, "i"));
    }
  });

  it("deleting a customer cascades its projects and portal contacts, not staff by default", () => {
    const init = readFileSync(resolve(process.cwd(), "drizzle/0000_init.sql"), "utf8");
    expect(init).toMatch(
      /project_customer_account_id_customer_account_id_fk[\s\S]{0,200}ON DELETE cascade/i,
    );
    expect(init).toMatch(
      /user_customer_account_id_customer_account_id_fk[\s\S]{0,200}ON DELETE cascade/i,
    );
  });
});
