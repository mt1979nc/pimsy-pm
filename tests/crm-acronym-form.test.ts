import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("CRM acronym is one field", () => {
  it("renders name=crmAcronym once on New project (leftover Accessing Pimsy duplicate removed)", () => {
    const form = src("src/app/(app)/projects/new/new-project-form.tsx");
    expect(form.match(/name="crmAcronym"/g)).toHaveLength(1);
    expect(form.match(/id="crmAcronym"/g)).toHaveLength(1);
    expect(form.match(/label="CRM acronym"/g)).toHaveLength(1);
    expect(form).toMatch(/Shown on portal About/);
    expect(form).not.toMatch(/Copied onto Accessing Pimsy/);
    expect(form).toMatch(/name="crmKey"/);
    expect(form).toMatch(/name="bookmarkUrl"/);
    expect(form).toMatch(/name="hubspotDealUrl"/);
  });

  it("renders CRM acronym once on About Edit site profile", () => {
    const form = src("src/app/(app)/projects/[id]/about/about-form.tsx");
    expect(form.match(/name="crmAcronym"/g)).toHaveLength(1);
    expect(form.match(/label="CRM acronym"/g)).toHaveLength(1);
  });

  it("keeps a single crmAcronym on createProjectSchema (does not regress v1.14.4 / #56)", () => {
    const actions = src("src/actions/projects.ts");
    const start = actions.indexOf("const createProjectSchema");
    const end = actions.indexOf("async function nextProjectCode");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const schema = actions.slice(start, end);
    expect(schema.match(/crmAcronym:/g)).toHaveLength(1);
    expect(schema).toMatch(/crmKey:/);
    expect(schema).toMatch(/bookmarkUrl:/);
    expect(schema).toMatch(/hubspotDealUrl:/);
  });
});
