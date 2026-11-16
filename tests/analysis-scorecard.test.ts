import { describe, expect, it } from "vitest";

import { assembleOwnerScorecard, type ScorecardStaff, type ScorecardStat } from "@/lib/analysis-scorecard";

const jeremy: ScorecardStat = {
  leadId: "jr",
  name: "Jeremy Reals",
  completed: 10,
  onTimeRate: 0,
  avgVariance: 73.9,
  avgDaysLateOnMisses: 73.9,
  misses: 10,
};
const danielle: ScorecardStat = {
  leadId: "dp",
  name: "Danielle Piper",
  completed: 17,
  onTimeRate: 65,
  avgVariance: 11.2,
  avgDaysLateOnMisses: 20,
  misses: 6,
};

const staff: ScorecardStaff[] = [
  { id: "jr", name: "Jeremy Reals", isActive: true },
  { id: "dp", name: "Danielle Piper", isActive: false },
  { id: "sam", name: "Sam Balaz", isActive: true },
  { id: "am", name: "Alexander Morse", isActive: true },
];

describe("owner scorecard", () => {
  it("lists active staff, hides former people, and keeps a 0% lead's completed sites", () => {
    const rows = assembleOwnerScorecard([jeremy, danielle], staff, false);
    expect(rows.map((row) => row.name)).toEqual(["Jeremy Reals", "Alexander Morse", "Sam Balaz"]);
    expect(rows.find((row) => row.leadId === "jr")).toMatchObject({
      empty: false,
      completed: 10,
      onTimeRate: 0,
    });
    expect(rows.find((row) => row.leadId === "sam")).toMatchObject({
      empty: true,
      completed: 0,
      onTimeRate: null,
    });
    expect(rows.find((row) => row.leadId === "dp")).toBeUndefined();
  });

  it("includes former staff when asked, still keyed by the PATH user id", () => {
    const rows = assembleOwnerScorecard([jeremy, danielle], staff, true);
    expect(rows.map((row) => row.leadId)).toEqual(["dp", "jr", "am", "sam"]);
    expect(rows.find((row) => row.leadId === "dp")?.isActive).toBe(false);
    expect(rows.find((row) => row.leadId === "dp")?.completed).toBe(17);
  });
});
