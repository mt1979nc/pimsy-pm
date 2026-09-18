import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DISCOVERY_WIZARD_URL } from "@/db/dock-default-attachments";
import { parseHttpUrl, defaultLinkLabel } from "@/lib/http-url";
import {
  fileAssetOpenHref,
  libraryAssetOpenHref,
  libraryKindLabel,
  libraryUploadKind,
  slugifyLibraryName,
} from "@/lib/library-meta";
import { resolveTaskActionButtons } from "@/lib/playbook-resources";

describe("file library kinds and URLs", () => {
  it("labels File vs Image vs Link", () => {
    expect(libraryKindLabel("FILE")).toBe("File");
    expect(libraryKindLabel("LINK")).toBe("Link");
    expect(libraryKindLabel("IMAGE")).toBe("Image");
    expect(libraryKindLabel(null)).toBe("File");
  });

  it("File library add UI offers File, Image, and Link", () => {
    const form = readFileSync(resolve(process.cwd(), "src/app/(app)/library/library-form.tsx"), "utf8");
    expect(form).toMatch(/const MODES = \["file", "image", "link"\]/);
    expect(form).toMatch(/Add link/);
    expect(form).toMatch(/Add image/);
    expect(form).toMatch(/Add file/);
    expect(form).toMatch(/placeholder="Title"/);
    expect(form).toMatch(/placeholder="https:\/\//);
    expect(form).not.toMatch(/Storylane|essay|Discovery Wizard/);
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
    expect(libraryAssetOpenHref({ id: "lib-2", kind: "FILE", url: null, storageKey: "lib/q.xlsx" })).toBe(
      "/api/library/lib-2",
    );
    expect(libraryAssetOpenHref({ id: "lib-missing", kind: "FILE", url: null })).toBeNull();
    expect(
      fileAssetOpenHref({
        id: "fa-1",
        kind: "LINK",
        url: "https://example.com/forms/intake",
      }),
    ).toBe("https://example.com/forms/intake");
    expect(
      fileAssetOpenHref({
        id: "fa-2",
        kind: "FILE",
        url: null,
        storageKey: "2026-09/q.xlsx",
      }),
    ).toBe("/api/files/fa-2");
    expect(fileAssetOpenHref({ id: "fa-missing", kind: "FILE", url: null })).toBeNull();
  });

  it("classifies library uploads as File or Image", () => {
    expect(libraryUploadKind("application/pdf")).toMatchObject({ ok: true, kind: "FILE" });
    expect(libraryUploadKind("image/png")).toMatchObject({ ok: true, kind: "IMAGE" });
    expect(libraryUploadKind("", "IMAGE", "shot.png")).toMatchObject({ ok: true, kind: "IMAGE" });
    expect(libraryUploadKind("application/pdf", "IMAGE")).toMatchObject({
      error: expect.stringMatching(/image/i),
    });
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
          hasBlob: true,
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

  it("keeps client attachment UI off the Postgres client", () => {
    const files = [
      "src/components/attachments.tsx",
      "src/app/(app)/library/library-form.tsx",
      "src/app/(app)/templates/[id]/template-editor.tsx",
      "src/lib/library-meta.ts",
      "src/lib/http-url.ts",
      "src/lib/comment-visibility.ts",
      "src/components/comment-count-badge.tsx",
    ];
    for (const rel of files) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src, rel).not.toMatch(/from ["']@\/lib\/library["']/);
      expect(src, rel).not.toMatch(/from ["']@\/lib\/rollup["']/);
      expect(src, rel).not.toMatch(/from ["']@\/db["']/);
      expect(src, rel).not.toMatch(/postgres-js|from ["']postgres["']/);
    }
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
