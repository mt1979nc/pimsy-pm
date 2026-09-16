import { describe, expect, it } from "vitest";
import {
  excludeCollapsedDescendants,
  filterNestedTasks,
  partitionCompletedGroups,
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

  it("hides descendants when a parent is collapsed", () => {
    const visible = excludeCollapsedDescendants(tree, new Set(["user-setup"]));
    expect(visible.map((r) => r.id)).not.toContain("create-users");
    expect(visible.map((r) => r.id)).not.toContain("user-codes");
    expect(visible.map((r) => r.id)).toContain("user-setup");
  });
});
