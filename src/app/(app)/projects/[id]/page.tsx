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
  SeverityBadge,
  VisibilityBadge,
  Avatar,
  HealthBadge,
} from "@/components/ui";
import { fmtDate, fmtShort, fmtRelative, dueLabel, isOverdue } from "@/lib/dates";
import {
  StatusUpdateForm,
  MilestoneToggle,
  AddMilestoneForm,
  AddRiskForm,
  RiskStatusControl,
} from "./overview-forms";
import { cn } from "@/lib/cn";

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
        with: { user: { columns: { id: true, name: true, email: true, image: true, role: true } } },
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
      ),
      orderBy: [asc(tasks.dueDate)],
      limit: 10,
    }),
  ]);

  const staffMembers = project.members.filter((m) => m.user.role !== "CUSTOMER");
  const customerContacts = project.members.filter((m) => m.user.role === "CUSTOMER");

  return (
    <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Project updates"
            subtitle="What the customer sees as the running record"
            action={<StatusUpdateForm projectId={id} currentHealth={project.health} />}
          />
          {updates.length === 0 ? (
            <EmptyState
              title="No updates posted yet"
              description="A short weekly update keeps the customer out of your inbox."
            />
          ) : (
            <div className="divide-y divide-border">
              {updates.map((u) => (
                <div key={u.id} className="px-5 py-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Avatar name={u.author.name} image={u.author.image} size={22} />
                    <span className="text-[13px] font-medium text-ink">{u.author.name}</span>
                    <span className="text-[12px] text-ink-3">{fmtRelative(u.publishedAt)}</span>
                    <HealthBadge health={u.health} />
                    <VisibilityBadge visibility={u.visibility} />
                  </div>
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                    {u.summary}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {[
                      ["Completed", u.accomplished],
                      ["Next", u.upcoming],
                      ["Needs from customer", u.needsFromYou],
                    ]
                      .filter(([, v]) => v)
                      .map(([label, v]) => (
                        <div key={label as string} className="rounded-lg bg-surface-2 p-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                            {label}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-snug text-ink-2">
                            {v}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Waiting on the customer"
            subtitle={
              customerActions.length > 0
                ? `${customerActions.length} open action item${customerActions.length === 1 ? "" : "s"}`
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
          {customerActions.length === 0 ? (
            <EmptyState
              title="Nothing on their plate"
              description="Assign a task to the customer side and it appears in their portal."
            />
          ) : (
            <div className="divide-y divide-border">
              {customerActions.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink">{t.title}</div>
                    {t.dueDate ? (
                      <div
                        className={cn(
                          "text-[12px]",
                          isOverdue(t.dueDate) ? "font-medium text-red" : "text-ink-3",
                        )}
                      >
                        {dueLabel(t.dueDate)}
                      </div>
                    ) : null}
                  </div>
                  <Badge tone={t.status === "IN_PROGRESS" ? "brand" : "neutral"}>
                    {t.status === "IN_PROGRESS" ? "Started" : "Not started"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-5">
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
                <div key={r.id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] text-ink">{r.title}</span>
                    <SeverityBadge severity={r.severity} />
                  </div>
                  {r.description ? (
                    <p className="mt-1 text-[12.5px] leading-snug text-ink-3">{r.description}</p>
                  ) : null}
                  <div className="mt-1.5 flex items-center gap-2">
                    <RiskStatusControl riskId={r.id} status={r.status} />
                    {r.owner ? (
                      <span className="text-[12px] text-ink-3">{r.owner.name}</span>
                    ) : null}
                    <VisibilityBadge visibility={r.visibility} />
                  </div>
                </div>
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
                    {m.role.toLowerCase().replace("_", " ")}
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
                  <div key={m.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <Avatar name={m.user.name} image={m.user.image} size={24} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-ink">{m.user.name}</div>
                      <div className="truncate text-[12px] text-ink-3">{m.user.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <div className="border-t border-border px-4 py-2.5">
            <Link
              href={`/projects/${id}/settings`}
              className="text-[12.5px] font-medium text-brand hover:underline"
            >
              Manage team & portal access →
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
