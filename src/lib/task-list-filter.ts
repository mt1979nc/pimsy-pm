/**
 * Fast client-side task list filter + completed-section split.
 * Pure helpers so staff and portal lists share the same behavior.
 */

export type TaskListView = "all" | "open" | "done" | "customer" | "mine";

export const TASK_LIST_VIEWS: Array<{ id: TaskListView; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "done", label: "Done" },
  { id: "customer", label: "Customer" },
  { id: "mine", label: "Mine" },
];

export type FilterableTask = {
  id: string;
  parentTaskId?: string | null;
  title: string;
  description?: string | null;
  status: string;
  ownerSide: string;
  assigneeId?: string | null;
  assigneeIds?: string[] | null;
  notApplicable?: boolean | null;
};

/** Closed for list/section math: DONE, cancelled, or N/A. */
export function isTaskClosed(t: { status: string; notApplicable?: boolean | null }): boolean {
  return Boolean(t.notApplicable) || t.status === "DONE" || t.status === "CANCELLED";
}

function isClosed(t: FilterableTask): boolean {
  return isTaskClosed(t);
}

/**
 * A phase/section is complete when it has tasks and every one is DONE, N/A, or
 * cancelled. N/A counts as complete. Empty sections stay in original order.
 * A section marked N/A is complete even with no rows.
 */
export function isSectionComplete(
  tasks: readonly { status: string; notApplicable?: boolean | null }[],
  opts?: { sectionNotApplicable?: boolean },
): boolean {
  if (opts?.sectionNotApplicable) return true;
  if (tasks.length === 0) return false;
  return tasks.every(isTaskClosed);
}

/**
 * Incomplete sections first (stable original order), then complete sections
 * (stable original order) so finished phases accumulate at the bottom.
 */
export function sortSectionsByCompletion<T>(
  sections: readonly T[],
  complete: (section: T) => boolean,
): T[] {
  const incomplete: T[] = [];
  const finished: T[] = [];
  for (const section of sections) {
    (complete(section) ? finished : incomplete).push(section);
  }
  return [...incomplete, ...finished];
}

export function sortPhaseSections<
  T extends {
    notApplicable?: boolean | null;
    tasks: readonly { status: string; notApplicable?: boolean | null }[];
  },
>(sections: readonly T[]): T[] {
  return sortSectionsByCompletion(sections, (section) =>
    isSectionComplete(section.tasks, { sectionNotApplicable: Boolean(section.notApplicable) }),
  );
}

function haystack(t: FilterableTask): string {
  return `${t.title} ${t.description ?? ""}`.toLowerCase();
}

function childrenMap<T extends FilterableTask>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of rows) {
    if (!t.parentTaskId) continue;
    const list = map.get(t.parentTaskId) ?? [];
    list.push(t);
    map.set(t.parentTaskId, list);
  }
  return map;
}

function collectDescendants<T extends FilterableTask>(id: string, children: Map<string, T[]>): T[] {
  const out: T[] = [];
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    out.push(node);
    const next = children.get(node.id);
    if (next) stack.push(...next);
  }
  return out;
}

function matchesView(t: FilterableTask, view: TaskListView, currentUserId?: string): boolean {
  switch (view) {
    case "all":
      return true;
    case "open":
      return !isClosed(t);
    case "done":
      return t.status === "DONE";
    case "customer":
      return t.ownerSide === "CUSTOMER";
    case "mine":
      if (!currentUserId) return false;
      if (t.assigneeId === currentUserId) return true;
      return Boolean(t.assigneeIds?.includes(currentUserId));
    default:
      return true;
  }
}

/**
 * Keep a nested row if it, an ancestor, or a descendant matches query + view.
 * Ancestors stay so the specialist still sees which parent a sub-task belongs to.
 */
export function filterNestedTasks<T extends FilterableTask>(
  ordered: T[],
  opts: { query: string; view: TaskListView; currentUserId?: string },
): T[] {
  const q = opts.query.trim().toLowerCase();
  const byId = new Map(ordered.map((t) => [t.id, t]));
  const children = childrenMap(ordered);

  const queryHit = new Set<string>();
  for (const t of ordered) {
    if (!q || haystack(t).includes(q)) queryHit.add(t.id);
  }

  const viewHit = new Set<string>();
  for (const t of ordered) {
    if (matchesView(t, opts.view, opts.currentUserId)) viewHit.add(t.id);
  }

  const keep = new Set<string>();
  for (const t of ordered) {
    if (!queryHit.has(t.id) || !viewHit.has(t.id)) continue;
    keep.add(t.id);
    let parentId = t.parentTaskId;
    while (parentId) {
      keep.add(parentId);
      parentId = byId.get(parentId)?.parentTaskId ?? null;
    }
    for (const d of collectDescendants(t.id, children)) keep.add(d.id);
  }

  return ordered.filter((t) => keep.has(t.id));
}

export type PartitionedTasks<T extends FilterableTask> = {
  active: T[];
  completed: T[];
};

/**
 * Top-level groups where the parent and every descendant are done / N/A /
 * cancelled move into `completed` so the list can collapse finished work.
 * Mixed groups (open parent, some done children) stay in `active`.
 */
export function partitionCompletedGroups<T extends FilterableTask>(ordered: T[]): PartitionedTasks<T> {
  const ids = new Set(ordered.map((t) => t.id));
  const children = childrenMap(ordered);
  const placed = new Set<string>();
  const active: T[] = [];
  const completed: T[] = [];

  const roots = ordered.filter((t) => !t.parentTaskId || !ids.has(t.parentTaskId));
  for (const root of roots) {
    const group = [root, ...collectDescendants(root.id, children).sort((a, b) => {
      return ordered.indexOf(a) - ordered.indexOf(b);
    })];
    const bucket = group.every(isClosed) ? completed : active;
    for (const t of group) {
      if (placed.has(t.id)) continue;
      placed.add(t.id);
      bucket.push(t);
    }
  }

  for (const t of ordered) {
    if (placed.has(t.id)) continue;
    (isClosed(t) ? completed : active).push(t);
  }

  return { active, completed };
}

export function countOpen(rows: FilterableTask[]): number {
  return rows.filter((t) => !isClosed(t)).length;
}

/** Hide children whose ancestor parent is collapsed. */
export function excludeCollapsedDescendants<T extends FilterableTask>(
  ordered: T[],
  collapsedParentIds: ReadonlySet<string>,
): T[] {
  if (collapsedParentIds.size === 0) return ordered;
  const byId = new Map(ordered.map((t) => [t.id, t]));
  return ordered.filter((t) => {
    let parentId = t.parentTaskId;
    while (parentId) {
      if (collapsedParentIds.has(parentId)) return false;
      parentId = byId.get(parentId)?.parentTaskId ?? null;
    }
    return true;
  });
}
