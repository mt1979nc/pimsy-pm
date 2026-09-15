import { describe, expect, it } from "vitest";
import { checkUpload, contentDisposition, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("task file upload / download", () => {
  it("allows Office uploads even when the browser sends octet-stream", () => {
    expect(checkUpload("billing.xlsx", "application/octet-stream", 12_000)).toEqual({ ok: true });
    expect(checkUpload("packet.pdf", "", 800)).toEqual({ ok: true });
    expect(checkUpload("sheet.csv", "application/vnd.ms-excel", 400)).toEqual({ ok: true });
  });

  it("still refuses executables even with a generic MIME type", () => {
    const result = checkUpload("payload.exe", "application/octet-stream", 100);
    expect(result.ok).toBe(false);
  });

  it("keeps the 25 MB cap aligned with Next server actions", () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
    const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toMatch(/bodySizeLimit:\s*"25mb"/);
    expect(checkUpload("big.xlsx", "application/octet-stream", MAX_UPLOAD_BYTES + 1).ok).toBe(false);
  });

  it("emits RFC 5987 Content-Disposition so download filenames work", () => {
    const header = contentDisposition("Billing spreadsheet.xlsx", false);
    expect(header).toMatch(/^attachment;/);
    expect(header).toContain("filename*=UTF-8''Billing%20spreadsheet.xlsx");
  });
});
