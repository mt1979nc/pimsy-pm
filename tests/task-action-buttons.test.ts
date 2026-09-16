import { describe, expect, it } from "vitest";
import { DISCOVERY_WIZARD_URL } from "@/db/dock-default-attachments";
import {
  DOCK_BILLING_QUESTIONNAIRE_LABEL,
  DOCK_CLINICAL_FORM_LABEL,
  DOCK_OPEN_FORM_LABEL,
  DOCK_TASK_ACTION_LABEL,
  DOCK_UPLOAD_FILES_LABEL,
  dockTaskActionsForTitle,
  isDiscoveryWizardTaskTitle,
  isDockFileRequestTitle,
  isOrganizationDetailsTitle,
} from "@/db/dock-task-buttons";
import { flattenSeedTasks, IMPLEMENTATION_PHASES, RCM_TEMPLATE } from "@/db/template-implementation";
import {
  playbookResourceButtonLabel,
  resolveTaskActionButtons,
} from "@/lib/playbook-resources";

describe("Dock task action buttons (PWMI Discovery)", () => {
  it("uses Click Here as the Organization Details Form / wizard CTA", () => {
    expect(DOCK_TASK_ACTION_LABEL).toBe("Click Here");
    expect(
      playbookResourceButtonLabel({
        kind: "LINK",
        name: "Discovery Wizard",
        url: DISCOVERY_WIZARD_URL,
      }),
    ).toBe("Click Here");
  });

  it("opens the Discovery Wizard from org-details / Guided Discovery only", () => {
    for (const title of [
      "Organization Details Form",
      "Discovery org details",
      "Org details",
      "Organization Details",
      "Guided Discovery Meeting",
      "Schedule: Workflow Guided Discovery",
    ]) {
      expect(isDiscoveryWizardTaskTitle(title), title).toBe(true);
      const actions = dockTaskActionsForTitle(title);
      expect(actions, title).toEqual([
        expect.objectContaining({
          kind: "link",
          label: "Click Here",
          url: DISCOVERY_WIZARD_URL,
          resourceName: "Discovery Wizard",
        }),
      ]);
    }
    expect(isDiscoveryWizardTaskTitle("Clinical Workflows")).toBe(false);
    expect(isDiscoveryWizardTaskTitle("Discovery clinical workflows")).toBe(false);
  });

  it("Clinical Workflows is the Dock Form CTA, not the wizard", () => {
    expect(dockTaskActionsForTitle("Clinical Workflows")).toEqual([
      expect.objectContaining({
        kind: "form",
        label: DOCK_CLINICAL_FORM_LABEL,
      }),
    ]);
    expect(dockTaskActionsForTitle("Clinical Workflows")[0]?.url).toBeUndefined();
    const buttons = resolveTaskActionButtons({
      title: "Clinical Workflows",
      taskHref: "/projects/p/tasks/t",
      assets: [
        {
          id: "sheet-1",
          kind: "FILE",
          name: "Clinical workflows data sheet",
          libraryAssetId: "lib-c",
          hasBlob: true,
        },
        {
          id: "wiz-1",
          kind: "LINK",
          name: "Discovery Wizard",
          url: DISCOVERY_WIZARD_URL,
        },
      ],
    });
    expect(buttons[0]).toMatchObject({
      kind: "form",
      label: DOCK_CLINICAL_FORM_LABEL,
      href: "/api/files/sheet-1",
      popup: false,
    });
    expect(buttons[0]?.href).not.toBe(DISCOVERY_WIZARD_URL);
  });

  it("Billing Questionnaire is the Dock Form CTA", () => {
    expect(dockTaskActionsForTitle("Billing Questionnaire")[0]).toMatchObject({
      kind: "form",
      label: DOCK_BILLING_QUESTIONNAIRE_LABEL,
    });
    const withFile = resolveTaskActionButtons({
      title: "Billing Questionnaire",
      taskHref: "/projects/p/tasks/t",
      assets: [
        {
          id: "file-1",
          kind: "FILE",
          name: "Billing questionnaire",
          libraryAssetId: "lib-q",
          hasBlob: true,
        },
      ],
    });
    expect(withFile[0]).toMatchObject({
      kind: "form",
      label: DOCK_BILLING_QUESTIONNAIRE_LABEL,
      href: "/api/files/file-1",
      popup: false,
    });
    const withoutFile = resolveTaskActionButtons({
      title: "Billing Questionnaire",
      taskHref: "/projects/p/tasks/t",
    });
    expect(withoutFile).toEqual([]);
  });

  it("does not treat specialist review rows as the wizard or form CTA", () => {
    expect(isDiscoveryWizardTaskTitle("Review Clinical Workflow Data Sheet")).toBe(false);
    expect(dockTaskActionsForTitle("Review Clinical Workflow Data Sheet")[0]?.kind).toBe("download");
    expect(dockTaskActionsForTitle("Review Billing Questionnaire Data Sheet")[0]?.kind).toBe(
      "download",
    );
  });

  it("RCM intake Click Here downloads; billing spreadsheet is Upload files", () => {
    expect(dockTaskActionsForTitle("Complete RCM intake questionnaire")[0]).toMatchObject({
      kind: "download",
      label: "Click Here",
    });
    expect(
      dockTaskActionsForTitle(
        "Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers",
      )[0],
    ).toMatchObject({ kind: "upload", label: DOCK_UPLOAD_FILES_LABEL });
    expect(
      resolveTaskActionButtons({
        title: "Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers",
        taskHref: "/projects/p/tasks/t",
      })[0],
    ).toMatchObject({
      kind: "upload",
      label: DOCK_UPLOAD_FILES_LABEL,
      href: "/projects/p/tasks/t#upload",
    });
    const withSheet = resolveTaskActionButtons({
      title: "Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers",
      taskHref: "/projects/p/tasks/t",
      assets: [
        {
          id: "sheet-9",
          kind: "FILE",
          name: "Billing spreadsheet",
          libraryAssetId: "lib-b",
          hasBlob: true,
        },
      ],
    });
    expect(withSheet[0]?.kind).toBe("upload");
    expect(withSheet[0]?.href).toBe("/projects/p/tasks/t#upload");
  });

  it("Upload files on Dock File Request titles; Open form on Documentation & Forms", () => {
    for (const title of [
      "Upload Company Logo(s)",
      "Letterhead",
      "Submit Documents",
      "Submit Import Files",
      "Final Data Submission",
    ]) {
      expect(isDockFileRequestTitle(title), title).toBe(true);
      expect(dockTaskActionsForTitle(title)[0], title).toMatchObject({
        kind: "upload",
        label: DOCK_UPLOAD_FILES_LABEL,
      });
    }
    expect(isDockFileRequestTitle("Documentation & Forms")).toBe(false);
    expect(dockTaskActionsForTitle("Documentation & Forms")[0]).toMatchObject({
      kind: "form",
      label: DOCK_OPEN_FORM_LABEL,
    });
    expect(isDockFileRequestTitle("Logos")).toBe(false);
    expect(dockTaskActionsForTitle("Zendesk Company Setup")[0]).toMatchObject({
      kind: "link",
      label: "Open Zendesk",
    });
    expect(dockTaskActionsForTitle("ClaimMD Enrollment")).toEqual([]);
  });

  it("resolves wizard Click Here from title even with no attachments (existing WIP)", () => {
    const buttons = resolveTaskActionButtons({
      title: "Discovery org details",
      taskHref: "/projects/p/tasks/t",
      projectCode: "CEDAR",
    });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toMatchObject({
      kind: "link",
      label: "Click Here",
      popup: true,
      resourceName: "Discovery Wizard",
    });
    const href = new URL(buttons[0]!.href);
    expect(href.origin + href.pathname).toBe(
      new URL(DISCOVERY_WIZARD_URL).origin + new URL(DISCOVERY_WIZARD_URL).pathname,
    );
    expect(href.searchParams.get("project")).toBe("CEDAR");
    expect(href.searchParams.get("projectId")).toBe("p");
    expect(href.searchParams.get("taskId")).toBe("t");
    expect(href.searchParams.get("audience")).toBe("staff");
    expect(href.searchParams.get("task")).toMatch(/org details/i);
  });

  it("stamps portal audience when the task href is a portal route", () => {
    const buttons = resolveTaskActionButtons({
      title: "Organization Details Form",
      taskHref: "/portal/projects/p/tasks/t",
      projectCode: "TANC",
      appOrigin: "https://path.example",
    });
    const href = new URL(buttons[0]!.href);
    expect(href.searchParams.get("audience")).toBe("portal");
    expect(href.searchParams.get("return")).toContain("https://path.example/go?");
    expect(href.searchParams.get("return")).toContain("project=TANC");
  });

  it("covers every Implementation and RCM playbook title that should have a Dock button", () => {
    const rows = [
      ...flattenSeedTasks(IMPLEMENTATION_PHASES),
      ...flattenSeedTasks(RCM_TEMPLATE.phases),
    ];
    const withButtons = rows.filter((r) => dockTaskActionsForTitle(r.title).length > 0);
    const titles = new Set(withButtons.map((r) => r.title));
    expect(titles.has("Organization Details Form")).toBe(true);
    expect(titles.has("Clinical Workflows")).toBe(true);
    expect(titles.has("Guided Discovery Meeting")).toBe(true);
    expect(titles.has("Billing Questionnaire")).toBe(true);
    expect(titles.has("Documentation & Forms")).toBe(true);
    expect(titles.has("Upload Company Logo(s)")).toBe(true);
    expect(titles.has("Complete RCM intake questionnaire")).toBe(true);
    expect(titles.has("Zendesk Company Setup")).toBe(true);
    expect(titles.has("Add Zendesk Users to Org")).toBe(true);
    expect(titles.has("Accessing Pimsy")).toBe(true);
    expect(isOrganizationDetailsTitle("Discovery org details")).toBe(true);
  });

  it("does not invent Storylane or other unknown URLs", () => {
    const allowed = new Set([
      DISCOVERY_WIZARD_URL,
      "https://pimsyehr.com/solutions/install-pimsy/",
      "https://pimsyemr.zendesk.com/agent/search/1",
    ]);
    for (const title of flattenSeedTasks(IMPLEMENTATION_PHASES).map((r) => r.title)) {
      for (const action of dockTaskActionsForTitle(title)) {
        if (action.url) {
          expect(allowed.has(action.url), `${title} → ${action.url}`).toBe(true);
          expect(action.url).not.toMatch(/storylane/i);
        }
      }
    }
  });

  it("opens Zendesk agent search on org and user setup tasks", () => {
    const org = resolveTaskActionButtons({ title: "Zendesk Company Setup" });
    expect(org).toEqual([
      expect.objectContaining({
        kind: "link",
        label: "Open Zendesk",
        href: "https://pimsyemr.zendesk.com/agent/search/1",
        popup: true,
      }),
    ]);
    const users = resolveTaskActionButtons({
      title: "Add Zendesk Users to Org",
      assets: [
        {
          id: "zd-1",
          kind: "LINK",
          name: "Zendesk user / email search",
          url: "https://pimsyemr.zendesk.com/agent/search/1?q=email%3Ajane%40clinic.example",
        },
      ],
    });
    expect(users[0]?.href).toContain("email%3Ajane%40clinic.example");
    expect(users[0]?.href).toMatch(/pimsyemr\.zendesk\.com/);
  });

  it("Accessing Pimsy always offers the documented desktop installer; bookmark only when attached", () => {
    const bare = resolveTaskActionButtons({ title: "Accessing Pimsy" });
    expect(bare).toEqual([
      expect.objectContaining({
        kind: "link",
        label: "Install desktop app",
        href: "https://pimsyehr.com/solutions/install-pimsy/",
        popup: true,
      }),
    ]);
    const withBookmark = resolveTaskActionButtons({
      title: "Accessing Pimsy",
      assets: [
        {
          id: "bm-1",
          kind: "LINK",
          name: "Bookmark / CRM link",
          url: "https://cedar.pimsyehr.com/",
        },
      ],
    });
    expect(withBookmark.map((b) => b.label)).toEqual(["Install desktop app", "Open bookmark"]);
    expect(withBookmark[1]?.href).toBe("https://cedar.pimsyehr.com/");
  });
});
