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
    expect(APP_VERSION).toBe("1.13.3");
    expect(APP_VERSION).toMatch(/^1\.13\./);
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

  it("names PATH as the product and Prism as the analytics module in v1.11", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.11.0");
    expect(note?.summary).toMatch(/PATH/);
    expect(note?.summary).toMatch(/Prism/);
    expect(note?.highlights?.some((h) => h.includes("Plan · Assign · Track · Handoff"))).toBe(true);
  });

  it("documents the v1.11.1 Portfolio / demo-cleanup hotfix", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.11.1");
    expect(note?.summary).toMatch(/Portfolio/);
    expect(note?.summary).toMatch(/Waiting-on/);
    expect(note?.highlights?.some((h) => h.includes("db:cleanup:demo"))).toBe(true);
  });

  it("documents the v1.11.2 headroom chart hotfix", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.11.2");
    expect(note?.summary).toMatch(/Headroom/i);
    expect(note?.highlights?.some((h) => h.includes("pixel heights"))).toBe(true);
    expect(note?.highlights?.some((h) => /this-week/i.test(h))).toBe(true);
    expect(note?.summary).toMatch(/delete/i);
    expect(note?.highlights?.some((h) => /delete project/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Delete customer/i.test(h))).toBe(true);
  });

  it("documents the v1.11.3 headroom line-chart hotfix", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.11.3");
    expect(note?.summary).toMatch(/line chart/i);
    expect(note?.summary).toMatch(/Headroom/i);
    expect(note?.highlights?.some((h) => /polyline|line/i.test(h) && /dashed/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Peak week/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /weeks/.test(h) && /capacityHours/.test(h))).toBe(true);
  });

  it("documents v1.12.2 template attachments on matching PATH tasks", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.12.2");
    expect(note?.summary).toMatch(/attachment/i);
    expect(note?.summary).toMatch(/Discovery Wizard/i);
    expect(note?.highlights?.some((h) => /calm-mud/i.test(h) || /azurestaticapps/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /db:resync:playbook-from-dock/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /content\/template-attachments/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /TANC/.test(h) && /RAC/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /consolidat/i.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/\bPHI\b/.test(h) || /No invented PHI|no invented PHI/i.test(h))).toBe(
      true,
    );
  });

  it("documents the v1.12.1 Engagements roster hotfix", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.12.1");
    expect(note?.summary).toMatch(/Engagements roster/i);
    expect(note?.summary).toMatch(/Slip days/i);
    expect(note?.highlights?.some((h) => /table-fixed|horizontal scroll/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /slip_event\.days|sum of slip/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Services is removed/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /\/management\/engagements\/\[id\]/.test(h))).toBe(true);
  });

  it("documents v1.13.3 US federal holiday go-live projections", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.13.3");
    expect(note?.summary).toMatch(/federal holiday/i);
    expect(note?.summary).toMatch(/Forecast\+/);
    expect(note?.highlights?.some((h) => /default on/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Thanksgiving/i.test(h) && /Christmas/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /hrs\/wk|even-spread/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /0014_skip_us_federal_holidays/.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/storylane/i.test(h))).toBe(true);
  });

  it("documents v1.13.2 Forecast+ Prism hour and go-live parity", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.13.2");
    expect(note?.summary).toMatch(/Forecast\+/);
    expect(note?.summary).toMatch(/Prism/);
    expect(note?.highlights?.some((h) => /30 min\/user|25 min\/form/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /training/i.test(h) && /2\.5h/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /65/.test(h) && /21d config/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /percentiles/.test(h) || /reference caption/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /playbook/i.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/storylane/i.test(h))).toBe(true);
  });

  it("documents v1.13.0 Dock description/attachment parity and hang-free resync", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.13.0");
    expect(note?.summary).toMatch(/description/i);
    expect(note?.summary).toMatch(/attachment/i);
    expect(note?.summary).toMatch(/resync/i);
    expect(note?.highlights?.some((h) => /description/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /checklist|areas to cover/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /clickable|button/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /download/i.test(h) && /upload/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Duplicate/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /db:resync:playbook-from-dock/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /set-description|backfill/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /180s|timeout/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Cloud Shell/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Dock API|live Dock Spaces/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /PATH/.test(h) && /Prism/.test(h))).toBe(true);
  });

  it("documents v1.12.4 Forecast+ go-live scenarios on Add to roster", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.12.4");
    expect(note?.summary).toMatch(/Optimistic|Typical|Pessimistic/i);
    expect(note?.summary).toMatch(/past completed|go-live/i);
    expect(note?.highlights?.some((h) => /Add to roster/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /P25|percentile|median/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /SENSORI/.test(h) && /MHC/.test(h) && /LECHRIS/.test(h))).toBe(
      true,
    );
    expect(note?.highlights?.some((h) => /Edit engagement/i.test(h))).toBe(true);
  });

  it("documents v1.12.3 Onboarded and historical complete-on-time", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.12.3");
    expect(note?.summary).toMatch(/Onboarded/i);
    expect(note?.summary).toMatch(/complete on time/i);
    expect(note?.highlights?.some((h) => /About/.test(h) && /Onboarded/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /dashboard|My Work|Portfolio/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /db:complete:historical-on-time/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /0013_onboarded/.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/Dock Spaces|pimsyehr\.dock/i.test(h))).toBe(true);
  });

  it("documents v1.12 Dock parity, prune-keep-legacy, and Learning Center", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.12.0");
    expect(note?.summary).toMatch(/Dock/i);
    expect(note?.summary).toMatch(/Learning Center/i);
    expect(note?.highlights?.some((h) => h.includes("db:cleanup:non-dock"))).toBe(true);
    expect(note?.highlights?.some((h) => /post go-live/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /db:resync:playbook-from-dock/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Discovery Wizard/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /area-to-cover|checklist/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /\/portal\/learn/.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/PHI/.test(h) || /No PHI/.test(h))).toBe(true);
  });
});
