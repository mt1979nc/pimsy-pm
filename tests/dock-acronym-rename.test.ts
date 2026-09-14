import { describe, expect, it } from "vitest";
import { loadRepoDockAllowlistDocument } from "@/lib/dock-allowlist";
import { patchAcronymFields, planAcronymRename, remapsFromAliases } from "@/lib/dock-acronym-rename";

describe("Dock acronym rename (RAC → TANC)", () => {
  it("only rewrites fields that still equal the old code", () => {
    expect(
      patchAcronymFields(
        { id: "1", code: "RAC", name: "Transformation ANew", crmAcronym: "OTHER", prismClientId: "RAC" },
        "RAC",
        "TANC",
      ),
    ).toEqual({ code: "TANC", prismClientId: "TANC" });
    expect(
      patchAcronymFields(
        { id: "1", code: "TANC", name: "Transformation ANew", crmAcronym: "TANC", prismClientId: "TANC" },
        "RAC",
        "TANC",
      ),
    ).toBeNull();
  });

  it("plans a rename and never invents a second site", () => {
    const plan = planAcronymRename(
      [
        {
          id: "rac",
          code: "RAC",
          name: "Transformation ANew",
          crmAcronym: "RAC",
          prismClientId: "RAC",
          customerName: "Redemption Alliance",
          status: "IN_PROGRESS",
        },
      ],
      { from: "RAC", to: "TANC", note: "Dock WIP acronym is TANC." },
    );
    expect(plan.actions).toHaveLength(1);
    expect(plan.collisions).toEqual([]);
    expect(plan.actions[0]?.patch).toEqual({
      code: "TANC",
      crmAcronym: "TANC",
      prismClientId: "TANC",
    });
    expect(plan.alreadyCanonical).toBe(0);
  });

  it("refuses when another project already owns TANC", () => {
    const plan = planAcronymRename(
      [
        {
          id: "rac",
          code: "RAC",
          name: "Transformation ANew",
          crmAcronym: "RAC",
          prismClientId: "RAC",
        },
        {
          id: "tanc",
          code: "TANC",
          name: "Already TANC",
          crmAcronym: "TANC",
          prismClientId: "TANC",
        },
      ],
      { from: "RAC", to: "TANC" },
    );
    expect(plan.actions).toEqual([]);
    expect(plan.collisions).toHaveLength(1);
    expect(plan.collisions[0]?.detail).toMatch(/already exists/);
    expect(plan.alreadyCanonical).toBe(1);
  });

  it("refuses when two projects would take the unique TANC code", () => {
    const plan = planAcronymRename(
      [
        { id: "a", code: "RAC", name: "A", crmAcronym: "RAC" },
        { id: "b", code: "RAC", name: "B", crmAcronym: "RAC" },
      ],
      { from: "RAC", to: "TANC" },
    );
    expect(plan.actions).toEqual([]);
    expect(plan.collisions.length).toBeGreaterThanOrEqual(2);
    expect(plan.collisions[0]?.detail).toMatch(/unique code/);
  });

  it("ships RAC → TANC from the allowlist aliases", () => {
    const remaps = remapsFromAliases(loadRepoDockAllowlistDocument().aliases);
    expect(remaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "RAC", to: "TANC" }),
      ]),
    );
    expect(remaps[0]?.note).toMatch(/do not delete/i);
  });
});
