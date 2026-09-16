import { describe, expect, it } from "vitest";
import {
  calendarDayKey,
  classifyDueReminder,
  dueReminderRecipientIds,
  dueReminderStaffPath,
  dueReminderPortalPath,
  isOpenProjectStatus,
} from "@/lib/task-due-reminders";

const noonEt = (ymd: string) => new Date(`${ymd}T16:00:00.000Z`);

describe("assignee due reminders (P1-G)", () => {
  const now = new Date("2026-09-16T15:00:00.000Z");

  it("classifies today and tomorrow Eastern as due soon, past as overdue", () => {
    expect(calendarDayKey(now)).toBe("2026-09-16");
    expect(classifyDueReminder(noonEt("2026-09-16"), now)).toBe("due_soon");
    expect(classifyDueReminder(noonEt("2026-09-17"), now)).toBe("due_soon");
    expect(classifyDueReminder(noonEt("2026-09-15"), now)).toBe("overdue");
    expect(classifyDueReminder(noonEt("2026-09-20"), now)).toBeNull();
    expect(classifyDueReminder(null, now)).toBeNull();
  });

  it("notifies every join-table assignee, not only the primary", () => {
    expect(
      dueReminderRecipientIds({
        assigneeIds: ["pat", "lee", "anna"],
        primaryAssigneeId: "pat",
      }),
    ).toEqual(["pat", "lee", "anna"]);
    expect(
      dueReminderRecipientIds({
        assigneeIds: [],
        primaryAssigneeId: "sam",
      }),
    ).toEqual(["sam"]);
    expect(dueReminderRecipientIds({ assigneeIds: [], primaryAssigneeId: null })).toEqual([]);
  });

  it("uses staff and portal deep links (no invented PHI)", () => {
    expect(dueReminderStaffPath("proj", "task")).toBe("/projects/proj/tasks/task");
    expect(dueReminderPortalPath("proj", "task")).toBe("/portal/projects/proj/tasks/task");
  });

  it("skips completed / cancelled / pipeline-closed project statuses", () => {
    expect(isOpenProjectStatus("IN_PROGRESS")).toBe(true);
    expect(isOpenProjectStatus("COMPLETED")).toBe(false);
    expect(isOpenProjectStatus("CANCELLED")).toBe(false);
  });
});
