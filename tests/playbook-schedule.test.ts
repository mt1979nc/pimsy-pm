import { describe, expect, it } from "vitest";
import { EHR_PLAYBOOK, EHR_RCM_PLAYBOOK } from "@/db/template-playbooks";
import { IMPLEMENTATION_PHASES, type SeedTask } from "@/db/template-implementation";
import { playbookDayCount } from "@/lib/playbook-meta";
import { DEFAULT_SCOPE, forecastImplementation } from "@/lib/estimator";
import { recommendPhaseSchedule } from "@/lib/project-timeline";
import { utcDayKey } from "@/lib/dates";

/** Titles EHR+RCM moves onto the RCM tab. Day counts on everything else must match. */
const MOVED_TO_RCM = new Set([
  "Schedule Billing Workflow Discovery Meeting",
  "Payer Setup",
  "ClaimMD Enrollment",
]);

function taskDayMap(tasks: SeedTask[], prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const task of tasks) {
    const key = `${prefix}${task.title}`;
    out.set(key, `${task.offsetDays ?? 0}|${task.durationDays ?? 2}`);
    if (task.children?.length) {
      for (const [childKey, value] of taskDayMap(task.children, `${key}>`)) out.set(childKey, value);
    }
  }
  return out;
}

describe("EHR and EHR+RCM share schedule days", () => {
  it("uses the same go-live duration and the same day counts on shared phases", () => {
    expect(EHR_PLAYBOOK.durationDays).toBe(90);
    expect(EHR_RCM_PLAYBOOK.durationDays).toBe(EHR_PLAYBOOK.durationDays);

    for (const phase of EHR_PLAYBOOK.phases) {
      const other = EHR_RCM_PLAYBOOK.phases.find((p) => p.name === phase.name);
      expect(other, phase.name).toBeTruthy();
      expect(other?.offsetDays, phase.name).toBe(phase.offsetDays);
      expect(other?.durationDays, phase.name).toBe(phase.durationDays);
      const ehrTasks = taskDayMap(phase.tasks);
      const combined = taskDayMap(other?.tasks ?? []);
      for (const [title, days] of ehrTasks) {
        const leaf = title.split(">").pop() ?? title;
        if (!combined.has(title)) {
          expect(MOVED_TO_RCM.has(leaf), `${phase.name} / ${title}`).toBe(true);
          continue;
        }
        expect(combined.get(title), `${phase.name} / ${title}`).toBe(days);
      }
      for (const title of combined.keys()) {
        expect(ehrTasks.has(title), `${phase.name} / ${title}`).toBe(true);
      }
    }

    for (const milestone of EHR_PLAYBOOK.milestones) {
      const other = EHR_RCM_PLAYBOOK.milestones.find((m) => m.name === milestone.name);
      expect(other?.offsetDays, milestone.name).toBe(milestone.offsetDays);
    }
  });

  it("shows the Forecast go-live span on both full-implementation paths", () => {
    expect(
      playbookDayCount({ path: "EHR", templateDurationDays: 90, forecastCalendarDays: 64 }),
    ).toBe(64);
    expect(
      playbookDayCount({ path: "EHR_RCM", templateDurationDays: 90, forecastCalendarDays: 64 }),
    ).toBe(64);
    expect(
      playbookDayCount({ path: "RCM_LEGACY", templateDurationDays: 52, forecastCalendarDays: 64 }),
    ).toBe(52);
    expect(playbookDayCount({ path: "EHR", templateDurationDays: 90, forecastCalendarDays: null })).toBe(
      90,
    );
  });
});

describe("playbook tab order", () => {
  it("places Accessing Pimsy after Site Configuration and before Billing Configuration, once each", () => {
    const names = IMPLEMENTATION_PHASES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.indexOf("Site Configuration")).toBeLessThan(names.indexOf("Accessing Pimsy"));
    expect(names.indexOf("Accessing Pimsy")).toBeLessThan(names.indexOf("Billing Configuration"));
    expect(EHR_RCM_PLAYBOOK.phases.map((p) => p.name).filter((n) => n === "Accessing Pimsy")).toEqual([
      "Accessing Pimsy",
    ]);
  });
});

describe("EHR+RCM forecast windows", () => {
  it("keeps EHR section dates when RCM tabs are on the same playbook", () => {
    const kickoff = new Date("2026-09-16T12:00:00.000Z");
    const forecast = forecastImplementation(DEFAULT_SCOPE, kickoff, { skipUsFederalHolidays: false });
    const typical = forecast.scenarios.find((s) => s.scenario === "TYPICAL")!;
    const ehr = [
      { name: "Site Configuration", offsetDays: 14, durationDays: 28, workTrack: "EHR" as const },
      { name: "Core (Train the Trainer)", offsetDays: 42, durationDays: 21, workTrack: "EHR" as const },
    ];
    const combined = [
      ...ehr,
      { name: "Payer & Enrollment", offsetDays: 63, durationDays: 21, workTrack: "RCM" as const },
      { name: "Workflow & Handoff", offsetDays: 84, durationDays: 17, workTrack: "RCM" as const },
    ];
    const alone = recommendPhaseSchedule({
      phases: ehr,
      kickoff,
      scaleFactor: typical.calendarDays / 90,
      forecast: typical,
      skipUsFederalHolidays: false,
    });
    const withRcm = recommendPhaseSchedule({
      phases: combined,
      kickoff,
      scaleFactor: typical.calendarDays / 90,
      forecast: typical,
      skipUsFederalHolidays: false,
    });
    expect(utcDayKey(withRcm.get("Site Configuration")!.startDate)).toBe(
      utcDayKey(alone.get("Site Configuration")!.startDate),
    );
    expect(utcDayKey(withRcm.get("Site Configuration")!.dueDate)).toBe(
      utcDayKey(alone.get("Site Configuration")!.dueDate),
    );
    expect(utcDayKey(withRcm.get("Core (Train the Trainer)")!.dueDate)).toBe(
      utcDayKey(alone.get("Core (Train the Trainer)")!.dueDate),
    );
    expect(withRcm.get("Payer & Enrollment")).toBeTruthy();
    expect(withRcm.get("Workflow & Handoff")).toBeTruthy();
  });
});
