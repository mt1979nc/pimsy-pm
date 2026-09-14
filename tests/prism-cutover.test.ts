import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  parsePrismDump,
  parsePrismDumpJson,
  emailForTeamMember,
  isProtectedEmail,
  isProtectedProjectCode,
  acronymKey,
} from "@/lib/prism-dump";
import { planPrismImport, isWipProject, matchProject, matchUser, type ExistingPmState } from "@/lib/prism-import";
import { buildDirectorSnapshot } from "@/lib/prism-snapshot";
import { buildCapacityForecast, weeklyHoursForEngagement, type ForecastEngagement } from "@/lib/forecast";
import { prismDualReadEnabled, prismRuntimeSource } from "@/lib/prism-dual-read";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

const exampleJson = readFileSync(resolve(process.cwd(), "scripts/fixtures/prism-dump.example.json"), "utf8");

describe("Prism dump parse", () => {
  it("normalizes table rows + Flags/Data JSON from the example dump", () => {
    const dump = parsePrismDumpJson(exampleJson);
    expect(dump.team.map((t) => t.teamId)).toEqual(["am", "md"]);
    const am = dump.team.find((t) => t.teamId === "am")!;
    expect(am.flags.director).toBe(true);
    expect(am.flags.canLead).toBe(true);
    expect(am.hoursPerWeek).toBe(30);
    const morgan = dump.team.find((t) => t.teamId === "md")!;
    expect(morgan.flags.capacityExempt).toBe(true);
    expect(morgan.flags.canLead).toBe(false);

    const cedar = dump.customers.find((c) => c.id === "CEDAR")!;
    expect(cedar.status).toBe("active");
    expect(cedar.serviceLines).toContain("OUTPATIENT_THERAPY");
    expect(cedar.serviceLines).toContain("MEDICATION_MANAGEMENT");
    expect(cedar.kickoffDate).toBe("2026-08-12");

    const pipe = dump.customers.find((c) => c.id === "PIPEX")!;
    expect(pipe.status).toBe("pipeline");

    expect(dump.completed[0]?.id).toBe("ROH");
    expect(emailForTeamMember(am)).toBe("alexander@pimsyehr.com");
  });

  it("accepts a Prism getState-shaped document", () => {
    const dump = parsePrismDump({
      team: [{ id: "jr", name: "Jeremy Reals", hoursPerWeek: 25, flags: { canLead: true } }],
      customers: [
        {
          id: "THS",
          acct: "Triangle",
          owner: "jr",
          status: "pre-kickoff",
          sel: { outpatient: true },
        },
      ],
    });
    expect(dump.team[0]?.teamId).toBe("jr");
    expect(dump.customers[0]?.status).toBe("pre-kickoff");
    expect(dump.customers[0]?.serviceLines).toEqual(["OUTPATIENT_THERAPY"]);
  });

  it("rejects empty objects", () => {
    expect(() => parsePrismDump({})).toThrow(/no team/i);
  });
});

describe("import plan (idempotent, WIP-safe)", () => {
  const dump = parsePrismDumpJson(exampleJson);

  it("updates existing acronyms and inserts missing pipeline sites", () => {
    const existing: ExistingPmState = {
      users: [
        {
          id: "u-am",
          email: "alexander@pimsyehr.com",
          prismTeamId: "am",
          name: "Alexander Morse",
          role: "OWNER",
        },
      ],
      projects: [
        {
          id: "p1",
          code: "CEDAR",
          prismClientId: "CEDAR",
          crmAcronym: "CEDAR",
          templateId: "tmpl-1",
          taskCountTotal: 40,
          status: "IN_PROGRESS",
          archivedAt: null,
        },
      ],
    };
    const plan = planPrismImport(dump, existing);
    const cedar = plan.customers.find((r) => r.key === "CEDAR")!;
    expect(cedar.action).toBe("protect-wip");
    const pipe = plan.customers.find((r) => r.key === "PIPEX")!;
    expect(pipe.action).toBe("insert");
    const teamAm = plan.team.find((r) => r.key === "am")!;
    expect(teamAm.action).toBe("update");
  });

  it("does not overwrite demo logins or IMP-9001", () => {
    expect(isProtectedEmail("demo.manager@pimsyehr.com")).toBe(true);
    expect(isProtectedProjectCode("IMP-9001")).toBe(true);
    const existing: ExistingPmState = {
      users: [
        {
          id: "demo",
          email: "demo.manager@pimsyehr.com",
          prismTeamId: "am",
          name: "Demo",
          role: "MANAGER",
        },
      ],
      projects: [
        {
          id: "demo-p",
          code: "IMP-9001",
          prismClientId: "CEDAR",
          crmAcronym: "CEDAR",
          templateId: null,
          taskCountTotal: 0,
          status: "IN_PROGRESS",
          archivedAt: null,
        },
      ],
    };
    const plan = planPrismImport(dump, existing);
    expect(plan.team.find((r) => r.key === "am")?.action).toBe("protect-demo");
    expect(plan.customers.find((r) => r.key === "CEDAR")?.action).toBe("protect-demo");
  });

  it("refuses to complete a live WIP playbook", () => {
    const completedDump = parsePrismDump({
      team: [{ TeamId: "am", Name: "Alexander Morse", HoursPerWeek: 30 }],
      customers: [],
      completed: [{ id: "CEDAR", acct: "CEDAR Health", owner: "am", kickoffDate: "2026-01-01", goliveDate: "2026-03-01" }],
    });
    const existing: ExistingPmState = {
      users: [],
      projects: [
        {
          id: "p1",
          code: "CEDAR",
          prismClientId: "CEDAR",
          crmAcronym: "CEDAR",
          templateId: "t",
          taskCountTotal: 12,
          status: "IN_PROGRESS",
          archivedAt: null,
        },
      ],
    };
    const plan = planPrismImport(completedDump, existing);
    expect(plan.completed[0]?.action).toBe("protect-wip");
    expect(plan.warnings.some((w) => /CEDAR/.test(w))).toBe(true);
  });

  it("matches projects by acronym aliases", () => {
    expect(
      matchProject("cedar", [
        {
          id: "1",
          code: "IMP-0012",
          prismClientId: "CEDAR",
          crmAcronym: null,
          templateId: null,
          taskCountTotal: 0,
          status: "IN_PROGRESS",
          archivedAt: null,
        },
      ])?.id,
    ).toBe("1");
    expect(acronymKey(" cedar ")).toBe("CEDAR");
    expect(isWipProject({ templateId: "x", taskCountTotal: 0 })).toBe(true);
    expect(matchUser("am", null, [{ id: "1", email: "a@x", prismTeamId: "am", name: "A", role: "OWNER" }])?.id).toBe(
      "1",
    );
  });
});

describe("engagement dates stay in sync with weekly load", () => {
  const base: ForecastEngagement = {
    id: "CEDAR",
    code: "CEDAR",
    name: "CEDAR Health",
    acronym: "CEDAR",
    prismStatus: "active",
    leadId: "am",
    coLeadId: null,
    ownerSplitPercent: 100,
    estimatedHours: 40,
    customHoursPerWeek: null,
    startDate: d("2026-08-12"),
    initialGoLiveDate: d("2026-10-05"),
    targetGoLiveDate: d("2026-10-05"),
  };

  it("recomputes weekly hours from the current kickoff → go-live window", () => {
    const before = weeklyHoursForEngagement(base);
    const slipped = weeklyHoursForEngagement({
      ...base,
      targetGoLiveDate: d("2026-11-02"),
    });
    expect(before).toBeGreaterThan(slipped);
    expect(slipped).toBeGreaterThan(0);
  });

  it("pipeline never enters department billable hours after a status edit", () => {
    const forecast = buildCapacityForecast({
      asOf: d("2026-09-14"),
      weeksAhead: 4,
      staff: [{ id: "am", name: "Alexander", capacityHoursPerWeek: 30, capacityExempt: false }],
      engagements: [{ ...base, prismStatus: "pipeline", estimatedHours: 400 }],
    });
    expect(forecast.thisWeek?.billableHours).toBe(0);
    expect(forecast.engagements[0]?.countsTowardLoad).toBe(false);
  });
});

describe("Director / morning snapshot", () => {
  it("lists go-lives in the next 14 days and pipeline separately", () => {
    const forecast = buildCapacityForecast({
      asOf: d("2026-09-14"),
      weeksAhead: 4,
      staff: [
        {
          id: "am",
          name: "Alexander",
          email: "alexander@pimsyehr.com",
          capacityHoursPerWeek: 30,
          capacityExempt: false,
          isDirector: true,
          canLead: true,
        },
      ],
      engagements: [
        {
          id: "1",
          code: "CEDAR",
          name: "CEDAR Health",
          acronym: "CEDAR",
          prismStatus: "active",
          leadId: "am",
          coLeadId: null,
          ownerSplitPercent: 100,
          estimatedHours: 40,
          customHoursPerWeek: null,
          startDate: d("2026-08-12"),
          initialGoLiveDate: d("2026-10-05"),
          targetGoLiveDate: d("2026-09-21"),
        },
        {
          id: "2",
          code: "PIPEX",
          name: "Pipeline Example",
          acronym: "PIPEX",
          prismStatus: "pipeline",
          leadId: "am",
          coLeadId: null,
          ownerSplitPercent: 100,
          estimatedHours: 40,
          customHoursPerWeek: null,
          startDate: null,
          initialGoLiveDate: null,
          targetGoLiveDate: null,
        },
      ],
    });
    const snap = buildDirectorSnapshot({ asOf: d("2026-09-14"), forecast, exclusions: ["SENSORI"] });
    expect(snap.source).toBe("pimsy-pm");
    expect(snap.pipelineCount).toBe(1);
    expect(snap.pipeline[0]?.acronym).toBe("PIPEX");
    expect(snap.goLivesNext14.map((g) => g.acronym)).toContain("CEDAR");
    expect(snap.analysisExclusions).toEqual(["SENSORI"]);
    expect(snap.team).toHaveLength(1);
    expect(snap.team[0]?.thisWeekHours).toBeGreaterThan(0);
    expect(snap.team[0]?.peakHours).toBeGreaterThanOrEqual(snap.team[0]!.thisWeekHours);
    expect(snap.forecastWeeks.filter((w) => w.billableHours > 0).length).toBeGreaterThan(1);
  });

  it("keeps runtime dual-read off so PATH is the only live source", () => {
    expect(prismDualReadEnabled()).toBe(false);
    expect(prismRuntimeSource()).toBe("pimsy-pm");
  });
});
