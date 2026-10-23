import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  builtinEstimator,
  DEFAULT_SCOPE,
  estimateHours,
  forecastImplementation,
} from "@/lib/estimator";
import { buildCapacityForecast, weeklyHoursForEngagement, type ForecastEngagement, type ForecastStaffMember } from "@/lib/forecast";
import { DEFAULT_ESTIMATOR, DEFAULT_PATH_CONFIG } from "@/lib/path-config-defaults";
import { slipGoLiveBlocked, statusCountsTowardLoad } from "@/lib/path-config-rules";
import { applyPathConfig, resetPathConfigCache } from "@/lib/path-config-store";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

const engagement: ForecastEngagement = {
  id: "CEDAR",
  code: "CEDAR",
  name: "Cedar",
  acronym: "CEDAR",
  prismStatus: "active",
  leadId: "alex",
  coLeadId: null,
  ownerSplitPercent: 100,
  estimatedHours: 40,
  customHoursPerWeek: null,
  startDate: d("2026-09-14"),
  initialGoLiveDate: d("2026-11-09"),
  targetGoLiveDate: d("2026-11-09"),
};

const staff: ForecastStaffMember[] = [
  { id: "alex", name: "Alexander", capacityHoursPerWeek: 30, capacityExempt: false, isDirector: true },
];

describe("seeded PATH config", () => {
  afterEach(() => {
    resetPathConfigCache();
  });

  it("matches the hardcoded estimator and capacity", () => {
    expect(builtinEstimator()).toEqual(DEFAULT_ESTIMATOR);
    const kickoff = d("2026-09-14");
    const hoursBefore = estimateHours(DEFAULT_SCOPE);
    const forecastBefore = forecastImplementation(DEFAULT_SCOPE, kickoff);
    const weeklyBefore = weeklyHoursForEngagement(engagement);
    const capacityBefore = buildCapacityForecast({
      asOf: d("2026-10-01"),
      staff,
      engagements: [engagement],
    });

    applyPathConfig(DEFAULT_PATH_CONFIG);

    expect(estimateHours(DEFAULT_SCOPE)).toEqual(hoursBefore);
    expect(forecastImplementation(DEFAULT_SCOPE, kickoff)).toEqual(forecastBefore);
    expect(weeklyHoursForEngagement(engagement)).toBe(weeklyBefore);
    expect(weeklyBefore).toBe(5);
    expect(
      buildCapacityForecast({
        asOf: d("2026-10-01"),
        staff,
        engagements: [engagement],
      }),
    ).toEqual(capacityBefore);
    expect(statusCountsTowardLoad("pipeline")).toBe(false);
    expect(statusCountsTowardLoad("stalled")).toBe(true);
    expect(statusCountsTowardLoad("special")).toBe(true);
  });

  it("changes the estimate when org setup hours change", () => {
    const before = estimateHours(DEFAULT_SCOPE).totalHours;
    applyPathConfig({
      ...DEFAULT_PATH_CONFIG,
      estimator: { ...DEFAULT_ESTIMATOR, orgSetupHours: 9 },
    });
    expect(estimateHours(DEFAULT_SCOPE).totalHours).toBe(before + 7);
  });

  it("blocks a go-live slip unless the approver matches", () => {
    expect(
      slipGoLiveBlocked({ days: 3, approveGoLive: true, role: "SPECIALIST", isDirector: false }),
    ).toBe(true);
    expect(
      slipGoLiveBlocked({ days: 3, approveGoLive: true, role: "SPECIALIST", isDirector: true }),
    ).toBe(false);
    expect(slipGoLiveBlocked({ days: 3, approveGoLive: true, role: "OWNER", isDirector: false })).toBe(false);
    expect(
      slipGoLiveBlocked({ days: 3, approveGoLive: false, role: "MEMBER", isDirector: false }),
    ).toBe(false);

    applyPathConfig({
      ...DEFAULT_PATH_CONFIG,
      slipApproval: { approverRole: "DIRECTOR", thresholdDays: 10 },
    });
    expect(
      slipGoLiveBlocked({ days: 3, approveGoLive: true, role: "SPECIALIST", isDirector: false }),
    ).toBe(false);
    expect(
      slipGoLiveBlocked({ days: 10, approveGoLive: true, role: "SPECIALIST", isDirector: false }),
    ).toBe(true);
  });

  it("seeds today's numbers in 0032_path_config.sql", () => {
    const sql = readFileSync(resolve(process.cwd(), "drizzle/0032_path_config.sql"), "utf8");
    expect(sql).toContain("'singleton', 'even'");
    expect(sql).toContain("'DIRECTOR', 0");
    expect(sql).toContain("'pre-go-live', 'Pre Go-Live', 5, true, 2");
    expect(sql).toContain('"minutesPerUser":15');
    expect(sql).toContain('"orgSetupHours":2');
    expect(sql).toContain("SENSORI");
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("puts each setting on the settings form", () => {
    const form = readFileSync(resolve(process.cwd(), "src/app/(app)/settings/workspace-form.tsx"), "utf8");
    const action = readFileSync(resolve(process.cwd(), "src/actions/path-settings.ts"), "utf8");
    for (const title of [
      "Load model",
      "Phases",
      "Statuses",
      "Slip causes",
      "Slip approval",
      "Roles",
      "People",
      "Estimator weights",
      "Service lines",
      "Analytics exclusions",
      "Hiring trigger",
      "Holidays",
      "Tags",
      "Custom fields",
      "Templates",
      "Dock allowlist",
    ]) {
      expect(form).toContain(title);
    }
    expect(action).toMatch(/isAdmin/);
    expect(action).toMatch(/Only an owner or admin/);
  });
});
