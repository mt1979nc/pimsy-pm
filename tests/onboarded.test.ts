import { describe, expect, it } from "vitest";
import {
  excludeOnboardedProjectTasks,
  excludeOnboardedProjects,
  isOverviewUpcomingDue,
  projectIsOnboarded,
} from "@/lib/onboarded";
import {
  assessHistoricalComplete,
  isOpenHistoricalTask,
  planOnTimeCompletions,
  spreadOnTimeStamps,
  utcNoon,
} from "@/lib/historical-complete";
import { utcDayKey } from "@/lib/dates";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

describe("Onboarded overview exclusion", () => {
  it("defaults to not onboarded", () => {
    expect(projectIsOnboarded(undefined)).toBe(false);
    expect(projectIsOnboarded({})).toBe(false);
    expect(projectIsOnboarded({ onboarded: false })).toBe(false);
    expect(projectIsOnboarded({ onboarded: true })).toBe(true);
  });

  it("drops onboarded sites and their tasks from due rollups", () => {
    const projects = [
      { id: "a", onboarded: false },
      { id: "b", onboarded: true },
    ];
    expect(excludeOnboardedProjects(projects).map((p) => p.id)).toEqual(["a"]);
    const tasks = [
      { id: "t1", project: { onboarded: false } },
      { id: "t2", project: { onboarded: true } },
      { id: "t3", project: null },
    ];
    expect(excludeOnboardedProjectTasks(tasks).map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it("treats overdue as upcoming-due on the overview window", () => {
    const now = Date.now();
    expect(isOverviewUpcomingDue(new Date(now - 2 * 86_400_000))).toBe(true);
    expect(isOverviewUpcomingDue(new Date(now + 3 * 86_400_000))).toBe(true);
    expect(isOverviewUpcomingDue(new Date(now + 10 * 86_400_000))).toBe(false);
    expect(isOverviewUpcomingDue(null)).toBe(false);
  });
});

describe("historical complete-on-time eligibility", () => {
  const dated = {
    startDate: d("2026-01-05"),
    actualGoLiveDate: d("2026-03-02"),
    targetGoLiveDate: d("2026-03-02"),
  };

  it("refuses active WIP even when kickoff and target go-live exist", () => {
    const r = assessHistoricalComplete({
      startDate: d("2026-01-05"),
      targetGoLiveDate: d("2026-03-02"),
      status: "IN_PROGRESS",
      onboarded: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Active WIP/i);
  });

  it("requires kickoff and an end date", () => {
    expect(assessHistoricalComplete({ status: "COMPLETED", onboarded: true }).ok).toBe(false);
    expect(
      assessHistoricalComplete({
        status: "COMPLETED",
        startDate: d("2026-01-05"),
      }).ok,
    ).toBe(false);
  });

  it("allows COMPLETED, post go-live, Onboarded, and archived", () => {
    expect(assessHistoricalComplete({ ...dated, status: "COMPLETED" }).ok).toBe(true);
    expect(
      assessHistoricalComplete({
        ...dated,
        status: "IN_PROGRESS",
        actualGoLiveDate: d("2026-03-02"),
      }).ok,
    ).toBe(true);
    expect(
      assessHistoricalComplete({
        startDate: d("2026-01-05"),
        targetGoLiveDate: d("2026-03-02"),
        status: "IN_PROGRESS",
        onboarded: true,
      }).ok,
    ).toBe(true);
    expect(
      assessHistoricalComplete({
        ...dated,
        status: "IN_PROGRESS",
        archivedAt: d("2026-03-10"),
      }).ok,
    ).toBe(true);
  });

  it("does not treat a future actual go-live as post go-live without another gate", () => {
    const r = assessHistoricalComplete(
      {
        startDate: d("2026-09-01"),
        actualGoLiveDate: d("2026-12-01"),
        status: "IN_PROGRESS",
        onboarded: false,
      },
      d("2026-09-14"),
    );
    expect(r.ok).toBe(false);
  });
});

describe("on-time completion stamps", () => {
  it("completes on or before the due date", () => {
    const planned = planOnTimeCompletions({
      kickoff: d("2026-01-05"),
      end: d("2026-03-02"),
      now: d("2026-09-14"),
      tasks: [
        { id: "due", status: "TODO", dueDate: d("2026-02-10") },
        { id: "late-due", status: "TODO", dueDate: d("2026-04-01") },
      ],
    });
    const byId = Object.fromEntries(planned.map((p) => [p.id, p]));
    expect(utcDayKey(byId.due!.completedAt)).toBe("2026-02-10");
    expect(byId.due!.completedAt.getTime()).toBeLessThanOrEqual(d("2026-02-10").getTime());
    expect(utcDayKey(byId["late-due"]!.completedAt)).toBe("2026-03-02");
    expect(byId["late-due"]!.completedAt.getTime()).toBeLessThanOrEqual(d("2026-04-01").getTime());
  });

  it("spreads missing dues evenly across kickoff → go-live", () => {
    const stamps = spreadOnTimeStamps(d("2026-01-05"), d("2026-01-15"), 3);
    expect(stamps.map(utcDayKey)).toEqual(["2026-01-05", "2026-01-10", "2026-01-15"]);

    const planned = planOnTimeCompletions({
      kickoff: d("2026-01-05"),
      end: d("2026-01-15"),
      now: d("2026-09-14"),
      tasks: [
        { id: "a", status: "TODO", dueDate: null, order: 0 },
        { id: "b", status: "IN_PROGRESS", dueDate: null, order: 1 },
        { id: "c", status: "BLOCKED", dueDate: null, order: 2 },
      ],
    });
    expect(planned.map((p) => utcDayKey(p.completedAt))).toEqual([
      "2026-01-05",
      "2026-01-10",
      "2026-01-15",
    ]);
  });

  it("skips DONE, CANCELLED, and N/A", () => {
    expect(isOpenHistoricalTask({ id: "1", status: "DONE" })).toBe(false);
    expect(isOpenHistoricalTask({ id: "2", status: "CANCELLED" })).toBe(false);
    expect(isOpenHistoricalTask({ id: "3", status: "TODO", notApplicable: true })).toBe(false);
    expect(isOpenHistoricalTask({ id: "4", status: "TODO" })).toBe(true);

    const planned = planOnTimeCompletions({
      kickoff: d("2026-01-05"),
      end: d("2026-03-02"),
      tasks: [
        { id: "open", status: "TODO", dueDate: d("2026-02-01") },
        { id: "done", status: "DONE", dueDate: d("2026-02-01") },
        { id: "na", status: "TODO", notApplicable: true, dueDate: d("2026-02-01") },
      ],
    });
    expect(planned.map((p) => p.id)).toEqual(["open"]);
  });

  it("does not stamp completedAt in the future", () => {
    const planned = planOnTimeCompletions({
      kickoff: d("2026-09-01"),
      end: d("2026-12-01"),
      now: d("2026-09-14"),
      tasks: [{ id: "future", status: "TODO", dueDate: d("2026-11-01") }],
    });
    expect(planned[0]!.completedAt.getTime()).toBeLessThanOrEqual(d("2026-09-14").getTime());
    expect(planned[0]!.completedAt.getTime()).toBeLessThanOrEqual(d("2026-11-01").getTime());
    expect(utcNoon(planned[0]!.completedAt).toISOString()).toContain("2026-09-14");
  });
});
