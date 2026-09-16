import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, ForbiddenError, NotFoundError } from "@/lib/authz";
import {
  previewPortalProject,
  previewPortalTask,
  previewPortalTaskAttachments,
  previewPortalTaskComments,
} from "@/lib/portal-preview";
import { Card, CardHeader, Badge, AvatarStack } from "@/components/ui";
import { TaskComments } from "@/components/task-comments";
import { AttachmentList } from "@/components/attachments";
import { TaskActionButtons } from "@/components/task-action-buttons";
import { resolveTaskDescription } from "@/lib/task-description";
import { fmtDate } from "@/lib/dates";
import { hasPlaybookFileResource, isCustomerUploadRequestTitle } from "@/lib/playbook-resources";
import { isDockFileRequestTitle } from "@/db/dock-task-buttons";
import { commentsForCustomerSurface } from "@/lib/comment-visibility";
import { assigneesOf } from "@/lib/task-assignees";
import { resolveProjectBookingUrls } from "@/lib/booking-urls";

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

  const [rawComments, attachments, project] = await Promise.all([
    previewPortalTaskComments(task.id),
    previewPortalTaskAttachments(task.id),
    previewPortalProject(id),
  ]);
  const comments = commentsForCustomerSurface(rawComments);
  const description = resolveTaskDescription(task.title, task.description);
  const uploadRequest =
    task.ownerSide === "CUSTOMER" &&
    (hasPlaybookFileResource(attachments) || isCustomerUploadRequestTitle(task.title));
  const hasFileAction = Boolean(
    attachments.some((a) => a.kind !== "LINK") ||
      isDockFileRequestTitle(task.title) ||
      uploadRequest,
  );

  const people = assigneesOf(task);

  return (
    <div className="space-y-5">
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
              {task.status === "DONE"
                ? "Complete"
                : task.status === "IN_PROGRESS"
                  ? "In progress"
                  : "Not started"}
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
          <TaskActionButtons
            title={task.title}
            assets={attachments}
            taskHref={`/projects/${id}/customer-view/tasks/${task.id}`}
            bookingUrls={resolveProjectBookingUrls(project ?? {})}
            readOnly
          />
          {description ? (
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{description}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-4 text-[13px] text-ink-2">
            {people.length > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <AvatarStack people={people} size={22} />
                {people
                  .map((p) => p.name)
                  .filter(Boolean)
                  .join(", ")}
              </span>
            ) : (
              <span>Unassigned</span>
            )}
            {task.dueDate ? <span>Due {fmtDate(task.dueDate)}</span> : null}
          </div>
        </div>
      </Card>

      {hasFileAction || attachments.length > 0 ? (
        <Card>
          <CardHeader
            title="Links & files"
            subtitle={
              attachments.length > 0
                ? `${attachments.length} shared with the customer`
                : "Same files the customer can open on this task"
            }
          />
          <AttachmentList
            assets={attachments}
            currentUserId={actor.id}
            canManageVisibility={false}
            canDelete={false}
            uploadRequest={uploadRequest}
            staffPreview
            wizardLaunch={{
              title: task.title,
              taskHref: `/projects/${id}/customer-view/tasks/${task.id}`,
            }}
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Comments"
          subtitle="Shared comments the customer can read — internal notes stay on the staff task"
        />
        <TaskComments
          taskId={task.id}
          comments={comments}
          currentUserId={actor.id}
          canChooseVisibility={false}
          taskIsInternal={false}
          readOnly
        />
      </Card>
    </div>
  );
}
