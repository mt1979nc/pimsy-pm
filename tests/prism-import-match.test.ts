import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parsePrismDump, parsePrismDumpJson } from "@/lib/prism-dump";
import {
  nextCoLeadId,
  planPrismImport,
  prismTeamUpdateFields,
  slipKey,
  type ExistingPmState,
  type ExistingProjectSnapshot,
} from "@/lib/prism-import";
import {
  PRISM_CUTOVER_ROSTER_DESCRIPTION,
  findRosterShellDuplicates,
  matchProject,
  normalizeAccountName,
  resolveProjectMatch,
} from "@/lib/prism-import-match";
import { PRISM_IMPORT_OVERRIDES } from "@/lib/prism-import-overrides";
import { formatPrismImportPlan } from "@/lib/prism-import-report";

function project(partial: Partial<ExistingProjectSnapshot> & Pick<ExistingProjectSnapshot, "id" | "code">): ExistingProjectSnapshot {
  return {
    prismClientId: null,
    crmAcronym: null,
    templateId: null,
    taskCountTotal: 0,
    status: "IN_PROGRESS",
    archivedAt: null,
    ...partial,
  };
}

const empty: ExistingPmState = { users: [], projects: [] };

describe("project matching", () => {
  it("prefers prism id, then code or acronym, and does not match blanks", () => {
    const projects = [
      project({ id: "by-id", code: "IMP-1", prismClientId: "CCCCARE" }),
      project({ id: "by-code", code: "CCCCARE", prismClientId: null }),
      project({ id: "blank", code: "", prismClientId: "", crmAcronym: "", name: "", customerName: "" }),
    ];
    const byId = resolveProjectMatch("CCCCARE", projects, "Connected Community Care");
    expect(byId.kind).toBe("match");
    if (byId.kind === "match") expect(byId.project.id).toBe("by-id");
    expect(byId.kind === "match" ? byId.via : null).toBe("prismClientId");
    expect(matchProject("EBHKY", [project({ id: "by-crm", code: "IMP-9", crmAcronym: "ebhky" })])?.id).toBe("by-crm");
    expect(resolveProjectMatch("", projects, "").kind).toBe("none");
    expect(resolveProjectMatch("BDMH", [projects[2]!], "Better Days Mental Health").kind).toBe("none");
    expect(normalizeAccountName("  Connected Community Care — PIMSY implementation ")).toBe("connected community care");
  });

  it("falls back to a normalized account name", () => {
    const live = project({
      id: "path-ccc",
      code: "CCC",
      crmAcronym: "CCC",
      name: "Connected Community Care",
      customerName: "Connected Community Care",
    });
    const result = resolveProjectMatch("CCCCARE", [live], "Connected Community Care");
    expect(result.kind).toBe("match");
    if (result.kind === "match") {
      expect(result.project.id).toBe("path-ccc");
      expect(result.via).toBe("name");
    }
    expect(resolveProjectMatch("CCCCARE", [live], "Someone Else").kind).toBe("none");
  });

  it("skips an archived-only hit for a live customer and still matches completed history", () => {
    const archived = project({
      id: "old",
      code: "LECHRIS",
      prismClientId: "LECHRIS",
      archivedAt: new Date("2026-10-02T00:00:00Z"),
      status: "COMPLETED",
    });
    expect(resolveProjectMatch("LECHRIS", [archived], "Le Chris Health Systems").kind).toBe("archived");
    expect(matchProject("LECHRIS", [archived], "Le Chris Health Systems")).toBeUndefined();
    const allowed = resolveProjectMatch("LECHRIS", [archived], "Le Chris Health Systems", { allowArchived: true });
    expect(allowed.kind).toBe("match");
    if (allowed.kind === "match") expect(allowed.project.id).toBe("old");
  });

  it("uses a live name match when the prism id only hits an archived shell", () => {
    const shell = project({
      id: "shell",
      code: "CCCCARE",
      prismClientId: "CCCCARE",
      name: "Connected Community Care — PIMSY implementation",
      archivedAt: new Date("2026-10-05T00:00:00Z"),
    });
    const live = project({
      id: "live",
      code: "CCC",
      customerName: "Connected Community Care",
      name: "Connected Community Care",
    });
    const result = resolveProjectMatch("CCCCARE", [shell, live], "Connected Community Care");
    expect(result.kind).toBe("match");
    if (result.kind === "match") {
      expect(result.project.id).toBe("live");
      expect(result.archivedAlso.map((row) => row.id)).toContain("shell");
    }
  });

  it("does not write when several active candidates share the winning tier", () => {
    const projects = [
      project({ id: "a", code: "IMP-A", customerName: "Epic Behavioral Health - KY" }),
      project({ id: "b", code: "IMP-B", name: "Epic Behavioral Health — KY" }),
    ];
    const result = resolveProjectMatch("EBHKY", projects, "Epic Behavioral Health - KY");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") expect(result.candidates.map((row) => row.id).sort()).toEqual(["a", "b"]);
    expect(matchProject("EBHKY", projects, "Epic Behavioral Health - KY")).toBeUndefined();
  });
});

describe("import overrides", () => {
  it("keeps corrections in one list", () => {
    expect(PRISM_IMPORT_OVERRIDES.excludedTeam.map((row) => row.teamId)).toEqual(["rb"]);
    expect(PRISM_IMPORT_OVERRIDES.customers.map((row) => row.acronym)).toEqual(["FBH", "TLA"]);
  });

  it("excludes ReShawn Beard and overrides FBH, and says when TLA is absent", () => {
    const dump = parsePrismDump({
      team: [{ id: "jr", name: "Jeremy Reals", hoursPerWeek: 30 }],
      formerTeam: [{ id: "rb", name: "ReShawn Beard", hoursPerWeek: 30 }],
      customers: [
        {
          id: "FBH",
          acct: "FBH",
          owner: "jr",
          status: "active",
          kickoffDate: "2026-09-11",
          goliveDate: "2026-11-09",
          initialGolive: "2026-11-02",
          slipLog: [{ from: "2026-11-05", to: "2026-11-09", days: 4, cause: "customer", note: "Slow Discovery" }],
        },
      ],
    });
    const plan = planPrismImport(dump, empty);
    const rb = plan.team.find((row) => row.key === "rb");
    expect(rb?.action).toBe("skip");
    expect(rb?.matchLabel).toBe("SKIPPED");
    expect(rb?.detail).toMatch(/not imported, not touched/);
    expect(plan.prepared.customers.find((row) => row.id === "FBH")?.goliveDate).toBe("2026-10-21");
    expect(dump.customers.find((row) => row.id === "FBH")?.goliveDate).toBe("2026-11-09");
    const fbh = plan.customers.find((row) => row.key === "FBH");
    expect(fbh?.matchLabel).toBe("NEW");
    expect(fbh?.changes?.join("\n")).toMatch(/LIVE/);
    expect(fbh?.changes?.join("\n")).toMatch(/2026-10-21/);
    expect(fbh?.changes?.join("\n")).not.toMatch(/2026-11-09 →/);
    const fbhSlips = plan.slips.filter((row) => row.parentKey === "FBH");
    expect(fbhSlips.length).toBeGreaterThan(0);
    expect(fbhSlips.every((row) => row.matchLabel === "SKIPPED")).toBe(true);
    expect(plan.overrideNotes.join("\n")).toMatch(/no TLA was found/);
    expect(plan.overrideNotes.join("\n")).toMatch(/Discovery was not applied/);
    expect(formatPrismImportPlan(plan)).toMatch(/no TLA was found/);
  });

  it("sets TLA to Discovery when the acronym is present", () => {
    const dump = parsePrismDump({
      team: [],
      customers: [{ id: "tla", acct: "TLA Counseling", status: "active", owner: "am" }],
    });
    const plan = planPrismImport(dump, empty);
    expect(plan.overrideNotes.join("\n")).not.toMatch(/no TLA was found/);
    expect(plan.overrideNotes.join("\n")).toMatch(/Discovery/);
    const tla = plan.customers.find((row) => row.key === "TLA");
    expect(tla?.matchLabel).toBe("NEW");
    expect(tla?.changes?.join("\n")).toMatch(/Discovery/);
    const report = formatPrismImportPlan(plan);
    expect(report).toMatch(/TLA {2}TLA Counseling/);
    expect(report).toMatch(/NEW/);
    expect(report).toMatch(/Discovery/);
  });

  it("does not put lead, exempt, or director on an update of an existing person", () => {
    const patch = prismTeamUpdateFields(
      { name: "Morgan Davis" },
      { name: "Morgan Davis", hoursPerWeek: 10, teamId: "md" },
      true,
    );
    expect(patch).not.toHaveProperty("canLead");
    expect(patch).not.toHaveProperty("capacityExempt");
    expect(patch).not.toHaveProperty("isDirector");
    expect(patch).not.toHaveProperty("pathManaged");
  });
});

describe("1 Oct 2026 Prism dump", () => {
  const dump = parsePrismDumpJson(readFileSync(resolve(process.cwd(), "tests/fixtures/prism-dump-2026-10-01.json"), "utf8"));

  it("reports TLA missing, FBH live, and ReShawn excluded", () => {
    expect(dump.customers).toHaveLength(17);
    expect(dump.customers.some((row) => row.id === "TLA")).toBe(false);
    expect(dump.formerTeam.some((row) => row.teamId === "rb")).toBe(true);
    const plan = planPrismImport(dump, empty);
    const report = formatPrismImportPlan(plan);
    expect(report).toMatch(/no TLA was found/);
    expect(plan.team.find((row) => row.key === "rb")?.matchLabel).toBe("SKIPPED");
    const fbh = plan.customers.find((row) => row.key === "FBH");
    expect(fbh?.matchLabel).toBe("NEW");
    expect(fbh?.changes?.join("\n")).toContain("status  — → LIVE (override)");
    expect(fbh?.changes?.join("\n")).toContain("go-live  — → 2026-10-21 (override)");
    expect(plan.customers.filter((row) => row.action === "insert")).toHaveLength(17);
    expect(report).toContain("NEW");
  });

  it("matches a PATH customer whose acronym differs and does not insert it again", () => {
    const book: ExistingPmState = {
      users: [{ id: "u-dp", email: "danielle@pimsyehr.com", prismTeamId: "dp", name: "Danielle Piper", role: "SPECIALIST" }],
      projects: [
        project({
          id: "path-ccc",
          code: "CCC",
          crmAcronym: "CCC",
          name: "Connected Community Care",
          customerName: "Connected Community Care",
          customerStatus: "ONBOARDING",
          leadId: "u-dp",
          leadName: "Danielle Piper",
          leadPrismTeamId: "dp",
          prismStatus: "active",
          startDate: new Date("2026-08-07T12:00:00Z"),
          targetGoLiveDate: new Date("2026-10-05T12:00:00Z"),
          initialGoLiveDate: new Date("2026-09-28T12:00:00Z"),
          actualGoLiveDate: null,
          currentPhase: null,
          slipCount: 0,
          templateId: "tmpl",
          taskCountTotal: 12,
        }),
      ],
    };
    const plan = planPrismImport(dump, book);
    const row = plan.customers.find((item) => item.key === "CCCCARE");
    expect(row?.action).toBe("protect-wip");
    expect(row?.matchLabel).toBe("MATCHED");
    expect(row?.projectId).toBe("path-ccc");
    expect(row?.via).toBe("name");
    expect(plan.customers.filter((item) => item.key === "CCCCARE" && item.action === "insert")).toHaveLength(0);
    const report = formatPrismImportPlan(plan);
    expect(report).toContain("MATCHED  path-ccc  Connected Community Care  (CCC)  via account name");
    const slips = plan.slips.filter((item) => item.parentKey === "CCCCARE");
    expect(slips.length).toBeGreaterThan(0);
    expect(slips.every((item) => item.matchLabel === "MATCHED")).toBe(true);
    expect(report).toContain("path-ccc");

    const filled: ExistingPmState = {
      ...book,
      projects: [{ ...book.projects[0]!, prismClientId: "CCCCARE" }],
    };
    const rerun = planPrismImport(dump, filled);
    expect(rerun.customers.find((item) => item.key === "CCCCARE")?.projectId).toBe("path-ccc");
    expect(rerun.customers.find((item) => item.key === "CCCCARE")?.via).toBe("prismClientId");
    expect(rerun.customers.some((item) => item.action === "insert" && item.key === "CCCCARE")).toBe(false);
  });

  it("does not insert a second copy of customers already imported, and flags a roster shell beside the real project", () => {
    const imported: ExistingProjectSnapshot[] = dump.customers.map((customer) =>
      project({
        id: `shell-${customer.id}`,
        code: customer.id,
        prismClientId: customer.id,
        crmAcronym: customer.id,
        name: `${customer.acct} — PIMSY implementation`,
        customerName: customer.acct,
        description: PRISM_CUTOVER_ROSTER_DESCRIPTION,
        customerStatus: "ONBOARDING",
        prismStatus: customer.status,
        startDate: customer.kickoffDate ? new Date(`${customer.kickoffDate}T12:00:00Z`) : null,
        targetGoLiveDate: customer.goliveDate ? new Date(`${customer.goliveDate}T12:00:00Z`) : null,
        initialGoLiveDate: customer.initialGolive ? new Date(`${customer.initialGolive}T12:00:00Z`) : null,
        actualGoLiveDate: null,
        currentPhase: null,
        existingSlips: customer.slipLog.flatMap((slip) =>
          slip.from && slip.to ? [{ from: slip.from, to: slip.to }] : [],
        ),
        slipCount: customer.slipLog.length,
      }),
    );
    const real = project({
      id: "path-lechris",
      code: "LCH",
      crmAcronym: "LCH",
      name: "Le Chris Health Systems",
      customerName: "Le Chris Health Systems",
      description: "Dock playbook",
      templateId: "tmpl",
      taskCountTotal: 40,
      customerStatus: "ONBOARDING",
      prismStatus: "active",
      startDate: new Date("2026-03-11T12:00:00Z"),
      targetGoLiveDate: new Date("2026-10-26T12:00:00Z"),
      initialGoLiveDate: new Date("2026-06-08T12:00:00Z"),
      actualGoLiveDate: null,
      currentPhase: "training",
    });
    const projects = [...imported, real];
    const shellsAlone = findRosterShellDuplicates(imported);
    expect(shellsAlone).toHaveLength(0);
    const dupes = findRosterShellDuplicates(projects);
    expect(dupes.map((row) => row.shellCode)).toContain("LECHRIS");
    expect(dupes.find((row) => row.shellCode === "LECHRIS")?.siblingId).toBe("path-lechris");

    const plan = planPrismImport(dump, { users: [], projects });
    expect(plan.customers.some((row) => row.action === "insert")).toBe(false);
    expect(plan.duplicateShells.find((row) => row.shellId === "shell-LECHRIS")?.siblingId).toBe("path-lechris");
    const lechris = plan.customers.find((row) => row.key === "LECHRIS");
    expect(lechris?.projectId).toBe("shell-LECHRIS");
    expect(lechris?.matchLabel).toBe("MATCHED");
    const report = formatPrismImportPlan(plan);
    expect(report).toContain("shell-LECHRIS");
    expect(report).toContain("path-lechris");
    expect(report).toMatch(/nothing is deleted/i);
    expect(plan.slips.filter((row) => row.parentKey === "LECHRIS").every((row) => row.matchLabel === "SKIPPED")).toBe(true);
  });

  it("leaves an archived live customer unmatched for insert and an ambiguous name unmatched", () => {
    const plan = planPrismImport(dump, {
      users: [],
      projects: [
        project({
          id: "arch-ebh",
          code: "EBHKY",
          prismClientId: "EBHKY",
          archivedAt: new Date("2026-10-03T00:00:00Z"),
          name: "Epic Behavioral Health - KY",
        }),
        project({ id: "a", code: "IMP-A", customerName: "Project Wellness" }),
        project({ id: "b", code: "IMP-B", name: "Project Wellness" }),
      ],
    });
    const ebh = plan.customers.find((row) => row.key === "EBHKY");
    expect(ebh?.matchLabel).toBe("SKIPPED");
    expect(ebh?.action).not.toBe("update");
    expect(ebh?.action).not.toBe("insert");
    const pwmi = plan.customers.find((row) => row.key === "PWMI");
    expect(pwmi?.matchLabel).toBe("AMBIGUOUS");
    expect(pwmi?.action).toBe("ambiguous");
    expect(pwmi?.projectId).toBeUndefined();
    const report = formatPrismImportPlan(plan);
    expect(report).toContain("AMBIGUOUS");
    expect(report).toContain("SKIPPED");
  });
});

describe("co-lead and slip append", () => {
  it("keeps a PATH co-lead when Prism has no co-owner and sets one when Prism has one", () => {
    expect(nextCoLeadId(null, "user-md", () => "other")).toBe("user-md");
    expect(nextCoLeadId("", "user-md", () => "other")).toBe("user-md");
    expect(nextCoLeadId("jr", "user-md", (teamId) => (teamId === "jr" ? "user-jr" : null))).toBe("user-jr");
    expect(nextCoLeadId("jr", "user-md", () => null)).toBe("user-md");
    expect(nextCoLeadId("rb", "user-md", () => "user-rb")).toBe("user-md");

    const dump = parsePrismDump({
      team: [
        { id: "jr", name: "Jeremy Reals", hoursPerWeek: 30 },
        { id: "md", name: "Morgan Davis", hoursPerWeek: 23 },
      ],
      customers: [
        { id: "DYM", acct: "DYM BHSO", owner: "jr", status: "active" },
        { id: "EBHKY", acct: "Epic Behavioral Health - KY", owner: "jr", owner2: "md", status: "active" },
      ],
    });
    const plan = planPrismImport(dump, {
      users: [
        { id: "user-jr", email: "jeremy@pimsyehr.com", prismTeamId: "jr", name: "Jeremy Reals", role: "SPECIALIST" },
        { id: "user-md", email: "morgan@pimsyehr.com", prismTeamId: "md", name: "Morgan Davis", role: "SPECIALIST" },
      ],
      projects: [
        project({
          id: "dym",
          code: "DYM",
          prismClientId: "DYM",
          coLeadId: "user-md",
          coLeadName: "Morgan Davis",
          coLeadPrismTeamId: "md",
        }),
        project({
          id: "ebh",
          code: "EBHKY",
          prismClientId: "EBHKY",
          coLeadId: null,
          coLeadName: null,
          coLeadPrismTeamId: null,
        }),
      ],
    });
    const dym = plan.customers.find((row) => row.key === "DYM");
    const ebh = plan.customers.find((row) => row.key === "EBHKY");
    expect(dym?.changes?.join("\n")).toMatch(/co-lead  Morgan Davis \(md\)  kept \(Prism co-owner empty\)/);
    expect(ebh?.changes?.join("\n")).toMatch(/co-lead  — → Morgan Davis \(md\)/);
    expect(formatPrismImportPlan(plan)).toMatch(/co-lead/);
  });

  it("appends Prism slips that are not already on the project and does not repeat one", () => {
    expect(slipKey("2026-11-02", "2026-11-16")).toBe("2026-11-02|2026-11-16");
    expect(slipKey("2026-11-02T12:00:00.000Z", "2026-11-16")).toBe("2026-11-02|2026-11-16");
    expect(slipKey("", "2026-11-16")).toBeNull();

    const dump = parsePrismDump({
      team: [],
      customers: [
        {
          id: "DYM",
          acct: "DYM BHSO",
          status: "active",
          slipLog: [
            { from: "2026-10-12", to: "2026-11-02", days: 21, cause: "customer" },
            { from: "2026-11-02", to: "2026-11-16", days: 14, cause: "customer", note: "new since last import" },
            { from: "2026-11-02", to: "2026-11-16", days: 14, cause: "customer", note: "same dates again" },
          ],
        },
      ],
    });
    const plan = planPrismImport(dump, {
      users: [],
      projects: [
        project({
          id: "dym",
          code: "DYM",
          prismClientId: "DYM",
          existingSlips: [{ from: "2026-10-12", to: "2026-11-02" }],
          slipCount: 1,
        }),
      ],
    });
    const slips = plan.slips.filter((row) => row.parentKey === "DYM");
    expect(slips.map((row) => `${row.matchLabel} ${row.detail}`)).toEqual([
      "SKIPPED already in PATH; not overwritten",
      "MATCHED will append",
      "SKIPPED duplicate in this dump; not imported twice",
    ]);
    expect(plan.customers.find((row) => row.key === "DYM")?.changes?.join("\n")).toMatch(/slips  1 to add, 1 already in PATH/);
    expect(formatPrismImportPlan(plan)).toMatch(/will append/);
  });
});
