/**
 * Parent vs specialist sub-task visibility.
 *
 * Configuration parents (e.g. User Setup) are customer-facing status. Nested
 * specialist work under them is a staff checklist — the portal and customer
 * shared view show the parent done/not, not Create Users / User Codes / …
 *
 * Customer-owned nested tasks (e.g. Schedule Training 1) stay visible: those
 * are the practice’s own action items.
 *
 * Playbook authoring stays on /templates (OWNER/ADMIN). Specialists add or
 * remove live tasks; they do not get a Dock-style workspace template editor.
 */

import { and, eq, ne, or, isNull, type SQL } from "drizzle-orm";
import { tasks } from "@/db/schema";

export function isSpecialistSubtask(task: {
  parentTaskId?: string | null;
  ownerSide: string;
}): boolean {
  return Boolean(task.parentTaskId) && task.ownerSide === "INTERNAL";
}

export function isPortalFacingTask(task: {
  visibility: string;
  ownerSide: string;
  parentTaskId?: string | null;
  status?: string;
  notApplicable?: boolean;
}): boolean {
  if (task.visibility !== "SHARED") return false;
  if (task.notApplicable) return false;
  if (task.status === "CANCELLED") return false;
  return !isSpecialistSubtask(task);
}

export function filterPortalFacingTasks<
  T extends {
    visibility: string;
    ownerSide: string;
    parentTaskId?: string | null;
    status?: string;
    notApplicable?: boolean;
  },
>(rows: T[]): T[] {
  return rows.filter(isPortalFacingTask);
}

/**
 * SQL for portal / customer-view task lists: SHARED, active, and either a
 * parent/main task or a customer-owned nested action item.
 */
export function portalFacingTaskSql(): SQL {
  return and(
    eq(tasks.visibility, "SHARED"),
    ne(tasks.status, "CANCELLED"),
    eq(tasks.notApplicable, false),
    or(isNull(tasks.parentTaskId), eq(tasks.ownerSide, "CUSTOMER")),
  )!;
}

/**
 * Defaults for a live-project create. New sub-tasks are specialist work
 * (internal) unless explicitly assigned to the customer.
 */
export function liveTaskCreateDefaults(input: {
  ownerSide?: "INTERNAL" | "CUSTOMER";
  visibility?: "INTERNAL" | "SHARED";
  parentTaskId?: string | null;
}): { ownerSide: "INTERNAL" | "CUSTOMER"; visibility: "INTERNAL" | "SHARED" } {
  const ownerSide = input.ownerSide ?? "INTERNAL";
  if (ownerSide === "CUSTOMER") {
    return { ownerSide, visibility: "SHARED" };
  }
  if (input.parentTaskId) {
    return { ownerSide, visibility: "INTERNAL" };
  }
  return { ownerSide, visibility: input.visibility ?? "INTERNAL" };
}
