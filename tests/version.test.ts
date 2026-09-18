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
    expect(APP_VERSION).toBe("1.17.1");
    expect(APP_VERSION).toMatch(/^1\.17\./);
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

  it("documents v1.17.1 file library File / Image / Link add", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.17.1");
    expect(note?.summary).toMatch(/File library/i);
    expect(note?.summary).toMatch(/Link|hyperlink/i);
    expect(note?.summary).toMatch(/No schema migrate/i);
    expect(note?.highlights?.some((h) => /File/.test(h) && /Image/.test(h) && /Link/.test(h))).toBe(
      true,
    );
    expect(note?.highlights?.some((h) => /title|URL/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /portal|customer/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/\bCRM\b/.test(h))).toBe(true);
    expect(RELEASE_NOTES.find((n) => n.version === "1.17.0")).toBeTruthy();
  });

  it("documents v1.17.0 PATH visual cleanup for adoption", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.17.0");
    expect(note?.summary).toMatch(/visual cleanup|scannable/i);
    expect(note?.summary).toMatch(/No schema migrate/i);
    expect(note?.highlights?.some((h) => /Post update|project-updates essay/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Task list/.test(h) && /description/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Add RCM/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Edit site profile|Danger zone|Record slip/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /PATH/.test(h) && /Prism/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Portal included/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Learning Center/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/\bPHI\b/.test(h) || /No invented PHI|no invented PHI/i.test(h))).toBe(
      true,
    );
    expect(RELEASE_NOTES.find((n) => n.version === "1.16.5")).toBeTruthy();
  });

  it("documents v1.16.5 Learning Center as PIMSY how-tos", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.16.5");
    expect(note?.summary).toMatch(/PIMSY/);
    expect(note?.summary).toMatch(/not a PATH implementation journey/i);
    expect(note?.highlights?.some((h) => /Password & access/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Training 4/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /storylane\.io/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Customer Guide/.test(h) && /omitted|signed/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /embed=inline/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Discovery worksheets|go-live checklists|ClaimMD/.test(h))).toBe(
      true,
    );
    expect(note?.highlights?.some((h) => /templates-only/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/storylane\.com/i.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/dock\.us/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /PATH/.test(h) && /Prism/.test(h))).toBe(true);
    expect(RELEASE_NOTES.find((n) => n.version === "1.16.4")).toBeTruthy();
    expect(RELEASE_NOTES.find((n) => n.version === "1.16.3")).toBeTruthy();
  });

  it("documents v1.16.4 collapsed Add RCM on existing projects", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.16.4");
    expect(note?.summary).toMatch(/Add RCM/i);
    expect(note?.summary).toMatch(/hidden by default|button/i);
    expect(note?.summary).toMatch(/No schema migrate/i);
    expect(note?.highlights?.some((h) => /Add RCM/.test(h) && /clicked|button/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /compact RCM/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /seed|resync/i.test(h))).toBe(true);
  });

  it("documents v1.16.0 template default assignee by role", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.16.0");
    expect(note?.summary).toMatch(/staffing role/i);
    expect(note?.summary).toMatch(/not a named person/i);
    expect(note?.highlights?.some((h) => /Default assignee \(role\)/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Customer project lead/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /templates-only/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /MEMBER/.test(h) && /portal/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /PATH/.test(h) && /Prism/.test(h))).toBe(true);
    expect(RELEASE_NOTES.find((n) => n.version === "1.15.0")).toBeTruthy();
  });

  it("documents v1.15.0 post-ship of Waves A–C and the footer bump", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.15.0");
    expect(note?.summary).toMatch(/Waves A–C|live/i);
    expect(note?.summary).toMatch(/v1\.15\.0|1\.15\.0/);
    expect(note?.highlights?.some((h) => /any-specialist/i.test(h) && /digest/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /0017/.test(h) && /0018/.test(h) && /0022/.test(h))).toBe(
      true,
    );
    expect(note?.highlights?.some((h) => /pimsy-customer-digest/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /pimsy-cron-task-due-reminders/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /CRON_SECRET/.test(h) && /15 minutes/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Billing Configuration/.test(h) && /Other/.test(h))).toBe(
      true,
    );
    expect(note?.highlights?.some((h) => /User Profile \/ Signature Capture/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /- \[ \]/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /seed|resync/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /PATH/.test(h) && /Prism/.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/\bPHI\b/.test(h) || /No invented PHI|no invented PHI/i.test(h))).toBe(
      true,
    );
    expect(RELEASE_NOTES.find((n) => n.version === "1.14.4")).toBeTruthy();
  });

  it("documents the v1.14.4 createProjectSchema crmAcronym hotfix", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.14.4");
    expect(note?.summary).toMatch(/Hotfix/i);
    expect(note?.summary).toMatch(/crmAcronym/);
    expect(note?.highlights?.some((h) => /createProjectSchema/.test(h) && /crmAcronym/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /bookmarkUrl|crmKey/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(RELEASE_NOTES.find((n) => n.version === "1.14.3")).toBeTruthy();
  });

  it("documents customer email digest (batched, portal deep links) on 1.14.4 notes", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.14.4");
    expect(note?.highlights?.some((h) => /notify\(\)/.test(h) && /digest/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /\/portal\/projects/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /\/projects\/…/.test(h) || /staff `\/projects/.test(h))).toBe(
      true,
    );
    expect(note?.highlights?.some((h) => /CRON_SECRET|customer-digest/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Logic App|15 minutes/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No playbook resync/.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/\bPHI\b/.test(h) || /no invented PHI|No invented PHI/i.test(h))).toBe(
      true,
    );
  });

  it("documents the v1.14.3 ActionState inviteUrl hotfix", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.14.3");
    expect(note?.summary).toMatch(/Hotfix/i);
    expect(note?.summary).toMatch(/inviteUrl/);
    expect(note?.highlights?.some((h) => /ActionState/.test(h) && /inviteUrl/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(RELEASE_NOTES.find((n) => n.version === "1.14.2")).toBeTruthy();
  });

  it("documents v1.14.2 specialist slip save and weekly-meeting roster", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.14.2");
    expect(note?.summary).toMatch(/slip/i);
    expect(note?.summary).toMatch(/weekly-meeting|weekly meeting/i);
    expect(note?.highlights?.some((h) => /Record slip/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /assertProjectWrite|canWriteAllProjects|any-specialist/i.test(h))).toBe(
      true,
    );
    expect(note?.highlights?.some((h) => /SPECIALIST|MEMBER|non-observer/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /\/management\/weekly/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /excludeFromAnalytics|analytics-excluded/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /PATH/.test(h) && /Prism/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(RELEASE_NOTES.find((n) => n.version === "1.14.0")).toBeTruthy();
  });

  it("documents v1.14.1 auto customer portal invite", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.14.1");
    expect(note?.summary).toMatch(/auto-invite/i);
    expect(note?.summary).toMatch(/PATH/);
    expect(note?.summary).toMatch(/Resend|magic-link|set-password/i);
    expect(note?.highlights?.some((h) => /New customer|New project|portal enabled/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Idempotent|pending|Resend invite/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /INTERNAL_EMAIL_DOMAINS/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Hold from live|Alexander/i.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/\bPHI\b/.test(h) || /patient information|No PHI/i.test(h))).toBe(
      true,
    );
    expect(RELEASE_NOTES.find((n) => n.version === "1.14.0")).toBeTruthy();
  });

  it("documents v1.14.0 any-specialist access to implementation sites", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.14.0");
    expect(note?.summary).toMatch(/specialist/i);
    expect(note?.summary).toMatch(/primary assignee|named primary/i);
    expect(note?.summary).toMatch(/portal/i);
    expect(note?.highlights?.some((h) => /authz/i.test(h) && /SPECIALIST/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /canReadAllProjects|canWriteAllProjects/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /MEMBER/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /canSeePortfolio|Prism|Portfolio/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No playbook resync/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Hold from live/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /client/i.test(h) && /authz|Postgres/i.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/\bPHI\b/.test(h) || /No invented PHI|no invented PHI/i.test(h))).toBe(
      true,
    );
    expect(RELEASE_NOTES.find((n) => n.version === "1.13.10")).toBeTruthy();
  });

  it("documents v1.13.10 Customer view comments and missing-library-file downloads", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.13.10");
    expect(note?.summary).toMatch(/comment/i);
    expect(note?.summary).toMatch(/Customer view|portal/i);
    expect(note?.summary).toMatch(/download|FILE|library/i);
    expect(note?.highlights?.some((h) => /SHARED|shared/i.test(h) && /comment/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /internal/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /blob|storage|404|missing/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /File library/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No playbook resync/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /templates-only/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /client/i.test(h) && /Postgres/i.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/storylane\.com/i.test(h))).toBe(true);
    expect(RELEASE_NOTES.find((n) => n.version === "1.13.9")).toBeTruthy();
  });

  it("documents v1.13.9 analytics-exclude for test/E2E customers and projects", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.13.9");
    expect(note?.summary).toMatch(/exclude/i);
    expect(note?.summary).toMatch(/Prism|analytics/i);
    expect(note?.highlights?.some((h) => /excludeFromAnalytics/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /exclude_from_analytics/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /New customer|Reporting|Settings/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Portfolio|capacity|Forecast/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /portal|Projects list|My Work/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /0016_exclude_from_analytics/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No playbook resync/i.test(h))).toBe(true);
    expect(RELEASE_NOTES.find((n) => n.version === "1.13.8")).toBeTruthy();
  });

  it("documents v1.13.8 template expose/hide and portal task links", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.13.8");
    expect(note?.summary).toMatch(/expose\/hide|eyelid|Accessing Pimsy/i);
    expect(note?.summary).toMatch(/portal|Customer view/i);
    expect(note?.highlights?.some((h) => /SHARED|INTERNAL|eyelid/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Expose tab|Hide tab/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Discovery/i.test(h) && /link/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /0015_template_locked/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /db:seed -- --templates-only/.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /PATH/.test(h) && /Prism/.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/storylane\.com/i.test(h))).toBe(true);
    expect(RELEASE_NOTES.find((n) => n.version === "1.13.7")).toBeTruthy();
  });

  it("documents v1.13.7 file library Link/Form hyperlinks", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.13.7");
    expect(note?.summary).toMatch(/File library/i);
    expect(note?.summary).toMatch(/hyperlink|online form/i);
    expect(note?.highlights?.some((h) => /Link\/Form/i.test(h) && /URL/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Attach from library|playbook/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No schema migrate/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No playbook resync/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /client-safe|webpack/i.test(h) && /Postgres|@\/db/i.test(h))).toBe(
      true,
    );
    expect(note?.highlights?.every((h) => !/storylane\.com/i.test(h))).toBe(true);
    expect(RELEASE_NOTES.find((n) => n.version === "1.13.6")).toBeTruthy();
  });

  it("documents the v1.13.6 portal webpack Postgres hotfix", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.13.6");
    expect(note?.summary).toMatch(/Hotfix/i);
    expect(note?.summary).toMatch(/webpack|Postgres|node:fs/i);
    expect(note?.highlights?.some((h) => /pctComplete|rollup|portal task list/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /client-safe|not imported from client/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /No WIP resync/i.test(h))).toBe(true);
    expect(RELEASE_NOTES.find((n) => n.version === "1.13.5")).toBeTruthy();
  });

  it("documents v1.13.5 Dock-clean task list UX", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.13.5");
    expect(note?.summary).toMatch(/Dock/i);
    expect(note?.summary).toMatch(/filter/i);
    expect(note?.highlights?.some((h) => /description/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /upload/i.test(h) && /download/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Mark done|checkbox/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /collaps/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /templates-only|resync/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /25 MB|octet-stream/i.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/storylane\.com/i.test(h))).toBe(true);
    expect(RELEASE_NOTES.find((n) => n.version === "1.13.4")).toBeTruthy();
    expect(RELEASE_NOTES.find((n) => n.version === "1.13.3")).toBeTruthy();
    expect(RELEASE_NOTES.find((n) => n.version === "1.13.2")).toBeTruthy();
    expect(RELEASE_NOTES.find((n) => n.version === "1.13.1")).toBeTruthy();
  });

  it("documents v1.13.4 staff add/remove tasks and parent-only portal visibility", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.13.4");
    expect(note?.summary).toMatch(/add or remove/i);
    expect(note?.summary).toMatch(/parent/i);
    expect(note?.highlights?.some((h) => /Add sub-task/i.test(h) && /Remove/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /User Setup/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Templates/i.test(h) && /OWNER|admin/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /presentation|editing chrome/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /playbook seed|resync/i.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/storylane/i.test(h))).toBe(true);
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

  it("documents v1.13.1 Dock Click here task action buttons", () => {
    const note = RELEASE_NOTES.find((n) => n.version === "1.13.1");
    expect(note?.summary).toMatch(/Click here/i);
    expect(note?.summary).toMatch(/task action|button/i);
    expect(note?.highlights?.some((h) => /Discovery Wizard/i.test(h) && /calm-mud|azurestaticapps/i.test(h))).toBe(
      true,
    );
    expect(note?.highlights?.some((h) => /Click here/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /staff|portal/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /resync/i.test(h))).toBe(true);
    expect(note?.highlights?.some((h) => /Dock API/i.test(h))).toBe(true);
    expect(note?.highlights?.every((h) => !/storylane\.com/i.test(h))).toBe(true);
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
