import { describe, expect, it } from "vitest";
import { DISCOVERY_WIZARD_URL } from "@/db/dock-default-attachments";
import { parseHttpUrl, defaultLinkLabel } from "@/lib/http-url";
import {
  fileAssetOpenHref,
  libraryAssetOpenHref,
  libraryKindLabel,
  slugifyLibraryName,
} from "@/lib/library";
import { resolveTaskActionButtons } from "@/lib/playbook-resources";

describe("file library kinds and URLs", () => {
  it("labels File vs Link/Form", () => {
    expect(libraryKindLabel("FILE")).toBe("File");
    expect(libraryKindLabel("LINK")).toBe("Link/Form");
    expect(libraryKindLabel("IMAGE")).toBe("Image");
    expect(libraryKindLabel(null)).toBe("File");
  });

  it("slugifies staff names without inventing form hosts", () => {
    expect(slugifyLibraryName("Billing questionnaire")).toBe("billing-questionnaire");
    expect(slugifyLibraryName("  ")).toBe("library-item");
  });

  it("accepts http(s) and rejects javascript: / data:", () => {
    const ok = parseHttpUrl("example.com/forms/intake");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.url.toString()).toBe("https://example.com/forms/intake");

    const https = parseHttpUrl("https://example.com/q");
    expect(https.ok).toBe(true);

    expect(parseHttpUrl("javascript:alert(1)").ok).toBe(false);
    expect(parseHttpUrl("data:text/html,hi").ok).toBe(false);
    expect(parseHttpUrl("").ok).toBe(false);
  });

  it("opens links at the stored URL and files at the download route", () => {
    expect(
      libraryAssetOpenHref({
        id: "lib-1",
        kind: "LINK",
        url: "https://example.com/forms/intake",
      }),
    ).toBe("https://example.com/forms/intake");
    expect(libraryAssetOpenHref({ id: "lib-2", kind: "FILE", url: null })).toBe("/api/library/lib-2");
    expect(
      fileAssetOpenHref({
        id: "fa-1",
        kind: "LINK",
        url: "https://example.com/forms/intake",
      }),
    ).toBe("https://example.com/forms/intake");
    expect(fileAssetOpenHref({ id: "fa-2", kind: "FILE", url: null })).toBe("/api/files/fa-2");
  });

  it("uses a hostname fallback label when staff skip the name", () => {
    const parsed = parseHttpUrl("https://example.com/forms/intake/");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(defaultLinkLabel(parsed.url)).toBe("example.com/forms/intake");
      expect(defaultLinkLabel(parsed.url, "RCM intake")).toBe("RCM intake");
    }
  });

  it("form CTAs prefer a staff-pasted library LINK over a file download", () => {
    const buttons = resolveTaskActionButtons({
      title: "Clinical Workflows",
      taskHref: "/projects/p/tasks/t",
      assets: [
        {
          id: "sheet-1",
          kind: "FILE",
          name: "Clinical workflows data sheet",
          libraryAssetId: "lib-file",
        },
        {
          id: "form-1",
          kind: "LINK",
          name: "Clinical Workflow Form",
          url: "https://example.com/clinical-workflow-form",
          libraryAssetId: "lib-link",
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
      href: "https://example.com/clinical-workflow-form",
      popup: true,
    });
    expect(buttons[0]?.href).not.toBe("/api/files/sheet-1");
    expect(buttons[0]?.href).not.toBe(DISCOVERY_WIZARD_URL);
  });

  it("does not invent Storylane or Inbed URLs", () => {
    expect(DISCOVERY_WIZARD_URL).not.toMatch(/storylane|inbed/i);
    const parsed = parseHttpUrl("https://example.com/q");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.url.hostname).toBe("example.com");
    }
  });
});
