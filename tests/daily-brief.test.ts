import { describe, expect, it } from "vitest";
import { detectWipShape, missingWeekdays, normalizeDailyBrief } from "@/lib/daily-brief";

const preOct5 = {
  retrievedAt: "2026-09-08T13:00:00.000Z",
  totalIncluded: 2,
  workspaces: [
    { name: "Cedar", acronym: "CEDAR", owners: ["AM"], targetEnd: "2026-09-01", overdueTaskCount: null },
    { name: "Tanc", acronym: "TANC", owners: ["AM", "JR"], targetEnd: "2026-12-01" },
  ],
};

const postOct5 = {
  retrievedAt: "2026-10-07T13:00:00.000Z",
  totalIncluded: 1,
  overdueTaskTotal: 4,
  workspaces: [
    {
      name: "Cedar",
      acronym: "CEDAR",
      owners: ["AM"],
      team: "Impl",
      targetEnd: "2026-09-01",
      targetPassed: true,
      overdueTaskCount: 4,
      taskProgress: { done: 3, total: 10 },
    },
  ],
};

describe("daily brief shapes", () => {
  it("keeps pre-Oct 5 WIP on target end and owners, with no overdue column", () => {
    expect(detectWipShape(preOct5)).toBe("pre-oct-5");
    const result = normalizeDailyBrief({
      dockWip: preOct5,
      dockThreads: { totals: { threads: 6, waiting_on_pimsy: 4, waiting_on_customer: 2 } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fact.factDate).toBe("2026-09-08");
    expect(result.fact.wipSites).toBe(2);
    expect(result.fact.overdueTasks).toBeNull();
    expect(result.fact.taskDone).toBeNull();
    expect(result.fact.targetPassed).toBe(1);
    expect(result.fact.waitingOnPimsy).toBe(4);
    expect(result.fact.waitingOnCustomer).toBe(2);
    expect(result.fact.owners).toEqual([
      { owner: "AM", team: "", wipSites: 2 },
      { owner: "JR", team: "", wipSites: 1 },
    ]);
  });

  it("reads the post-Oct 5 overdue, progress, team, and target flag", () => {
    expect(detectWipShape(postOct5)).toBe("post-oct-5");
    const result = normalizeDailyBrief({
      date: "2026-10-07",
      dockWip: postOct5,
      prism: { loadHours: 74.4, capacityHours: 85, slipDays: 12 },
      zendesk: { gap: true, tickets: null },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fact.overdueTasks).toBe(4);
    expect(result.fact.taskDone).toBe(3);
    expect(result.fact.taskTotal).toBe(10);
    expect(result.fact.targetPassed).toBe(1);
    expect(result.fact.prismLoadHours).toBe(74.4);
    expect(result.fact.prismCapacityHours).toBe(85);
    expect(result.fact.slipDays).toBe(12);
    expect(result.fact.zendeskOpen).toBeNull();
    expect(result.fact.note).toMatch(/Zendesk gap/);
    expect(result.fact.owners).toEqual([{ owner: "AM", team: "Impl", wipSites: 1 }]);
  });

  it("flags an empty weekday board and skips weekends when finding gaps", () => {
    const empty = normalizeDailyBrief({
      date: "2026-10-06",
      dockWip: { retrievedAt: "2026-10-06T13:00:00.000Z", totalIncluded: 0, workspaces: [] },
    });
    expect(empty.ok && empty.fact.gap).toBe(true);
    expect(missingWeekdays(["2026-09-08", "2026-09-09"], "2026-09-08", "2026-09-14")).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-14",
    ]);
  });
});
