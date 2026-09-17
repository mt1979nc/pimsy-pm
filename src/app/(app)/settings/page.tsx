import { requireStaff } from "@/lib/guard";
import { canManageTemplates } from "@/lib/authz";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { PageHeader, Card, CardHeader, Badge, LinkButton } from "@/components/ui";
import { APP_VERSION } from "@/lib/version";
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
      <PageHeader title="Settings" />

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
              zoomBookingUrl: me.zoomBookingUrl ?? "",
            }}
          />
        </Card>

        <Card>
          <CardHeader
            title="Password"
            subtitle={me.passwordHash ? undefined : "Set a password to skip magic-link email."}
          />
          <PasswordForm hasPassword={!!me.passwordHash} />
        </Card>

        <Card>
          <CardHeader
            title="Alerts"
          />
          <MyAlertSettings
            types={alertTypes}
            prefs={prefs}
            usingDefaults={!me.notificationPrefs}
            audienceNote="Only for the projects and conversations you're part of."
          />
        </Card>

        {canManageTemplates(actor) ? (
          <Card>
            <CardHeader title="Playbooks" />
            <div className="flex flex-wrap gap-2 px-4 py-3">
              <LinkButton href="/templates" size="sm">
                Playbooks
              </LinkButton>
              <LinkButton href="/library" size="sm">
                File library
              </LinkButton>
              <LinkButton href="/learning" size="sm">
                Learning Center
              </LinkButton>
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Update History"
            action={
              <LinkButton href="/updates" size="sm" variant="secondary">
                What&apos;s new
              </LinkButton>
            }
          />
          <div className="px-4 py-3 text-[13px] text-ink-2">
            v{APP_VERSION} — staff only. Customers never see this list.
          </div>
        </Card>

        <Card>
          <CardHeader title="About this workspace" />
          <div className="space-y-2 p-4 text-[13px] text-ink-2">
            <p>Implementation logistics only — timelines, checklists, training, correspondence.</p>
            <p className="rounded-lg bg-amber-soft px-3 py-2 text-amber">
              <strong className="font-semibold">No PHI.</strong> Never post patient names, records,
              or clinical detail.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
