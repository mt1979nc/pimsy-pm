import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function isClientModule(src: string): boolean {
  return /^["']use client["']/m.test(src);
}

const FORBIDDEN = [
  /from ["']@\/db["']/,
  /from ["']@\/lib\/authz["']/,
  /from ["']@\/lib\/rollup["']/,
  /from ["']@\/lib\/library["']/,
  /from ["']@\/lib\/analytics-scope["']/,
  /from ["']@\/lib\/weekly-meeting["']/,
  /from ["']@\/lib\/project-slip["']/,
  /from ["']postgres["']/,
  /postgres-js/,
];

describe("client components stay off the Postgres client", () => {
  const files = walk(SRC).filter((p) => isClientModule(readFileSync(p, "utf8")));

  it("finds the staff/portal client surfaces", () => {
    const rel = files.map((p) => relative(process.cwd(), p).replaceAll("\\", "/"));
    expect(rel).toEqual(expect.arrayContaining([
      "src/components/attachments.tsx",
      "src/components/portal-task-list.tsx",
      "src/components/task-action-buttons.tsx",
      "src/components/record-slip-form.tsx",
      "src/app/(app)/management/_components/weekly-meeting-table.tsx",
      "src/app/(app)/templates/[id]/template-editor.tsx",
      "src/app/(app)/library/library-form.tsx",
    ]));
    expect(files.length).toBeGreaterThan(20);
  });

  it("does not import @/db, authz, rollup, the library server module, or postgres", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = relative(process.cwd(), file).replaceAll("\\", "/");
      for (const pat of FORBIDDEN) {
        if (pat.test(src)) offenders.push(`${rel} matches ${pat}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
