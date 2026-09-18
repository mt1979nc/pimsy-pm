import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  commentsForCustomerSurface,
  commentsForStaffSurface,
  isCustomerVisibleComment,
} from "@/lib/comment-visibility";

const shared = {
  id: "c-shared",
  body: "Please upload the questionnaire.",
  visibility: "SHARED" as const,
  deletedAt: null,
};
const internal = {
  id: "c-internal",
  body: "Pricing note for staff only.",
  visibility: "INTERNAL" as const,
  deletedAt: null,
};
const deletedShared = {
  id: "c-deleted",
  body: "Retracted.",
  visibility: "SHARED" as const,
  deletedAt: "2026-09-16T12:00:00.000Z",
};

describe("task comment visibility", () => {
  it("customers and Customer view see only live SHARED comments", () => {
    expect(isCustomerVisibleComment(shared)).toBe(true);
    expect(isCustomerVisibleComment(internal)).toBe(false);
    expect(isCustomerVisibleComment(deletedShared)).toBe(false);
    expect(commentsForCustomerSurface([shared, internal, deletedShared])).toEqual([shared]);
  });

  it("staff see SHARED and INTERNAL comments, not deleted rows", () => {
    expect(commentsForStaffSurface([shared, internal, deletedShared])).toEqual([shared, internal]);
  });

  it("Customer view task page loads and renders shared comments read-only", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/customer-view/tasks/[taskId]/page.tsx"),
      "utf8",
    );
    expect(src).toMatch(/previewPortalTaskComments/);
    expect(src).toMatch(/TaskComments/);
    expect(src).toMatch(/readOnly/);
    expect(src).not.toMatch(/from ["']@\/db["']/);
  });

  it("staff project task list shows a comment count from existing comments", () => {
    const row = readFileSync(resolve(process.cwd(), "src/components/task-row.tsx"), "utf8");
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/tasks/page.tsx"),
      "utf8",
    );
    const counts = readFileSync(resolve(process.cwd(), "src/lib/comment-counts.ts"), "utf8");
    expect(row).toMatch(/CommentCountBadge/);
    expect(row).toMatch(/commentCount/);
    expect(page).toMatch(/commentCountsByTaskIds/);
    expect(page).toMatch(/commentCount: commentCounts.get/);
    expect(counts).toMatch(/taskComments/);
    expect(counts).toMatch(/groupBy/);
    expect(counts).toMatch(/No denormalized count column/);
  });
});
