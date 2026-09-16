import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts, passwordResetTokens, projectMembers, projects, users } from "@/db/schema";
import { buildFixture } from "./fixtures";
import {
  autoInviteCustomerContact,
  autoInviteCustomerContactsForProject,
  provisionCustomerContact,
  sendCustomerInvite,
  STAFF_DOMAIN_CONTACT_ERROR,
  type InviteDeliver,
} from "@/lib/customer-invite";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("customer portal auto-invite (postgres)", () => {
  let fixture: Awaited<ReturnType<typeof buildFixture>>;

  beforeAll(async () => {
    fixture = await buildFixture();
  });

  function actor() {
    return {
      id: fixture.actors.specialist.id,
      email: "spec@pimsyehr.com",
      name: "Sam Specialist",
    };
  }

  function capturingDeliver() {
    const sent: { to: string; subject: string }[] = [];
    const deliver: InviteDeliver = async ({ to, subject }) => {
      sent.push({ to, subject });
      return { emailed: true };
    };
    return { sent, deliver };
  }

  it("provisions a CUSTOMER user pinned to one account and refuses staff domains", async () => {
    const first = await provisionCustomerContact({
      customerAccountId: fixture.accounts.a,
      email: "jordan@acme.example",
      name: "Jordan Lee",
      title: "Practice Administrator",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.created).toBe(true);

    const row = await db.query.users.findFirst({ where: eq(users.id, first.userId) });
    expect(row?.role).toBe("CUSTOMER");
    expect(row?.customerAccountId).toBe(fixture.accounts.a);

    const again = await provisionCustomerContact({
      customerAccountId: fixture.accounts.a,
      email: "jordan@acme.example",
      name: "Jordan Lee",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.created).toBe(false);
    expect(again.userId).toBe(first.userId);

    const staff = await provisionCustomerContact({
      customerAccountId: fixture.accounts.a,
      email: "newhire@pimsyehr.com",
      name: "New Hire",
    });
    expect(staff).toEqual({ ok: false, error: STAFF_DOMAIN_CONTACT_ERROR });

    const other = await provisionCustomerContact({
      customerAccountId: fixture.accounts.b,
      email: "jordan@acme.example",
      name: "Jordan Lee",
    });
    expect(other.ok).toBe(false);
  });

  it("sends once, skips a repeat, and force-resend mints a new link", async () => {
    const provisioned = await provisionCustomerContact({
      customerAccountId: fixture.accounts.a,
      email: "avery-auto@acme.example",
      name: "Avery Auto",
    });
    expect(provisioned.ok).toBe(true);
    if (!provisioned.ok) return;

    const firstCap = capturingDeliver();
    const first = await sendCustomerInvite({
      userId: provisioned.userId,
      actor: actor(),
      customerName: "Acme Behavioral",
      deliver: firstCap.deliver,
    });
    expect(first.skipped).toBe(false);
    expect(first.emailed).toBe(true);
    expect(first.inviteUrl).toMatch(/\/reset-password\?token=/);
    expect(firstCap.sent).toHaveLength(1);
    expect(firstCap.sent[0]?.subject).toMatch(/PATH/);
    expect(firstCap.sent[0]?.subject).not.toMatch(/\bPHI\b/);

    const tokensAfterFirst = await db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, provisioned.userId));
    expect(tokensAfterFirst).toHaveLength(1);

    const secondCap = capturingDeliver();
    const second = await sendCustomerInvite({
      userId: provisioned.userId,
      actor: actor(),
      customerName: "Acme Behavioral",
      deliver: secondCap.deliver,
    });
    expect(second.skipped).toBe(true);
    expect(second.skipReason).toBe("pending_invite");
    expect(secondCap.sent).toHaveLength(0);

    const tokensAfterSkip = await db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, provisioned.userId));
    expect(tokensAfterSkip).toHaveLength(1);

    const resendCap = capturingDeliver();
    const resend = await sendCustomerInvite({
      userId: provisioned.userId,
      actor: actor(),
      customerName: "Acme Behavioral",
      force: true,
      deliver: resendCap.deliver,
    });
    expect(resend.skipped).toBe(false);
    expect(resend.emailed).toBe(true);
    expect(resendCap.sent).toHaveLength(1);

    const tokensAfterResend = await db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, provisioned.userId));
    expect(tokensAfterResend).toHaveLength(1);
    expect(tokensAfterResend[0]?.id).not.toBe(tokensAfterFirst[0]?.id);
  });

  it("auto-invite on a portal site adds account contacts to the project without spamming", async () => {
    const [acct] = await db
      .insert(customerAccounts)
      .values({ name: "Invite Co", slug: `invite-co-${Date.now()}` })
      .returning({ id: customerAccounts.id });
    const [proj] = await db
      .insert(projects)
      .values({
        name: "Invite Co implementation",
        code: `IMP-INV${Date.now().toString().slice(-4)}`,
        customerAccountId: acct.id,
        leadId: fixture.actors.specialist.id,
        portalEnabled: true,
      })
      .returning({ id: projects.id });

    const cap = capturingDeliver();
    const created = await autoInviteCustomerContact({
      customerAccountId: acct.id,
      email: "site-go-live@invite-co.example",
      name: "Site Go Live",
      actor: actor(),
      projectId: proj.id,
      deliver: cap.deliver,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.invited).toBe(true);
    expect(cap.sent).toHaveLength(1);
    expect(cap.sent[0]?.to).toBe("site-go-live@invite-co.example");

    const membership = await db.query.projectMembers.findFirst({
      where: eq(projectMembers.userId, created.userId),
    });
    expect(membership?.projectId).toBe(proj.id);
    expect(membership?.role).toBe("CUSTOMER_CONTACT");

    const secondPass = await autoInviteCustomerContactsForProject({
      projectId: proj.id,
      customerAccountId: acct.id,
      actor: actor(),
      deliver: cap.deliver,
    });
    expect(secondPass.invitedUserIds).not.toContain(created.userId);
    expect(secondPass.skippedUserIds).toContain(created.userId);
    expect(cap.sent).toHaveLength(1);
  });

  it("does not invite a contact who already signed in unless force is set", async () => {
    const provisioned = await provisionCustomerContact({
      customerAccountId: fixture.accounts.a,
      email: "seen@acme.example",
      name: "Seen Contact",
    });
    expect(provisioned.ok).toBe(true);
    if (!provisioned.ok) return;

    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, provisioned.userId));

    const cap = capturingDeliver();
    const skipped = await sendCustomerInvite({
      userId: provisioned.userId,
      actor: actor(),
      customerName: "Acme Behavioral",
      deliver: cap.deliver,
    });
    expect(skipped.skipped).toBe(true);
    expect(skipped.skipReason).toBe("already_signed_in");
    expect(cap.sent).toHaveLength(0);
  });
});
