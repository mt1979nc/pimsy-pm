import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { customerHandedOffToSupport, isSupportHandedOff } from "@/lib/handed-off-list";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("support handoff list signal", () => {
  it("uses the handoff stamp, not LIVE or go-live", () => {
    expect(isSupportHandedOff(null)).toBe(false);
    expect(isSupportHandedOff(undefined)).toBe(false);
    expect(isSupportHandedOff("")).toBe(false);
    expect(isSupportHandedOff(new Date("2026-09-01"))).toBe(true);

    const atGoLive = {
      status: "IN_PROGRESS",
      supportHandoffAt: null,
    };
    expect(customerHandedOffToSupport([atGoLive])).toBe(false);
    expect(
      customerHandedOffToSupport([
        { status: "IN_PROGRESS", supportHandoffAt: null },
        { status: "COMPLETED", supportHandoffAt: new Date("2026-09-01") },
      ]),
    ).toBe(false);
    expect(
      customerHandedOffToSupport([{ status: "COMPLETED", supportHandoffAt: new Date("2026-09-01") }]),
    ).toBe(true);
    expect(customerHandedOffToSupport([])).toBe(false);
    expect(customerHandedOffToSupport([{ status: "CANCELLED", supportHandoffAt: null }])).toBe(false);
    expect(
      customerHandedOffToSupport([{ status: "COMPLETED", supportHandoffAt: null }]),
    ).toBe(false);
  });

  it("wires both lists to the stamp and the Show handed off toggle", () => {
    const projects = source("src/app/(app)/projects/page.tsx");
    const customers = source("src/app/(app)/customers/page.tsx");
    const queries = source("src/lib/queries.ts");
    for (const page of [projects, customers]) {
      expect(page).toMatch(/ShowHandedOffToggle/);
      expect(page).toMatch(/supportHandoffAt/);
      expect(page).not.toMatch(/status === "LIVE"/);
      expect(page).not.toMatch(/ceoStatus/);
      expect(page).not.toMatch(/actualGoLiveDate/);
    }
    expect(source("src/components/show-handed-off.tsx")).toMatch(/Show handed off/);
    expect(projects).toMatch(/handedOffOnly: true/);
    expect(queries).toMatch(/isNotNull\(projects\.supportHandoffAt\)/);
    expect(source("src/components/show-handed-off.tsx")).toMatch(/path\.lists\.show-handed-off/);
    expect(projects).toMatch(/layout="divided"/);
    expect(customers).toMatch(/layout="grid"/);
    expect(projects).not.toMatch(/wrap=/);
    expect(customers).not.toMatch(/wrap=/);
    expect(source("src/components/show-handed-off.tsx")).not.toMatch(/wrap\?:/);
  });
});
