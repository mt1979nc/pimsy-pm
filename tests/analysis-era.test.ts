import { describe, expect, it } from "vitest";
import { eraLabel, eraTitle } from "@/lib/analysis-era";

describe("completed history era", () => {
  it("prefers the stored era over the import sentence", () => {
    expect(eraLabel({ prismEra: "legacy", description: "Imported (current era)." })).toBe("legacy");
  });

  it("reads the import sentence when the column is empty", () => {
    expect(eraLabel({ description: "Imported from Prism completed implementations (current era)." })).toBe(
      "current",
    );
    expect(eraLabel({ description: "hand typed" })).toBe("unspecified");
  });

  it("titles the three groups", () => {
    expect(eraTitle("legacy")).toBe("Legacy");
    expect(eraTitle("current")).toBe("Current");
    expect(eraTitle("unspecified")).toBe("Unspecified");
  });
});
