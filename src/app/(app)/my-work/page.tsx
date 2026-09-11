import { requireStaff } from "@/lib/guard";
import { myTasks, waitingOnCustomer, hoursLoggedThisWeek } from "@/lib/queries";
import { PageHeader, Card, CardHeader, EmptyState, Stat, Badge } from "@/components/ui";
import { TaskRow } from "@/components/task-row";
import { isOverdue, dueLabel } from "@/lib/dates";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "My work" };

type Task = Awaited<ReturnType<typeof myTasks>>[number];

function customerKey(t: Task) {
  return t.project?.customerAccount?.id ?? t.project?.id ?? "unknown";
}

function customerLabel(t: Task) {
  return t.project?.customerAccount?.name ?? t.project?.name ?? "Unknown customer";
}

function phaseKey(t: Task) {
  return t.phase?.id ?? "no-phase";
}

function phaseLabel(t: Task) {
  const name = t.phase?.name ?? "No phase";
  // Clear post-go-live labeling when the playbook phase name already says so.
  if (/post\s*go[-\s]?live/i.test(name)) return name;
  return name;
}

/** Group tasks by customer, then by phase (clean hierarchy). */
function groupByCustomerThenPhase(tasks: Task[]) {
  const byCustomer = new Map<
    string,
    { label: string; phases: Map<string, { label: string; order: number; tasks: Task[] }> }
  >();

  for (const t of tasks) {
    const ck = customerKey(t);
    if (!byCustomer.has(ck)) {
      byCustomer.set(ck, { label: customerLabel(t), phases: new Map() });
    }
    const cust = byCustomer.get(ck)!;
    const pk = phaseKey(t);
    if (!cust.phases.has(pk)) {
      cust.phases.set(pk, {
        label: phaseLabel(t),
        order: t.phase?.order ?? 999,
        tasks: [],
      });
    }
    cust.phases.get(pk)!.tasks.push(t);
  }

  return [...byCustomer.entries()]
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .map(([id, c]) => ({
      id,
      label: c.label,
      phases: [...c.phases.entries()]
        .sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label))
        .map(([pid, p]) => ({ id: pid, label: p.label, tasks: p.tasks })),
    }));
}

export default async function MyWorkPage() {
  const actor = await requireStaff();
  const [tasks, chase, hours] = await Promise.all([
    myTasks(actor),
    waitingOnCustomer(actor, 30),
    hoursLoggedThisWeek(actor),
  ]);

  const overdue = tasks.filter((t) => isOverdue(t.dueDate));
  const committed = tasks.reduce((n, t) => n + (t.estimateHours ?? 0), 0);
  const groups = groupByCustomerThenPhase(tasks);

  return (
    <>
      <PageHeader
        title="My work"
        subtitle="Everything assigned to you, grouped by customer and phase."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open tasks" value={tasks.length} />
        <Stat
          label="Overdue"
          value={overdue.length}
          tone={overdue.length > 0 ? "red" : undefined}
        />
        <Stat
          label="Committed hours"
          value={Math.round(committed)}
          hint={`vs ${actor.role === "CUSTOMER" ? "—" : "your weekly capacity"}`}
        />
        <Stat label="Logged this week" value={`${hours}h`} />
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {groups.map((customer) => (
            <Card key={customer.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {customer.label}
                    <Badge tone="neutral">
                      {customer.phases.reduce((n, p) => n + p.tasks.length, 0)}
                    </Badge>
                  </span>
                }
              />
              <div className="divide-y divide-border">
                {customer.phases.map((phase) => (
                  <div key={phase.id}>
                    <div className="bg-surface-2 px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
                      {phase.label}
                    </div>
                    <div className="divide-y divide-border">
                      {phase.tasks.map((t) => (
                        <TaskRow key={t.id} task={t} showProject />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {tasks.length === 0 ? (
            <Card>
              <EmptyState
                title="Nothing assigned to you"
                description="Tasks assigned to you across any project show up here."
              />
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader
            title="Chase list"
            subtitle="Open action items sitting with customers"
          />
          {chase.length === 0 ? (
            <EmptyState title="Nothing outstanding" />
          ) : (
            <div className="divide-y divide-border">
              {chase.map((t) => (
                <div key={t.id} className="px-4 py-2.5">
                  <div className="text-[13px] text-ink">{t.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                    <Link
                      href={`/projects/${t.project.id}/messages`}
                      className="font-medium text-ink-2 hover:text-brand"
                    >
                      {t.project.customerAccount?.name ?? t.project.name}
                    </Link>
                    {t.dueDate ? (
                      <>
                        <span>·</span>
                        <span className={isOverdue(t.dueDate) ? "font-medium text-red" : ""}>
                          {dueLabel(t.dueDate)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
