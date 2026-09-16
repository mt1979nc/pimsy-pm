import { describe, expect, it, vi } from "vitest";
import { flattenSeedTasks, IMPLEMENTATION_PHASES } from "@/db/template-implementation";
import { dockPlaybookDescriptionForTitle } from "@/db/dock-playbook-copy";
import {
  CONFIRM_USERS_LOGGED_IN_TITLE,
  buildPimsyLoginConfirmation,
  contactMatchesEhrSession,
  formatSessionDuration,
  isConfirmUsersLoggedInTitle,
  parsePimsyAuditFeed,
  pimsySiteKey,
  readPimsyAuditFeedConfig,
} from "@/lib/pimsy-audit-feed";

describe("confirm-users-logged-in playbook", () => {
  it("matches the Dock training titles and not unrelated login copy", () => {
    expect(isConfirmUsersLoggedInTitle(CONFIRM_USERS_LOGGED_IN_TITLE)).toBe(true);
    expect(isConfirmUsersLoggedInTitle("Confirm users have logged in (prior to training)")).toBe(true);
    expect(isConfirmUsersLoggedInTitle("confirm users have logged in")).toBe(true);
    expect(isConfirmUsersLoggedInTitle("Schedule Training 1")).toBe(false);
    expect(isConfirmUsersLoggedInTitle("Training 1 Recording Link")).toBe(false);
  });

  it("is nested on Trainings 1, 2, 3, and 5 (not Group Notes)", () => {
    const titles = flattenSeedTasks(IMPLEMENTATION_PHASES)
      .filter((r) => isConfirmUsersLoggedInTitle(r.title))
      .map((r) => r.phase);
    expect(titles).toEqual([
      "Core (Train the Trainer)",
      "Core (Train the Trainer)",
      "Core (Train the Trainer)",
      "Core (Train the Trainer)",
    ]);
    const desc = dockPlaybookDescriptionForTitle(CONFIRM_USERS_LOGGED_IN_TITLE);
    expect(desc).toMatch(/EHR/i);
    expect(desc).toMatch(/PATH/i);
    expect(desc).toMatch(/audit feed|PIMSY_AUDIT_FEED_URL/i);
  });
});

describe("site key and duration", () => {
  it("prefers CRM acronym then Prism id then code", () => {
    expect(
      pimsySiteKey({ code: "IMP-1", crmAcronym: "THS", crmKey: "k", prismClientId: "X" }),
    ).toBe("THS");
    expect(pimsySiteKey({ code: "IMP-1", crmAcronym: null, prismClientId: "PWMI" })).toBe("PWMI");
    expect(pimsySiteKey({ code: "IMP-1", crmAcronym: "  ", prismClientId: null })).toBe("IMP-1");
    expect(pimsySiteKey({ code: "  ", crmAcronym: null, prismClientId: null })).toBeNull();
  });

  it("formats session length without inventing a value", () => {
    expect(formatSessionDuration(null)).toBe("—");
    expect(formatSessionDuration(-1)).toBe("—");
    expect(formatSessionDuration(45)).toBe("45s");
    expect(formatSessionDuration(60)).toBe("1m");
    expect(formatSessionDuration(2700)).toBe("45m");
    expect(formatSessionDuration(3600)).toBe("1h");
    expect(formatSessionDuration(3900)).toBe("1h 5m");
  });
});

describe("audit feed parse", () => {
  it("reads canonical sessions and duration from clock or in/out", () => {
    const rows = parsePimsyAuditFeed({
      sessions: [
        {
          displayName: "Jane Trainer",
          username: "jtrainer",
          loggedInAt: "2026-09-15T14:00:00.000Z",
          loggedOutAt: "2026-09-15T14:45:00.000Z",
        },
        {
          name: "Alex Lead",
          login: "alead",
          LoginTime: "2026-09-15T13:00:00.000Z",
          Duration: "01:10:00",
          eventType: "Login",
        },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows?.[0]?.displayName).toBe("Jane Trainer");
    expect(rows?.[0]?.durationSeconds).toBe(2700);
    expect(rows?.[1]?.durationSeconds).toBe(4200);
  });

  it("drops patient-shaped rows and non-login events; does not fabricate people", () => {
    const rows = parsePimsyAuditFeed({
      logins: [
        { displayName: "Ok", username: "ok", loggedInAt: "2026-09-15T12:00:00Z", eventType: "login" },
        { displayName: "Chart", username: "x", loggedInAt: "2026-09-15T12:00:00Z", patientName: "Not allowed" },
        { displayName: "Edit", username: "y", loggedInAt: "2026-09-15T12:00:00Z", eventType: "chart update" },
        { username: "no-time" },
      ],
    });
    expect(rows).toEqual([
      expect.objectContaining({ username: "ok", displayName: "Ok" }),
    ]);
  });

  it("returns empty for an empty live payload, not sample users", () => {
    expect(parsePimsyAuditFeed({ sessions: [] })).toEqual([]);
    expect(parsePimsyAuditFeed([])).toEqual([]);
  });

  it("returns null for a non-list body so callers error instead of faking rows", () => {
    expect(parsePimsyAuditFeed("not json object")).toBeNull();
    expect(parsePimsyAuditFeed(12)).toBeNull();
  });
});

describe("feed config and confirmation builder", () => {
  it("stays unconfigured when the URL is missing — no invented sessions", async () => {
    expect(readPimsyAuditFeedConfig({})).toEqual({ configured: false });
    const view = await buildPimsyLoginConfirmation({
      site: { code: "THS", crmAcronym: "THS", crmKey: null, prismClientId: "THS" },
      contacts: [
        { id: "c1", name: "Pat Contact", email: "pat@practice.example", lastSeenAt: "2026-09-14T10:00:00Z" },
      ],
      expectedUserCount: 8,
      config: { configured: false },
    });
    expect(view.feed.status).toBe("unconfigured");
    expect(view.sessions).toEqual([]);
    expect(view.contacts[0]?.matchedEhrSession).toBe(false);
    expect(view.contacts[0]?.lastSeenAt).toBeTruthy();
    expect(view.feed.message).toMatch(/PIMSY_AUDIT_FEED_URL/);
    expect(view.feed.message).toMatch(/not an EHR login/i);
  });

  it("does not call the feed without a site key", async () => {
    const fetchImpl = vi.fn();
    const view = await buildPimsyLoginConfirmation({
      site: { code: "  ", crmAcronym: null, prismClientId: null },
      contacts: [],
      config: { configured: true, url: "https://audit.example/logins", token: "t", windowDays: 14 },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(view.feed.status).toBe("missing_site_key");
    expect(view.sessions).toEqual([]);
  });

  it("maps a live feed onto PATH contacts without adding extra people", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain("siteKey=THS");
      expect(url).toContain("windowDays=14");
      expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer secret" }));
      return new Response(
        JSON.stringify({
          sessions: [
            {
              displayName: "Pat Contact",
              username: "pat@practice.example",
              loggedInAt: "2026-09-15T15:00:00.000Z",
              durationSeconds: 1800,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const view = await buildPimsyLoginConfirmation({
      site: { code: "IMP-9", crmAcronym: "THS", crmKey: "crm-1", prismClientId: "THS" },
      contacts: [
        { id: "c1", name: "Pat Contact", email: "pat@practice.example", lastSeenAt: null },
        { id: "c2", name: "Other", email: "other@practice.example", lastSeenAt: null },
      ],
      expectedUserCount: 6,
      config: { configured: true, url: "https://audit.example/logins", token: "secret", windowDays: 14 },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: new Date("2026-09-16T12:00:00.000Z"),
    });
    expect(view.feed.status).toBe("ok");
    expect(view.sessions).toHaveLength(1);
    expect(view.sessions[0]?.durationSeconds).toBe(1800);
    expect(view.contacts.find((c) => c.id === "c1")?.matchedEhrSession).toBe(true);
    expect(view.contacts.find((c) => c.id === "c2")?.matchedEhrSession).toBe(false);
    expect(view.feed.message).toMatch(/Live EHR audit feed/);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("on HTTP failure returns an error and an empty session list", async () => {
    const view = await buildPimsyLoginConfirmation({
      site: { code: "THS", crmAcronym: "THS" },
      contacts: [],
      config: { configured: true, url: "https://audit.example/logins", token: null, windowDays: 7 },
      fetchImpl: (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch,
    });
    expect(view.feed.status).toBe("error");
    expect(view.sessions).toEqual([]);
    expect(view.feed.message).toMatch(/503/);
    expect(view.feed.message).toMatch(/invented/);
  });
});

describe("contact ↔ session match", () => {
  it("matches email or name without claiming PATH last-seen as EHR", () => {
    const session = {
      displayName: "Pat Contact",
      username: "pat",
      loggedInAt: "2026-09-15T15:00:00.000Z",
      loggedOutAt: null,
      durationSeconds: 60,
    };
    expect(
      contactMatchesEhrSession({ name: "Pat Contact", email: "pat@practice.example" }, session),
    ).toBe(true);
    expect(
      contactMatchesEhrSession({ name: "Nobody", email: "nobody@practice.example" }, session),
    ).toBe(false);
  });
});
