import { describe, expect, it } from "vitest";
import {
  matchMilestonePhaseId,
  milestoneRollupPatches,
  phaseClearedByTasks,
} from "@/lib/milestone-rollup";

describe("milestone rollup from task completion", () => {
  const phases = [
    { id: "kickoff", name: "Kickoff" },
    { id: "discovery", name: "Discovery" },
    { id: "config", name: "Site Configuration" },
    { id: "import", name: "Demographic Import" },
    { id: "core", name: "Core (Train the Trainer)" },
    { id: "checklist", name: "Go-Live Checklist" },
    { id: "tier2", name: "Post Go-Live (Tier 2)" },
  ];

  it("matches playbook milestone names to sections", () => {
    expect(matchMilestonePhaseId("Kickoff call complete", phases)).toBe("kickoff");
    expect(matchMilestonePhaseId("Discovery materials received", phases)).toBe("discovery");
    expect(matchMilestonePhaseId("Site configuration complete", phases)).toBe("config");
    expect(matchMilestonePhaseId("Data import validated", phases)).toBe("import");
    expect(matchMilestonePhaseId("Core training complete", phases)).toBe("core");
    expect(matchMilestonePhaseId("Go-live readiness sign-off", phases)).toBe("checklist");
    expect(matchMilestonePhaseId("Tier 2 training complete", phases)).toBe("tier2");
  });

  it("treats a section as cleared when remaining countable tasks are DONE", () => {
    expect(
      phaseClearedByTasks([
        { phaseId: "discovery", status: "DONE", notApplicable: false },
        { phaseId: "discovery", status: "TODO", notApplicable: true },
        { phaseId: "discovery", status: "CANCELLED", notApplicable: false },
      ]),
    ).toBe(true);
    expect(
      phaseClearedByTasks([{ phaseId: "discovery", status: "TODO", notApplicable: false }]),
    ).toBe(false);
    expect(phaseClearedByTasks([])).toBe(false);
  });

  it("completes a matching milestone when its section tasks are done", () => {
    const patches = milestoneRollupPatches({
      now: new Date("2026-09-16T12:00:00.000Z"),
      milestones: [
        { id: "ms-disc", name: "Discovery materials received", isGoLive: false, completedAt: null },
        { id: "ms-gl", name: "Go-Live", isGoLive: true, completedAt: null },
      ],
      phases,
      tasks: [
        { phaseId: "discovery", status: "DONE", notApplicable: false },
        { phaseId: "discovery", status: "DONE", notApplicable: false },
        { phaseId: "config", status: "TODO", notApplicable: false },
      ],
    });
    expect(patches).toEqual([
      {
        id: "ms-disc",
        completedAt: new Date("2026-09-16T12:00:00.000Z"),
        action: "complete",
      },
    ]);
  });

  it("does not auto-complete the Go-Live milestone from task ticks", () => {
    const patches = milestoneRollupPatches({
      milestones: [{ id: "ms-gl", name: "Go-Live", isGoLive: true, completedAt: null }],
      phases,
      tasks: [{ phaseId: "checklist", status: "DONE", notApplicable: false }],
    });
    expect(patches).toEqual([]);
  });

  it("reopens a rolled-up milestone when a section task is reopened", () => {
    const patches = milestoneRollupPatches({
      milestones: [
        {
          id: "ms-disc",
          name: "Discovery materials received",
          isGoLive: false,
          completedAt: new Date("2026-09-10T12:00:00.000Z"),
        },
      ],
      phases,
      tasks: [{ phaseId: "discovery", status: "TODO", notApplicable: false }],
    });
    expect(patches).toEqual([{ id: "ms-disc", completedAt: null, action: "reopen" }]);
  });
});
