import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { tasks, taskComments, taskChecklistItems } from "@/db/schema";
import { requireCustomer } from "@/lib/guard";
import { portalProject } from "@/lib/portal";
import { listTaskAttachments } from "@/lib/attachments";
import { Card, CardHeader, Badge, Avatar } from "@/components/ui";
import { TaskComments } from "@/components/task-comments";
import { TaskChecklist } from "@/components/task-checklist";
import { AttachmentList, AddAttachment } from "@/components/attachments";
import { TaskActionButtons } from "@/components/task-action-buttons";
import { hasPlaybookFileResource, isCustomerUploadRequestTitle } from "@/lib/playbook-resources";
import { isDockFileRequestTitle } from "@/db/dock-task-buttons";
import { fmtDate, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { isSpecialistSubtask } from "@/lib/task-visibility";
import { resolveTaskDescription } from "@/lib/task-description";
import { TaskCompleteControl } from "@/components/task-complete-control";
import { CustomerAssigneePicker } from "@/components/customer-assignee-picker";
import { listCustomerProjectTeam, assigneesOf } from "@/lib/task-assignees";

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
      assignees: {
        with: { user: { columns: { id: true, name: true, email: true, image: true, role: true, title: true } } },
      },
      phase: { columns: { id: true, name: true, visibility: true, notApplicable: true } },
    },
  });
  if (!task) notFound();
  if (isSpecialistSubtask(task)) notFound();
  if (task.phase && (task.phase.visibility !== "SHARED" || task.phase.notApplicable)) notFound();

  const [comments, attachments, checklist] = await Promise.all([
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
    db.query.taskChecklistItems.findMany({
      where: and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.visibility, "SHARED")),
      orderBy: [asc(taskChecklistItems.order)],
    }),
  ]);

  const people = assigneesOf(task);
  const mine = people.some((p) => p.id === actor.id) || task.assigneeId === actor.id;
  const yours = task.ownerSide === "CUSTOMER";
  const team = yours ? await listCustomerProjectTeam(id) : [];
  const completedAt = task.status === "DONE" ? task.completedAt : null;
  const overdue = isOverdue(task.dueDate, completedAt);
  const uploadRequest =
    yours && (hasPlaybookFileResource(attachments) || isCustomerUploadRequestTitle(task.title));
  const displayDescription = resolveTaskDescription(task.title, task.description, {
    stripChecklist: checklist.length > 0,
  });
  const hasFileAction =
    attachments.some((a) => a.kind !== "LINK") ||
    isDockFileRequestTitle(task.title) ||
    uploadRequest;

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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {yours ? (
            <TaskCompleteControl
              taskId={task.id}
              title={task.title}
              status={task.status}
              canEdit
            />
          ) : null}
          <TaskActionButtons
            title={task.title}
            assets={attachments}
            taskHref={`/portal/projects/${id}/tasks/${taskId}`}
            projectCode={project.code}
          />
        </div>
        {task.dueDate ? (
          <p className={cn("mt-1.5 text-[13.5px]", overdue && task.status !== "DONE" ? "font-medium text-red" : "text-ink-2")}>
            Due {fmtDate(task.dueDate)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          {hasFileAction ? (
            <Card>
              <CardHeader
                title="Links & files"
                subtitle={
                  isDockFileRequestTitle(task.title)
                    ? "Upload files on this task"
                    : uploadRequest
                      ? "Download, complete the file, then upload it here"
                      : attachments.length > 0
                        ? `${attachments.length} attached`
                        : "Anything you need for this step, and anywhere to send us documents"
                }
              />
              <div id="files">
                <AttachmentList
                  assets={attachments}
                  currentUserId={actor.id}
                  canManageVisibility={false}
                  uploadRequest={uploadRequest}
                  wizardLaunch={{
                    title: task.title,
                    taskHref: `/portal/projects/${id}/tasks/${taskId}`,
                    projectCode: project.code,
                  }}
                />
                <AddAttachment
                  taskId={task.id}
                  canChooseVisibility={false}
                  defaultVisibility="SHARED"
                  taskIsInternal={false}
                  uploadRequest={uploadRequest}
                />
              </div>
            </Card>
          ) : null}

          {displayDescription ? (
            <Card>
              <CardHeader title="What this involves" />
              <p className="whitespace-pre-wrap px-5 py-4 text-[13.5px] leading-relaxed text-ink">
                {displayDescription}
              </p>
            </Card>
          ) : null}

          {checklist.length > 0 ? (
            <Card>
              <CardHeader
                title="Checklist"
                subtitle="What this session includes — your specialist checks these off as you go"
              />
              <TaskChecklist
                taskId={task.id}
                items={checklist}
                canEdit={false}
                canToggle={false}
                taskIsInternal={false}
              />
            </Card>
          ) : null}

          {hasFileAction ? null : (
            <Card>
              <CardHeader
                title="Links & files"
                subtitle={
                  attachments.length > 0
                    ? `${attachments.length} attached`
                    : "Anything you need for this step, and anywhere to send us documents"
                }
              />
              <div id="files">
                <AttachmentList
                  assets={attachments}
                  currentUserId={actor.id}
                  canManageVisibility={false}
                  uploadRequest={uploadRequest}
                  wizardLaunch={{
                    title: task.title,
                    taskHref: `/portal/projects/${id}/tasks/${taskId}`,
                    projectCode: project.code,
                  }}
                />
                <AddAttachment
                  taskId={task.id}
                  canChooseVisibility={false}
                  defaultVisibility="SHARED"
                  taskIsInternal={false}
                  uploadRequest={uploadRequest}
                />
              </div>
            </Card>
          )}

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
            {yours ? (
              <div className="px-4 py-3">
                <CustomerAssigneePicker
                  taskId={task.id}
                  currentUserId={actor.id}
                  assignees={people.map((p) => ({
                    id: p.id,
                    name: p.name,
                    email: p.email ?? "",
                    image: p.image,
                    role: p.role ?? "CUSTOMER",
                    title: p.title,
                  }))}
                  team={team.map((p) => ({
                    id: p.id,
                    name: p.name,
                    email: p.email ?? "",
                    image: p.image,
                    role: p.role ?? "CUSTOMER",
                    title: p.title,
                  }))}
                />
              </div>
            ) : people.length > 0 ? (
              <div className="space-y-1 px-4 py-3">
                {people.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <Avatar name={p.name} image={p.image} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-ink">
                        {p.name}
                        {p.id === actor.id ? (
                          <span className="ml-1 font-normal text-ink-3">(you)</span>
                        ) : null}
                      </div>
                      <div className="truncate text-[12px] text-ink-3">
                        {p.role === "CUSTOMER" ? (p.title ?? "Your team") : "Your implementation specialist"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-3 text-[13px] text-ink-3">
                Your implementation team will pick this up.
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
