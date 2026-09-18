import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, ne, desc, asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { projects, milestones, risks, statusUpdates, tasks } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess } from "@/lib/authz";
import {
  Card,
  CardHeader,
  EmptyState,
  Badge,
  VisibilityBadge,
  Avatar,
} from "@/components/ui";
import { fmtDate, fmtShort, isOverdue } from "@/lib/dates";
import {
  StatusUpdateForm,
  MilestoneToggle,
  AddMilestoneForm,
  AddRiskForm,
  StatusUpdateItem,
  RiskItem,
} from "./overview-forms";
import { cn } from "@/lib/cn";
import { staffingRoleLabel } from "@/lib/staffing";
import { WaitingOnCustomerList } from "@/components/waiting-on-customer-list";
import { countWaitingOnByArea, formatWaitingOnAreaHint } from "@/lib/waiting-on-area";
import { ContactCard } from "@/components/contact-card";

export const dynamic = "force-dynamic";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaff();
  await assertProjectAccess(actor, id);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    with: {
      customerAccount: { columns: { id: true, name: true, practiceType: true, seatCount: true, priorSystem: true } },
      members: {
        with: { user: { columns: { id: true, name: true, email: true, image: true, role: true, title: true, phone: true, isActive: true, lastSeenAt: true } } },
      },
    },
  });
  if (!project) notFound();

  const [projectMilestones, projectRisks, updates, customerActions] = await Promise.all([
    db.query.milestones.findMany({
      where: eq(milestones.projectId, id),
      orderBy: [asc(milestones.order), asc(milestones.dueDate)],
    }),
    db.query.risks.findMany({
      where: and(eq(risks.projectId, id), inArray(risks.status, ["OPEN", "MITIGATING"])),
      orderBy: [desc(risks.severity)],
      with: { owner: { columns: { id: true, name: true } } },
    }),
    db.query.statusUpdates.findMany({
      where: eq(statusUpdates.projectId, id),
      orderBy: [desc(statusUpdates.publishedAt)],
      limit: 4,
      with: { author: { columns: { id: true, name: true, image: true } } },
    }),
    db.query.tasks.findMany({
      where: and(
        eq(tasks.projectId, id),
        eq(tasks.ownerSide, "CUSTOMER"),
        ne(tasks.status, "DONE"),
        ne(tasks.status, "CANCELLED"),
        eq(tasks.notApplicable, false),
      ),
      orderBy: [asc(tasks.dueDate)],
      limit: 30,
      with: { phase: { columns: { id: true, name: true, order: true } } },
    }),
  ]);

  const staffMembers = project.members.filter((m) => m.user.role !== "CUSTOMER");
  const customerContacts = project.members.filter((m) => m.user.role === "CUSTOMER");

  return (
    <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Updates" />
          <StatusUpdateForm projectId={id} currentHealth={project.health} />
          {updates.length === 0 ? (
            <EmptyState title="No updates yet" />
          ) : (
            <div className="divide-y divide-border">
              {updates.map((u) => (
                <StatusUpdateItem
                  key={u.id}
                  update={u}
                  currentUserId={actor.id}
                  currentUserRole={actor.role}
                />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Waiting on the customer"
            subtitle={
              customerActions.length > 0
                ? formatWaitingOnAreaHint(countWaitingOnByArea(customerActions)) ??
                  `${customerActions.length} open action item${customerActions.length === 1 ? "" : "s"}`
                : "Nothing outstanding"
            }
            action={
              <Link
                href={`/projects/${id}/tasks`}
                className="text-[12.5px] font-medium text-brand hover:underline"
              >
                All tasks
              </Link>
            }
          />
          <WaitingOnCustomerList
            tasks={customerActions.map((t) => ({
              ...t,
              project: {
                id,
                name: project.name,
                customerAccount: project.customerAccount,
              },
            }))}
            emptyTitle="None"
            emptyDescription="Assign a customer task to show it here."
            showProject={false}
            showStatus
          />
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Milestones" />
          {projectMilestones.length === 0 ? (
            <EmptyState title="No milestones yet" />
          ) : (
            <div className="divide-y divide-border">
              {projectMilestones.map((m) => (
                <div key={m.id} className="flex items-start gap-3 px-4 py-2.5">
                  <MilestoneToggle
                    milestoneId={m.id}
                    completed={!!m.completedAt}
                    label={m.name}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "text-[13px]",
                          m.completedAt ? "text-ink-3 line-through" : "text-ink",
                        )}
                      >
                        {m.name}
                      </span>
                      {m.isGoLive ? <Badge tone="violet">Go-live</Badge> : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
                      <span
                        className={cn(
                          isOverdue(m.dueDate, m.completedAt) && "font-medium text-red",
                        )}
                      >
                        {m.completedAt ? `Done ${fmtShort(m.completedAt)}` : fmtDate(m.dueDate)}
                      </span>
                      {m.visibility === "INTERNAL" ? (
                        <VisibilityBadge visibility="INTERNAL" />
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-border">
            <AddMilestoneForm projectId={id} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Open risks"
            subtitle={projectRisks.length > 0 ? `${projectRisks.length} open` : undefined}
          />
          {projectRisks.length === 0 ? (
            <EmptyState title="No open risks" />
          ) : (
            <div className="divide-y divide-border">
              {projectRisks.map((r) => (
                <RiskItem
                  key={r.id}
                  risk={r}
                  currentUserId={actor.id}
                  currentUserRole={actor.role}
                />
              ))}
            </div>
          )}
          <div className="border-t border-border">
            <AddRiskForm projectId={id} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Team" />
          <div className="divide-y divide-border">
            {staffMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <Avatar name={m.user.name} image={m.user.image} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-ink">{m.user.name}</div>
                  <div className="truncate text-[12px] capitalize text-ink-3">
                    {staffingRoleLabel(m.role)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {customerContacts.length > 0 ? (
            <>
              <div className="border-t border-border bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                Customer contacts
              </div>
              <div className="divide-y divide-border">
                {customerContacts.map((m) => (
                  <ContactCard key={m.id} person={m.user} />
                ))}
              </div>
            </>
          ) : null}
          <div className="border-t border-border px-4 py-2.5">
            <Link
              href={`/projects/${id}/settings`}
              className="text-[12.5px] font-medium text-brand hover:underline"
            >
              Manage team
            </Link>
          </div>
        </Card>

        {project.customerAccount ? (
          <Card>
            <CardHeader title="Customer" />
            <dl className="divide-y divide-border text-[13px]">
              {[
                ["Practice", project.customerAccount.name],
                ["Type", project.customerAccount.practiceType],
                ["Seats", project.customerAccount.seatCount?.toString()],
                ["Coming from", project.customerAccount.priorSystem],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-3 px-4 py-2">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="text-right text-ink">{v}</dd>
                  </div>
                ))}
            </dl>
            <div className="border-t border-border px-4 py-2.5">
              <Link
                href={`/customers/${project.customerAccount.id}`}
                className="text-[12.5px] font-medium text-brand hover:underline"
              >
                Open customer record →
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
