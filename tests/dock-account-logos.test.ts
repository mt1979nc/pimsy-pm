import { describe, expect, it } from "vitest";
import {
  acronymsFromDockRecord,
  dockListUrl,
  pathLogoKeys,
  planDockLogoImport,
  type DockLogoAccount,
  type PathLogoCustomer,
} from "@/lib/dock-account-logos";

const cedarAccount: DockLogoAccount = {
  id: "acc_cedar",
  name: "CEDAR Health",
  logo: "https://cdn.example/cedar.png",
  customFields: [{ name: "Acronym", variableName: "acronym", value: "CEDAR" }],
};

function customer(partial: Partial<PathLogoCustomer> & Pick<PathLogoCustomer, "id" | "name" | "acronyms">): PathLogoCustomer {
  return {
    logoUrl: null,
    logoStorageKey: null,
    ...partial,
  };
}

describe("Dock account logo matching", () => {
  it("matches a Dock account acronym custom field to the PATH customer", () => {
    const plan = planDockLogoImport({
      accounts: [cedarAccount],
      workspaces: [],
      customers: [customer({ id: "c1", name: "CEDAR Health", acronyms: pathLogoKeys({ crmAcronym: "cedar" }) })],
    });
    expect(plan.updates).toEqual([
      expect.objectContaining({
        customerId: "c1",
        acronym: "CEDAR",
        logoUrl: "https://cdn.example/cedar.png",
        action: "set",
      }),
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("uses the workspace acronym with the account logo", () => {
    const plan = planDockLogoImport({
      accounts: [{ id: "acc_bhc", name: "BridgeHill Crossing", logo: "https://cdn.example/bhc.png", customFields: [] }],
      workspaces: [
        {
          id: "ws_bhc",
          name: "BridgeHill Crossing",
          accountId: "acc_bhc",
          accountName: "BridgeHill Crossing",
          accountLogo: "https://cdn.example/bhc.png",
          customFields: [{ name: "CRM acronym", variableName: "crmAcronym", value: "BHC" }],
        },
      ],
      customers: [customer({ id: "c2", name: "BridgeHill Crossing", acronyms: ["BHC"] })],
    });
    expect(plan.updates[0]).toMatchObject({ acronym: "BHC", logoUrl: "https://cdn.example/bhc.png", action: "set" });
  });

  it("treats a Dock name that is only an acronym as the key", () => {
    expect(acronymsFromDockRecord("BHC", [])).toEqual(["BHC"]);
    expect(acronymsFromDockRecord("BridgeHill Crossing", [])).toEqual([]);
  });

  it("does not use project codes as keys", () => {
    expect(pathLogoKeys({ crmAcronym: "THS", crmKey: "secret-key-value", prismClientId: null })).toEqual(["THS"]);
    expect(pathLogoKeys({ crmAcronym: null, crmKey: "IMP-0042" })).toEqual([]);
  });

  it("skips conflicts, existing URLs, and PATH uploads unless overwrite", () => {
    const accounts: DockLogoAccount[] = [
      {
        id: "a",
        name: "RAC",
        logo: "https://cdn.example/rac-a.png",
        customFields: [{ name: "Acronym", variableName: "acronym", value: "RAC" }],
      },
      {
        id: "b",
        name: "Other",
        logo: "https://cdn.example/rac-b.png",
        customFields: [{ name: "Acronym", variableName: "acronym", value: "RAC" }],
      },
    ];
    const conflict = planDockLogoImport({
      accounts,
      workspaces: [],
      customers: [customer({ id: "c", name: "RAC", acronyms: ["RAC"] })],
    });
    expect(conflict.skipped[0]?.reason).toBe("conflict");
    expect(conflict.updates).toEqual([]);

    const existing = planDockLogoImport({
      accounts: [cedarAccount],
      workspaces: [],
      customers: [
        customer({
          id: "c1",
          name: "CEDAR Health",
          acronyms: ["CEDAR"],
          logoUrl: "https://cdn.example/other.png",
        }),
      ],
    });
    expect(existing.skipped[0]?.reason).toBe("existing-url");

    const replaced = planDockLogoImport({
      accounts: [cedarAccount],
      workspaces: [],
      overwrite: true,
      customers: [
        customer({
          id: "c1",
          name: "CEDAR Health",
          acronyms: ["CEDAR"],
          logoStorageKey: "2026-10/upload.png",
        }),
      ],
    });
    expect(replaced.updates[0]).toMatchObject({ action: "replace", clearsUpload: true });
  });

  it("leaves an already-matching URL unchanged and reports unmatched Dock acronyms", () => {
    const plan = planDockLogoImport({
      accounts: [
        cedarAccount,
        {
          id: "zz",
          name: "ZZ",
          logo: "https://cdn.example/zz.png",
          customFields: [],
        },
      ],
      workspaces: [],
      customers: [
        customer({
          id: "c1",
          name: "CEDAR Health",
          acronyms: ["CEDAR"],
          logoUrl: "https://cdn.example/cedar.png",
        }),
      ],
    });
    expect(plan.updates[0]?.action).toBe("unchanged");
    expect(plan.unmatchedDock.map((row) => row.acronym)).toEqual(["ZZ"]);
  });

  it("requests account.logo from the Dock list API", () => {
    const url = dockListUrl("https://api.dock.us", "accounts", 2, 100);
    expect(url).toContain("https://api.dock.us/v1/accounts?");
    expect(url).toContain("properties=logo");
    expect(url).toContain("properties=customFields.variableName");
    expect(url).toContain("page=2");
    const workspaces = dockListUrl("https://api.dock.us/", "workspaces", 1, 100);
    expect(workspaces).toContain("properties=account.logo");
    expect(workspaces).not.toContain("hubspot");
  });
});
