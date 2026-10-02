import { describe, expect, it } from "vitest";
import {
  excludeCollapsedDescendants,
  filterNestedTasks,
  isSectionComplete,
  parseTaskListPrefs,
  partitionCompletedGroups,
  sortPhaseSections,
  taskListPrefsKey,
  type FilterableTask,
} from "@/lib/task-list-filter";

function t(
  partial: Partial<FilterableTask> & Pick<FilterableTask, "id" | "title">,
): FilterableTask {
  return {
    parentTaskId: null,
    status: "TODO",
    ownerSide: "INTERNAL",
    ...partial,
  };
}

const tree: FilterableTask[] = [
  t({ id: "user-setup", title: "User Setup", status: "TODO" }),
  t({ id: "create-users", title: "Create Users", parentTaskId: "user-setup", status: "DONE" }),
  t({ id: "user-codes", title: "User Codes / Rates", parentTaskId: "user-setup", status: "TODO" }),
  t({ id: "logos", title: "Upload Company Logo(s)", ownerSide: "CUSTOMER", status: "TODO" }),
  t({ id: "done-parent", title: "Pre-Kickoff", status: "DONE" }),
  t({ id: "done-child", title: "Zendesk Company Setup", parentTaskId: "done-parent", status: "DONE" }),
];

describe("task list filter and completed collapse", () => {
  it("filters by query and keeps the parent of a matching sub-task", () => {
    const rows = filterNestedTasks(tree, { query: "codes", view: "all" });
    expect(rows.map((r) => r.id)).toEqual(["user-setup", "user-codes"]);
  });

  it("Open view hides fully completed groups but keeps mixed parents", () => {
    const rows = filterNestedTasks(tree, { query: "", view: "open" });
    expect(rows.some((r) => r.id === "done-parent")).toBe(false);
    expect(rows.some((r) => r.id === "user-setup")).toBe(true);
    expect(rows.some((r) => r.id === "create-users")).toBe(true);
  });

  it("Customer view is only customer-owned rows plus ancestors", () => {
    const rows = filterNestedTasks(tree, { query: "", view: "customer" });
    expect(rows.map((r) => r.id)).toEqual(["logos"]);
  });

  it("Mine view uses assigneeId or assigneeIds", () => {
    const withAssignee = tree.map((row) =>
      row.id === "logos" ? { ...row, assigneeIds: ["sam"] } : row,
    );
    const rows = filterNestedTasks(withAssignee, {
      query: "",
      view: "mine",
      currentUserId: "sam",
    });
    expect(rows.map((r) => r.id)).toEqual(["logos"]);
  });

  it("partitions fully completed groups for a collapsed section", () => {
    const { active, completed } = partitionCompletedGroups(tree);
    expect(completed.map((r) => r.id)).toEqual(["done-parent", "done-child"]);
    expect(active.some((r) => r.id === "user-setup")).toBe(true);
    expect(active.some((r) => r.id === "create-users")).toBe(true);
  });

  it("Punch keeps open items and their parents, and drops finished children", () => {
    const rows = filterNestedTasks(tree, { query: "", view: "punch" });
    expect(rows.map((r) => r.id)).toEqual(["user-setup", "user-codes", "logos"]);
  });

  it("Punch still shows a done parent when a child is open", () => {
    const rows = filterNestedTasks(
      [
        t({ id: "parent", title: "User Setup", status: "DONE" }),
        t({ id: "child", title: "User Codes / Rates", parentTaskId: "parent", status: "TODO" }),
      ],
      { query: "", view: "punch" },
    );
    expect(rows.map((r) => r.id)).toEqual(["parent", "child"]);
  });

  it("restores a saved punch filter and ignores junk", () => {
    expect(parseTaskListPrefs(JSON.stringify({ query: "logo", view: "punch" }))).toEqual({
      query: "logo",
      view: "punch",
    });
    expect(parseTaskListPrefs("not-json")).toBeNull();
    expect(parseTaskListPrefs(JSON.stringify({ view: "nope" }))).toBeNull();
    expect(taskListPrefsKey("proj-1")).toBe("path.task-list.staff.proj-1");
    expect(taskListPrefsKey("proj-1", "portal")).toBe("path.task-list.portal.proj-1");
  });

  it("hides descendants when a parent is collapsed", () => {
    const visible = excludeCollapsedDescendants(tree, new Set(["user-setup"]));
    expect(visible.map((r) => r.id)).not.toContain("create-users");
    expect(visible.map((r) => r.id)).not.toContain("user-codes");
    expect(visible.map((r) => r.id)).toContain("user-setup");
  });
});

describe("complete sections drop to the bottom", () => {
  it("treats DONE, N/A, and cancelled as complete; empty stays incomplete", () => {
    expect(isSectionComplete([{ status: "DONE" }, { status: "TODO", notApplicable: true }])).toBe(true);
    expect(isSectionComplete([{ status: "CANCELLED" }])).toBe(true);
    expect(isSectionComplete([{ status: "TODO" }, { status: "DONE" }])).toBe(false);
    expect(isSectionComplete([])).toBe(false);
    expect(isSectionComplete([], { sectionNotApplicable: true })).toBe(true);
  });

  it("keeps original order among open sections, then among completed ones", () => {
    const sections = [
      { id: "kickoff", notApplicable: false, tasks: [{ status: "DONE" }] },
      { id: "discovery", notApplicable: false, tasks: [{ status: "TODO" }] },
      { id: "config", notApplicable: false, tasks: [{ status: "DONE" }, { status: "TODO", notApplicable: true }] },
      { id: "training", notApplicable: false, tasks: [{ status: "IN_PROGRESS" }] },
      { id: "import", notApplicable: true, tasks: [{ status: "TODO" }] },
    ];
    expect(sortPhaseSections(sections).map((s) => s.id)).toEqual([
      "discovery",
      "training",
      "kickoff",
      "config",
      "import",
    ]);
  });
});
