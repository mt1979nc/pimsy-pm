import { and, eq, ne, asc } from "drizzle-orm";
import { db } from "@/db";
import { phases, tasks, users } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess } from "@/lib/authz";
import { Card, CardHeader, EmptyState, Badge, VisibilityBadge } from "@/components/ui";
import { TaskRow } from "@/components/task-row";
import { AddTaskInline, AddPhaseForm } from "./task-forms";
import { fmtShort } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function ProjectTasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaff();
  await assertProjectAccess(actor, id);

  const [projectPhases, allTasks, staff] = await Promise.all([
    db.query.phases.findMany({
      where: eq(phases.projectId, id),
      orderBy: [asc(phases.order)],
    }),
    db.query.tasks.findMany({
      where: eq(tasks.projectId, id),
      orderBy: [asc(tasks.order), asc(tasks.dueDate)],
      with: { assignee: { columns: { id: true, name: true, image: true } } },
    }),
    db.query.users.findMany({
      where: and(eq(users.isActive, true), ne(users.role, "CUSTOMER")),
      columns: { id: true, name: true },
      orderBy: [asc(users.name)],
    }),
  ]);

  const byPhase = new Map<string | null, typeof allTasks>();
  for (const t of allTasks) {
    const key = t.phaseId ?? null;
    if (!byPhase.has(key)) byPhase.set(key, []);
    byPhase.get(key)!.push(t);
  }

  const unphased = byPhase.get(null) ?? [];
  const openCount = allTasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED").length;
  const customerCount = allTasks.filter(
    (t) => t.ownerSide === "CUSTOMER" && t.status !== "DONE" && t.status !== "CANCELLED",
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          <Badge>{openCount} open</Badge>
          <Badge tone="green">{allTasks.filter((t) => t.status === "DONE").length} done</Badge>
          {customerCount > 0 ? (
            <Badge tone="violet">{customerCount} waiting on customer</Badge>
          ) : null}
        </div>
        <AddPhaseForm projectId={id} />
      </div>

      {projectPhases.length === 0 && allTasks.length === 0 ? (
        <Card>
          <EmptyState
            title="No tasks yet"
            description="Add a phase to structure the work, or start adding tasks directly."
          />
          <div className="border-t border-border">
            <AddTaskInline projectId={id} staff={staff} defaultAssigneeId={actor.id} />
          </div>
        </Card>
      ) : null}

      {projectPhases.map((phase) => {
        const phaseTasks = byPhase.get(phase.id) ?? [];
        const done = phaseTasks.filter((t) => t.status === "DONE").length;
        return (
          <Card key={phase.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {phase.name}
                  {phase.visibility === "INTERNAL" ? (
                    <VisibilityBadge visibility="INTERNAL" />
                  ) : null}
                </span>
              }
              subtitle={
                <>
                  {done}/{phaseTasks.length} complete
                  {phase.dueDate ? ` · due ${fmtShort(phase.dueDate)}` : ""}
                </>
              }
            />
            {phaseTasks.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-3">Nothing in this phase yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {phaseTasks.map((t) => (
                  <TaskRow key={t.id} task={{ ...t, projectId: id }} />
                ))}
              </div>
            )}
            <div className="border-t border-border">
              <AddTaskInline
                projectId={id}
                phaseId={phase.id}
                staff={staff}
                defaultAssigneeId={actor.id}
              />
            </div>
          </Card>
        );
      })}

      {unphased.length > 0 || projectPhases.length > 0 ? (
        <Card>
          <CardHeader title="Unphased tasks" subtitle={`${unphased.length} item(s)`} />
          {unphased.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-ink-3">Everything is assigned to a phase.</p>
          ) : (
            <div className="divide-y divide-border">
              {unphased.map((t) => (
                <TaskRow key={t.id} task={{ ...t, projectId: id }} />
              ))}
            </div>
          )}
          <div className="border-t border-border">
            <AddTaskInline projectId={id} staff={staff} defaultAssigneeId={actor.id} />
          </div>
        </Card>
      ) : null}

      <p className="text-[12.5px] leading-relaxed text-ink-3">
        Tasks marked <VisibilityBadge visibility="INTERNAL" className="align-middle" /> stay inside
        your team. Anything marked{" "}
        <VisibilityBadge visibility="SHARED" className="align-middle" /> appears in the customer&apos;s
        portal, and anything owned by the customer always does.
      </p>
    </div>
  );
}
