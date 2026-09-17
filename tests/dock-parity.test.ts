import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadRepoDockAllowlistDocument,
  loadRepoDockWipAllowlist,
  parseDockAllowlist,
} from "@/lib/dock-allowlist";
import {
  classifyNonDockCustomer,
  classifyNonDockProject,
  isActiveWipBook,
  isDockTestOrDraftWorkspace,
  isLegacyHistoricalSite,
} from "@/lib/non-dock-cleanup";
import {
  parseChecklistFromDescription,
  checklistForTaskTitle,
  trainingDescriptionForTitle,
  DOCK_TRAINING_1_TITLE,
  THS_TRAINING_1_AREAS,
  TRAINING_SESSION_DESCRIPTION,
} from "@/db/dock-training-checklists";
import {
  dockPlaybookDescriptionForTitle,
  shouldReplacePlaybookDescription,
} from "@/db/dock-playbook-copy";
import { orderTasksForNesting } from "@/lib/task-tree";
import {
  DISCOVERY_WIZARD_URL,
  DEFAULT_LIBRARY_ASSETS,
  librarySlugsForTaskTitle,
} from "@/db/dock-default-attachments";
import { filterLearningCatalog } from "@/lib/learning-center";
import {
  LEARNING_CENTER_SECTIONS,
  LEARNING_SECTION_SLUGS,
  RETIRED_LEARNING_SECTION_SLUGS,
  DOCK_LC_ASSETS,
  LEARNING_DESKTOP_INSTALL_URL,
  learningCatalogWiredUrls,
  learningIframeSrc,
  learningOpenLabel,
  learningKindLabel,
  isLearningDockSpaceUrl,
  isSignedGcsUrl,
} from "@/db/learning-center-catalog";
import { findByPlaybookTitle, normalizeOverlapTitle } from "@/lib/playbook-meta";
import { isProtectedWipAcronym } from "@/lib/demo-entities";

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

  it("expands alias from/to keys so prune keeps a lagging PATH code", () => {
    expect(
      [...parseDockAllowlist('{"acronyms":["TANC"],"aliases":[{"from":"RAC","to":"TANC"}]}')].sort(),
    ).toEqual(["RAC", "TANC"]);
    expect(
      [...parseDockAllowlist('{"acronyms":["TANC"],"aliases":{"RAC":{"to":"TANC"}}}')].sort(),
    ).toEqual(["RAC", "TANC"]);
    expect([...parseDockAllowlist('{"acronyms":["BHC"]}')]).toEqual(["BHC"]);
  });

  it("ships the 2026-09-14 Dock Implementation WIP acronyms including RAC and TANC", () => {
    const raw = readFileSync(resolve(process.cwd(), "content/dock-wip-allowlist.json"), "utf8");
    const data = JSON.parse(raw) as {
      asOf: string;
      acronyms: string[];
      aliases: Array<{ from: string; to: string; keepBothUntilConsolidated?: boolean }>;
    };
    expect(data.asOf).toBe("2026-09-14");
    expect(data.acronyms).toContain("TANC");
    expect(data.acronyms).toContain("RAC");
    const alias = data.aliases.find((a) => a.from === "RAC");
    expect(alias?.to).toBe("TANC");
    expect(alias?.keepBothUntilConsolidated).toBe(true);
    const doc = loadRepoDockAllowlistDocument();
    expect(doc.aliases.some((a) => a.from === "RAC" && a.to === "TANC" && a.keepBothUntilConsolidated)).toBe(
      true,
    );
    const set = loadRepoDockWipAllowlist();
    expect(set.has("TANC")).toBe(true);
    expect(set.has("RAC")).toBe(true);
    expect(set.size).toBe(data.acronyms.length);
    for (const code of [
      "TANC",
      "RAC",
      "THS",
      "BHC",
      "CEDAR",
      "APS",
      "DPS",
      "NEOES",
      "LIFECONN",
    ]) {
      expect(set.has(code)).toBe(true);
    }
    expect(set.has("REPLACE_WITH_LIVE_DOCK_WIP")).toBe(false);
    expect(isProtectedWipAcronym("TANC")).toBe(true);
    expect(isProtectedWipAcronym("RAC")).toBe(true);
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

  it("deletes Dock test/draft spaces even when they look internal", () => {
    const names = [
      "DRAFT Impl. Billing/RCM tab",
      "MT Test",
      "Test Dock",
      "MT Test 5",
      "MT Testing 4",
    ];
    for (const name of names) {
      expect(isDockTestOrDraftWorkspace({ name, code: name })).toBe(true);
      expect(
        classifyNonDockProject(
          {
            id: name,
            code: "INT-TEST",
            name,
            status: "IN_PROGRESS",
            type: "INTERNAL",
          },
          { allowlist: allow, now },
        ),
      ).toBe("delete");
    }
    expect(isDockTestOrDraftWorkspace({ name: "CEDAR Health", code: "CEDAR" })).toBe(false);
  });

  it("keeps RAC and TANC active WIP on the shipped allowlist and deletes RAC on a BHC-only overlay", () => {
    const rac = {
      id: "rac",
      code: "RAC",
      name: "Transformation ANew",
      crmAcronym: "RAC",
      prismClientId: "RAC",
      customerName: "Redemption Alliance",
      status: "IN_PROGRESS" as const,
      prismStatus: "active",
    };
    expect(classifyNonDockProject(rac, { allowlist: loadRepoDockWipAllowlist(), now })).toBe(
      "keep-allowlist",
    );
    expect(classifyNonDockProject(rac, { allowlist: new Set(["TANC"]), now })).toBe("delete");
    expect(classifyNonDockProject(rac, { allowlist: allow, now })).toBe("delete");
    expect(
      classifyNonDockProject(
        { ...rac, id: "tanc", code: "TANC", crmAcronym: "TANC", prismClientId: "TANC" },
        { allowlist: loadRepoDockWipAllowlist(), now },
      ),
    ).toBe("keep-allowlist");
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
  it("seeds THS Training 1 areas on both Dock and PATH titles", () => {
    const labels = checklistForTaskTitle(DOCK_TRAINING_1_TITLE).map((i) => i.label);
    expect(labels).toEqual(THS_TRAINING_1_AREAS.map((i) => i.label));
    expect(checklistForTaskTitle("Training 1: Intro to PIMSY").map((i) => i.label)).toEqual(labels);
    expect(labels).toContain("User Profile / Signature Capture");
    expect(labels).toContain("Client Create / Term");
    const training1 = trainingDescriptionForTitle(DOCK_TRAINING_1_TITLE);
    expect(training1).toMatch(/Storylane/);
    expect(training1).not.toMatch(/https:\/\/.*storylane/i);
    expect(training1).toContain("- [ ] User Profile / Signature Capture");
    expect(training1).toContain("- [ ] Client Create / Term");
    const liveCopy = dockPlaybookDescriptionForTitle(DOCK_TRAINING_1_TITLE);
    expect(liveCopy).toMatch(/nested items|checklist/i);
    expect(liveCopy).toMatch(/Storylane/);
    expect(liveCopy).not.toContain("- [ ] User Profile / Signature Capture");
    expect(checklistForTaskTitle("Training 2: Client Charts").some((i) => /Diagnoses/i.test(i.label))).toBe(
      true,
    );
    expect(checklistForTaskTitle("Unrelated task")).toEqual([]);
  });

  it("fills blank or stale training blurbs and never overwrites staff notes", () => {
    const next = dockPlaybookDescriptionForTitle("Training 2: Client Charts");
    expect(next).toMatch(/nested items|checklist/i);
    expect(next).not.toContain("- [ ] Diagnoses");
    expect(shouldReplacePlaybookDescription(null, next)).toBe(true);
    expect(shouldReplacePlaybookDescription("   ", next)).toBe(true);
    expect(shouldReplacePlaybookDescription(TRAINING_SESSION_DESCRIPTION, next)).toBe(true);
    const checkboxDump = `${TRAINING_SESSION_DESCRIPTION}\n\n- [ ] Diagnoses\n- [ ] Chart documents`;
    expect(shouldReplacePlaybookDescription(checkboxDump, next)).toBe(true);
    expect(shouldReplacePlaybookDescription(next, next)).toBe(false);
    expect(shouldReplacePlaybookDescription("Specialist notes for Cedar kickoff.", next)).toBe(false);
    expect(shouldReplacePlaybookDescription("hello", null)).toBe(false);
  });

  it("puts Discovery Wizard / billing copy in the description without URLs", () => {
    const wizard = dockPlaybookDescriptionForTitle("Guided Discovery Meeting");
    expect(wizard).toMatch(/Discovery Wizard/i);
    expect(wizard).toMatch(/Click Here/i);
    expect(wizard).not.toMatch(/https?:\/\//i);
    expect(dockPlaybookDescriptionForTitle("Billing Questionnaire")).toMatch(
      /Click Here to Submit Billing Questionnaire/i,
    );
    expect(dockPlaybookDescriptionForTitle("Billing Questionnaire")).toMatch(/Upload any working copy/i);
    expect(dockPlaybookDescriptionForTitle("Billing Questionnaire")).not.toMatch(/https?:\/\//i);
    expect(
      dockPlaybookDescriptionForTitle(
        "Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers",
      ),
    ).toMatch(/Upload files/i);
    expect(
      dockPlaybookDescriptionForTitle(
        "Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers",
      ),
    ).not.toMatch(/Click here to download the billing spreadsheet/i);
    expect(dockPlaybookDescriptionForTitle("Organization Details Form")).toMatch(
      /Click Here on this task to open the Discovery Wizard/i,
    );
    expect(dockPlaybookDescriptionForTitle("Discovery org details")).toMatch(
      /Click Here on this task to open the Discovery Wizard/i,
    );
    expect(dockPlaybookDescriptionForTitle("Clinical Workflows")).toMatch(
      /Click Here to Submit Clinical Workflow Form/i,
    );
    expect(dockPlaybookDescriptionForTitle("Clinical Workflows")).not.toMatch(/Discovery Wizard/i);
    expect(dockPlaybookDescriptionForTitle("Documentation & Forms")).toMatch(/Open form/i);
    expect(dockPlaybookDescriptionForTitle("Review Billing Questionnaire Data Sheet")).toMatch(
      /review what the practice submitted/i,
    );
    expect(dockPlaybookDescriptionForTitle("Review Billing Questionnaire Data Sheet")).not.toMatch(
      /Upload the completed file/i,
    );
    expect(shouldReplacePlaybookDescription(
      "Complete the attached billing questionnaire and upload the finished files on this task.",
      dockPlaybookDescriptionForTitle("Billing Questionnaire"),
    )).toBe(true);
    expect(dockPlaybookDescriptionForTitle("Unrelated task")).toBeNull();
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

  it("aliases Dock combined Training 1 to the PATH template title", () => {
    const byTitle = new Map([
      [
        normalizeOverlapTitle(DOCK_TRAINING_1_TITLE),
        { title: DOCK_TRAINING_1_TITLE, id: "live" },
      ],
    ]);
    expect(findByPlaybookTitle(byTitle, "Training 1: Intro to PIMSY")?.id).toBe("live");
  });

  it("maps Discovery Wizard and billing sheet titles to library slugs", () => {
    expect(librarySlugsForTaskTitle("Guided Discovery Meeting")).toContain("discovery-wizard");
    expect(librarySlugsForTaskTitle("Schedule: Workflow Guided Discovery")).toContain("discovery-wizard");
    expect(librarySlugsForTaskTitle("Review Billing Questionnaire Data Sheet")).toContain(
      "billing-questionnaire",
    );
    expect(librarySlugsForTaskTitle("Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers")).toContain(
      "billing-spreadsheet",
    );
    expect(librarySlugsForTaskTitle("Billing Spreadsheet")).toContain("billing-spreadsheet");
    expect(librarySlugsForTaskTitle("Complete RCM intake questionnaire")).toContain("rcm-intake-questionnaire");
    expect(librarySlugsForTaskTitle("Clinical Workflows")).toContain("clinical-workflows-sheet");
    expect(librarySlugsForTaskTitle("Clinical Workflows")).not.toContain("discovery-wizard");
    expect(librarySlugsForTaskTitle("Kickoff call")).toEqual([]);
    expect(librarySlugsForTaskTitle("Accessing Pimsy")).toEqual(["pimsy-desktop-install"]);
    const wizard = DEFAULT_LIBRARY_ASSETS.find((a) => a.slug === "discovery-wizard");
    expect(wizard?.kind).toBe("LINK");
    expect(wizard?.url).toBe(DISCOVERY_WIZARD_URL);
    expect(wizard?.url).toBe("https://calm-mud-0fe119810.7.azurestaticapps.net/");
  });
});

describe("Learning Center IA", () => {
  it("groups seed content as Dock LC topics for using PIMSY", () => {
    expect(LEARNING_CENTER_SECTIONS.map((s) => s.slug)).toEqual([...LEARNING_SECTION_SLUGS]);
    expect(LEARNING_CENTER_SECTIONS.map((s) => s.title)).toEqual([
      "Getting started",
      "Password & access",
      "Scheduling",
      "Notes",
      "Providers",
      "Training",
    ]);
    expect([...RETIRED_LEARNING_SECTION_SLUGS]).toEqual([
      "discovery",
      "billing",
      "go-live",
      "after-go-live",
      "reference",
    ]);
    const topics = new Set<string>(LEARNING_CENTER_SECTIONS.map((s) => s.topic));
    expect(topics.has("password_access")).toBe(true);
    expect(topics.has("scheduling")).toBe(true);
    expect(topics.has("notes")).toBe(true);
    expect(topics.has("providers")).toBe(true);
    expect(topics.has("training")).toBe(true);
    expect(topics.has("discovery")).toBe(false);
    expect(topics.has("go_live")).toBe(false);
    expect(LEARNING_CENTER_SECTIONS.every((s) => s.items.length > 0)).toBe(true);
    const start = LEARNING_CENTER_SECTIONS.find((s) => s.slug === "getting-started");
    expect(start?.items.map((i) => i.title)).toEqual([
      "Intro to PIMSY",
      "Getting started with PIMSY v2",
      "Overview",
      "Tips for a Successful implementation V2",
    ]);
    const bodies = LEARNING_CENTER_SECTIONS.flatMap((s) => s.items.map((i) => i.body)).join("\n");
    expect(bodies).not.toMatch(/Your action items/i);
    expect(bodies).not.toMatch(/violet \*\*Yours\*\*/i);
  });

  it("uses Dock inventory titles as searchable cards with real asset URLs", () => {
    const titles = LEARNING_CENTER_SECTIONS.flatMap((s) => s.items.map((i) => i.title));
    for (const need of [
      "Intro to PIMSY",
      "Getting started with PIMSY v2",
      "Overview",
      "Tips for a Successful implementation V2",
      "Password Reset",
      "Access",
      "How training works",
      "Training 4: Group Notes (if applicable)",
      "How to Navigate the Calendar in the Portal",
      "How to Schedule Recurring Appointments in the Portal",
      "How to Use Telehealth on the Portal",
      "How to Take a Payment in the Portal",
      "Ambient Scribe",
      "How to do a Group Note",
      "How to do a Note",
      "How to Favorite tabs in a Note",
      "How to Navigate the Provider Portal Dashboard",
      "How to Manage Prescriptions with DrFirst in the Portal",
      DOCK_TRAINING_1_TITLE,
    ]) {
      expect(titles).toContain(need);
    }
    expect(titles).not.toContain("Discovery Wizard");
    expect(titles).not.toContain("PIMSY Implementation Customer Guide.pdf");
    expect(titles).not.toContain("ClaimMD enrollment");
    const byTitle = new Map(LEARNING_CENTER_SECTIONS.flatMap((s) => s.items.map((i) => [i.title, i])));
    expect(byTitle.get("Overview")?.url).toBe(DOCK_LC_ASSETS.overview);
    expect(byTitle.get("Password Reset")?.url).toBe(DOCK_LC_ASSETS.passwordReset);
    expect(byTitle.get("Getting started with PIMSY v2")?.url).toBe(DOCK_LC_ASSETS.gettingStartedPdf);
    expect(byTitle.get("Tips for a Successful implementation V2")?.url).toBe(DOCK_LC_ASSETS.tipsPdf);
    expect(byTitle.get("How to Navigate the Calendar in the Portal")?.url).toBe(DOCK_LC_ASSETS.navigateCalendar);
    expect(byTitle.get("How to Schedule Recurring Appointments in the Portal")?.url).toBe(
      DOCK_LC_ASSETS.recurringAppointments,
    );
    expect(byTitle.get("How to Use Telehealth on the Portal")?.url).toBe(DOCK_LC_ASSETS.telehealth);
    expect(byTitle.get("How to Take a Payment in the Portal")?.url).toBe(DOCK_LC_ASSETS.takeAPayment);
    expect(byTitle.get("Ambient Scribe")?.url).toBe(DOCK_LC_ASSETS.ambientScribe);
    expect(byTitle.get("How to do a Group Note")?.url).toBe(DOCK_LC_ASSETS.groupNote);
    expect(byTitle.get("How to do a Note")?.url).toBe(DOCK_LC_ASSETS.note);
    expect(byTitle.get("How to Favorite tabs in a Note")?.url).toBe(DOCK_LC_ASSETS.favoriteTabs);
    expect(byTitle.get("How to Navigate the Provider Portal Dashboard")?.url).toBe(DOCK_LC_ASSETS.providerDashboard);
    expect(byTitle.get("How to Manage Prescriptions with DrFirst in the Portal")?.url).toBe(
      DOCK_LC_ASSETS.managePrescriptions,
    );
    expect(byTitle.get("Access")?.url).toBe(LEARNING_DESKTOP_INSTALL_URL);
    expect(byTitle.get("Intro to PIMSY")?.url).toBeUndefined();
    expect(LEARNING_CENTER_SECTIONS.flatMap((s) => s.items).every((i) => i.isPlaceholder !== true || Boolean(i.url))).toBe(
      true,
    );
    expect(learningOpenLabel("How to Navigate the Calendar in the Portal", "LINK")).toBe("Open");
    expect(learningOpenLabel("How to Navigate the Calendar in the Portal", "LINK")).not.toMatch(/view pdf/i);
    expect(learningKindLabel("LINK", DOCK_LC_ASSETS.overview)).toBe("Storylane");
    expect(learningKindLabel("LINK", DOCK_LC_ASSETS.gettingStartedPdf)).toBe("PDF");
  });

  it("keeps Training 1–5 in PIMSY module order including Training 4", () => {
    const training = LEARNING_CENTER_SECTIONS.find((s) => s.slug === "training");
    const sessionTitles = training!.items
      .map((i) => i.title)
      .filter((t) => /^Training [1-5]/.test(t));
    expect(sessionTitles).toEqual([
      DOCK_TRAINING_1_TITLE,
      "Training 2: Client Charts",
      "Training 3: Appointments & Notes",
      "Training 4: Group Notes (if applicable)",
      "Training 5: Intake",
    ]);
    const orders = training!.items.filter((i) => /^Training [1-5]/.test(i.title)).map((i) => i.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("wires only Dock inventory Storylane/PDF URLs plus the desktop installer", () => {
    const allowed = new Set<string>([...Object.values(DOCK_LC_ASSETS), LEARNING_DESKTOP_INSTALL_URL]);
    const urls = learningCatalogWiredUrls();
    expect(urls).toEqual(expect.arrayContaining([...Object.values(DOCK_LC_ASSETS), LEARNING_DESKTOP_INSTALL_URL]));
    for (const url of urls) {
      expect(allowed.has(url)).toBe(true);
      expect(isLearningDockSpaceUrl(url)).toBe(false);
      expect(isSignedGcsUrl(url)).toBe(false);
      expect(url).not.toMatch(/pimsyehr\.dock\.us/i);
      expect(url).not.toMatch(/claimmd/i);
      expect(url).not.toMatch(/drfirst\.com/i);
    }
    expect(learningIframeSrc(DOCK_LC_ASSETS.overview)).toBe(DOCK_LC_ASSETS.overview);
    expect(learningIframeSrc(DOCK_LC_ASSETS.passwordReset)).toBe(DOCK_LC_ASSETS.passwordReset);
    expect(learningIframeSrc(DOCK_LC_ASSETS.ambientScribe)).toBe(DOCK_LC_ASSETS.ambientScribe);
    expect(learningIframeSrc(DOCK_LC_ASSETS.groupNote)).toBe(DOCK_LC_ASSETS.groupNote);
    expect(learningIframeSrc(DOCK_LC_ASSETS.favoriteTabs)).toBe(DOCK_LC_ASSETS.favoriteTabs);
    expect(learningIframeSrc(DOCK_LC_ASSETS.gettingStartedPdf)).toBe(DOCK_LC_ASSETS.gettingStartedPdf);
    expect(learningIframeSrc(DOCK_LC_ASSETS.tipsPdf)).toBe(DOCK_LC_ASSETS.tipsPdf);
    expect(learningIframeSrc(DOCK_LC_ASSETS.navigateCalendar)).toBeNull();
    expect(learningIframeSrc(DOCK_LC_ASSETS.recurringAppointments)).toBeNull();
    expect(learningIframeSrc(DOCK_LC_ASSETS.telehealth)).toBeNull();
    expect(learningIframeSrc(DOCK_LC_ASSETS.takeAPayment)).toBeNull();
    expect(learningIframeSrc(DOCK_LC_ASSETS.note)).toBeNull();
    expect(learningIframeSrc(DOCK_LC_ASSETS.providerDashboard)).toBeNull();
    expect(learningIframeSrc(DOCK_LC_ASSETS.managePrescriptions)).toBeNull();
    expect(LEARNING_CENTER_SECTIONS.flatMap((s) => s.items).filter((i) => i.isPlaceholder && !i.url)).toEqual([]);
  });

  it("staff /learning and portal /portal/learn both render the shared catalog", () => {
    const staffList = readFileSync(resolve(process.cwd(), "src/app/(app)/learning/page.tsx"), "utf8");
    const portalList = readFileSync(resolve(process.cwd(), "src/app/portal/learn/page.tsx"), "utf8");
    const staffItem = readFileSync(resolve(process.cwd(), "src/app/(app)/learning/[itemId]/page.tsx"), "utf8");
    const portalItem = readFileSync(resolve(process.cwd(), "src/app/portal/learn/[itemId]/page.tsx"), "utf8");
    expect(staffList).toContain("loadLearningCatalog");
    expect(portalList).toContain("loadLearningCatalog");
    expect(portalList).toContain('hrefPrefix="/portal/learn"');
    expect(staffItem).toContain("LearningItemMedia");
    expect(portalItem).toContain("LearningItemMedia");
    const catalogUi = readFileSync(resolve(process.cwd(), "src/components/learning-catalog.tsx"), "utf8");
    expect(catalogUi).toContain(">Open<");
    expect(catalogUi).not.toContain("item.summary ?");
    expect(portalItem).toContain("learningIframeSrc");
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
            kind: "LINK",
            url: DISCOVERY_WIZARD_URL,
            hasFile: false,
            libraryAssetId: null,
            audienceRole: "admin",
            isPlaceholder: false,
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
