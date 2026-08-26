import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { tasks, taskComments } from "@/db/schema";
import { requireCustomer } from "@/lib/guard";
import { portalProject } from "@/lib/portal";
import { listTaskAttachments } from "@/lib/attachments";
import { Card, CardHeader, Badge, Avatar } from "@/components/ui";
import { TaskComments } from "@/components/task-comments";
import { AttachmentList, AddAttachment } from "@/components/attachments";
import { PortalTaskRow } from "../../../../portal-task-row";
import { fmtDate, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function PortalTaskPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  const actor = await requireCustomer();

  const project = await portalProject(actor, id);
  if (!project) notFound();

  // SHARED only. An internal task must be indistinguishable from one that
  // doesn't exist.
  const task = await db.query.tasks.findFirst({
    where: and(
      eq(tasks.id, taskId),
      eq(tasks.projectId, id),
      eq(tasks.visibility, "SHARED"),
    ),
    with: {
      assignee: { columns: { id: true, name: true, email: true, image: true, role: true, title: true } },
      phase: { columns: { id: true, name: true } },
    },
  });
  if (!task) notFound();

  const [comments, attachments] = await Promise.all([
    db.query.taskComments.findMany({
      where: and(
        eq(taskComments.taskId, taskId),
        eq(taskComments.visibility, "SHARED"),
        isNull(taskComments.deletedAt),
      ),
      orderBy: [asc(taskComments.createdAt)],
      with: { author: { columns: { id: true, name: true, image: true, role: true } } },
    }),
    listTaskAttachments(actor, taskId),
  ]);

  const mine = task.assigneeId === actor.id;
  const yours = task.ownerSide === "CUSTOMER";
  const completedAt = task.status === "DONE" ? task.completedAt : null;
  const overdue = isOverdue(task.dueDate, completedAt);

  return (
    <>
      <Link
        href={task.phase ? `/portal/projects/${id}/phases/${task.phase.id}` : `/portal/projects/${id}`}
        className="mb-3 inline-block text-[12.5px] text-ink-3 hover:text-brand"
      >
        ← {task.phase ? task.phase.name : project.name}
      </Link>

      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {yours ? (
            <Badge tone="violet">{mine ? "Assigned to you" : "Your team's action"}</Badge>
          ) : (
            <Badge tone="brand">Handled by your implementation team</Badge>
          )}
          {task.phase ? <Badge>{task.phase.name}</Badge> : null}
          {task.status === "DONE" ? <Badge tone="green">Complete</Badge> : null}
        </div>
        <h1 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">
          {task.title}
        </h1>
        {task.dueDate ? (
          <p className={cn("mt-1.5 text-[13.5px]", overdue && task.status !== "DONE" ? "font-medium text-red" : "text-ink-2")}>
            Due {fmtDate(task.dueDate)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          {yours ? (
            <Card>
              <CardHeader
                title="Mark it done"
                subtitle="Checking this off updates your project progress straight away"
              />
              <PortalTaskRow
                task={{
                  id: task.id,
                  title: task.title,
                  description: null,
                  status: task.status,
                  dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
                }}
              />
            </Card>
          ) : null}

          {task.description ? (
            <Card>
              <CardHeader title="What this involves" />
              <p className="whitespace-pre-wrap px-5 py-4 text-[13.5px] leading-relaxed text-ink">
                {task.description}
              </p>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Links & files"
              subtitle={
                attachments.length > 0
                  ? `${attachments.length} attached`
                  : "Anything you need for this step, and anywhere to send us documents"
              }
            />
            <AttachmentList
              assets={attachments}
              currentUserId={actor.id}
              canManageVisibility={false}
            />
            <AddAttachment
              taskId={task.id}
              canChooseVisibility={false}
              defaultVisibility="SHARED"
              taskIsInternal={false}
            />
          </Card>

          <Card>
            <CardHeader
              title="Comments"
              subtitle="Questions here reach your implementation team directly"
            />
            <TaskComments
              taskId={task.id}
              comments={comments}
              currentUserId={actor.id}
              canChooseVisibility={false}
              taskIsInternal={false}
            />
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Who's doing this" />
            {task.assignee ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar name={task.assignee.name} image={task.assignee.image} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink">
                    {task.assignee.name}
                    {mine ? <span className="ml-1 font-normal text-ink-3">(you)</span> : null}
                  </div>
                  <div className="truncate text-[12px] text-ink-3">
                    {task.assignee.role === "CUSTOMER"
                      ? (task.assignee.title ?? "Your team")
                      : "Your implementation specialist"}
                  </div>
                </div>
              </div>
            ) : (
              <p className="px-4 py-3 text-[13px] text-ink-3">
                {yours
                  ? "Nobody at your practice is named on this yet."
                  : "Your implementation team will pick this up."}
              </p>
            )}
          </Card>

          {project.lead ? (
            <Card>
              <CardHeader title="Need help?" />
              <div className="px-4 py-3">
                <p className="text-[13px] leading-relaxed text-ink-2">
                  Stuck on this one? Leave a comment, or message{" "}
                  {project.lead.name?.split(" ")[0] ?? "your specialist"} directly.
                </p>
                <Link
                  href={`/portal/projects/${id}/messages`}
                  className="mt-2 inline-block text-[12.5px] font-medium text-brand hover:underline"
                >
                  Open messages →
                </Link>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
