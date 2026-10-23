import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectWipShape, missingWeekdays, normalizeDailyBrief, parseDeliveryStatus, parsePrismLiveMarkdown } from "@/lib/daily-brief";
import { loadDailyBriefDir } from "@/lib/daily-brief-folder";

const fixture = (path: string) => readFileSync(resolve(process.cwd(), "tests/fixtures/daily-brief", path), "utf8");

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

  it("detects WIP shape from the file fields and stores overdue only when it is present", () => {
    const postFields = {
      totalIncluded: 1,
      workspaces: [{ name: "Cedar", owners: ["AM"], team: "Impl", targetPassed: false }],
    };
    expect(detectWipShape({ ...postFields, retrievedAt: "2026-09-08T13:00:00.000Z" })).toBe("post-oct-5");
    expect(detectWipShape({ ...preOct5, retrievedAt: "2026-10-20T13:00:00.000Z" })).toBe("pre-oct-5");

    const early = normalizeDailyBrief({ date: "2026-09-08", dockWip: postFields });
    expect(early.ok).toBe(true);
    if (!early.ok) return;
    expect(early.fact.wipShape).toBe("post-oct-5");
    expect(early.fact.overdueTasks).toBeNull();

    const presentZero = normalizeDailyBrief({
      date: "2026-10-07",
      dockWip: { totalIncluded: 1, overdueTaskTotal: 0, workspaces: [] },
    });
    expect(presentZero.ok && presentZero.fact.overdueTasks).toBe(0);
  });

  it("stores a gap:true capture as a gap row with empty counts", () => {
    const days = loadDailyBriefDir(resolve(process.cwd(), "tests/fixtures/daily-brief/gaps"));
    const october = days.find((day) => day.date === "2026-10-06");
    expect(october?.input.dockWip).toEqual({ gap: true, reason: "box_no_egress" });
    const result = normalizeDailyBrief(october!.input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fact.gap).toBe(true);
    expect(result.fact.wipSites).toBeNull();
    expect(result.fact.overdueTasks).toBeNull();
    expect(result.fact.openThreads).toBeNull();
    expect(result.fact.wipShape).toBe("unknown");
    expect(result.fact.note).toContain("Gap: box_no_egress.");
    expect(result.fact.note.match(/Gap: box_no_egress\./g)).toHaveLength(1);

    const threadsOnly = normalizeDailyBrief({
      date: "2026-10-06",
      dockWip: preOct5,
      dockThreads: { gap: true, reason: "box_no_egress" },
    });
    expect(threadsOnly.ok).toBe(true);
    if (!threadsOnly.ok) return;
    expect(threadsOnly.fact.gap).toBe(true);
    expect(threadsOnly.fact.wipSites).toBe(2);
    expect(threadsOnly.fact.openThreads).toBeNull();
    expect(threadsOnly.fact.note).toContain("Gap: box_no_egress.");
  });

  it("counts a Dock WIP day with no thread file as a gap and keeps the real WIP count", () => {
    const days = loadDailyBriefDir(resolve(process.cwd(), "tests/fixtures/daily-brief/gaps"));
    const september = days.find((day) => day.date === "2026-09-08");
    expect(september?.input.threadsMissing).toBe(true);
    const result = normalizeDailyBrief(september!.input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fact.gap).toBe(true);
    expect(result.fact.wipSites).toBe(2);
    expect(result.fact.openThreads).toBeNull();
    expect(result.fact.waitingOnPimsy).toBeNull();
    expect(result.fact.note).toContain("Missing thread data.");
  });

  it("loads delivery-status metrics and prism-live markdown from fixtures", () => {
    const delivery = parseDeliveryStatus(JSON.parse(fixture("metrics/delivery-status.json")));
    expect(delivery).toMatchObject({ openThreads: 8, waitingOnPimsy: 5, waitingOnCustomer: 3 });
    expect(delivery.note).toContain("New threads 2.");
    expect(delivery.note).toContain("Gone threads 1.");
    expect(delivery.note).toContain("Target moves 1.");
    expect(delivery.note).toContain("Vs Wed threads +2.");

    const live = parsePrismLiveMarkdown(fixture("metrics/prism-live.md"));
    expect(live.loadHours).toBe(74.4);
    expect(live.capacityHours).toBe(85);
    expect(live.slipDays).toBe(18);
    expect(live.note).toBe("Active 11. Stalled 2. Special 1.");

    const days = loadDailyBriefDir(resolve(process.cwd(), "tests/fixtures/daily-brief/metrics"));
    expect(days.map((day) => day.date)).toEqual(["2026-09-10"]);
    const result = normalizeDailyBrief(days[0]!.input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fact.gap).toBe(false);
    expect(result.fact.wipSites).toBe(2);
    expect(result.fact.openThreads).toBe(8);
    expect(result.fact.waitingOnPimsy).toBe(5);
    expect(result.fact.waitingOnCustomer).toBe(3);
    expect(result.fact.prismLoadHours).toBe(74.4);
    expect(result.fact.prismCapacityHours).toBe(85);
    expect(result.fact.slipDays).toBe(18);
    expect(result.fact.note).toContain("Active 11. Stalled 2. Special 1.");
    expect(result.fact.note).toContain("Vs Wed threads +2.");
  });
});
