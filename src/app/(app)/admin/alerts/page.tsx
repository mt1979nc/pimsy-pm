import { and, eq, ne, asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import {
  getOrgSettings,
  typesFor,
  resolvePrefs,
  sideForRole,
} from "@/lib/notification-prefs";
import { Card, CardHeader, Badge, Avatar, EmptyState } from "@/components/ui";
import { OrgDefaultsForm, UserAlertOverride } from "@/components/alert-settings";
import { EmailKillSwitch } from "./email-switch";
import { TeamsPanel } from "./teams-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

export default async function AdminAlertsPage() {
  await requireAdmin();
  const org = await getOrgSettings();

  const [staff, contacts] = await Promise.all([
    db.query.users.findMany({
      where: and(ne(users.role, "CUSTOMER"), eq(users.isActive, true)),
      columns: { id: true, name: true, email: true, role: true, image: true, notificationPrefs: true },
      orderBy: [asc(users.name)],
    }),
    db.query.users.findMany({
      where: and(eq(users.role, "CUSTOMER"), eq(users.isActive, true)),
      columns: { id: true, name: true, email: true, role: true, image: true, notificationPrefs: true },
      orderBy: [asc(users.name)],
      with: { customerAccount: { columns: { id: true, name: true } } },
    }),
  ]);

  const staffTypes = typesFor("staff");
  const customerTypes = typesFor("customer");

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
        These are <strong className="font-semibold">email</strong> settings. In-app notifications
        always appear regardless — suppressing those would hide things people need to act on.
        Defaults apply to anyone who hasn&apos;t set their own preferences.
      </p>

      <Card>
        <CardHeader
          title="Outbound email"
          subtitle="A single switch for everything the system sends"
        />
        <EmailKillSwitch enabled={org.emailEnabled} />
      </Card>

      <Card>
        <CardHeader
          title="Microsoft Teams"
          subtitle="Optional — a customer-activity feed posted into one channel"
        />
        <TeamsPanel enabled={org.teamsEnabled} webhookUrl={org.teamsWebhookUrl} />
      </Card>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Staff defaults"
            subtitle="What your implementation team is emailed about"
          />
          <OrgDefaultsForm
            scope="staff"
            types={staffTypes}
            prefs={org.staffDefaults ?? { emailEnabled: true, types: {} }}
          />
        </Card>

        <Card>
          <CardHeader
            title="Customer defaults"
            subtitle="What customer contacts are emailed about"
          />
          <OrgDefaultsForm
            scope="customer"
            types={customerTypes}
            prefs={org.customerDefaults ?? { emailEnabled: true, types: {} }}
          />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Per-person overrides"
          subtitle="Set someone's alerts directly — useful when a contact asks you to ease off"
        />
        <div className="border-b border-border bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Your team
        </div>
        <div className="divide-y divide-border">
          {staff.map((u) => {
            const prefs = resolvePrefs(u, org);
            return (
              <div key={u.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
                <Avatar name={u.name} image={u.image} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-ink">{u.name ?? u.email}</div>
                  <div className="truncate text-[12px] text-ink-3">{u.email}</div>
                </div>
                {!u.notificationPrefs ? <Badge>Defaults</Badge> : <Badge tone="brand">Custom</Badge>}
                {!prefs.emailEnabled ? <Badge tone="amber">Email off</Badge> : null}
                <UserAlertOverride
                  userId={u.id}
                  userName={u.name ?? u.email}
                  types={typesFor(sideForRole(u.role))}
                  prefs={prefs}
                  usingDefaults={!u.notificationPrefs}
                />
              </div>
            );
          })}
        </div>

        <div className="border-y border-border bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Customer contacts
        </div>
        {contacts.length === 0 ? (
          <EmptyState title="No customer contacts yet" />
        ) : (
          <div className="divide-y divide-border">
            {contacts.map((u) => {
              const prefs = resolvePrefs(u, org);
              return (
                <div key={u.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
                  <Avatar name={u.name} image={u.image} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink">{u.name ?? u.email}</div>
                    <div className="truncate text-[12px] text-ink-3">{u.email}</div>
                  </div>
                  <Badge tone="violet">{u.customerAccount?.name ?? "No account"}</Badge>
                  {!u.notificationPrefs ? <Badge>Defaults</Badge> : <Badge tone="brand">Custom</Badge>}
                  {!prefs.emailEnabled ? <Badge tone="amber">Email off</Badge> : null}
                  <UserAlertOverride
                    userId={u.id}
                    userName={u.name ?? u.email}
                    types={typesFor(sideForRole(u.role))}
                    prefs={prefs}
                    usingDefaults={!u.notificationPrefs}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
