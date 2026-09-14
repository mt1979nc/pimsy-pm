import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIBRARY_ASSETS,
  DISCOVERY_WIZARD_URL,
  alreadyHasLibraryCoverage,
  libraryDefsForTaskTitle,
  librarySlugsForTaskTitle,
  normalizeAttachmentUrl,
} from "@/db/dock-default-attachments";
import { flattenSeedTasks, IMPLEMENTATION_PHASES, RCM_TEMPLATE } from "@/db/template-implementation";
import { normalizeOverlapTitle } from "@/lib/playbook-meta";

describe("default template attachments catalog", () => {
  it("every catalog file targets at least one Implementation or RCM playbook title", () => {
    const playbook = [
      ...flattenSeedTasks(IMPLEMENTATION_PHASES),
      ...flattenSeedTasks(RCM_TEMPLATE.phases),
    ].map((r) => r.title);

    for (const def of DEFAULT_LIBRARY_ASSETS) {
      const hits = playbook.filter((title) => librarySlugsForTaskTitle(title).includes(def.slug));
      expect(hits.length, `${def.slug} should match a playbook task`).toBeGreaterThan(0);
    }
  });

  it("attaches Discovery Wizard as a LINK on Guided Discovery tasks, not a description URL", () => {
    const wizard = DEFAULT_LIBRARY_ASSETS.find((a) => a.slug === "discovery-wizard");
    expect(wizard?.kind).toBe("LINK");
    expect(wizard?.url).toBe(DISCOVERY_WIZARD_URL);
    expect(librarySlugsForTaskTitle("Guided Discovery Meeting")).toContain("discovery-wizard");
    expect(librarySlugsForTaskTitle("Schedule: Workflow Guided Discovery")).toContain(
      "discovery-wizard",
    );
    const guided = IMPLEMENTATION_PHASES.flatMap((p) =>
      flattenSeedTasks([p]).filter((r) => /guided discovery/i.test(r.title)),
    );
    expect(guided.length).toBeGreaterThan(0);
    for (const row of guided) {
      expect(row.title).not.toMatch(/https?:\/\//i);
    }
  });

  it("maps Dock short titles onto the billing spreadsheet and questionnaire", () => {
    expect(librarySlugsForTaskTitle("Billing Spreadsheet")).toContain("billing-spreadsheet");
    expect(librarySlugsForTaskTitle("Complete and Upload Billing Spreadsheet")).toContain(
      "billing-spreadsheet",
    );
    expect(librarySlugsForTaskTitle("Billing Questionnaire")).toContain("billing-questionnaire");
    expect(librarySlugsForTaskTitle("Review Billing Questionnaire Data Sheet")).toContain(
      "billing-questionnaire",
    );
    expect(librarySlugsForTaskTitle("Organization Details Form")).toEqual(
      expect.arrayContaining(["discovery-wizard", "organization-details-form"]),
    );
  });

  it("does not attach catalog files to unrelated playbook rows", () => {
    expect(libraryDefsForTaskTitle("Zendesk Company Setup")).toEqual([]);
    expect(libraryDefsForTaskTitle("Schedule Kickoff")).toEqual([]);
    expect(libraryDefsForTaskTitle("ClaimMD Enrollment")).toEqual([]);
  });
});

describe("idempotent coverage", () => {
  it("treats trailing-slash wizard URLs as the same link", () => {
    expect(normalizeAttachmentUrl("https://calm-mud-0fe119810.7.azurestaticapps.net/")).toBe(
      normalizeAttachmentUrl("https://calm-mud-0fe119810.7.azurestaticapps.net"),
    );
  });

  it("skips a second Discovery Wizard when the URL is already on the task", () => {
    const def = DEFAULT_LIBRARY_ASSETS.find((a) => a.slug === "discovery-wizard")!;
    const files = [
      {
        libraryAssetId: null,
        kind: "LINK" as const,
        url: "https://calm-mud-0fe119810.7.azurestaticapps.net/",
      },
    ];
    expect(alreadyHasLibraryCoverage(files, def, null)).toBe(true);
  });

  it("does not treat a user-uploaded spreadsheet as covering the library default", () => {
    const def = DEFAULT_LIBRARY_ASSETS.find((a) => a.slug === "billing-spreadsheet")!;
    const files = [
      {
        libraryAssetId: null,
        kind: "FILE" as const,
        url: null,
      },
    ];
    expect(
      alreadyHasLibraryCoverage(files, def, {
        id: "lib-billing",
        kind: "FILE",
        url: null,
      }),
    ).toBe(false);
  });

  it("covers a clone that already points at the library row", () => {
    const def = DEFAULT_LIBRARY_ASSETS.find((a) => a.slug === "billing-questionnaire")!;
    const files = [
      {
        libraryAssetId: "lib-q",
        kind: "FILE" as const,
        url: null,
      },
    ];
    expect(
      alreadyHasLibraryCoverage(files, def, { id: "lib-q", kind: "FILE", url: null }),
    ).toBe(true);
  });
});

describe("playbook title inventory", () => {
  it("keeps Guided Discovery Meeting and billing spreadsheet titles in the Dock port", () => {
    const titles = new Set(
      flattenSeedTasks(IMPLEMENTATION_PHASES).map((r) => normalizeOverlapTitle(r.title)),
    );
    expect(titles.has(normalizeOverlapTitle("Guided Discovery Meeting"))).toBe(true);
    expect(
      titles.has(
        normalizeOverlapTitle("Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers"),
      ),
    ).toBe(true);
    expect(titles.has(normalizeOverlapTitle("Billing Questionnaire"))).toBe(true);
  });
});
