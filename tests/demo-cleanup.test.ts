import { describe, expect, it } from "vitest";
import {
  classifyCustomer,
  classifyProject,
  classifyUser,
  isFixtureExampleEmail,
  isGrokFixture,
  isProtectedStaffEmail,
  isProtectedWipAcronym,
  projectTouchesProtectedWip,
  redactDatabaseUrl,
} from "@/lib/demo-entities";
import { isNavLinkActive } from "@/lib/nav";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("nav active matching", () => {
  it("does not treat /reports/waiting-on as the Portfolio item", () => {
    expect(isNavLinkActive("/reports", "/reports", true)).toBe(true);
    expect(isNavLinkActive("/reports/waiting-on", "/reports", true)).toBe(false);
    expect(isNavLinkActive("/reports/waiting-on", "/reports/waiting-on")).toBe(true);
    expect(isNavLinkActive("/reports/capacity", "/reports", true)).toBe(false);
  });

  it("still prefixes nested routes when exact is off", () => {
    expect(isNavLinkActive("/management/forecast", "/management")).toBe(true);
  });
});

describe("Portfolio vs Waiting-on pages", () => {
  it("keeps distinct titles so the Leadership tabs cannot collapse into one view", () => {
    const portfolio = readFileSync(resolve(process.cwd(), "src/app/(app)/reports/page.tsx"), "utf8");
    const waiting = readFileSync(
      resolve(process.cwd(), "src/app/(app)/reports/waiting-on/page.tsx"),
      "utf8",
    );
    expect(portfolio).toMatch(/title: "Portfolio"/);
    expect(waiting).toMatch(/title: "Waiting on"/);
    expect(portfolio).not.toMatch(/WaitingOnReportPage/);
    expect(waiting).toMatch(/WaitingOnReportPage/);
  });
});

describe("demo cleanup classifiers", () => {
  it("deletes known Nathan demo projects and GROK fixtures", () => {
    expect(
      classifyProject({
        id: "1",
        code: "IMP-9001",
        name: "Riverbend Counseling Group — PIMSY implementation",
        customerSlug: "riverbend-counseling",
        customerName: "Riverbend Counseling Group",
      }),
    ).toBe("delete");
    expect(
      classifyProject({
        id: "2",
        code: "IMP-0004",
        name: "GROK E2E Test LLC",
        crmAcronym: "GROKTEST",
        customerName: "GROK E2E Test LLC",
      }),
    ).toBe("delete");
    expect(
      isGrokFixture({
        code: "GROK",
        name: "GROK E2E Test LLC",
        crmAcronym: "GROK",
        customerName: "GROK E2E Test LLC",
      }),
    ).toBe(true);
  });

  it("never deletes real imported WIP including CEDAR vs Cedar Hollow", () => {
    expect(isProtectedWipAcronym("CEDAR")).toBe(true);
    expect(
      classifyProject({
        id: "cedar",
        code: "CEDAR",
        name: "CEDAR Health",
        crmAcronym: "CEDAR",
        prismClientId: "CEDAR",
        customerName: "CEDAR Health",
      }),
    ).toBe("protect");
    expect(
      projectTouchesProtectedWip({
        id: "x",
        code: "IMP-9001",
        name: "oops",
        crmAcronym: "CEDAR",
      }),
    ).toBe(true);
    expect(
      classifyProject({
        id: "x",
        code: "IMP-9001",
        name: "oops",
        crmAcronym: "CEDAR",
      }),
    ).toBe("protect");
    expect(
      classifyProject({
        id: "hollow",
        code: "IMP-9003",
        name: "Cedar Hollow Family Health — PIMSY implementation",
        customerSlug: "cedar-hollow",
        customerName: "Cedar Hollow Family Health",
      }),
    ).toBe("delete");
  });

  it("protects named staff and deletes demo / @example.com users", () => {
    expect(isProtectedStaffEmail("alexander@pimsyehr.com")).toBe(true);
    expect(isProtectedStaffEmail("jeremy@pimsyehr.com")).toBe(true);
    expect(isProtectedStaffEmail("danielle@pimsyehr.com")).toBe(true);
    expect(isProtectedStaffEmail("morgan@pimsyehr.com")).toBe(true);
    expect(isProtectedStaffEmail("mindy@pimsyehr.com")).toBe(true);
    expect(isProtectedStaffEmail("david@pimsyehr.com")).toBe(true);
    expect(isProtectedStaffEmail("anna@pimsyehr.com")).toBe(true);
    expect(isProtectedStaffEmail("kori@pimsyehr.com")).toBe(true);
    expect(classifyUser({ id: "a", email: "alexander@pimsyehr.com", name: "Alexander Morse" })).toBe(
      "protect",
    );
    expect(classifyUser({ id: "d", email: "demo.manager@pimsyehr.com", name: "Demo Manager" })).toBe(
      "delete",
    );
    expect(isFixtureExampleEmail("contact@riverbend-counseling.example.com")).toBe(true);
    expect(
      classifyUser({
        id: "c",
        email: "contact@riverbend-counseling.example.com",
        name: "Dana Whitfield",
      }),
    ).toBe("delete");
  });

  it("does not delete a demo-slug customer that still owns protected WIP", () => {
    expect(
      classifyCustomer(
        { id: "c", slug: "riverbend-counseling", name: "Riverbend Counseling Group" },
        ["protect"],
      ),
    ).toBe("protect");
    expect(
      classifyCustomer(
        { id: "c", slug: "riverbend-counseling", name: "Riverbend Counseling Group" },
        ["delete"],
      ),
    ).toBe("delete");
    expect(
      classifyCustomer(
        { id: "mixed", slug: "riverbend-counseling", name: "Riverbend Counseling Group" },
        ["delete", "keep"],
      ),
    ).toBe("keep");
  });

  it("redacts passwords from DATABASE_URL", () => {
    expect(
      redactDatabaseUrl("postgresql://pimsy:s3cret@myserver.postgres.database.azure.com:5432/pimsy?sslmode=require"),
    ).toBe("host=myserver.postgres.database.azure.com:5432 db=pimsy user=pimsy");
    expect(redactDatabaseUrl("not-a-url")).toMatch(/unparseable/);
  });
});
