import { describe, expect, it } from "vitest";
import {
  APP_VERSION,
  RELEASE_NOTES,
  currentRelease,
  staffUpdateHistory,
} from "@/lib/version";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("staff Update History source", () => {
  it("keeps APP_VERSION aligned with package.json and the newest note", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      version: string;
    };
    expect(APP_VERSION).toBe(pkg.version);
    expect(currentRelease().version).toBe(APP_VERSION);
    expect(RELEASE_NOTES[0]?.version).toBe(APP_VERSION);
  });

  it("lists releases newest-first with unique versions", () => {
    const versions = RELEASE_NOTES.map((n) => n.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (let i = 1; i < RELEASE_NOTES.length; i++) {
      expect(RELEASE_NOTES[i - 1]!.version.localeCompare(RELEASE_NOTES[i]!.version, undefined, { numeric: true })).toBe(
        1,
      );
    }
  });

  it("feeds the staff page from RELEASE_NOTES (no separate CMS)", () => {
    expect(staffUpdateHistory()).toBe(RELEASE_NOTES);
    expect(staffUpdateHistory()[0]?.highlights?.length).toBeGreaterThan(0);
  });

  it("requires a date and summary on every note", () => {
    for (const note of RELEASE_NOTES) {
      expect(note.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(note.summary.trim().length).toBeGreaterThan(8);
    }
  });
});
