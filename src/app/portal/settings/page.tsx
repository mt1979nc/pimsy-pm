import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireCustomer } from "@/lib/guard";
import { Card, CardHeader } from "@/components/ui";
import { PasswordForm } from "@/components/password-form";
import { MyAlertSettings } from "@/components/alert-settings";
import { typesFor, resolvePrefs, getOrgSettings } from "@/lib/notification-prefs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your settings" };

export default async function PortalSettingsPage() {
  const actor = await requireCustomer();
  const me = await db.query.users.findFirst({ where: eq(users.id, actor.id) });
  if (!me) return null;

  const org = await getOrgSettings();
  const prefs = resolvePrefs(me, org);

  return (
    <>
      <Link href="/portal" className="mb-3 inline-block text-[12.5px] text-ink-3 hover:text-brand">
        ← Your workspace
      </Link>

      <h1 className="mb-1 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        Your settings
      </h1>
      <p className="mb-6 text-[13.5px] text-ink-2">
        Control what your implementation team emails you about.
      </p>

      <div className="max-w-[620px] space-y-5">
        <Card>
          <CardHeader
            title="Email alerts"
            subtitle="Everything still appears here in your workspace either way."
          />
          <MyAlertSettings
            types={typesFor("customer")}
            prefs={prefs}
            usingDefaults={!me.notificationPrefs}
            audienceNote="Only about your own implementation."
          />
        </Card>

        <Card>
          <CardHeader
            title="Password"
            subtitle={me.passwordHash ? "Change your password." : "Set a password to sign in without an emailed link."}
          />
          <PasswordForm hasPassword={!!me.passwordHash} />
        </Card>

        <Card>
          <CardHeader title="Your details" />
          <dl className="divide-y divide-border text-[13px]">
            <div className="flex justify-between gap-3 px-5 py-2.5">
              <dt className="text-ink-3">Name</dt>
              <dd className="text-ink">{me.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 px-5 py-2.5">
              <dt className="text-ink-3">Email</dt>
              <dd className="text-ink">{me.email}</dd>
            </div>
            {me.title ? (
              <div className="flex justify-between gap-3 px-5 py-2.5">
                <dt className="text-ink-3">Role</dt>
                <dd className="text-ink">{me.title}</dd>
              </div>
            ) : null}
          </dl>
          <p className="border-t border-border px-5 py-3 text-[12.5px] leading-relaxed text-ink-3">
            Need a detail changed, or a colleague added to this workspace? Ask your implementation
            specialist — they can set it up in a moment.
          </p>
        </Card>
      </div>
    </>
  );
}
