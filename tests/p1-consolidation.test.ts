import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function src(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("shared customer Areas nav", () => {
  it("renders portal and staff customer view from CustomerAreaNav", () => {
    const portal = src("src/app/portal/projects/[id]/layout.tsx");
    const staff = src("src/app/(app)/projects/[id]/customer-view/layout.tsx");
    const nav = src("src/components/customer-area-nav.tsx");

    expect(portal).toContain('from "@/components/customer-area-nav"');
    expect(portal).toContain("<CustomerAreaNav");
    expect(portal).toContain('learnHref="/portal/learn"');
    expect(portal).not.toContain("<SideNavLink");
    expect(staff).toContain("<CustomerAreaNav");
    expect(nav).toContain("Areas");
    expect(nav).toContain("Learning Center");
    expect(nav).toContain("Recordings");
    expect(nav).toContain("Messages");
  });
});

describe("deprecated contact and workbook paths", () => {
  it("keeps portal contacts on PortalContactsPanel only", () => {
    const page = src("src/app/(app)/customers/[id]/page.tsx");
    const panel = src("src/app/(app)/customers/[id]/portal-contacts-panel.tsx");
    expect(page).toContain('from "./portal-contacts-panel"');
    expect(page).not.toContain("invite-contact-form");
    expect(page).not.toContain("InviteContactForm");
    expect(panel).toContain("export function PortalContactsPanel");
    expect(panel).not.toContain("InviteContactForm");
  });
});
