import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { importedTeamFlags } from "@/lib/prism-import";

function morganRoster(relativePath: string) {
  const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
  const start = source.indexOf('email: "morgan@pimsyehr.com"');
  expect(start).toBeGreaterThan(-1);
  const block = source.slice(start, start + 500);
  expect(block).toMatch(/capacityExempt:\s*false/);
  expect(block).toMatch(/canLead:\s*true/);
  expect(block).toMatch(/prismTeamId:\s*"md"/);
}

describe("Morgan Davis stays lead-eligible", () => {
  it("seeds her as a lead who counts toward capacity", () => {
    morganRoster("scripts/seed-staff-logins.ts");
    morganRoster("src/db/seed-prism-import.ts");
  });

  it("does not let a Prism re-import turn her flags back off", () => {
    const fromOldDump = importedTeamFlags({
      teamId: "md",
      email: null,
      flags: { capacityExempt: true, canLead: false, director: false },
    });
    expect(fromOldDump).toEqual({ capacityExempt: false, canLead: true, director: false });

    const byEmail = importedTeamFlags({
      teamId: "other",
      email: "Morgan@pimsyehr.com",
      flags: { capacityExempt: true, canLead: false, director: false },
    });
    expect(byEmail.canLead).toBe(true);
    expect(byEmail.capacityExempt).toBe(false);

    const kori = importedTeamFlags({
      teamId: "kori",
      email: "kori@pimsyehr.com",
      flags: { capacityExempt: true, canLead: false, director: true },
    });
    expect(kori).toEqual({ capacityExempt: true, canLead: false, director: true });
  });
});
