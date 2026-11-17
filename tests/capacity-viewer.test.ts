import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { canManagePrismCapacity, canSeePortfolio, isStaff } from "@/lib/authz";
import {
  CAPACITY_VIEWER_HOME,
  CAPACITY_VIEWER_ROLE,
  assertCapacityViewerCannotMutate,
  capacityViewerApiForbidden,
  capacityViewerCanMutate,
  capacityViewerRouteDecision,
  isCapacityViewerRole,
} from "@/lib/capacity-viewer";
import { staffHomeHref } from "@/lib/day-to-day";
import { staffSidebarSections } from "@/lib/staff-sidebar";
import { ADDABLE_STAFF_ROLES, ASSIGNABLE_STAFF_ROLES, parseNewTeamMember } from "@/lib/team-member";

const originalArchive = process.env.PATH_ARCHIVED_MODULES;
const originalDay = process.env.PATH_DAY_TO_DAY;

afterEach(() => {
  if (originalArchive === undefined) delete process.env.PATH_ARCHIVED_MODULES;
  else process.env.PATH_ARCHIVED_MODULES = originalArchive;
  if (originalDay === undefined) delete process.env.PATH_DAY_TO_DAY;
  else process.env.PATH_DAY_TO_DAY = originalDay;
});

describe("capacity viewer route guard", () => {
  it("lands on Team capacity and stays off every other page", () => {
    delete process.env.PATH_ARCHIVED_MODULES;
    delete process.env.PATH_DAY_TO_DAY;
    expect(staffHomeHref(CAPACITY_VIEWER_ROLE)).toBe(CAPACITY_VIEWER_HOME);
    expect(capacityViewerRouteDecision("/management/capacity")).toBe("allow");
    expect(capacityViewerRouteDecision("/change-password")).toBe("allow");
    expect(capacityViewerRouteDecision("/signin")).toBe("allow");
    expect(capacityViewerRouteDecision("/api/auth/session")).toBe("allow");

    for (const path of [
      "/management",
      "/management/forecast",
      "/management/engagements/new",
      "/management/team",
      "/management/analysis",
      "/settings",
      "/projects/everwood",
      "/admin/users",
      "/",
    ]) {
      expect(capacityViewerRouteDecision(path)).toBe("redirect");
    }

    process.env.PATH_ARCHIVED_MODULES = "1";
    process.env.PATH_DAY_TO_DAY = "1";
    expect(staffHomeHref(CAPACITY_VIEWER_ROLE)).toBe(CAPACITY_VIEWER_HOME);
  });

  it("shows only Team capacity in the sidebar", () => {
    const sections = staffSidebarSections({
      unread: 4,
      showPortfolio: false,
      showTemplates: false,
      showDayToDay: false,
      showArchivedModules: false,
      capacityViewer: true,
    });
    expect(sections).toEqual([
      {
        id: "analytics",
        label: "Data analytics",
        items: [{ href: "/management/capacity", label: "Team capacity", exact: true }],
      },
    ]);
  });

  it("is staff and cannot see or edit the portfolio", () => {
    const actor = { role: CAPACITY_VIEWER_ROLE as "CAPACITY_VIEWER" };
    expect(isCapacityViewerRole(actor.role)).toBe(true);
    expect(isStaff(actor)).toBe(true);
    expect(canSeePortfolio(actor)).toBe(false);
    expect(canManagePrismCapacity(actor)).toBe(false);
  });
});

describe("capacity viewer mutation rejection", () => {
  it("rejects the role and allows everyone else", () => {
    expect(capacityViewerCanMutate(CAPACITY_VIEWER_ROLE)).toBe(false);
    expect(capacityViewerCanMutate("ADMIN")).toBe(true);
    expect(() => assertCapacityViewerCannotMutate(CAPACITY_VIEWER_ROLE)).toThrow(
      /cannot change data/,
    );
    try {
      assertCapacityViewerCannotMutate(CAPACITY_VIEWER_ROLE);
    } catch (error) {
      expect(error).toMatchObject({ name: "ForbiddenError", status: 403 });
    }
    expect(() => assertCapacityViewerCannotMutate("MANAGER")).not.toThrow();
  });

  it("treats session APIs as forbidden", () => {
    expect(capacityViewerApiForbidden("/api/files/abc")).toBe(true);
    expect(capacityViewerApiForbidden("/api/prism/snapshot")).toBe(true);
    expect(capacityViewerApiForbidden("/api/auth/session")).toBe(false);
    expect(capacityViewerApiForbidden("/management/capacity")).toBe(false);
  });

  it("wires every server action through a write guard", () => {
    const dir = resolve(process.cwd(), "src/actions");
    const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(10);
    for (const name of files) {
      const text = readFileSync(resolve(dir, name), "utf8");
      expect(text, name).not.toMatch(/await requireStaff\(/);
      if (name === "auth.ts") {
        expect(text).toMatch(/await requireUser\(/);
        continue;
      }
      expect(text, name).not.toMatch(/await requireUser\(/);
      expect(text, name).toMatch(
        /requireMutatingStaff|requireMutatingUser|requirePortfolioAccess|requireAdmin/,
      );
    }
  });

  it("returns 403 from session API routes", () => {
    const routes = [
      "src/app/api/files/[id]/route.ts",
      "src/app/api/customer-logos/[id]/route.ts",
      "src/app/api/learn/[itemId]/file/route.ts",
      "src/app/api/library/[id]/route.ts",
      "src/app/api/go/route.ts",
      "src/app/api/prism/snapshot/route.ts",
    ];
    for (const route of routes) {
      const text = readFileSync(resolve(process.cwd(), route), "utf8");
      expect(text, route).toMatch(/isCapacityViewerRole/);
      expect(text, route).toMatch(/status: 403/);
    }
  });
});

describe("assigning the capacity viewer role", () => {
  it("is offered when adding a person and when changing a role", () => {
    expect(ADDABLE_STAFF_ROLES).toContain("CAPACITY_VIEWER");
    expect(ASSIGNABLE_STAFF_ROLES).toContain("CAPACITY_VIEWER");
    const parsed = parseNewTeamMember({
      name: "Anna Stokes",
      email: "anna@pimsyehr.com",
      role: "CAPACITY_VIEWER",
      canLead: false,
      capacityExempt: true,
      isDirector: false,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.title).toBe("Capacity viewer");
    expect(parsed.value.role).toBe("CAPACITY_VIEWER");
  });
});
