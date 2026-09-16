import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EXCLUDE_COLUMN,
  ANALYTICS_EXCLUDE_FIELD,
  ANALYTICS_EXCLUDE_LABEL,
  isExcludedFromAnalytics,
  keepAnalyticsByProject,
  keepAnalyticsRows,
  parseExcludeFromAnalytics,
  parseExcludeFromAnalyticsIfPresent,
} from "@/lib/analytics-exclude";

describe("analytics exclude flag", () => {
  it("names the setting excludeFromAnalytics / exclude_from_analytics", () => {
    expect(ANALYTICS_EXCLUDE_FIELD).toBe("excludeFromAnalytics");
    expect(ANALYTICS_EXCLUDE_COLUMN).toBe("exclude_from_analytics");
    expect(ANALYTICS_EXCLUDE_LABEL).toMatch(/Prism/);
    expect(ANALYTICS_EXCLUDE_LABEL).toMatch(/portfolio/);
    expect(ANALYTICS_EXCLUDE_LABEL).toMatch(/capacity/);
  });

  it("defaults to included", () => {
    expect(isExcludedFromAnalytics(undefined)).toBe(false);
    expect(isExcludedFromAnalytics({})).toBe(false);
    expect(isExcludedFromAnalytics({ excludeFromAnalytics: false })).toBe(false);
    expect(isExcludedFromAnalytics({ customerAccount: { excludeFromAnalytics: false } })).toBe(false);
  });

  it("excludes when the project or its customer is flagged", () => {
    expect(isExcludedFromAnalytics({ excludeFromAnalytics: true })).toBe(true);
    expect(
      isExcludedFromAnalytics({
        excludeFromAnalytics: false,
        customerAccount: { excludeFromAnalytics: true },
      }),
    ).toBe(true);
    expect(
      keepAnalyticsRows([
        { id: "keep", excludeFromAnalytics: false },
        { id: "drop", excludeFromAnalytics: true },
      ]).map((r) => r.id),
    ).toEqual(["keep"]);
    expect(
      keepAnalyticsByProject([
        { id: "s1", project: { excludeFromAnalytics: false } },
        { id: "s2", project: { customerAccount: { excludeFromAnalytics: true } } },
      ]).map((r) => r.id),
    ).toEqual(["s1"]);
  });

  it("parses the staff checkbox from FormData", () => {
    const create = new FormData();
    expect(parseExcludeFromAnalytics(create)).toBe(false);
    create.set("excludeFromAnalytics", "on");
    expect(parseExcludeFromAnalytics(create)).toBe(true);

    const edit = new FormData();
    expect(parseExcludeFromAnalyticsIfPresent(edit)).toBeUndefined();
    edit.set("excludeFromAnalyticsPresent", "1");
    expect(parseExcludeFromAnalyticsIfPresent(edit)).toBe(false);
    edit.set("excludeFromAnalytics", "on");
    expect(parseExcludeFromAnalyticsIfPresent(edit)).toBe(true);
  });
});
