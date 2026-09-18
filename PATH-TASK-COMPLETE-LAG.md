# PATH task-complete lag

Alexander reports a noticeable delay finishing tasks on live
https://pimsy-app.azurewebsites.net. This is a **PATH** (Plan · Assign · Track ·
Handoff) issue on the staff/portal task list — not Prism.

**Version that lands the fix:** 1.17.3. **Migrate: no.**

## Root cause (not a rewrite)

Completing a task is a **server-wait**, not an optimistic click. The checkbox
calls `setTaskStatus` inside `useTransition` and stays pending (row greys,
control disabled) until the server action **and** the current route’s RSC
refresh both finish.

Hypothesis was mostly right:

| Claim | Verdict |
|---|---|
| Completing one task triggers connected-peer sync | **Yes**, when the row has a `connect_key` / `overlap_key` / title key. Cheap skip when there is no key. N/A expansion is **not** on this path. |
| Completing one task triggers a full route revalidate | **Yes.** `revalidatePath` of the project + task list, plus `force-dynamic` layouts, refetches the **whole staff chrome** (including the Inbox unread badge) and the **entire playbook task list**. |
| Multi-second feel on small App Service + remote Postgres | **Yes.** Live is B1 App Service + burstable B1ms Postgres. The click paid sequential DB round-trips, a fat layout query, a fat task-list query, and (when anyone else should be emailed) a blocking Resend HTTP call. |

N/A expansion (`expandIdsWithConnectedPeers`) runs on **Mark N/A**, not on
Mark done. Completing a connected copy only copies `status` + `completedAt`
onto peers.

## 1. Client UI: wait on the server

Staff list (`src/components/task-row.tsx`), task-detail Mark done
(`src/components/task-complete-control.tsx`), and portal rows
(`src/app/portal/portal-task-row.tsx`) all do:

```ts
startTransition(async () => {
  await setTaskStatus(task.id, done ? "TODO" : "DONE");
});
```

There was **no optimistic status**. Pending applied `opacity-60` and `disabled`
until the action returned. That is the delay Alexander feels.

## 2. Server action: work on the click path

`setTaskStatus` in `src/actions/tasks.ts` (before 1.17.3), in order:

1. Auth + `loadTaskForActor` + `assertProjectWrite` (session + task + project, often membership).
2. `UPDATE task`.
3. **`syncConnectedTaskStatus`** — `SELECT` peers by `connect_key` OR `overlap_key` on the project, then one `UPDATE` if any. Indexed on `(project_id, connect_key)` (`task_project_connect_idx`). No index on `overlap_key` (optional later; not the seconds).
4. **`refreshProjectCounters`** — **six sequential `COUNT(*)` queries** + one `UPDATE` (`src/lib/rollup.ts`). Every task mutation. On remote Postgres this is six RTTs for numbers already denormalized onto `project`.
5. **`syncMilestonesFromTaskCompletion`** — load all milestones, phases, and **every task** on the project (columns only), then maybe patch milestones.
6. Audit insert.
7. On `DONE` only: expose-phase (title parse; usually no query), support-handoff (title parse; usually no query), then **`notify(..., email: true)`**.
8. **`applyTrainingStatusSideEffects`** loaded **every task on the project** even for a random Discovery row, then returned.
9. **Ten `revalidatePath`s** including settings, customer-view, recordings, `/portal`, `/my-work`.

`notify` (`src/lib/notify.ts`) **awaits Teams first**, then writes in-app rows,
then **`Promise.allSettled` of Resend** for every recipient whose prefs want
mail. Staff complete of someone else’s (or the lead’s) task blocks the checkbox
on an outbound HTTP call. Customer complete also awaits Teams.

App Service defaults in `azure/main.parameters.json`: **B1** plan, Postgres
**Standard_B1ms**. Each sequential query is a network hop; burstable Postgres
adds jitter. Fifteen-plus round-trips plus Resend plus a full RSC refresh is
exactly “a couple of seconds” on live.

## 3. The refresh is the other half of the lag

Task list (`src/app/(app)/projects/[id]/tasks/page.tsx`) is `force-dynamic` and
loads **all tasks**, **all file assets**, **all checklist items**, **all
assignees**, and every staff user — then walks connected keys in memory for the
Connected badge.

Worse: completing a task revalidates `/projects/:id/...`, which re-renders:

- **`(app)/layout.tsx`** — `unreadThreadCount(actor)` used to call
  `listInboxThreads(actor, 500)`: every reachable thread with project,
  customer account, and **all participants**, just to count the nav badge.
- **Project layout** — project + customer + lead (progress bar).
- **Task list page** — the fat load above.

The unread badge query is on **every staff (and portal) navigation**. Task
complete made it part of the click because the action refreshes the current
route tree.

## 4. What 1.17.3 changes (smallest high-impact)

| Fix | Migrate | Why |
|---|---|---|
| Optimistic checkbox (`useOptimistic`) | no | Click paints immediately; server failure rolls back. |
| `after()` for completion `notify` (email / Teams / in-app) | no | Resend/Teams no longer sit on the critical path. Handoff-to-Support email stays in-action (rare, product-required). |
| `refreshProjectCounters` → one `COUNT(*) FILTER` | no | Six RTTs → one. |
| `unreadThreadCount` → SQL `COUNT` + left join | no | Layout refresh no longer hydrates 500 inbox threads. |
| Training side-effects skip full-project load unless the row is a session/schedule (or a child of a session) | no | Most completes stop loading every playbook row. |
| Counters + milestone rollup + audit in `Promise.all` | no | Independent after the status write + peer sync. |
| Drop unused `revalidatePath`s (settings, customer-view, recordings, `/portal`) on the default complete | no | Those routes are already `force-dynamic`; they were not serving the current click. |

**Not changed (on purpose):** connected-peer sync still runs when a key exists —
that is the Billing Configuration product rule. N/A expansion still runs on
Mark N/A only. No overlap-key index (optional; query is already project-scoped).

## 5. Optional follow-ups (not in this PR)

- Index `(project_id, overlap_key)` — migrate yes; small. Only helps the peer
  `OR` lookup.
- Slim the task-list RSC payload (don’t send every checklist/attachment on the
  board). Larger change; the optimistic checkbox hides most of that wait.
- `accessibleProjectIds` still lists every unarchived project for specialists
  before the unread COUNT. Fine at current WIP volume.

No PHI. PATH naming unchanged. Prism untouched.
