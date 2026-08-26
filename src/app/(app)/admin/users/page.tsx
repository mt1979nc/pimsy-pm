import { asc, ne, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { Card, CardHeader, Badge, Avatar, EmptyState } from "@/components/ui";
import { InviteStaffForm, RoleSelect, ActiveToggle } from "./user-controls";
import { fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "People" };

export default async function AdminUsersPage() {
  const actor = await requireAdmin();

  const staff = await db.query.users.findMany({
    where: ne(users.role, "CUSTOMER"),
    orderBy: [asc(users.name)],
  });

  const contacts = await db.query.users.findMany({
    where: and(eq(users.role, "CUSTOMER")),
    orderBy: [asc(users.name)],
    with: { customerAccount: { columns: { id: true, name: true } } },
  });

  return (
    <>
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Internal team"
            subtitle={`${staff.filter((s) => s.isActive).length} active`}
            action={<InviteStaffForm />}
          />
          <div className="divide-y divide-border">
            {staff.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={u.name} image={u.image} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "truncate text-[13.5px] font-medium",
                        u.isActive ? "text-ink" : "text-ink-3 line-through",
                      )}
                    >
                      {u.name ?? u.email}
                    </span>
                    {u.id === actor.id ? <Badge>You</Badge> : null}
                    {!u.isActive ? <Badge tone="red">Inactive</Badge> : null}
                  </div>
                  <div className="truncate text-[12px] text-ink-3">
                    {u.email}
                    {u.title ? ` · ${u.title}` : ""}
                  </div>
                </div>
                <div className="text-right text-[11.5px] text-ink-3">
                  {u.lastSeenAt ? `Seen ${fmtRelative(u.lastSeenAt)}` : "Never signed in"}
                </div>
                <RoleSelect
                  userId={u.id}
                  role={u.role}
                  disabled={u.id === actor.id && u.role === "OWNER"}
                />
                {u.id === actor.id ? null : <ActiveToggle userId={u.id} isActive={u.isActive} />}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Customer contacts"
            subtitle="External users. Each is locked to a single customer account."
          />
          {contacts.length === 0 ? (
            <EmptyState
              title="No customer contacts yet"
              description="Invite them from a customer's page."
            />
          ) : (
            <div className="divide-y divide-border">
              {contacts.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <Avatar name={u.name} image={u.image} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "truncate text-[13px]",
                          u.isActive ? "text-ink" : "text-ink-3 line-through",
                        )}
                      >
                        {u.name ?? u.email}
                      </span>
                      {!u.isActive ? <Badge>Revoked</Badge> : null}
                    </div>
                    <div className="truncate text-[12px] text-ink-3">{u.email}</div>
                  </div>
                  <Badge tone="violet">{u.customerAccount?.name ?? "No account"}</Badge>
                  <ActiveToggle userId={u.id} isActive={u.isActive} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
