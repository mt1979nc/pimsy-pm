import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flattenSeedTasks, IMPLEMENTATION_PHASES } from "@/db/template-implementation";
import { operationalDescriptionForTitle } from "@/db/dock-task-descriptions";
import {
  SUPPORT_HANDOFF_EMAIL,
  SUPPORT_HANDOFF_EMPTY_NOTE,
  SUPPORT_HANDOFF_INSTRUCTIONS,
  SUPPORT_HANDOFF_NAME,
  SUPPORT_HANDOFF_TASK_TITLE,
  isHandOffToSupportTask,
  outstandingItemsFromDescription,
} from "@/lib/support-handoff-meta";
import { supportHandoffEmailContent } from "@/lib/support-handoff";
import { isOpenProjectStatus } from "@/lib/queries";

describe("Hand off to Support playbook + copy", () => {
  it("is the last task on Post Go-Live Survey", () => {
    const phase = IMPLEMENTATION_PHASES.find((p) => p.name === "Post Go-Live Survey");
    expect(phase).toBeTruthy();
    const titles = phase!.tasks.map((t) => t.title);
    expect(titles).toContain("Please complete this post go-live survey");
    expect(titles.at(-1)).toBe(SUPPORT_HANDOFF_TASK_TITLE);
    const task = phase!.tasks.find((t) => t.title === SUPPORT_HANDOFF_TASK_TITLE);
    expect(task?.ownerSide).toBe("INTERNAL");
    expect(task?.visibility).toBe("INTERNAL");
    expect(task?.description).toBe(SUPPORT_HANDOFF_INSTRUCTIONS);
  });

  it("is present on the flattened Implementation seed", () => {
    expect(flattenSeedTasks(IMPLEMENTATION_PHASES).some((r) => r.title === SUPPORT_HANDOFF_TASK_TITLE)).toBe(
      true,
    );
  });

  it("has Dock operational copy matching the seeded instructions", () => {
    expect(operationalDescriptionForTitle(SUPPORT_HANDOFF_TASK_TITLE)).toBe(SUPPORT_HANDOFF_INSTRUCTIONS);
  });
});

describe("Hand off to Support matching and outstanding items", () => {
  it("matches the canonical title and a compact alias", () => {
    expect(isHandOffToSupportTask("Hand off to Support")).toBe(true);
    expect(isHandOffToSupportTask("handoff to support")).toBe(true);
    expect(isHandOffToSupportTask("  Hand Off to Support  ")).toBe(true);
    expect(isHandOffToSupportTask("Please complete this post go-live survey")).toBe(false);
    expect(isHandOffToSupportTask("Expose the Configuration tab")).toBe(false);
  });

  it("treats blank or seeded instructions as no outstanding items", () => {
    expect(outstandingItemsFromDescription(null)).toBeNull();
    expect(outstandingItemsFromDescription("")).toBeNull();
    expect(outstandingItemsFromDescription(SUPPORT_HANDOFF_INSTRUCTIONS)).toBeNull();
    expect(outstandingItemsFromDescription(`  ${SUPPORT_HANDOFF_INSTRUCTIONS}  `)).toBeNull();
  });

  it("keeps staff notes from the description only", () => {
    expect(outstandingItemsFromDescription("ClaimMD enrollment still open for BCBS.")).toBe(
      "ClaimMD enrollment still open for BCBS.",
    );
    expect(
      outstandingItemsFromDescription(
        `${SUPPORT_HANDOFF_INSTRUCTIONS}\n\nNeed Support to watch the first payroll run.`,
      ),
    ).toBe("Need Support to watch the first payroll run.");
  });
});

describe("Hand off to Support email body", () => {
  it("always addresses Kori and states an empty outstanding list clearly", () => {
    const mail = supportHandoffEmailContent({
      projectName: "Acme implementation",
      projectCode: "IMP-T001",
      customerName: "Acme Behavioral",
      completedBy: "Sam Specialist",
      outstanding: null,
      projectUrl: "http://localhost:3000/projects/abc",
    });
    expect(mail.to).toBe(SUPPORT_HANDOFF_EMAIL);
    expect(mail.subject).toMatch(/IMP-T001/);
    expect(mail.subject).toMatch(/Hand off to Support/);
    expect(mail.text).toContain(SUPPORT_HANDOFF_EMPTY_NOTE);
    expect(mail.text).toContain(SUPPORT_HANDOFF_NAME);
    expect(mail.text).toContain("out of implementation");
    expect(mail.text).not.toMatch(/\bPHI\b/);
    expect(mail.text).not.toMatch(/SSN|date of birth|patient name/i);
  });

  it("quotes staff outstanding notes and does not invent extra clinical content", () => {
    const note = "Need a callback on ClaimMD enrollment for the commercial payer list.";
    const mail = supportHandoffEmailContent({
      projectName: "Acme implementation",
      projectCode: "IMP-T001",
      customerName: "Acme Behavioral",
      completedBy: "Sam Specialist",
      outstanding: note,
      projectUrl: "http://localhost:3000/projects/abc",
    });
    expect(mail.text).toContain(note);
    expect(mail.text).not.toContain(SUPPORT_HANDOFF_EMPTY_NOTE);
    expect(mail.html).toContain("ClaimMD enrollment");
  });
});

describe("open Implementation WIP filter", () => {
  it("treats COMPLETED as out of the active book", () => {
    expect(isOpenProjectStatus("IN_PROGRESS")).toBe(true);
    expect(isOpenProjectStatus("NOT_STARTED")).toBe(true);
    expect(isOpenProjectStatus("ON_HOLD")).toBe(true);
    expect(isOpenProjectStatus("BLOCKED")).toBe(true);
    expect(isOpenProjectStatus("COMPLETED")).toBe(false);
    expect(isOpenProjectStatus("CANCELLED")).toBe(false);
  });
});

describe("Hand off to Support client-bundle safety", () => {
  it("keeps identifiers off Postgres and the mailer", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/support-handoff-meta.ts"), "utf8");
    expect(src).not.toMatch(/from ["']@\/db["']/);
    expect(src).not.toMatch(/from ["']@\/lib\/email["']/);
    expect(src).not.toMatch(/from ["']@\/lib\/support-handoff["']/);
    expect(src).not.toMatch(/from ["']resend["']/);
  });
});
