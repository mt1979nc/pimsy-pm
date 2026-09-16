import { describe, expect, it } from "vitest";
import {
  descendantIdsOf,
  eligibleParents,
  parentOptionsForPhase,
  resolveTaskMove,
  wouldCreateCycle,
  type MoveTaskNode,
} from "@/lib/task-move";

const discovery = "phase-discovery";
const config = "phase-config";

function t(
  id: string,
  opts: { parent?: string | null; phase?: string | null; title?: string } = {},
): MoveTaskNode {
  return {
    id,
    title: opts.title ?? id,
    phaseId: opts.phase === undefined ? discovery : opts.phase,
    parentTaskId: opts.parent ?? null,
  };
}

const tree: MoveTaskNode[] = [
  t("user-setup", { title: "User Setup" }),
  t("create-users", { parent: "user-setup", title: "Create Users" }),
  t("user-codes", { parent: "user-setup", title: "User Codes" }),
  t("follow-up", { parent: "create-users", title: "Schedule follow-up" }),
  t("kickoff", { title: "Kickoff" }),
  t("site-config", { phase: config, title: "Site Configuration" }),
  t("org-details", { phase: config, parent: "site-config", title: "Org details" }),
];

const phaseIds = new Set([discovery, config]);

describe("task move (section + parent)", () => {
  it("collects nested descendants, not siblings", () => {
    expect([...descendantIdsOf("user-setup", tree)].sort()).toEqual(
      ["create-users", "follow-up", "user-codes"].sort(),
    );
    expect([...descendantIdsOf("create-users", tree)].sort()).toEqual(["follow-up"]);
    expect(descendantIdsOf("kickoff", tree).size).toBe(0);
  });

  it("rejects nesting a parent under its own sub-task", () => {
    expect(wouldCreateCycle("user-setup", "create-users", tree)).toBe(true);
    expect(wouldCreateCycle("user-setup", "follow-up", tree)).toBe(true);
    expect(wouldCreateCycle("user-setup", "user-setup", tree)).toBe(true);
    expect(wouldCreateCycle("create-users", "site-config", tree)).toBe(false);
    expect(wouldCreateCycle("create-users", null, tree)).toBe(false);
  });

  it("lists eligible parents in the target section only", () => {
    const discoveryParents = eligibleParents("create-users", discovery, tree).map((p) => p.id);
    expect(discoveryParents).toContain("kickoff");
    expect(discoveryParents).toContain("user-setup");
    expect(discoveryParents).not.toContain("create-users");
    expect(discoveryParents).not.toContain("follow-up");
    expect(discoveryParents).not.toContain("site-config");

    const configParents = eligibleParents("create-users", config, tree).map((p) => p.id);
    expect(configParents).toEqual(["site-config", "org-details"]);
  });

  it("indents nested parent options", () => {
    const options = parentOptionsForPhase("kickoff", config, tree);
    const org = options.find((o) => o.id === "org-details");
    const site = options.find((o) => o.id === "site-config");
    expect(site?.depth).toBe(0);
    expect(org?.depth).toBe(1);
  });

  it("resolves a cross-parent move into another section", () => {
    const result = resolveTaskMove({
      taskId: "create-users",
      toPhaseId: config,
      toParentTaskId: "site-config",
      tasks: tree,
      phaseIds,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parentTaskId).toBe("site-config");
    expect(result.value.phaseId).toBe(config);
    expect(result.value.movingIds).toEqual(["create-users", "follow-up"]);
  });

  it("resolves a top-level move across sections and keeps children with the parent", () => {
    const result = resolveTaskMove({
      taskId: "user-setup",
      toPhaseId: config,
      toParentTaskId: null,
      tasks: tree,
      phaseIds,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parentTaskId).toBe(null);
    expect(result.value.phaseId).toBe(config);
    expect(result.value.movingIds[0]).toBe("user-setup");
    expect(result.value.movingIds).toEqual(
      expect.arrayContaining(["user-setup", "create-users", "user-codes", "follow-up"]),
    );
  });

  it("uses the parent's section when the requested phase disagrees", () => {
    const result = resolveTaskMove({
      taskId: "kickoff",
      toPhaseId: discovery,
      toParentTaskId: "site-config",
      tasks: tree,
      phaseIds,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.phaseId).toBe(config);
    expect(result.value.parentTaskId).toBe("site-config");
  });

  it("rejects a cycle and an unknown section", () => {
    const cycle = resolveTaskMove({
      taskId: "user-setup",
      toPhaseId: discovery,
      toParentTaskId: "follow-up",
      tasks: tree,
      phaseIds,
    });
    expect(cycle.ok).toBe(false);
    if (cycle.ok) return;
    expect(cycle.error).toMatch(/itself or one of its sub-tasks/);

    const missing = resolveTaskMove({
      taskId: "kickoff",
      toPhaseId: "nope",
      toParentTaskId: null,
      tasks: tree,
      phaseIds,
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error).toMatch(/section is not on this project/);
  });
});
