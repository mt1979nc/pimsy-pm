import { describe, expect, it } from "vitest";
import {
  ACCESSING_PIMSY_CATALOG_BLURB,
  ACCESSING_PIMSY_HEADING,
  PIMSY_DESKTOP_INSTALL_URL,
  accessingPimsyFields,
  bookmarkFromCustomFields,
  bookmarkFromWebsite,
  formatAccessingPimsyDescription,
  isPracticeAcronym,
  isReplaceableAccessingPimsyDescription,
  mergeBookmarkIntoCustomFields,
  pickPracticeAcronym,
} from "@/lib/accessing-pimsy";

describe("Accessing Pimsy field auto-fill", () => {
  it("always includes the documented desktop installer and omits missing fields", () => {
    expect(PIMSY_DESKTOP_INSTALL_URL).toBe("https://pimsyehr.com/solutions/install-pimsy/");
    const empty = accessingPimsyFields({});
    expect(empty.desktopAppUrl).toBe(PIMSY_DESKTOP_INSTALL_URL);
    expect(empty.bookmarkUrl).toBeNull();
    expect(empty.acronym).toBeNull();
    expect(empty.securityKey).toBeNull();

    const text = formatAccessingPimsyDescription(empty);
    expect(text).toContain(ACCESSING_PIMSY_HEADING);
    expect(text).toContain(PIMSY_DESKTOP_INSTALL_URL);
    expect(text).not.toMatch(/Security key:/);
    expect(text).not.toMatch(/Practice acronym:/);
    expect(text).not.toMatch(/Bookmark \/ CRM link:/);
  });

  it("fills acronym, key, and bookmark only when they already exist", () => {
    const fields = accessingPimsyFields({
      acronym: "CEDAR",
      securityKey: "issued-key-1",
      bookmarkUrl: "cedar.pimsyehr.com",
    });
    expect(fields.acronym).toBe("CEDAR");
    expect(fields.securityKey).toBe("issued-key-1");
    expect(fields.bookmarkUrl).toBe("https://cedar.pimsyehr.com/");
    const text = formatAccessingPimsyDescription(fields);
    expect(text).toContain("Practice acronym: CEDAR");
    expect(text).toContain("Security key: issued-key-1");
    expect(text).toContain("Bookmark / CRM link: https://cedar.pimsyehr.com/");
  });

  it("rejects generated project codes and HubSpot/Zendesk as the PIMSY bookmark", () => {
    expect(isPracticeAcronym("CEDAR")).toBe(true);
    expect(isPracticeAcronym("IMP-0004")).toBe(false);
    expect(pickPracticeAcronym("IMP-0004", "THS")).toBe("THS");
    expect(bookmarkFromWebsite("https://www.trianglehealth.org")).toBeNull();
    expect(bookmarkFromWebsite("https://ths.pimsyehr.com")).toBe("https://ths.pimsyehr.com/");
    expect(bookmarkFromCustomFields({ hubspot: "https://app.hubspot.com/x" })).toBeNull();
    expect(bookmarkFromCustomFields({ bookmark: "https://app.hubspot.com/x" })).toBe(
      "https://app.hubspot.com/x",
    );
    expect(bookmarkFromWebsite("https://pimsyemr.zendesk.com/hc")).toBeNull();
  });

  it("rewrites catalog blurbs but not staff notes", () => {
    expect(isReplaceableAccessingPimsyDescription(null)).toBe(true);
    expect(isReplaceableAccessingPimsyDescription(ACCESSING_PIMSY_CATALOG_BLURB)).toBe(true);
    const generated = formatAccessingPimsyDescription(accessingPimsyFields({ acronym: "BHC" }));
    expect(isReplaceableAccessingPimsyDescription(generated)).toBe(true);
    expect(
      isReplaceableAccessingPimsyDescription(`${generated}\n\nMorgan: wait for IT to issue the key.`),
    ).toBe(false);
  });

  it("stores bookmark on customFields.bookmark without inventing a tenant URL", () => {
    const next = mergeBookmarkIntoCustomFields({ timezone: "America/Chicago" }, null);
    expect(next.bookmark).toBeUndefined();
    expect(next.timezone).toBe("America/Chicago");
  });
});
