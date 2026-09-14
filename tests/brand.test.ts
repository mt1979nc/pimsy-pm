import { describe, expect, it } from "vitest";
import {
  PRODUCT_EXPANSION,
  PRODUCT_NAME,
  PRISM_EXPANSION,
  PRISM_MODULE_NAME,
} from "@/lib/brand";

describe("locked product naming", () => {
  it("keeps PATH as the app and Prism as the analytics module", () => {
    expect(PRODUCT_NAME).toBe("PATH");
    expect(PRODUCT_EXPANSION).toBe("Plan · Assign · Track · Handoff");
    expect(PRISM_MODULE_NAME).toBe("Prism");
    expect(PRISM_EXPANSION).toBe("Portfolio · Readiness · Insight · Staffing · Metrics");
  });
});
