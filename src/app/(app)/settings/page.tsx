import { requireStaff } from "@/lib/guard";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { PageHeader, Card, CardHeader, Badge } from "@/components/ui";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "@/components/password-form";
import { MyAlertSettings } from "@/components/alert-settings";
import { typesFor, resolvePrefs, getOrgSettings } from "@/lib/notification-prefs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requireStaff();
  const me = await db.query.users.findFirst({ where: eq(users.id, actor.id) });
  if (!me) return null;

  const org = await getOrgSettings();
  const prefs = resolvePrefs(me, org);
  const alertTypes = typesFor("staff");

  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile and working preferences." />

      <div className="mx-auto max-w-[640px] space-y-5">
        <Card>
          <CardHeader
            title="Profile"
            subtitle={me.email}
            action={<Badge tone="brand">{me.role.toLowerCase()}</Badge>}
          />
          <ProfileForm
            defaults={{
              name: me.name ?? "",
              title: me.title ?? "",
              timeZone: me.timeZone,
              capacityHoursPerWeek: me.capacityHoursPerWeek,
            }}
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
          <CardHeader
            title="Alerts"
            subtitle="What lands in your inbox. In-app notifications aren't affected."
          />
          <MyAlertSettings
            types={alertTypes}
            prefs={prefs}
            usingDefaults={!me.notificationPrefs}
            audienceNote="Only for the projects and conversations you're part of."
          />
        </Card>

        <Card>
          <CardHeader title="About this workspace" />
          <div className="space-y-3 p-5 text-[13px] leading-relaxed text-ink-2">
            <p>
              This system tracks implementation logistics only — timelines, configuration
              checklists, training scheduling and correspondence.
            </p>
            <p className="rounded-lg bg-amber-soft px-3 py-2 text-amber">
              <strong className="font-semibold">No PHI.</strong> Never post patient names, records,
              or clinical detail here, and tell your customers the same. If a customer pastes
              something they shouldn&apos;t, delete the message and follow your incident process.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
