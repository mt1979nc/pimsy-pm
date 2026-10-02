import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { customerLogoSrc, isDisplayableLogoUrl, logoInitials } from "@/lib/customer-logo";
import { parseLogoForm } from "@/lib/customer-logo-parse";

describe("customer logo display", () => {
  it("prefers an uploaded file route over a stale URL", () => {
    expect(
      customerLogoSrc({
        id: "cust_1",
        logoUrl: "https://cdn.example/old.png",
        logoStorageKey: "2026-10/abc.png",
      }),
    ).toBe("/api/customer-logos/cust_1");
  });

  it("uses an https URL when nothing was uploaded", () => {
    expect(customerLogoSrc({ id: "cust_1", logoUrl: "https://cdn.example/cedar.png" })).toBe(
      "https://cdn.example/cedar.png",
    );
  });

  it("drops javascript and data URLs", () => {
    expect(isDisplayableLogoUrl("javascript:alert(1)")).toBe(false);
    expect(isDisplayableLogoUrl("data:image/png;base64,aaaa")).toBe(false);
    expect(customerLogoSrc({ id: "cust_1", logoUrl: "javascript:alert(1)" })).toBeNull();
  });

  it("shows short acronyms and name initials", () => {
    expect(logoInitials("BHC")).toBe("BHC");
    expect(logoInitials("CEDAR")).toBe("CE");
    expect(logoInitials("BridgeHill Crossing")).toBe("BC");
    expect(logoInitials("")).toBe("?");
  });
});

describe("customer logo form", () => {
  it("treats an empty form as no change", async () => {
    const parsed = await parseLogoForm(new FormData());
    expect(parsed).toEqual({ ok: true, input: { kind: "unchanged" } });
  });

  it("accepts an https URL and rejects a bare word", async () => {
    const ok = new FormData();
    ok.set("logoUrl", "https://cdn.example/logo.png");
    const parsed = await parseLogoForm(ok);
    expect(parsed).toEqual({ ok: true, input: { kind: "url", url: "https://cdn.example/logo.png" } });

    const bad = new FormData();
    bad.set("logoUrl", "not a url");
    const rejected = await parseLogoForm(bad);
    expect(rejected.ok).toBe(false);
  });

  it("lets Remove win over a prefilled URL, and an upload win over Remove", async () => {
    const clear = new FormData();
    clear.set("logoUrl", "https://cdn.example/logo.png");
    clear.set("clearLogo", "on");
    expect(await parseLogoForm(clear)).toEqual({ ok: true, input: { kind: "clear" } });

    const upload = new FormData();
    upload.set("clearLogo", "on");
    upload.set("logoFile", new File([Uint8Array.from([1, 2, 3])], "mark.png", { type: "image/png" }));
    const parsed = await parseLogoForm(upload);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.input.kind).toBe("file");
  });

  it("rejects a PDF and an oversized image", async () => {
    const pdf = new FormData();
    pdf.set("logoFile", new File([Uint8Array.from([1])], "notes.pdf", { type: "application/pdf" }));
    const rejected = await parseLogoForm(pdf);
    expect(rejected.ok).toBe(false);

    const big = new FormData();
    big.set(
      "logoFile",
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }),
    );
    const tooBig = await parseLogoForm(big);
    expect(tooBig.ok).toBe(false);
  });
});

describe("customer logo migration", () => {
  it("ships 0027 on customer_account", () => {
    const sql = readFileSync(resolve(process.cwd(), "drizzle/0027_customer_logo.sql"), "utf8");
    expect(sql).toMatch(/logo_url/);
    expect(sql).toMatch(/logo_storage_key/);
    expect(sql).toMatch(/customer_account/);
    const journal = readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8");
    expect(journal).toMatch(/0027_customer_logo/);
  });
});
