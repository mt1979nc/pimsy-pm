import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { canCreateProjects, canDeletePortfolioRecords } from "@/lib/authz";
import {
  PageHeader,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  CustomerStatusBadge,
  Badge,
  VisibilityBadge,
} from "@/components/ui";
import { ProjectRow, ProjectListHeader } from "@/components/project-row";
import { PortalContactsPanel, ToggleContactActive, ResendContactInvite } from "./invite-contact-form";
import { EditContactForm } from "./edit-contact-form";
import { ConfirmDeleteForm } from "@/components/confirm-delete";
import { deleteCustomer } from "@/actions/customers";
import { fmtRelative } from "@/lib/dates";
import { ContactCard } from "@/components/contact-card";
import { CustomerAnalyticsForm } from "./customer-analytics-form";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();

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
            {customer.excludeFromAnalytics ? <Badge tone="amber">Off analytics</Badge> : null}
            {activeProjects[0] ? (
              <LinkButton href={`/projects/${activeProjects[0].id}/customer-view`} variant="secondary">
                Customer view
              </LinkButton>
            ) : null}
            {canCreateProjects(actor) ? (
              <LinkButton href="/projects/new" variant="primary">
                New project
              </LinkButton>
            ) : null}
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
                  canCreateProjects(actor) ? (
                    <LinkButton href="/projects/new" variant="primary" size="sm">
                      New project
                    </LinkButton>
                  ) : undefined
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
            <PortalContactsPanel
              customerAccountId={customer.id}
              projects={activeProjects.map((p) => ({ id: p.id, name: p.name }))}
            >
              {customer.contacts.length === 0 ? (
                <EmptyState
                  title="No contacts invited"
                  description="Add a portal contact when you create the customer or project — PATH emails the invite automatically. You can still add someone here."
                />
              ) : (
                <div className="divide-y divide-border">
                  {customer.contacts.map((c) => (
                    <div key={c.id}>
                      <ContactCard
                        person={c}
                        actions={
                          <div className="flex flex-col items-end gap-0.5">
                            {c.isActive ? <ResendContactInvite userId={c.id} /> : null}
                            <ToggleContactActive userId={c.id} isActive={c.isActive} />
                          </div>
                        }
                      />
                      <div className="px-4 pb-2.5">
                        <EditContactForm
                          contact={{ id: c.id, name: c.name, title: c.title, phone: c.phone }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PortalContactsPanel>
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

          <Card>
            <CardHeader
              title="Reporting"
              subtitle="E2E / stress-test accounts stay off Prism metrics"
            />
            <CustomerAnalyticsForm
              customerId={customer.id}
              excludeFromAnalytics={customer.excludeFromAnalytics}
            />
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

          {canDeletePortfolioRecords(actor) ? (
            <Card>
              <CardHeader title="Danger zone" subtitle="Permanent delete" />
              <div className="p-5">
                <ConfirmDeleteForm
                  action={deleteCustomer}
                  hiddenFields={{ customerId: customer.id }}
                  confirmLabel={`Type ${customer.name} to confirm`}
                  confirmHint="Customer name or slug."
                  submitLabel="Delete customer permanently"
                  warning={
                    customer.status === "LIVE" ||
                    customer.projects.some((p) => p.status === "COMPLETED" || p.actualGoLiveDate)
                      ? "This account looks like a live or post go-live site. PATH keeps those for historical Forecast/Analysis. Prefer archive, or prune only active non-Dock WIP with db:cleanup:non-dock. Staff logins are never deleted."
                      : customer.projects.length > 0
                        ? `This deletes the customer account and portal contacts. ${customer.projects.length} project${customer.projects.length === 1 ? "" : "s"} will also be removed if you check the box. Staff logins are never deleted.`
                      : "This deletes the customer account and portal contacts. Staff logins are never deleted."
                  }
                  cascade={
                    customer.projects.length > 0
                      ? {
                          name: "cascadeProjects",
                          label: `Also delete ${customer.projects.length} project${customer.projects.length === 1 ? "" : "s"} (tasks, threads, slips)`,
                        }
                      : undefined
                  }
                />
              </div>
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
