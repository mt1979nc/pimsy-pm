import { requireStaff } from "@/lib/guard";
import { myTasks, waitingOnCustomer, hoursLoggedThisWeek } from "@/lib/queries";
import { PageHeader, Card, CardHeader, EmptyState, Stat, Badge } from "@/components/ui";
import { TaskRow } from "@/components/task-row";
import { isOverdue, daysUntil, dueLabel } from "@/lib/dates";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "My work" };

export default async function MyWorkPage() {
  const actor = await requireStaff();
  const [tasks, chase, hours] = await Promise.all([
    myTasks(actor),
    waitingOnCustomer(actor, 30),
    hoursLoggedThisWeek(actor),
  ]);

  const overdue = tasks.filter((t) => isOverdue(t.dueDate));
  const today = tasks.filter((t) => daysUntil(t.dueDate) === 0);
  const thisWeek = tasks.filter((t) => {
    const d = daysUntil(t.dueDate);
    return d !== null && d > 0 && d <= 7;
  });
  const later = tasks.filter((t) => {
    const d = daysUntil(t.dueDate);
    return d === null || d > 7;
  });

  const committed = tasks.reduce((n, t) => n + (t.estimateHours ?? 0), 0);

  const groups: [string, typeof tasks, string | undefined][] = [
    ["Overdue", overdue, "red"],
    ["Due today", today, undefined],
    ["This week", thisWeek, undefined],
    ["Later / no date", later, undefined],
  ];

  return (
    <>
      <PageHeader title="My work" subtitle="Everything assigned to you, ordered by urgency." />

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
          {groups.map(([label, items, tone]) =>
            items.length === 0 ? null : (
              <Card key={label}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {label}
                      <Badge tone={tone === "red" ? "red" : "neutral"}>{items.length}</Badge>
                    </span>
                  }
                />
                <div className="divide-y divide-border">
                  {items.map((t) => (
                    <TaskRow key={t.id} task={t} showProject />
                  ))}
                </div>
              </Card>
            ),
          )}

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
