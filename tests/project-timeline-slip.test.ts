import { describe, it, expect } from "vitest";
import { resolveSlipPush } from "@/lib/project-timeline";
import { parseDateInput, toDateInput, utcDayKey } from "@/lib/dates";

describe("resolveSlipPush — slipDays vs date round-trip", () => {
  it("slipDays=7 wins when requested is ±1 calendar day from current (UTC noon vs midnight)", () => {
    // Stored go-live as UTC noon (management parseDateInput style)
    const current = new Date("2026-11-13T12:00:00.000Z");
    // Form default via new Date('YYYY-MM-DD') → UTC midnight → looks like Nov 13 still,
    // but CT toISOString can also surface Nov 12. Simulate ±1 day noise.
    const requestedMinus1 = new Date("2026-11-12T00:00:00.000Z");
    const requestedPlus1 = new Date("2026-11-14T00:00:00.000Z");

    for (const requested of [requestedMinus1, requestedPlus1]) {
      const result = resolveSlipPush({
        currentGoLive: current,
        requestedGoLive: requested,
        slipDaysRaw: "7",
        slipCause: "CUSTOMER",
        slipNote: "customer delay",
      });
      expect(result.ok).toBe(true);
      if (!result.ok || !result.slipped) throw new Error("expected slipped");
      expect(result.days).toBe(7);
      expect(utcDayKey(result.nextGoLive)).toBe("2026-11-20");
      expect(utcDayKey(result.fromDate)).toBe("2026-11-13");
    }
  });

  it("without slipDays, same UTC calendar day is not a slip (noon vs midnight)", () => {
    const current = new Date("2026-11-13T12:00:00.000Z");
    const requested = new Date("2026-11-13T00:00:00.000Z");
    const result = resolveSlipPush({
      currentGoLive: current,
      requestedGoLive: requested,
      slipDaysRaw: undefined,
      slipCause: undefined,
      slipNote: undefined,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.slipped).toBe(false);
  });

  it("without slipDays, a real calendar-day change is still a slip", () => {
    const current = parseDateInput("2026-11-13")!;
    const requested = parseDateInput("2026-11-20")!;
    const result = resolveSlipPush({
      currentGoLive: current,
      requestedGoLive: requested,
      slipDaysRaw: "",
      slipCause: "PIMSY",
      slipNote: undefined,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.slipped) throw new Error("expected slipped");
    expect(result.days).toBe(7);
    expect(utcDayKey(result.nextGoLive)).toBe("2026-11-20");
  });

  it("toDateInput uses UTC calendar parts (no CT day-shift)", () => {
    // 2026-11-13T05:00:00.000Z is still Nov 13 UTC; in CT it is Nov 12 evening.
    // toISOString().slice would be fine here; the failure case is late-UTC evenings:
    const eveningUtc = new Date("2026-11-13T02:00:00.000Z"); // Nov 12 8pm CT
    expect(eveningUtc.toISOString().slice(0, 10)).toBe("2026-11-13");
    // Early morning UTC that is previous evening in US:
    const earlyUtcAsLocalEvening = new Date(Date.UTC(2026, 10, 13, 4, 0, 0)); // Nov 13 04:00Z
    expect(toDateInput(earlyUtcAsLocalEvening)).toBe("2026-11-13");
    expect(toDateInput(parseDateInput("2026-11-13"))).toBe("2026-11-13");
  });
});
