import { describe, expect, it } from "vitest";
import { dockPlaybookDescriptionForTitle } from "@/db/dock-playbook-copy";
import { flattenSeedTasks, IMPLEMENTATION_PHASES, RCM_TEMPLATE } from "@/db/template-implementation";
import { resolveTaskDescription, descriptionSnippet } from "@/lib/task-description";
import { TRAINING_SESSION_DESCRIPTION } from "@/db/dock-training-checklists";

describe("Dock playbook descriptions on live tasks", () => {
  it("covers every Implementation and RCM seed title", () => {
    const rows = [
      ...flattenSeedTasks(IMPLEMENTATION_PHASES),
      ...flattenSeedTasks(RCM_TEMPLATE.phases),
    ];
    const missing = rows.filter((r) => !dockPlaybookDescriptionForTitle(r.title));
    expect(missing, missing.map((m) => m.title).join("; ")).toEqual([]);
  });

  it("fills a blank Org Info row from the catalog without a resync", () => {
    const text = resolveTaskDescription("Org Info", null);
    expect(text).toMatch(/Discovery Wizard/i);
    expect(text).toMatch(/organizational info|org record|org info/i);
  });

  it("keeps staff-authored notes", () => {
    expect(resolveTaskDescription("Org Info", "Cedar: wait on legal entity name.")).toBe(
      "Cedar: wait on legal entity name.",
    );
  });

  it("strips checkbox dump when the task already has first-class checklist items", () => {
    const stored = `${TRAINING_SESSION_DESCRIPTION}\n\n- [ ] Appointment Widget\n- [ ] Client Create / Term`;
    const text = resolveTaskDescription("Training 1: Intro to PIMSY", stored, { stripChecklist: true });
    expect(text).toBeTruthy();
    expect(text).not.toContain("- [ ] Appointment Widget");
    expect(text).toMatch(/nested|Storylane/i);
  });

  it("snippets long copy for the list", () => {
    const snippet = descriptionSnippet("A".repeat(200), 40);
    expect(snippet?.endsWith("…")).toBe(true);
    expect(snippet!.length).toBeLessThanOrEqual(40);
  });
});
