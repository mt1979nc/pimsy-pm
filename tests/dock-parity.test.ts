import { describe, expect, it } from "vitest";
import { parseDockAllowlist } from "@/lib/dock-allowlist";
import {
  classifyNonDockCustomer,
  classifyNonDockProject,
  isActiveWipBook,
  isLegacyHistoricalSite,
} from "@/lib/non-dock-cleanup";
import { parseChecklistFromDescription, checklistForTaskTitle } from "@/db/dock-training-checklists";
import { orderTasksForNesting } from "@/lib/task-tree";
import { librarySlugsForTaskTitle } from "@/db/dock-default-attachments";
import { filterLearningCatalog } from "@/lib/learning-center";
import { LEARNING_CENTER_SECTIONS } from "@/db/learning-center-catalog";

describe("Dock WIP allowlist parsing", () => {
  it("reads a JSON array, object, Dock snapshot, and CSV", () => {
    expect([...parseDockAllowlist('["bhc","Cedar"]')].sort()).toEqual(["BHC", "CEDAR"]);
    expect([...parseDockAllowlist('{"acronyms":["DYM"]}')]).toEqual(["DYM"]);
    expect(
      [...parseDockAllowlist('{"workspaces":[{"name":"Cedar Health","acronym":"CEDAR"}]}')],
    ).toEqual(["CEDAR"]);
    expect(
      [...parseDockAllowlist("acronym,name\nBHC,BridgeHill\nCCCCARE,Connected\n")],
    ).toEqual(["BHC", "CCCCARE"]);
    expect([...parseDockAllowlist("BHC\nCEDAR\n")].sort()).toEqual(["BHC", "CEDAR"]);
  });

  it("refuses an empty file", () => {
    expect(() => parseDockAllowlist("   ")).toThrow(/empty/);
  });
});

describe("non-Dock prune classifiers", () => {
  const allow = new Set(["BHC", "CEDAR"]);
  const now = new Date("2026-09-14T12:00:00.000Z");

  it("keeps allowlisted WIP", () => {
    expect(
      classifyNonDockProject(
        {
          id: "1",
          code: "BHC",
          name: "BridgeHill",
          crmAcronym: "BHC",
          status: "IN_PROGRESS",
          prismStatus: "active",
        },
        { allowlist: allow, now },
      ),
    ).toBe("keep-allowlist");
  });

  it("keeps post go-live / completed history even when not on Dock WIP", () => {
    expect(
      classifyNonDockProject(
        {
          id: "2",
          code: "SENSORI",
          name: "Sensori",
          crmAcronym: "SENSORI",
          status: "COMPLETED",
          actualGoLiveDate: "2025-06-01",
          customerStatus: "LIVE",
        },
        { allowlist: allow, now },
      ),
    ).toBe("keep-legacy");
    expect(
      isLegacyHistoricalSite({
        id: "x",
        code: "MHC",
        name: "MHC",
        status: "COMPLETED",
        actualGoLiveDate: "2024-01-01",
      }),
    ).toBe(true);
  });

  it("deletes active / pre-kickoff / pipeline not on the allowlist", () => {
    expect(
      classifyNonDockProject(
        {
          id: "3",
          code: "NEWCO",
          name: "New Co",
          crmAcronym: "NEWCO",
          customerAccountId: "cust-1",
          status: "IN_PROGRESS",
          prismStatus: "active",
        },
        { allowlist: allow, now },
      ),
    ).toBe("delete");
    expect(
      classifyNonDockProject(
        {
          id: "4",
          code: "PIPE",
          name: "Pipeline Co",
          crmAcronym: "PIPE",
          customerAccountId: "cust-2",
          status: "NOT_STARTED",
          prismStatus: "pipeline",
          customerStatus: "PROSPECT",
        },
        { allowlist: allow, now },
      ),
    ).toBe("delete");
    expect(
      isActiveWipBook({
        id: "4",
        code: "PIPE",
        name: "Pipeline Co",
        prismStatus: "pre-kickoff",
        status: "NOT_STARTED",
      }),
    ).toBe(true);
  });

  it("keeps pipeline extras only when --keep-prism-analytics", () => {
    const pipeline = {
      id: "5",
      code: "ANAL",
      name: "Analytics only",
      crmAcronym: "ANAL",
      customerAccountId: "cust-3",
      status: "NOT_STARTED" as const,
      prismStatus: "pipeline",
      customerStatus: "PROSPECT",
    };
    expect(classifyNonDockProject(pipeline, { allowlist: allow, now })).toBe("delete");
    expect(
      classifyNonDockProject(pipeline, { allowlist: allow, now, keepPrismAnalytics: true }),
    ).toBe("keep-analytics");
  });

  it("does not prune internal PATH projects", () => {
    expect(
      classifyNonDockProject(
        {
          id: "int",
          code: "INT-1",
          name: "Internal tooling",
          status: "IN_PROGRESS",
          type: "INTERNAL",
        },
        { allowlist: allow, now },
      ),
    ).toBe("keep-legacy");
  });

  it("does not delete a customer that still has a legacy keep project", () => {
    expect(
      classifyNonDockCustomer({ id: "c", slug: "sens", name: "Sensori", status: "LIVE" }, [
        "delete",
        "keep-legacy",
      ]),
    ).toBe("keep");
    expect(
      classifyNonDockCustomer({ id: "c", slug: "gone", name: "Gone", status: "ONBOARDING" }, [
        "delete",
      ]),
    ).toBe("delete");
  });
});

describe("training checklists and nested tasks", () => {
  it("seeds areas to cover on Dock training session titles", () => {
    expect(checklistForTaskTitle("Training 1: Intro to PIMSY").length).toBeGreaterThan(2);
    expect(checklistForTaskTitle("Training 2: Client Charts").some((i) => /Diagnoses/i.test(i.label))).toBe(
      true,
    );
    expect(checklistForTaskTitle("Unrelated task")).toEqual([]);
  });

  it("parses Dock-style markdown checklists from a scraped description", () => {
    const parsed = parseChecklistFromDescription(
      "Please cover:\n- [ ] Logging in\n- [x] Navigation\n* [ ] User profile\n1. [ ] Help desk\nNot a box",
    );
    expect(parsed).toEqual([
      { label: "Logging in", done: false },
      { label: "Navigation", done: true },
      { label: "User profile", done: false },
      { label: "Help desk", done: false },
    ]);
  });

  it("nests children under parents for display", () => {
    const rows = orderTasksForNesting([
      { id: "p", parentTaskId: null, order: 0, title: "Training 1" },
      { id: "c", parentTaskId: "p", order: 1, title: "Schedule" },
      { id: "d", parentTaskId: "p", order: 2, title: "Recording" },
    ]);
    expect(rows.map((r) => `${r.depth}:${r.title}`)).toEqual([
      "0:Training 1",
      "1:Schedule",
      "1:Recording",
    ]);
  });

  it("maps Discovery Wizard and billing sheet titles to library slugs", () => {
    expect(librarySlugsForTaskTitle("Guided Discovery Meeting")).toContain("discovery-wizard");
    expect(librarySlugsForTaskTitle("Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers")).toContain(
      "billing-spreadsheet",
    );
  });
});

describe("Learning Center IA", () => {
  it("groups seed content by topic rather than a flat dump", () => {
    const topics = new Set(LEARNING_CENTER_SECTIONS.map((s) => s.topic));
    expect(topics.has("discovery")).toBe(true);
    expect(topics.has("training")).toBe(true);
    expect(topics.has("billing")).toBe(true);
    expect(topics.has("go_live")).toBe(true);
    expect(LEARNING_CENTER_SECTIONS.every((s) => s.items.length > 0)).toBe(true);
  });

  it("filters catalog search without leaking extra sections", () => {
    const sections = [
      {
        title: "Discovery",
        items: [
          {
            id: "1",
            title: "Discovery Wizard",
            summary: "Workbook",
            body: "Complete before configuration.",
            kind: "FILE",
            url: null,
            hasFile: true,
            libraryAssetId: null,
            audienceRole: "admin",
            isPlaceholder: true,
            published: true,
            visibility: "SHARED" as const,
            sectionId: "s",
            sectionTitle: "Discovery",
            sectionSlug: "discovery",
            topic: "discovery",
            topicLabel: "Discovery",
            order: 0,
          },
        ],
      },
    ];
    expect(filterLearningCatalog(sections, "wizard")[0]?.items).toHaveLength(1);
    expect(filterLearningCatalog(sections, "payroll")).toHaveLength(0);
  });
});
