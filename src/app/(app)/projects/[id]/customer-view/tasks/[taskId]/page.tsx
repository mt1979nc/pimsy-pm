import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, ForbiddenError, NotFoundError } from "@/lib/authz";
import { previewPortalTask } from "@/lib/portal-preview";
import { Card, CardHeader, Badge, Avatar } from "@/components/ui";
import { resolveTaskDescription } from "@/lib/task-description";
import { fmtDate } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer view · Task" };

export default async function CustomerViewTaskPage({
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

  const task = await previewPortalTask(id, taskId);
  if (!task) notFound();

  const description = resolveTaskDescription(task.title, task.description);

  return (
    <Card>
      <CardHeader
        title={task.title}
        subtitle="Read-only customer presentation — complete work from the staff task."
        action={
          <Link
            href={`/projects/${id}/tasks/${task.id}`}
            className="text-[12.5px] font-medium text-brand hover:underline"
          >
            Open staff task
          </Link>
        }
      />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={task.status === "DONE" ? "green" : "brand"}>
            {task.status === "DONE" ? "Complete" : task.status === "IN_PROGRESS" ? "In progress" : "Not started"}
          </Badge>
          {task.ownerSide === "CUSTOMER" ? <Badge tone="violet">Customer action</Badge> : null}
          {task.phase ? (
            <Link
              href={`/projects/${id}/customer-view/phases/${task.phase.id}`}
              className="text-[12.5px] text-brand hover:underline"
            >
              {task.phase.name}
            </Link>
          ) : null}
        </div>
        {description ? (
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4 text-[13px] text-ink-2">
          {task.assignee?.name ? (
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={task.assignee.name} image={task.assignee.image} size={22} />
              {task.assignee.name}
            </span>
          ) : (
            <span>Unassigned</span>
          )}
          {task.dueDate ? <span>Due {fmtDate(task.dueDate)}</span> : null}
        </div>
      </div>
    </Card>
  );
}
