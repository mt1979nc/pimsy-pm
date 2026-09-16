import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pctComplete } from "@/lib/pct-complete";

describe("pctComplete", () => {
  it("is safe against divide-by-zero", () => {
    expect(pctComplete(0, 0)).toBe(0);
    expect(pctComplete(3, 0)).toBe(0);
  });

  it("rounds to a whole percent", () => {
    expect(pctComplete(1, 3)).toBe(33);
    expect(pctComplete(2, 3)).toBe(67);
    expect(pctComplete(5, 5)).toBe(100);
  });
});

describe("client task lists stay off the Postgres client", () => {
  it("does not import @/lib/rollup or @/db from portal-task-list", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/portal-task-list.tsx"), "utf8");
    expect(src).toMatch(/from ["']@\/lib\/pct-complete["']/);
    expect(src).not.toMatch(/from ["']@\/lib\/rollup["']/);
    expect(src).not.toMatch(/from ["']@\/db["']/);
  });

  it("does not import @/lib/rollup or @/db from project-row", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/project-row.tsx"), "utf8");
    expect(src).toMatch(/from ["']@\/lib\/pct-complete["']/);
    expect(src).not.toMatch(/from ["']@\/lib\/rollup["']/);
    expect(src).not.toMatch(/from ["']@\/db["']/);
  });
});
