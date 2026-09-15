import { describe, expect, it } from "vitest";
import { DISCOVERY_WIZARD_URL } from "@/db/dock-default-attachments";
import {
  DOCK_TASK_ACTION_LABEL,
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

describe("Dock task action buttons", () => {
  it("uses Click here as the Dock checklist CTA label", () => {
    expect(DOCK_TASK_ACTION_LABEL).toBe("Click here");
    expect(playbookResourceButtonLabel({ kind: "LINK", name: "Discovery Wizard" })).toBe(
      "Click here",
    );
    expect(playbookResourceButtonLabel({ kind: "FILE", name: "Billing questionnaire" })).toBe(
      "Click here",
    );
  });

  it("opens the Discovery Wizard from Dock org-details / Guided Discovery titles", () => {
    for (const title of [
      "Organization Details Form",
      "Discovery org details",
      "Org details",
      "Organization Details",
      "Guided Discovery Meeting",
      "Schedule: Workflow Guided Discovery",
      "Clinical Workflows",
      "Discovery clinical workflows",
    ]) {
      expect(isDiscoveryWizardTaskTitle(title), title).toBe(true);
      const actions = dockTaskActionsForTitle(title);
      expect(actions, title).toEqual([
        expect.objectContaining({
          kind: "link",
          label: "Click here",
          url: DISCOVERY_WIZARD_URL,
          resourceName: "Discovery Wizard",
        }),
      ]);
    }
  });

  it("does not treat specialist review rows as the wizard CTA", () => {
    expect(isDiscoveryWizardTaskTitle("Review Clinical Workflow Data Sheet")).toBe(false);
    expect(dockTaskActionsForTitle("Review Clinical Workflow Data Sheet")[0]?.kind).toBe("download");
    expect(dockTaskActionsForTitle("Review Billing Questionnaire Data Sheet")[0]?.kind).toBe(
      "download",
    );
  });

  it("Click here downloads billing / RCM sheets", () => {
    expect(dockTaskActionsForTitle("Billing Questionnaire")[0]).toMatchObject({
      kind: "download",
      label: "Click here",
    });
    expect(
      dockTaskActionsForTitle(
        "Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers",
      )[0],
    ).toMatchObject({ kind: "download", label: "Click here" });
    expect(dockTaskActionsForTitle("Complete RCM intake questionnaire")[0]).toMatchObject({
      kind: "download",
      label: "Click here",
    });
  });

  it("Click here uploads on Dock File Request titles", () => {
    for (const title of [
      "Upload Company Logo(s)",
      "Letterhead",
      "Submit Documents",
      "Submit Import Files",
      "Documentation & Forms",
      "Final Data Submission",
    ]) {
      expect(isDockFileRequestTitle(title), title).toBe(true);
      expect(dockTaskActionsForTitle(title)[0]?.kind, title).toBe("upload");
    }
    expect(isDockFileRequestTitle("Logos")).toBe(false);
    expect(dockTaskActionsForTitle("Zendesk Company Setup")).toEqual([]);
    expect(dockTaskActionsForTitle("ClaimMD Enrollment")).toEqual([]);
  });

  it("resolves wizard Click here from title even with no attachments (existing WIP)", () => {
    const buttons = resolveTaskActionButtons({
      title: "Discovery org details",
      taskHref: "/projects/p/tasks/t",
    });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toMatchObject({
      kind: "link",
      label: "Click here",
      href: DISCOVERY_WIZARD_URL,
      popup: true,
      resourceName: "Discovery Wizard",
    });
  });

  it("points download Click here at the cloned file when present", () => {
    const buttons = resolveTaskActionButtons({
      title: "Billing Questionnaire",
      taskHref: "/projects/p/tasks/t",
      assets: [
        {
          id: "file-1",
          kind: "FILE",
          name: "Billing questionnaire",
          libraryAssetId: "lib-q",
        },
      ],
    });
    expect(buttons[0]?.href).toBe("/api/files/file-1");
    expect(buttons[0]?.popup).toBe(false);
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
    expect(titles.has("Upload Company Logo(s)")).toBe(true);
    expect(titles.has("Complete RCM intake questionnaire")).toBe(true);
    expect(titles.has("Zendesk Company Setup")).toBe(false);
    expect(isOrganizationDetailsTitle("Discovery org details")).toBe(true);
  });

  it("does not invent Storylane or other unknown URLs", () => {
    for (const title of flattenSeedTasks(IMPLEMENTATION_PHASES).map((r) => r.title)) {
      for (const action of dockTaskActionsForTitle(title)) {
        if (action.url) {
          expect(action.url).toBe(DISCOVERY_WIZARD_URL);
          expect(action.url).not.toMatch(/storylane/i);
        }
      }
    }
  });
});
