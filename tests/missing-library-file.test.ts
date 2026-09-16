import { describe, expect, it } from "vitest";
import { DISCOVERY_WIZARD_URL } from "@/db/dock-default-attachments";
import {
  assetHasDownloadableBlob,
  fileAssetOpenHref,
  libraryAssetOpenHref,
  MISSING_LIBRARY_FILE_CUSTOMER_NOTE,
  MISSING_LIBRARY_FILE_STAFF_NOTE,
} from "@/lib/library-meta";
import { resolveTaskActionButtons } from "@/lib/playbook-resources";

describe("missing library FILE blobs", () => {
  it("does not treat a FILE without storage as downloadable", () => {
    expect(assetHasDownloadableBlob({ kind: "FILE", storageKey: null })).toBe(false);
    expect(assetHasDownloadableBlob({ kind: "FILE", hasBlob: false })).toBe(false);
    expect(assetHasDownloadableBlob({ kind: "FILE", storageKey: "lib/q.xlsx" })).toBe(true);
    expect(assetHasDownloadableBlob({ kind: "FILE", hasBlob: true })).toBe(true);
    expect(assetHasDownloadableBlob({ kind: "LINK", url: "https://example.com", storageKey: null })).toBe(
      false,
    );
  });

  it("hides file hrefs when the blob is missing", () => {
    expect(fileAssetOpenHref({ id: "fa-missing", kind: "FILE", url: null })).toBeNull();
    expect(
      fileAssetOpenHref({ id: "fa-ok", kind: "FILE", url: null, storageKey: "2026-09/q.xlsx" }),
    ).toBe("/api/files/fa-ok");
    expect(libraryAssetOpenHref({ id: "lib-missing", kind: "FILE", url: null })).toBeNull();
    expect(
      libraryAssetOpenHref({ id: "lib-ok", kind: "FILE", url: null, storageKey: "lib/q.xlsx" }),
    ).toBe("/api/library/lib-ok");
    expect(
      fileAssetOpenHref({
        id: "fa-link",
        kind: "LINK",
        url: "https://example.com/forms/intake",
      }),
    ).toBe("https://example.com/forms/intake");
  });

  it("hides Billing Questionnaire download CTA when the clone has no blob", () => {
    const missing = resolveTaskActionButtons({
      title: "Billing Questionnaire",
      taskHref: "/projects/p/tasks/t",
      assets: [
        {
          id: "file-1",
          kind: "FILE",
          name: "Billing questionnaire",
          libraryAssetId: "lib-q",
          hasBlob: false,
        },
      ],
    });
    expect(missing).toEqual([]);

    const none = resolveTaskActionButtons({
      title: "Billing Questionnaire",
      taskHref: "/projects/p/tasks/t",
    });
    expect(none).toEqual([]);
  });

  it("uses a library FILE blob when present, and a Link/Form when that is attached", () => {
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
      href: "/api/files/file-1",
      popup: false,
    });

    const withLink = resolveTaskActionButtons({
      title: "Billing Questionnaire",
      taskHref: "/projects/p/tasks/t",
      assets: [
        {
          id: "file-1",
          kind: "FILE",
          name: "Billing questionnaire",
          libraryAssetId: "lib-file",
          hasBlob: false,
        },
        {
          id: "form-1",
          kind: "LINK",
          name: "Billing Questionnaire Form",
          url: "https://example.com/billing-questionnaire",
          libraryAssetId: "lib-link",
        },
      ],
    });
    expect(withLink[0]).toMatchObject({
      kind: "form",
      href: "https://example.com/billing-questionnaire",
      popup: true,
    });
    expect(withLink[0]?.href).not.toBe("/api/files/file-1");
    expect(withLink[0]?.href).not.toBe(DISCOVERY_WIZARD_URL);
  });

  it("hides specialist review downloads when the submitted file is missing", () => {
    const buttons = resolveTaskActionButtons({
      title: "Review Billing Questionnaire Data Sheet",
      taskHref: "/projects/p/tasks/t",
      assets: [
        {
          id: "file-2",
          kind: "FILE",
          name: "Billing questionnaire",
          libraryAssetId: "lib-q",
        },
      ],
    });
    expect(buttons).toEqual([]);
  });

  it("documents staff vs customer missing-file copy without inventing binaries", () => {
    expect(MISSING_LIBRARY_FILE_STAFF_NOTE).toMatch(/File library/i);
    expect(MISSING_LIBRARY_FILE_CUSTOMER_NOTE).toMatch(/not available/i);
    expect(MISSING_LIBRARY_FILE_STAFF_NOTE).not.toMatch(/xlsx|PHI/i);
    expect(MISSING_LIBRARY_FILE_CUSTOMER_NOTE).not.toMatch(/xlsx|PHI/i);
  });
});
