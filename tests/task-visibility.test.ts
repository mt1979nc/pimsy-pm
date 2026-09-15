import { describe, expect, it } from "vitest";
import {
  filterPortalFacingTasks,
  isPortalFacingTask,
  isSpecialistSubtask,
  liveTaskCreateDefaults,
} from "@/lib/task-visibility";
import { orderTasksForNesting } from "@/lib/task-tree";

describe("specialist sub-task vs parent visibility", () => {
  it("treats internal nested work as specialist sub-tasks", () => {
    expect(
      isSpecialistSubtask({ parentTaskId: "user-setup", ownerSide: "INTERNAL" }),
    ).toBe(true);
    expect(isSpecialistSubtask({ parentTaskId: null, ownerSide: "INTERNAL" })).toBe(false);
    expect(isSpecialistSubtask({ parentTaskId: "training-1", ownerSide: "CUSTOMER" })).toBe(false);
  });

  it("hides specialist children from the portal even when marked SHARED", () => {
    const userSetup = {
      title: "User Setup",
      visibility: "SHARED",
      ownerSide: "INTERNAL",
      parentTaskId: null,
      status: "TODO",
      notApplicable: false,
    };
    const createUsers = {
      title: "Create Users",
      visibility: "SHARED",
      ownerSide: "INTERNAL",
      parentTaskId: "user-setup",
      status: "TODO",
      notApplicable: false,
    };
    const scheduleTraining = {
      title: "Schedule Training 1",
      visibility: "SHARED",
      ownerSide: "CUSTOMER",
      parentTaskId: "training-1",
      status: "TODO",
      notApplicable: false,
    };

    expect(isPortalFacingTask(userSetup)).toBe(true);
    expect(isPortalFacingTask(createUsers)).toBe(false);
    expect(isPortalFacingTask(scheduleTraining)).toBe(true);
    expect(isPortalFacingTask({ ...createUsers, visibility: "INTERNAL" })).toBe(false);

    expect(filterPortalFacingTasks([userSetup, createUsers, scheduleTraining]).map((t) => t.title)).toEqual(
      ["User Setup", "Schedule Training 1"],
    );
  });

  it("defaults live sub-tasks to internal specialist work", () => {
    expect(liveTaskCreateDefaults({ parentTaskId: "parent", visibility: "SHARED" })).toEqual({
      ownerSide: "INTERNAL",
      visibility: "INTERNAL",
    });
    expect(liveTaskCreateDefaults({ parentTaskId: "parent", ownerSide: "CUSTOMER" })).toEqual({
      ownerSide: "CUSTOMER",
      visibility: "SHARED",
    });
    expect(
      liveTaskCreateDefaults({
        parentTaskId: null,
        ownerSide: "INTERNAL",
        visibility: "SHARED",
      }),
    ).toEqual({ ownerSide: "INTERNAL", visibility: "SHARED" });
  });

  it("presents portal orphans (customer child of a hidden parent) at depth 0", () => {
    const rows = orderTasksForNesting([
      { id: "schedule", parentTaskId: "hidden-kickoff", order: 0 },
      { id: "user-setup", parentTaskId: null, order: 1 },
      { id: "create-users", parentTaskId: "user-setup", order: 2 },
    ]);
    expect(rows.map((r) => `${r.depth}:${r.id}`)).toEqual([
      "0:user-setup",
      "1:create-users",
      "0:schedule",
    ]);
  });
});
