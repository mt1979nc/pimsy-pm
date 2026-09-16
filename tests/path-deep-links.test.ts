import { describe, expect, it } from "vitest";
import { DISCOVERY_WIZARD_URL } from "@/db/dock-default-attachments";
import {
  buildGoPath,
  inferGoDest,
  isDiscoveryWizardUrl,
  isSafeAppPath,
  parseAppHref,
  parseGoQuery,
  pathForAudience,
  portalTaskPath,
  staffTaskPath,
  stampDiscoveryWizardUrl,
  wizardLaunchFromTaskHref,
  wizardStepTaskTitles,
} from "@/lib/path-deep-links";

describe("PATH deep links", () => {
  it("rejects open-redirect callbackUrl values", () => {
    expect(isSafeAppPath("/go?project=CEDAR")).toBe(true);
    expect(isSafeAppPath("/portal/projects/abc/tasks/def")).toBe(true);
    expect(isSafeAppPath("//evil.example/phish")).toBe(false);
    expect(isSafeAppPath("https://evil.example/")).toBe(false);
    expect(isSafeAppPath("/\\evil.example")).toBe(false);
    expect(isSafeAppPath("javascript:alert(1)")).toBe(false);
  });

  it("builds staff vs portal task and about routes", () => {
    expect(staffTaskPath("p1", "t1")).toBe("/projects/p1/tasks/t1");
    expect(portalTaskPath("p1", "t1")).toBe("/portal/projects/p1/tasks/t1");
    expect(
      pathForAudience("staff", { dest: "task", projectId: "p1", taskId: "t1" }),
    ).toBe("/projects/p1/tasks/t1");
    expect(
      pathForAudience("portal", { dest: "task", projectId: "p1", taskId: "t1" }),
    ).toBe("/portal/projects/p1/tasks/t1");
    expect(pathForAudience("portal", { dest: "about", projectId: "p1" })).toBe(
      "/portal/projects/p1/about",
    );
    expect(pathForAudience("staff", { dest: "about", projectId: "p1" })).toBe(
      "/projects/p1/about",
    );
    expect(
      pathForAudience("portal", { dest: "upload", projectId: "p1", taskId: "t1" }),
    ).toBe("/portal/projects/p1/tasks/t1#upload");
    expect(
      pathForAudience("portal", { dest: "phase", projectId: "p1", phaseId: "ph1" }),
    ).toBe("/portal/projects/p1/phases/ph1");
  });

  it("parses staff, portal, and customer-view task hrefs", () => {
    expect(parseAppHref("/projects/p/tasks/t")).toEqual({
      audience: "staff",
      surface: "task",
      projectId: "p",
      taskId: "t",
      hash: undefined,
    });
    expect(parseAppHref("/portal/projects/p/tasks/t#upload")).toMatchObject({
      audience: "portal",
      surface: "task",
      projectId: "p",
      taskId: "t",
      hash: "upload",
    });
    expect(parseAppHref("/projects/p/customer-view/tasks/t")).toMatchObject({
      audience: "staff",
      surface: "task",
      projectId: "p",
      taskId: "t",
    });
    expect(parseAppHref("https://example.com/projects/p")).toBeNull();
  });

  it("round-trips /go query including Power Automate aliases", () => {
    const path = buildGoPath({
      project: "CEDAR",
      task: "Organization Details Form",
      dest: "task",
      step: "org",
    });
    expect(path).toBe(
      "/go?project=CEDAR&task=Organization+Details+Form&dest=task&step=org",
    );
    const parsed = parseGoQuery(new URLSearchParams(path.slice(path.indexOf("?") + 1)));
    expect(parsed.project).toBe("CEDAR");
    expect(parsed.task).toBe("Organization Details Form");
    expect(parsed.dest).toBe("task");
    expect(parsed.step).toBe("org");

    const aliases = parseGoQuery({
      acronym: "BHC",
      title: "Guided Discovery Meeting",
      to: "booking",
      audience: "customer",
    });
    expect(aliases.project).toBe("BHC");
    expect(aliases.task).toBe("Guided Discovery Meeting");
    expect(aliases.dest).toBe("about");
    expect(aliases.audience).toBe("portal");
  });

  it("maps wizard steps to PATH playbook titles", () => {
    expect(wizardStepTaskTitles("org")[0]).toBe("Organization Details Form");
    expect(wizardStepTaskTitles("0")[0]).toBe("Organization Details Form");
    expect(wizardStepTaskTitles("Users")).toContain("Create Users");
    expect(wizardStepTaskTitles("cpt codes")).toContain("Billing Code Setup");
    expect(wizardStepTaskTitles("user codes/rates")).toContain("User Codes / Rates");
    expect(inferGoDest({ step: "org" })).toBe("task");
    expect(inferGoDest({ dest: "about" })).toBe("about");
    expect(inferGoDest({ phase: "Discovery" })).toBe("phase");
    expect(inferGoDest({})).toBe("project");
  });

  it("stamps the Discovery Wizard URL with PATH context and a /go return", () => {
    expect(isDiscoveryWizardUrl(DISCOVERY_WIZARD_URL)).toBe(true);
    const stamped = stampDiscoveryWizardUrl(DISCOVERY_WIZARD_URL, {
      projectCode: "CEDAR",
      projectId: "proj-1",
      taskId: "task-1",
      taskTitle: "Organization Details Form",
      audience: "portal",
      appOrigin: "https://path.example",
    });
    const url = new URL(stamped);
    expect(url.origin + url.pathname).toBe(
      new URL(DISCOVERY_WIZARD_URL).origin + new URL(DISCOVERY_WIZARD_URL).pathname,
    );
    expect(url.searchParams.get("project")).toBe("CEDAR");
    expect(url.searchParams.get("projectId")).toBe("proj-1");
    expect(url.searchParams.get("taskId")).toBe("task-1");
    expect(url.searchParams.get("task")).toBe("Organization Details Form");
    expect(url.searchParams.get("audience")).toBe("portal");
    expect(url.searchParams.get("return")).toBe(
      "https://path.example/go?project=CEDAR&projectId=proj-1&task=Organization+Details+Form&taskId=task-1&dest=task&audience=portal",
    );
    expect(url.searchParams.get("go")).toBe(url.searchParams.get("return"));
    expect(stamped).not.toMatch(/phi|ssn|npi/i);
  });

  it("does not invent a return URL without an app origin (SWA is a different host)", () => {
    const stamped = wizardLaunchFromTaskHref(DISCOVERY_WIZARD_URL, {
      title: "Organization Details Form",
      taskHref: "/portal/projects/p/tasks/t",
      projectCode: "CEDAR",
    });
    const url = new URL(stamped);
    expect(url.searchParams.get("project")).toBe("CEDAR");
    expect(url.searchParams.get("taskId")).toBe("t");
    expect(url.searchParams.get("audience")).toBe("portal");
    expect(url.searchParams.get("return")).toBeNull();
  });

  it("does not stamp a non-wizard form URL", () => {
    expect(
      stampDiscoveryWizardUrl("https://example.com/form", { projectCode: "CEDAR" }),
    ).toBe("https://example.com/form");
  });

  it("still recognizes a wizard URL after PATH query params are added", () => {
    const stamped = stampDiscoveryWizardUrl(DISCOVERY_WIZARD_URL, {
      projectCode: "TANC",
      taskTitle: "Guided Discovery Meeting",
    });
    expect(isDiscoveryWizardUrl(stamped)).toBe(true);
  });
});
