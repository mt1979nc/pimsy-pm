import { describe, expect, it } from "vitest";
import { decideCustomerInvite, parseOptionalPortalContact } from "@/lib/customer-invite";
import { isInternalStaffDomain, isReservedStaffEmail } from "@/lib/internal-email";
import { customerInviteEmail } from "@/lib/email";

function decision(overrides: Partial<Parameters<typeof decideCustomerInvite>[0]> = {}) {
  return decideCustomerInvite({
    email: "pat@practice.example",
    isReservedStaffEmail: false,
    role: null,
    isActive: true,
    lastSeenAt: null,
    hasPassword: false,
    unusedInviteExpiresAt: null,
    ...overrides,
  });
}

describe("customer portal auto-invite policy", () => {
  it("sends a first invite for a new customer contact", () => {
    expect(decision()).toEqual({ action: "send", reason: "first_invite" });
  });

  it("skips when a pending unused invite is still live", () => {
    expect(
      decision({
        role: "CUSTOMER",
        unusedInviteExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      }),
    ).toEqual({ action: "skip", reason: "pending_invite" });
  });

  it("sends again when the unused invite has expired and they never signed in", () => {
    expect(
      decision({
        role: "CUSTOMER",
        unusedInviteExpiresAt: new Date(Date.now() - 60 * 1000),
      }),
    ).toEqual({ action: "send", reason: "expired_invite" });
  });

  it("skips when they have already signed in or set a password", () => {
    expect(decision({ role: "CUSTOMER", lastSeenAt: new Date() })).toEqual({
      action: "skip",
      reason: "already_signed_in",
    });
    expect(decision({ role: "CUSTOMER", hasPassword: true })).toEqual({
      action: "skip",
      reason: "already_signed_in",
    });
  });

  it("resend (force) sends even after sign-in or a pending invite", () => {
    expect(
      decision({
        role: "CUSTOMER",
        lastSeenAt: new Date(),
        unusedInviteExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        force: true,
      }),
    ).toEqual({ action: "send", reason: "resend" });
  });

  it("refuses staff-domain addresses, non-customer roles, and revoked contacts", () => {
    expect(decision({ isReservedStaffEmail: true })).toEqual({
      action: "refuse",
      reason: "internal_staff_email",
    });
    expect(decision({ role: "SPECIALIST" })).toEqual({ action: "refuse", reason: "not_customer" });
    expect(decision({ role: "CUSTOMER", isActive: false })).toEqual({
      action: "refuse",
      reason: "inactive",
    });
  });
});

describe("INTERNAL_EMAIL_DOMAINS vs customer contacts", () => {
  it("treats pimsyehr.com as staff and not a portal contact", () => {
    expect(isInternalStaffDomain("morgan@pimsyehr.com")).toBe(true);
    expect(isReservedStaffEmail("alexander@pimsyehr.com")).toBe(true);
    expect(isReservedStaffEmail("pat@riverbend.example")).toBe(false);
  });

  it("refuses bootstrap owner as a customer contact", () => {
    expect(
      isReservedStaffEmail("owner@example.com", {
        domains: ["pimsyehr.com"],
        bootstrapOwnerEmail: "owner@example.com",
      }),
    ).toBe(true);
  });
});

describe("optional portal contact fields on create", () => {
  it("treats an empty pair as no contact", () => {
    const fd = new FormData();
    expect(parseOptionalPortalContact(fd)).toEqual({ ok: true, contact: null });
    const titleOnly = new FormData();
    titleOnly.set("contactTitle", "Practice Administrator");
    expect(parseOptionalPortalContact(titleOnly)).toEqual({ ok: true, contact: null });
  });

  it("requires both name and email when either is present", () => {
    const nameOnly = new FormData();
    nameOnly.set("contactName", "Jordan Lee");
    expect(parseOptionalPortalContact(nameOnly).ok).toBe(false);

    const emailOnly = new FormData();
    emailOnly.set("contactEmail", "jordan@practice.example");
    expect(parseOptionalPortalContact(emailOnly).ok).toBe(false);
  });

  it("accepts a valid practice address and refuses a staff domain", () => {
    const ok = new FormData();
    ok.set("contactName", "Jordan Lee");
    ok.set("contactEmail", "jordan@practice.example");
    ok.set("contactTitle", "Practice Administrator");
    const parsed = parseOptionalPortalContact(ok);
    expect(parsed).toEqual({
      ok: true,
      contact: {
        name: "Jordan Lee",
        email: "jordan@practice.example",
        title: "Practice Administrator",
      },
    });

    const staff = new FormData();
    staff.set("contactName", "Morgan");
    staff.set("contactEmail", "morgan@pimsyehr.com");
    const refused = parseOptionalPortalContact(staff);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toMatch(/staff email domain/i);
  });
});

describe("PATH invite email copy", () => {
  it("brands PATH and forbids patient information without inventing PHI", () => {
    const html = customerInviteEmail({
      firstName: "Jordan",
      customerName: "Riverbend Counseling",
      inviterName: "Sam Specialist",
      inviteUrl: "https://path.example/reset-password?token=abc",
    });
    expect(html).toMatch(/PATH/);
    expect(html).toMatch(/Open PATH/);
    expect(html).toMatch(/never post patient information/i);
    expect(html).not.toMatch(/SSN|date of birth|medical record|PHI binaries/i);
    expect(html).toContain("https://path.example/reset-password?token=abc");
  });
});
