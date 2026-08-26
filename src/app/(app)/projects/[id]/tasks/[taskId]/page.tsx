import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, ne, asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { tasks, taskComments, users, projects } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, NotFoundError, ForbiddenError } from "@/lib/authz";
import { listTaskAttachments } from "@/lib/attachments";
import {
  Card,
  CardHeader,
  Badge,
  VisibilityBadge,
  TaskStatusBadge,
  PriorityBadge,
  Avatar,
} from "@/components/ui";
import { TaskComments } from "@/components/task-comments";
import { AttachmentList, AddAttachment } from "@/components/attachments";
import { AssigneePicker } from "@/components/assignee-picker";
import { TaskDetailControls } from "./task-controls";
import { fmtDate, dueLabel, isOverdue, fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  const actor = await requireStaff();

  try {
    await assertProjectAccess(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  }

  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.projectId, id)),
    with: {
      assignee: { columns: { id: true, name: true, email: true, image: true, role: true, title: true } },
      phase: { columns: { id: true, name: true } },
      project: {
        columns: { id: true, name: true, code: true, customerAccountId: true },
        with: { customerAccount: { columns: { id: true, name: true } } },
      },
    },
  });
  if (!task) notFound();

  const [comments, attachments, staff, contacts] = await Promise.all([
    db.query.taskComments.findMany({
      where: and(eq(taskComments.taskId, taskId), isNull(taskComments.deletedAt)),
      orderBy: [asc(taskComments.createdAt)],
      with: { author: { columns: { id: true, name: true, image: true, role: true } } },
    }),
    listTaskAttachments(actor, taskId),
    db.query.users.findMany({
      where: and(eq(users.isActive, true), ne(users.role, "CUSTOMER")),
      columns: { id: true, name: true, email: true, image: true, role: true, title: true },
      orderBy: [asc(users.name)],
    }),
    task.project.customerAccountId
      ? db.query.users.findMany({
          where: and(
            eq(users.isActive, true),
            eq(users.role, "CUSTOMER"),
            eq(users.customerAccountId, task.project.customerAccountId),
          ),
          columns: { id: true, name: true, email: true, image: true, role: true, title: true },
          orderBy: [asc(users.name)],
        })
      : Promise.resolve([]),
  ]);

  // A stale completedAt from an earlier "done" must not read as complete once
  // the task is reopened — the status is the source of truth.
  const completedAt = task.status === "DONE" ? task.completedAt : null;
  const overdue = isOverdue(task.dueDate, completedAt);

  return (
    <div className="mx-auto max-w-[900px]">
      <Link
        href={`/projects/${id}/tasks`}
        className="mb-3 inline-block text-[12.5px] text-ink-3 hover:text-brand"
      >
        ← All tasks
      </Link>

      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          <VisibilityBadge visibility={task.visibility} />
          {task.ownerSide === "CUSTOMER" ? <Badge tone="violet">Customer action</Badge> : null}
          {task.phase ? <Badge>{task.phase.name}</Badge> : null}
        </div>
        <h1 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">
          {task.title}
        </h1>
        {task.dueDate ? (
          <p className={cn("mt-1.5 text-[13.5px]", overdue ? "font-medium text-red" : "text-ink-2")}>
            {dueLabel(task.dueDate, completedAt)} · {fmtDate(task.dueDate)}
          </p>
        ) : (
          <p className="mt-1.5 text-[13.5px] text-ink-3">No due date</p>
        )}
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <TaskDetailControls
              task={{
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                visibility: task.visibility,
                ownerSide: task.ownerSide,
                dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "",
                estimateHours: task.estimateHours,
              }}
            />
          </Card>

          <Card>
            <CardHeader
              title="Links & files"
              subtitle={
                attachments.length > 0
                  ? `${attachments.length} attached`
                  : "Anything the work depends on"
              }
            />
            <AttachmentList
              assets={attachments}
              currentUserId={actor.id}
              canManageVisibility
            />
            <AddAttachment
              taskId={task.id}
              canChooseVisibility
              defaultVisibility={task.visibility === "INTERNAL" ? "INTERNAL" : "SHARED"}
              taskIsInternal={task.visibility === "INTERNAL"}
            />
          </Card>

          <Card>
            <CardHeader
              title="Comments"
              subtitle={
                task.visibility === "INTERNAL"
                  ? "This task is internal, so its comments are too"
                  : "Shared comments are visible to the customer"
              }
            />
            <TaskComments
              taskId={task.id}
              comments={comments}
              currentUserId={actor.id}
              canChooseVisibility
              taskIsInternal={task.visibility === "INTERNAL"}
            />
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Assigned to" />
            <div className="p-4">
              <AssigneePicker
                taskId={task.id}
                current={task.assignee ?? null}
                staff={staff}
                contacts={contacts}
                customerName={task.project.customerAccount?.name}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Context" />
            <dl className="divide-y divide-border text-[13px]">
              <div className="flex justify-between gap-3 px-4 py-2">
                <dt className="text-ink-3">Project</dt>
                <dd className="truncate text-right">
                  <Link href={`/projects/${id}`} className="text-brand hover:underline">
                    {task.project.name}
                  </Link>
                </dd>
              </div>
              {task.project.customerAccount ? (
                <div className="flex justify-between gap-3 px-4 py-2">
                  <dt className="text-ink-3">Customer</dt>
                  <dd className="truncate text-right">
                    <Link
                      href={`/customers/${task.project.customerAccount.id}`}
                      className="text-brand hover:underline"
                    >
                      {task.project.customerAccount.name}
                    </Link>
                  </dd>
                </div>
              ) : null}
              {task.phase ? (
                <div className="flex justify-between gap-3 px-4 py-2">
                  <dt className="text-ink-3">Phase</dt>
                  <dd className="text-right text-ink">{task.phase.name}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 px-4 py-2">
                <dt className="text-ink-3">Owned by</dt>
                <dd className="text-right text-ink">
                  {task.ownerSide === "CUSTOMER" ? "The customer" : "Your team"}
                </dd>
              </div>
              {task.estimateHours ? (
                <div className="flex justify-between gap-3 px-4 py-2">
                  <dt className="text-ink-3">Estimate</dt>
                  <dd className="text-right text-ink">{task.estimateHours}h</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 px-4 py-2">
                <dt className="text-ink-3">Created</dt>
                <dd className="text-right text-ink">{fmtRelative(task.createdAt)}</dd>
              </div>
              {completedAt ? (
                <div className="flex justify-between gap-3 px-4 py-2">
                  <dt className="text-ink-3">Completed</dt>
                  <dd className="text-right text-green">{fmtDate(completedAt)}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {task.assignee ? (
            <Card>
              <CardHeader title="Owner" />
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar name={task.assignee.name} image={task.assignee.image} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink">
                    {task.assignee.name}
                  </div>
                  <div className="truncate text-[12px] text-ink-3">{task.assignee.email}</div>
                </div>
                {task.assignee.role === "CUSTOMER" ? <Badge tone="violet">Customer</Badge> : null}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
