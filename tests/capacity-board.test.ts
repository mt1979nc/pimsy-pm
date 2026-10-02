import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  capacityNoteBadge,
  groupSitesUnderSpecialists,
  isCapacityPhase,
  modelCapacityPhase,
  slipDeleteRestoresGoLive,
  slipPersistencePlan,
  type CapacityGroupSite,
} from "@/lib/capacity-phase";
import { parseDateInput, utcDayKey } from "@/lib/dates";
import { previewSlipGoLive } from "@/lib/go-live-weekday";

function site(partial: Partial<CapacityGroupSite> & Pick<CapacityGroupSite, "id" | "acronym">): CapacityGroupSite {
  return {
    leadId: null,
    coLeadId: null,
    ownerSplitPercent: 100,
    prismStatus: "active",
    ...partial,
  };
}

describe("capacity site grouping", () => {
  const alex = "alex";
  const danielle = "danielle";
  const sites = [
    site({ id: "bdmh", acronym: "BDMH", leadId: alex }),
    site({
      id: "cedar",
      acronym: "CEDAR",
      leadId: alex,
      coLeadId: danielle,
      ownerSplitPercent: 60,
    }),
    site({ id: "bhc", acronym: "BHC", leadId: danielle }),
    site({ id: "pipe", acronym: "PIPE", leadId: alex, prismStatus: "pipeline" }),
    site({ id: "none", acronym: "NONE" }),
  ];

  it("keeps each specialist's sites on their own card", () => {
    const grouped = groupSitesUnderSpecialists([alex, danielle], sites);
    expect(grouped.byMember[alex]?.map((s) => s.acronym)).toEqual(["BDMH", "CEDAR"]);
    expect(grouped.byMember[danielle]?.map((s) => s.acronym)).toEqual(["BHC", "CEDAR"]);
    expect(grouped.byMember[alex]?.map((s) => s.id)).not.toEqual(
      grouped.byMember[danielle]?.map((s) => s.id),
    );
  });

  it("splits a co-led site and marks the co-lead as secondary", () => {
    const grouped = groupSitesUnderSpecialists([alex, danielle], sites);
    const primary = grouped.byMember[alex]?.find((s) => s.acronym === "CEDAR");
    const secondary = grouped.byMember[danielle]?.find((s) => s.acronym === "CEDAR");
    expect(primary).toMatchObject({ splitPercent: 60, isSecondary: false });
    expect(secondary).toMatchObject({ splitPercent: 40, isSecondary: true });
  });

  it("drops pipeline and parks ownerless sites instead of flattening the roster", () => {
    const grouped = groupSitesUnderSpecialists([alex, danielle], sites);
    const allIds = [
      ...grouped.byMember[alex]!,
      ...grouped.byMember[danielle]!,
      ...grouped.unassigned,
    ].map((s) => s.id);
    expect(allIds).not.toContain("pipe");
    expect(grouped.unassigned.map((s) => s.acronym)).toEqual(["NONE"]);
  });

  it("does not drop a site whose owner is missing from the roster", () => {
    const grouped = groupSitesUnderSpecialists([alex], [
      site({ id: "orphan", acronym: "ORPH", leadId: "gone" }),
    ]);
    expect(grouped.byMember[alex]).toEqual([]);
    expect(grouped.unassigned.map((s) => s.acronym)).toEqual(["ORPH"]);
  });
});

describe("capacity phase", () => {
  const kickoff = parseDateInput("2026-09-01")!;
  const goLive = parseDateInput("2026-12-01")!;

  it("uses the Prism phase list and treats a blank value as unrecorded", () => {
    expect(isCapacityPhase("config")).toBe(true);
    expect(isCapacityPhase("IN_PROGRESS")).toBe(false);
    expect(isCapacityPhase(null)).toBe(false);
  });

  it("guesses a phase from the kickoff → go-live window and does not require a stored value", () => {
    expect(modelCapacityPhase({ asOf: parseDateInput("2026-08-15")!, kickoff, goLive })).toBe("kickoff");
    expect(modelCapacityPhase({ asOf: parseDateInput("2026-09-03")!, kickoff, goLive })).toBe("kickoff");
    expect(modelCapacityPhase({ asOf: parseDateInput("2026-09-20")!, kickoff, goLive })).toBe("discovery");
    expect(modelCapacityPhase({ asOf: parseDateInput("2026-10-20")!, kickoff, goLive })).toBe("config");
    expect(modelCapacityPhase({ asOf: parseDateInput("2026-11-10")!, kickoff, goLive })).toBe("training");
    expect(modelCapacityPhase({ asOf: parseDateInput("2026-11-26")!, kickoff, goLive })).toBe("pregolive");
    expect(modelCapacityPhase({ asOf: parseDateInput("2026-12-01")!, kickoff, goLive })).toBe("complete");
    expect(modelCapacityPhase({ asOf: parseDateInput("2026-10-02")!, kickoff: null, goLive: null })).toBeNull();
  });
});

describe("capacity badges", () => {
  it("shows the special tag, plus stalled, pre-go-live, and pre-kickoff", () => {
    expect(capacityNoteBadge({ prismStatus: "active", prismNote: "special" })).toEqual({
      label: "special",
      tone: "violet",
    });
    expect(capacityNoteBadge({ prismStatus: "active", prismNote: "Special" })?.label).toBe("special");
    expect(capacityNoteBadge({ prismStatus: "active", prismNote: "stalled" })?.label).toBe("stalled");
    expect(capacityNoteBadge({ prismStatus: "active", prismNote: "pre-go-live" })?.label).toBe("pre-go-live");
    expect(capacityNoteBadge({ prismStatus: "pre-kickoff", prismNote: "special" })?.label).toBe("pre-kickoff");
    expect(capacityNoteBadge({ prismStatus: "active", prismNote: "bring donuts" })).toBeNull();
  });
});

describe("weekday go-live", () => {
  const monday = parseDateInput("2026-10-05")!;
  const thursday = parseDateInput("2026-10-01")!;
  const friday = parseDateInput("2026-10-02")!;

  it("prefers Monday when suggesting a later slip and snaps weekends", () => {
    const mondayPlusWeek = previewSlipGoLive({ currentGoLive: monday, slipDaysRaw: "7" });
    expect(mondayPlusWeek.ok).toBe(true);
    if (!mondayPlusWeek.ok) return;
    expect(utcDayKey(mondayPlusWeek.next)).toBe("2026-10-12");
    expect(mondayPlusWeek.snapNote).toBeNull();
    expect(mondayPlusWeek.days).toBe(7);

    const thursdayPlusOne = previewSlipGoLive({ currentGoLive: thursday, slipDaysRaw: "1" });
    expect(thursdayPlusOne.ok).toBe(true);
    if (!thursdayPlusOne.ok) return;
    expect(utcDayKey(thursdayPlusOne.next)).toBe("2026-10-05");
    expect(thursdayPlusOne.snapNote).toMatch(/Monday/);

    const fridayPlusOne = previewSlipGoLive({ currentGoLive: friday, slipDaysRaw: "1" });
    expect(fridayPlusOne.ok).toBe(true);
    if (!fridayPlusOne.ok) return;
    expect(utcDayKey(fridayPlusOne.next)).toBe("2026-10-05");
    expect(new Date(fridayPlusOne.next).getUTCDay()).toBe(1);
  });

  it("keeps an explicit weekday and pulls a weekend slip back to Friday", () => {
    const wednesday = previewSlipGoLive({
      currentGoLive: monday,
      requestedGoLive: parseDateInput("2026-10-07"),
    });
    expect(wednesday.ok).toBe(true);
    if (!wednesday.ok) return;
    expect(utcDayKey(wednesday.next)).toBe("2026-10-07");
    expect(wednesday.snapNote).toBeNull();

    const earlierWeekend = previewSlipGoLive({ currentGoLive: monday, slipDaysRaw: "-2" });
    expect(earlierWeekend.ok).toBe(true);
    if (!earlierWeekend.ok) return;
    expect(utcDayKey(earlierWeekend.next)).toBe("2026-10-02");
    expect(earlierWeekend.snapNote).toMatch(/Friday/);
    expect(earlierWeekend.days).toBeLessThan(0);
  });
});

describe("slip approval", () => {
  it("records the slip either way and moves go-live only when approved", () => {
    expect(slipPersistencePlan(true)).toEqual({
      updateGoLive: true,
      recordSlip: true,
      goLiveApplied: true,
    });
    expect(slipPersistencePlan(false)).toEqual({
      updateGoLive: false,
      recordSlip: true,
      goLiveApplied: false,
    });
    expect(slipDeleteRestoresGoLive(true)).toBe(true);
    expect(slipDeleteRestoresGoLive(false)).toBe(false);
    expect(slipDeleteRestoresGoLive(undefined)).toBe(true);
  });
});

describe("team capacity page", () => {
  it("renders site rows under specialists with phase, special, and slip history", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/(app)/management/capacity/page.tsx"), "utf8");
    const cards = readFileSync(resolve(process.cwd(), "src/components/reorderable-member-cards.tsx"), "utf8");
    const rows = readFileSync(resolve(process.cwd(), "src/components/capacity-site-rows.tsx"), "utf8");
    const slip = readFileSync(resolve(process.cwd(), "src/components/record-slip-form.tsx"), "utf8");
    expect(page).toMatch(/sitesByMember/);
    expect(page).toMatch(/<ReorderableMemberLoadCards/);
    expect(cards).toMatch(/CapacityMemberBody/);
    expect(cards).not.toMatch(/sites\.flat\(/);
    expect(rows).toMatch(/Phase for/);
    expect(rows).toMatch(/capacityNoteBadge/);
    expect(rows).toMatch(/SlipHistoryList/);
    expect(rows).toMatch(/Update go-live/);
    expect(rows).toMatch(/Keep current date/);
    expect(slip).toMatch(/approveGoLive/);
    expect(slip).toMatch(/Update go-live/);
    expect(slip).toMatch(/Keep current date/);
  });
});
