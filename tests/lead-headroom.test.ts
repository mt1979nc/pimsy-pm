import { describe, expect, it } from "vitest";

import { leadLoadsFromForecast, rankLeadHeadroom, type LeadLoad } from "@/lib/lead-headroom";

const weeks = ["2026-11-16", "2026-11-23", "2026-11-30"];
const kickoff = new Date("2026-11-16T12:00:00.000Z");
const goLive = new Date("2026-11-28T12:00:00.000Z");

function person(partial: Partial<LeadLoad> & Pick<LeadLoad, "id" | "name">): LeadLoad {
  return {
    capacityHoursPerWeek: 30,
    weeklyLoad: [0, 0, 0],
    ...partial,
  };
}

describe("Forecast+ lead ranking", () => {
  it("picks the person with the most free hours in the tightest week of the window", () => {
    const ranked = rankLeadHeadroom({
      candidates: [
        person({ id: "alex", name: "Alexander", weeklyLoad: [20, 10, 0] }),
        person({ id: "morgan", name: "Morgan", weeklyLoad: [5, 5, 28] }),
        person({ id: "jeremy", name: "Jeremy", capacityHoursPerWeek: 30, weeklyLoad: [18, 18, 0] }),
      ],
      weekStarts: weeks,
      kickoff,
      goLive,
    });
    expect(ranked.suggested).toMatchObject({
      id: "morgan",
      freeHoursPerWeek: 25,
      reason: "Most room: 25 h/wk free",
    });
    expect(ranked.runnerUp).toMatchObject({
      id: "jeremy",
      freeHoursPerWeek: 12,
      reason: "Next: Jeremy, 12 h/wk free",
    });
  });

  it("ignores weeks outside the projected go-live and keeps only Can lead people from the forecast", () => {
    const outside = rankLeadHeadroom({
      candidates: [person({ id: "sam", name: "Sam", weeklyLoad: [0, 0, 29] })],
      weekStarts: weeks,
      kickoff,
      goLive,
    });
    expect(outside.suggested?.freeHoursPerWeek).toBe(30);

    const loads = leadLoadsFromForecast({
      weeks: weeks.map((weekOf, index) => ({
        weekOf: new Date(`${weekOf}T12:00:00.000Z`),
        byPerson: [{ id: "sam", hours: index === 0 ? 4 : 0 }, { id: "former", hours: 10 }],
      })),
      staff: [
        { id: "sam", name: "Sam Balaz", capacityHoursPerWeek: 30, canLead: true },
        { id: "former", name: "Danielle", capacityHoursPerWeek: 30, canLead: false },
        { id: "hidden", name: "Not on the list", capacityHoursPerWeek: 30, canLead: true },
      ],
      allowedIds: new Set(["sam", "former"]),
    });
    expect(loads.weekStarts).toEqual(weeks);
    expect(loads.candidates.map((person) => person.id)).toEqual(["sam"]);
    expect(loads.candidates[0]?.weeklyLoad).toEqual([4, 0, 0]);
  });
});
