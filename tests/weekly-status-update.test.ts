import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROJECT_UPDATES_DUE_TODAY_LABEL,
  PROJECT_UPDATES_THURSDAY_HEADLINE,
  PROJECT_UPDATES_THURSDAY_ITEMS,
} from "@/lib/project-updates";
import {
  addCalendarDays,
  hourInZone,
  isWeeklyUpdateReminderDay,
  shouldSendWeeklyUpdateReminder,
  siteNeedsThisWeekUpdate,
  thisThursdayStart,
  weeklyUpdateReminderTitle,
  weeklyUpdateSiteLabel,
  weekdayInZone,
  WEEKLY_UPDATE_TIME_ZONE,
  zonedWallTimeToUtc,
} from "@/lib/weekly-status-update";
import { typesFor, shouldEmail, builtInDefaults } from "@/lib/notification-prefs";

describe("Thursday Updates standing instruction", () => {
  it("keeps copy short, scannable, and easy to tweak", () => {
    expect(PROJECT_UPDATES_THURSDAY_HEADLINE).toMatch(/Thursday/i);
    expect(PROJECT_UPDATES_THURSDAY_HEADLINE.length).toBeLessThan(48);
    expect([...PROJECT_UPDATES_THURSDAY_ITEMS]).toEqual([
      "Temperature / health of the account",
      "Concerns the site raised",
      "Whether any risks were added",
    ]);
    expect(PROJECT_UPDATES_THURSDAY_ITEMS.every((item) => item.length < 48)).toBe(true);
    expect(PROJECT_UPDATES_DUE_TODAY_LABEL).toBe("Due today");
  });

  it("renders above the staff Updates composer, not the portal", () => {
    const forms = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/overview-forms.tsx"),
      "utf8",
    );
    expect(forms).toMatch(/WeeklyUpdateInstruction/);
    expect(forms).toMatch(/PROJECT_UPDATES_THURSDAY_HEADLINE/);
    expect(forms).toMatch(/PROJECT_UPDATES_THURSDAY_ITEMS/);
    expect(forms).toMatch(/MentionTextarea/);

    const staff = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/page.tsx"),
      "utf8",
    );
    expect(staff).toMatch(/StatusUpdateForm/);

    const portal = readFileSync(
      resolve(process.cwd(), "src/app/portal/projects/[id]/page.tsx"),
      "utf8",
    );
    expect(portal).not.toMatch(/PROJECT_UPDATES_THURSDAY/);
    expect(portal).not.toMatch(/WeeklyUpdateInstruction/);
  });
});

describe("weekly status-update reminder window", () => {
  it("treats Thursday 00:00 Chicago as the week start (CDT)", () => {
    // Thursday 2026-09-17 09:00 CDT = 14:00 UTC
    const thuMorning = new Date("2026-09-17T14:00:00.000Z");
    expect(isWeeklyUpdateReminderDay(thuMorning)).toBe(true);
    expect(weekdayInZone(thuMorning)).toBe(4);
    expect(thisThursdayStart(thuMorning).toISOString()).toBe("2026-09-17T05:00:00.000Z");
    expect(shouldSendWeeklyUpdateReminder(thuMorning)).toBe(true);

    // Thursday 07:00 CDT — before 08:00 local
    const thuEarly = new Date("2026-09-17T12:00:00.000Z");
    expect(isWeeklyUpdateReminderDay(thuEarly)).toBe(true);
    expect(hourInZone(thuEarly)).toBe(7);
    expect(shouldSendWeeklyUpdateReminder(thuEarly)).toBe(false);

    // Friday does not send
    const friday = new Date("2026-09-18T14:00:00.000Z");
    expect(isWeeklyUpdateReminderDay(friday)).toBe(false);
    expect(shouldSendWeeklyUpdateReminder(friday)).toBe(false);
    expect(thisThursdayStart(friday).toISOString()).toBe("2026-09-17T05:00:00.000Z");
  });

  it("uses CST midnight before DST (UTC-6)", () => {
    const thu = new Date("2026-01-08T15:00:00.000Z"); // Thursday 09:00 CST
    expect(isWeeklyUpdateReminderDay(thu)).toBe(true);
    expect(thisThursdayStart(thu).toISOString()).toBe("2026-01-08T06:00:00.000Z");
  });

  it("counts only lead updates at or after this Thursday 00:00", () => {
    const weekStart = new Date("2026-09-17T05:00:00.000Z");
    expect(siteNeedsThisWeekUpdate(null, weekStart)).toBe(true);
    expect(siteNeedsThisWeekUpdate(new Date("2026-09-16T20:00:00.000Z"), weekStart)).toBe(true);
    expect(siteNeedsThisWeekUpdate(new Date("2026-09-17T05:00:00.000Z"), weekStart)).toBe(false);
    expect(siteNeedsThisWeekUpdate(new Date("2026-09-17T13:00:00.000Z"), weekStart)).toBe(false);
  });

  it("titles the reminder with site acronyms", () => {
    expect(weeklyUpdateSiteLabel({ id: "1", code: "IMP-1", crmAcronym: "CEDAR" })).toBe("CEDAR");
    expect(weeklyUpdateSiteLabel({ id: "1", code: "BHC", crmAcronym: null })).toBe("BHC");
    expect(weeklyUpdateReminderTitle(["BHC", "CEDAR", "THS"])).toBe(
      "Due today: Provide account updates for sites BHC, CEDAR, THS",
    );
  });

  it("adds calendar days on the YMD string without TZ shift", () => {
    expect(addCalendarDays("2026-09-17", -7)).toBe("2026-09-10");
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("resolves Chicago wall time around DST", () => {
    expect(zonedWallTimeToUtc(2026, 3, 5, 0, 0, WEEKLY_UPDATE_TIME_ZONE).toISOString()).toBe(
      "2026-03-05T06:00:00.000Z",
    );
    expect(zonedWallTimeToUtc(2026, 3, 12, 0, 0, WEEKLY_UPDATE_TIME_ZONE).toISOString()).toBe(
      "2026-03-12T05:00:00.000Z",
    );
  });

  it("exposes a CRON_SECRET cron route for the Thursday reminder", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/cron/weekly-status-update-reminder/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/CRON_SECRET/);
    expect(route).toMatch(/runWeeklyStatusUpdateReminder/);
    expect(route).toMatch(/404/);
  });

  it("is a staff-only alert, email on by default", () => {
    expect(typesFor("customer").map((t) => t.type)).not.toContain("STATUS_UPDATE_DUE");
    expect(typesFor("staff").map((t) => t.type)).toContain("STATUS_UPDATE_DUE");
    const org = {
      staffDefaults: builtInDefaults("staff"),
      customerDefaults: builtInDefaults("customer"),
      emailEnabled: true,
    };
    expect(shouldEmail({ role: "SPECIALIST" }, "STATUS_UPDATE_DUE", org)).toBe(true);
    expect(shouldEmail({ role: "CUSTOMER" }, "STATUS_UPDATE_DUE", org)).toBe(false);
  });
});
