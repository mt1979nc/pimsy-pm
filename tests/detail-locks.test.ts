import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  acronymColumns,
  acronymTaken,
  changedDetailFields,
  customerDetailError,
  isFieldLocked,
  lockedCustomerUpdate,
  nextPathManagedFields,
  stripLockedProjectFields,
} from "@/lib/detail-locks";
import { isRemovedFromCapacity } from "@/lib/capacity-handoff";
import { fillBlankAcronym } from "@/lib/prism-import-match";

describe("customer details", () => {
  it("rejects a bad acronym and a duplicate among live sites", () => {
    expect(customerDetailError({
      name: "",
      website: "",
      logoUrl: "",
      hubspotDealUrl: "",
      seatCount: "",
      status: "LIVE",
      contractDate: "",
      expectedArr: "",
      acronym: "OK",
    })).toMatch(/name/i);
    expect(customerDetailError({
      name: "Everwood",
      website: "everwood.example",
      logoUrl: "",
      hubspotDealUrl: "",
      seatCount: "",
      status: "LIVE",
      contractDate: "",
      expectedArr: "",
      acronym: "EVER",
    })).toMatch(/http/);
    const rows = [
      { id: "other", code: "EVER", crmAcronym: "EVER", prismClientId: "EVER", archivedAt: null },
      { id: "old", code: "ever", crmAcronym: null, prismClientId: null, archivedAt: new Date() },
    ];
    expect(acronymTaken("ever", "self", rows)).toBe(true);
    expect(acronymTaken("ever", "other", rows)).toBe(false);
    expect(acronymTaken("old", "self", rows)).toBe(false);
  });

  it("locks only the fields that changed", () => {
    const changed = changedDetailFields(
      { name: "Old", seatCount: "10", status: "ONBOARDING" },
      { name: "New", seatCount: "10", status: "LIVE" },
      ["name", "seatCount", "status"],
    );
    expect(changed).toEqual(["name", "status"]);
    expect(nextPathManagedFields(["logoUrl"], changed)).toEqual(["logoUrl", "name", "status"]);
  });

  it("keeps path-managed customer fields and acronyms out of a Prism import write", () => {
    const patch = lockedCustomerUpdate(
      { name: "Prism Name", seatCount: 40, status: "ONBOARDING", updatedAt: new Date() },
      ["name", "status"],
    );
    expect(patch.name).toBeUndefined();
    expect(patch.status).toBeUndefined();
    expect(patch.seatCount).toBe(40);

    const locked = ["acronym"];
    const acronymPatch = isFieldLocked(locked, "acronym")
      ? {}
      : {
          prismClientId: fillBlankAcronym("PATH", "PRISM"),
          crmAcronym: fillBlankAcronym(null, "PRISM"),
        };
    expect(acronymPatch).toEqual({});
    expect(fillBlankAcronym("PATH", "PRISM")).toBe("PATH");

    expect(acronymColumns({
      code: "EVER",
      crmAcronym: "EVER",
      prismClientId: "EVER",
      next: "everwood",
      codeTaken: false,
    })).toEqual({ crmAcronym: "EVERWOOD", code: "EVERWOOD", prismClientId: "EVERWOOD" });

    const asOf = new Date("2026-11-16T18:00:00.000Z");
    expect(isRemovedFromCapacity("2026-11-16", asOf)).toBe(true);
    expect(isRemovedFromCapacity("2026-11-15", asOf)).toBe(true);
    expect(isRemovedFromCapacity("2026-11-17", asOf)).toBe(false);
    expect(isRemovedFromCapacity(null, asOf)).toBe(false);
    const kept = stripLockedProjectFields(
      { capacityHandoffOn: null, prismStatus: "active" },
      ["capacityHandoffOn"],
    );
    expect(kept.capacityHandoffOn).toBeUndefined();
    expect(kept.prismStatus).toBe("active");
    expect(isFieldLocked(["capacityHandoffOn"], "capacityHandoffOn")).toBe(true);

    const sql = readFileSync(resolve(process.cwd(), "drizzle/0038_detail_locks.sql"), "utf8");
    expect(sql).toMatch(/customer_account/);
    expect(sql).toMatch(/path_managed_fields/);
  });
});
