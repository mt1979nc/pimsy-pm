import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CAPACITY_MEMBER_CARD_ORDER_KEY,
  moveIdBy,
  orderMembersByPreference,
  parseMemberCardOrder,
  reorderIds,
} from "@/lib/member-card-order";

describe("team capacity card order", () => {
  const people = [
    { id: "a", name: "Alex" },
    { id: "b", name: "Blair" },
    { id: "c", name: "Casey" },
  ];

  it("applies a saved order and appends people who are new", () => {
    expect(orderMembersByPreference(people, ["c", "a"]).map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(orderMembersByPreference(people, ["c", "missing", "c", "a"]).map((p) => p.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(orderMembersByPreference(people, []).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("moves one card onto another and steps up or down without leaving the list", () => {
    expect(reorderIds(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(reorderIds(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(reorderIds(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
    expect(moveIdBy(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveIdBy(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveIdBy(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveIdBy(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });

  it("ignores a stored value that is not a list of ids", () => {
    expect(parseMemberCardOrder(null)).toEqual([]);
    expect(parseMemberCardOrder("")).toEqual([]);
    expect(parseMemberCardOrder("{")).toEqual([]);
    expect(parseMemberCardOrder('{"id":"a"}')).toEqual([]);
    expect(parseMemberCardOrder('["b","","b",1,"a"]')).toEqual(["b", "a"]);
    expect(CAPACITY_MEMBER_CARD_ORDER_KEY).toBe("path.capacity.member-card-order");
  });

  it("reorders only the capacity headroom cards and leaves the math alone", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/(app)/reports/capacity/page.tsx"), "utf8");
    const cards = readFileSync(resolve(process.cwd(), "src/components/reorderable-member-cards.tsx"), "utf8");
    const chart = readFileSync(resolve(process.cwd(), "src/components/charts.tsx"), "utf8");
    expect(page).toMatch(/ReorderableMemberLoadCards/);
    expect(page).toMatch(/memberLoadsFromForecast/);
    expect(page).not.toMatch(/MemberLoadCards/);
    expect(cards).toMatch(/CAPACITY_MEMBER_CARD_ORDER_KEY/);
    expect(cards).toMatch(/localStorage/);
    expect(cards).toMatch(/Drag to reorder/);
    expect(cards).toMatch(/Move \$\{label\} up/);
    expect(cards).not.toMatch(/from ["']@\/db["']/);
    expect(chart).toMatch(/This wk/);
    expect(chart).toMatch(/h\/wk declared/);
    expect(chart).toMatch(/function MemberLoadCards/);
  });
});