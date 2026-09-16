import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, ne, asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { libraryAssets, phases, tasks, taskComments, taskChecklistItems, users, projectScopes } from "@/db/schema";
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
  ReviewRequiredBadge,
} from "@/components/ui";
import { TaskComments } from "@/components/task-comments";
import { AttachmentList, AddAttachment } from "@/components/attachments";
import { TaskActionButtons } from "@/components/task-action-buttons";
import { hasPlaybookFileResource, isCustomerUploadRequestTitle } from "@/lib/playbook-resources";
import { isDockFileRequestTitle } from "@/db/dock-task-buttons";
import { TaskChecklist } from "@/components/task-checklist";
import { TaskCompleteControl } from "@/components/task-complete-control";
import { AssigneePicker } from "@/components/assignee-picker";
import { PimsyLoginConfirmationCard } from "@/components/pimsy-login-confirmation";
import { TaskDetailControls } from "./task-controls";
import { AddTaskInline } from "../task-forms";
import { DeleteTaskControl } from "@/components/task-row";
import { MoveTaskControl } from "@/components/move-task-dialog";
import { fmtDate, dueLabel, isOverdue, fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { resolveTaskDescription } from "@/lib/task-description";
import { buildPimsyLoginConfirmation, isConfirmUsersLoggedInTitle } from "@/lib/pimsy-audit-feed";
import { showReviewRequiredBadge } from "@/lib/discovery-config-review";
import { listConnectedPeers } from "@/lib/connected-task-sync";
import { resolveProjectBookingUrls } from "@/lib/booking-urls";

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
      assignees: {
        with: { user: { columns: { id: true, name: true, email: true, image: true, role: true, title: true } } },
      },
      phase: { columns: { id: true, name: true } },
      project: {
        columns: {
          id: true,
          name: true,
          code: true,
          customerAccountId: true,
          crmAcronym: true,
          crmKey: true,
          prismClientId: true,
          bookingUrls: true,
          zoomBookingUrl: true,
        },
        with: {
          customerAccount: { columns: { id: true, name: true } },
          lead: { columns: { zoomBookingUrl: true } },
        },
      },
    },
  });
  if (!task) notFound();

  const confirmLogins = isConfirmUsersLoggedInTitle(task.title);

  const [
    comments,
    attachments,
    staff,
    contacts,
    checklist,
    subtasks,
    library,
    projectPhases,
    projectTasks,
    scope,
    connectedPeers,
  ] = await Promise.all([
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
          columns: { id: true, name: true, email: true, image: true, role: true, title: true, lastSeenAt: true },
          orderBy: [asc(users.name)],
        })
      : Promise.resolve([]),
    db.query.taskChecklistItems.findMany({
      where: eq(taskChecklistItems.taskId, taskId),
      orderBy: [asc(taskChecklistItems.order)],
    }),
    db.query.tasks.findMany({
      where: eq(tasks.parentTaskId, taskId),
      orderBy: [asc(tasks.order)],
      columns: {
        id: true,
        title: true,
        status: true,
        visibility: true,
        ownerSide: true,
        dueDate: true,
        completedAt: true,
        notApplicable: true,
        priority: true,
        parentTaskId: true,
        phaseId: true,
      },
    }),
    db.query.libraryAssets.findMany({
      orderBy: [asc(libraryAssets.name)],
      columns: { id: true, name: true, kind: true, isPlaceholder: true },
    }),
    db.query.phases.findMany({
      where: eq(phases.projectId, id),
      orderBy: [asc(phases.order)],
      columns: { id: true, name: true },
    }),
    db.query.tasks.findMany({
      where: eq(tasks.projectId, id),
      orderBy: [asc(tasks.order)],
      columns: { id: true, title: true, phaseId: true, parentTaskId: true },
    }),
    confirmLogins
      ? db.query.projectScopes.findFirst({
          where: eq(projectScopes.projectId, id),
          columns: { userCount: true },
        })
      : Promise.resolve(null),
    listConnectedPeers({
      projectId: id,
      taskId,
      connectKey: task.connectKey,
      overlapKey: task.overlapKey,
      title: task.title,
    }),
  ]);
  const attachedLibraryIds = attachments
    .map((a) => a.libraryAssetId)
    .filter((id): id is string => Boolean(id));

  // A stale completedAt from an earlier "done" must not read as complete once
  // the task is reopened — the status is the source of truth.
  const completedAt = task.status === "DONE" ? task.completedAt : null;
  const overdue = isOverdue(task.dueDate, completedAt);
  const uploadRequest =
    task.ownerSide === "CUSTOMER" &&
    (hasPlaybookFileResource(attachments) || isCustomerUploadRequestTitle(task.title));
  const displayDescription = resolveTaskDescription(task.title, task.description, {
    stripChecklist: checklist.length > 0,
  });
  const hasFileAction = Boolean(
    attachments.some((a) => a.kind !== "LINK") ||
      isDockFileRequestTitle(task.title) ||
      uploadRequest,
  );

  const loginConfirmation = confirmLogins
    ? await buildPimsyLoginConfirmation({
        site: {
          code: task.project.code,
          crmAcronym: task.project.crmAcronym,
          crmKey: task.project.crmKey,
          prismClientId: task.project.prismClientId,
        },
        contacts,
        expectedUserCount: scope?.userCount ?? null,
      })
    : null;

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
          {showReviewRequiredBadge(task) ? <ReviewRequiredBadge /> : null}
          {task.ownerSide === "CUSTOMER" ? <Badge tone="violet">Customer action</Badge> : null}
          {task.phase ? <Badge>{task.phase.name}</Badge> : null}
          {connectedPeers.length > 0 ? <Badge tone="green">Connected</Badge> : null}
        </div>
        <h1 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">
          {task.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <TaskCompleteControl
            taskId={task.id}
            title={task.title}
            status={task.status}
            canEdit={!task.notApplicable}
          />
          <TaskActionButtons
            title={task.title}
            assets={attachments}
            taskHref={`/projects/${id}/tasks/${taskId}`}
            projectCode={task.project.code}
            bookingUrls={resolveProjectBookingUrls(task.project)}
          />
        </div>
        {task.dueDate ? (
          <p className={cn("mt-1.5 text-[13.5px]", overdue ? "font-medium text-red" : "text-ink-2")}>
            {dueLabel(task.dueDate, completedAt)} · {fmtDate(task.dueDate)}
          </p>
        ) : (
          <p className="mt-1.5 text-[13.5px] text-ink-3">No due date</p>
        )}
        {connectedPeers.length > 0 ? (
          <p className="mt-2 text-[13px] text-ink-2">
            Connected — complete here and it reflects on{" "}
            {connectedPeers.map((peer, i) => (
              <span key={peer.id}>
                {i > 0 ? ", " : null}
                <Link
                  href={`/projects/${id}/tasks/${peer.id}`}
                  className="font-medium text-brand hover:underline"
                >
                  {peer.phaseName ? `${peer.phaseName}: ${peer.title}` : peer.title}
                </Link>
              </span>
            ))}
            .
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          {loginConfirmation ? (
            <PimsyLoginConfirmationCard projectId={id} confirmation={loginConfirmation} />
          ) : null}

          {hasFileAction ? (
            <Card>
              <CardHeader
                title="Links & files"
                subtitle={
                  isDockFileRequestTitle(task.title)
                    ? "Upload files on this task"
                    : uploadRequest
                      ? "Download, complete the file, and upload it here — same pattern as Dock"
                      : attachments.length > 0
                        ? `${attachments.length} attached`
                        : "Anything the work depends on"
                }
              />
              <div id="files">
                <AttachmentList
                  assets={attachments}
                  currentUserId={actor.id}
                  canManageVisibility
                  uploadRequest={uploadRequest}
                  wizardLaunch={{
                    title: task.title,
                    taskHref: `/projects/${id}/tasks/${taskId}`,
                    projectCode: task.project.code,
                  }}
                />
                <AddAttachment
                  taskId={task.id}
                  canChooseVisibility
                  defaultVisibility={task.visibility === "INTERNAL" ? "INTERNAL" : "SHARED"}
                  taskIsInternal={task.visibility === "INTERNAL"}
                  uploadRequest={uploadRequest}
                  library={library}
                  attachedLibraryIds={attachedLibraryIds}
                />
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Details" />
            <TaskDetailControls
              task={{
                id: task.id,
                title: task.title,
                description: displayDescription,
                status: task.status,
                priority: task.priority,
                visibility: task.visibility,
                ownerSide: task.ownerSide,
                dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "",
                estimateHours: task.estimateHours,
                notApplicable: task.notApplicable,
              }}
            />
          </Card>

          {checklist.length > 0 ? (
            <Card>
              <CardHeader
                title="Checklist"
                subtitle="Check items off here — add or remove items on Templates."
              />
              <TaskChecklist
                taskId={task.id}
                items={checklist}
                canEdit={false}
                canToggle
                taskIsInternal={task.visibility === "INTERNAL"}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Sub-tasks"
              subtitle={
                subtasks.length > 0
                  ? `${subtasks.filter((s) => s.status === "DONE").length}/${subtasks.length} done · specialist work stays off the customer view`
                  : "Specialist checklist under this parent — the customer sees this task’s status only"
              }
            />
            {subtasks.length > 0 ? (
              <ul className="divide-y divide-border">
                {subtasks.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 px-5 py-2.5">
                    <TaskCompleteControl
                      taskId={s.id}
                      title={s.title}
                      status={s.status}
                      canEdit={!s.notApplicable}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/projects/${id}/tasks/${s.id}`}
                        className="text-[13.5px] text-ink hover:text-brand hover:underline"
                      >
                        {s.title}
                      </Link>
                      <div className="text-[12px] text-ink-3">
                        {s.visibility === "INTERNAL" ? "Staff only" : "Shared"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-3 text-[13px] text-ink-3">No sub-tasks yet.</p>
            )}
            <div className="border-t border-border px-2 py-1">
              <AddTaskInline
                projectId={id}
                phaseId={task.phaseId ?? undefined}
                parentTaskId={task.id}
                staff={staff}
                defaultAssigneeId={actor.id}
              />
            </div>
          </Card>

          {hasFileAction ? null : (
            <Card>
              <CardHeader
                title="Links & files"
                subtitle={
                  attachments.length > 0 ? `${attachments.length} attached` : "Anything the work depends on"
                }
              />
              <div id="files">
                <AttachmentList
                  assets={attachments}
                  currentUserId={actor.id}
                  canManageVisibility
                  uploadRequest={uploadRequest}
                  wizardLaunch={{
                    title: task.title,
                    taskHref: `/projects/${id}/tasks/${taskId}`,
                    projectCode: task.project.code,
                  }}
                />
                <AddAttachment
                  taskId={task.id}
                  canChooseVisibility
                  defaultVisibility={task.visibility === "INTERNAL" ? "INTERNAL" : "SHARED"}
                  taskIsInternal={task.visibility === "INTERNAL"}
                  uploadRequest={uploadRequest}
                  library={library}
                  attachedLibraryIds={attachedLibraryIds}
                />
              </div>
            </Card>
          )}

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
                assignees={(task.assignees ?? [])
                  .map((a) => a.user)
                  .filter((u): u is NonNullable<typeof u> => Boolean(u))}
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
            <div className="border-t border-border px-4 py-3 space-y-3">
              <MoveTaskControl
                taskId={task.id}
                title={task.title}
                currentPhaseId={task.phaseId}
                currentParentTaskId={task.parentTaskId}
                phases={projectPhases}
                tasks={projectTasks}
              />
              <DeleteTaskControl taskId={task.id} projectId={id} title={task.title} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
