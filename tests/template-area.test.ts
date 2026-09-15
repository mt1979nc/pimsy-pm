import { describe, expect, it } from "vitest";
import {
  collectTemplateAreaRows,
  normalizeAreaKey,
  orderTemplateTasksForClone,
  suggestedCopyName,
  uniqueTemplateCode,
} from "@/lib/playbook-meta";
import { DEFAULT_RESYNC_DEADLINE_MS, resyncTimedOut } from "@/lib/resync-deadline";

describe("template area helpers", () => {
  it("normalizes custom area keys", () => {
    expect(normalizeAreaKey(" ePrescribe ")).toBe("eprescribe");
    expect(normalizeAreaKey("Group Notes")).toBe("group_notes");
    expect(normalizeAreaKey("!!!")).toBe("");
  });

  it("rolls up optional areas without double-counting a phase's tasks", () => {
    const rows = collectTemplateAreaRows([
      {
        isOptional: true,
        areaKey: "eprescribe",
        tasks: [
          { isOptional: true, areaKey: "eprescribe" },
          { isOptional: true, areaKey: "eprescribe" },
          { isOptional: true, areaKey: "payroll" },
        ],
      },
      {
        isOptional: false,
        areaKey: null,
        tasks: [{ isOptional: true, areaKey: "data_import" }],
      },
    ]);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.eprescribe?.phaseCount).toBe(1);
    expect(byKey.eprescribe?.taskCount).toBe(2);
    expect(byKey.eprescribe?.optionalCount).toBe(2);
    expect(byKey.payroll?.taskCount).toBe(1);
    expect(byKey.data_import?.taskCount).toBe(1);
    expect(byKey.data_import?.label).toMatch(/import/i);
  });

  it("allocates unique copy codes", () => {
    expect(uniqueTemplateCode("ehr", [])).toBe("ehr-copy");
    expect(uniqueTemplateCode("ehr", ["ehr", "ehr-copy"])).toBe("ehr-copy-2");
    expect(uniqueTemplateCode("PIMSY Implementation", ["pimsy-implementation-copy"])).toBe(
      "pimsy-implementation-copy-2",
    );
  });

  it("suggests a copy name", () => {
    expect(suggestedCopyName("PIMSY Implementation")).toBe("PIMSY Implementation (copy)");
    expect(suggestedCopyName("PIMSY Implementation (copy)")).toBe("PIMSY Implementation (copy 2)");
    expect(suggestedCopyName("PIMSY Implementation (copy 2)")).toBe("PIMSY Implementation (copy 3)");
  });

  it("clones nested Dock sections parents-first", () => {
    const ordered = orderTemplateTasksForClone([
      { id: "child", parentTaskId: "parent", order: 0 },
      { id: "parent", parentTaskId: null, order: 1 },
      { id: "grand", parentTaskId: "child", order: 2 },
    ]);
    expect(ordered.map((t) => t.id)).toEqual(["parent", "child", "grand"]);
  });
});

describe("resync deadline", () => {
  it("defaults to a 3-minute Cloud Shell budget", () => {
    expect(DEFAULT_RESYNC_DEADLINE_MS).toBe(180_000);
  });

  it("treats a past deadline as timed out and 0 as disabled", () => {
    expect(resyncTimedOut(Date.now() - 200_000, 180_000)).toBe(true);
    expect(resyncTimedOut(Date.now(), 0)).toBe(false);
    expect(resyncTimedOut(Date.now(), undefined)).toBe(false);
  });
});
