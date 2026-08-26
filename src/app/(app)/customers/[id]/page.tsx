import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import {
  PageHeader,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  CustomerStatusBadge,
  Badge,
  Avatar,
  VisibilityBadge,
} from "@/components/ui";
import { ProjectRow, ProjectListHeader } from "@/components/project-row";
import { InviteContactForm, ToggleContactActive } from "./invite-contact-form";
import { fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();

  const customer = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.id, id),
    with: {
      projects: {
        with: {
          lead: { columns: { id: true, name: true, image: true } },
          customerAccount: { columns: { id: true, name: true } },
        },
        orderBy: (p, { desc: d }) => [d(p.createdAt)],
      },
      contacts: {
        orderBy: (u, { asc }) => [asc(u.name)],
      },
      threads: {
        orderBy: (t, { desc: d }) => [d(t.lastMessageAt)],
        limit: 5,
      },
    },
  });
  if (!customer) notFound();

  const activeProjects = customer.projects.filter((p) => !p.archivedAt);

  return (
    <>
      <PageHeader
        title={customer.name}
        breadcrumb={
          <LinkButton href="/customers" variant="ghost" size="sm" className="-ml-2.5">
            ← Customers
          </LinkButton>
        }
        subtitle={
          [customer.practiceType, customer.city && `${customer.city}, ${customer.state ?? ""}`]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        actions={
          <>
            <CustomerStatusBadge status={customer.status} />
            <LinkButton href="/projects/new" variant="primary">
              New project
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader
              title="Projects"
              subtitle={`${activeProjects.length} project${activeProjects.length === 1 ? "" : "s"}`}
            />
            {activeProjects.length === 0 ? (
              <EmptyState
                title="No projects yet"
                description="Create their implementation project from a template."
                action={
                  <LinkButton href="/projects/new" variant="primary" size="sm">
                    New project
                  </LinkButton>
                }
              />
            ) : (
              <>
                <ProjectListHeader />
                <div className="divide-y divide-border">
                  {activeProjects.map((p) => (
                    <ProjectRow key={p.id} project={p} />
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Portal contacts"
              subtitle="Who can sign in to see this customer's projects"
              action={
                <InviteContactForm
                  customerAccountId={customer.id}
                  projects={activeProjects.map((p) => ({ id: p.id, name: p.name }))}
                />
              }
            />
            {customer.contacts.length === 0 ? (
              <EmptyState
                title="No contacts invited"
                description="Invite someone at the practice and they get their own portal."
              />
            ) : (
              <div className="divide-y divide-border">
                {customer.contacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={c.name} image={c.image} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-[13px]",
                            c.isActive ? "text-ink" : "text-ink-3 line-through",
                          )}
                        >
                          {c.name}
                        </span>
                        {!c.isActive ? <Badge>Revoked</Badge> : null}
                      </div>
                      <div className="truncate text-[12px] text-ink-3">
                        {c.email}
                        {c.title ? ` · ${c.title}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11.5px] text-ink-3">
                        {c.lastSeenAt ? `Seen ${fmtRelative(c.lastSeenAt)}` : "Never signed in"}
                      </div>
                      <ToggleContactActive userId={c.id} isActive={c.isActive} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Account" />
            <dl className="divide-y divide-border text-[13px]">
              {[
                ["Status", customer.status.toLowerCase()],
                ["Practice type", customer.practiceType],
                ["Seats", customer.seatCount?.toString()],
                ["Coming from", customer.priorSystem],
                ["Phone", customer.phone],
                ["Website", customer.website],
                [
                  "Location",
                  [customer.city, customer.state].filter(Boolean).join(", ") || null,
                ],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-3 px-4 py-2">
                    <dt className="shrink-0 text-ink-3">{k}</dt>
                    <dd className="truncate text-right capitalize text-ink">{v}</dd>
                  </div>
                ))}
            </dl>
          </Card>

          {customer.internalNotes ? (
            <Card>
              <CardHeader
                title="Internal notes"
                action={<VisibilityBadge visibility="INTERNAL" />}
              />
              <p className="whitespace-pre-wrap px-5 py-4 text-[13px] leading-relaxed text-ink-2">
                {customer.internalNotes}
              </p>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Recent conversations" />
            {customer.threads.length === 0 ? (
              <EmptyState title="No conversations yet" />
            ) : (
              <div className="divide-y divide-border">
                {customer.threads.map((t) => (
                  <Link
                    key={t.id}
                    href={
                      t.projectId
                        ? `/projects/${t.projectId}/messages/${t.id}`
                        : `/inbox/${t.id}`
                    }
                    className="block px-4 py-2.5 hover:bg-surface-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] text-ink">{t.subject}</span>
                      <VisibilityBadge visibility={t.visibility} />
                    </div>
                    <div className="text-[12px] text-ink-3">{fmtRelative(t.lastMessageAt)}</div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
