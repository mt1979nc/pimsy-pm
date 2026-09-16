/**
 * Pure helpers for moving a live PATH task to another section (phase) or parent.
 * Client-safe: no DB / Postgres imports. Server apply lives in `task-relink`.
 *
 * Hierarchy columns: `phaseId` (section), `parentTaskId` (nesting), `order` (siblings).
 */

export type MoveTaskNode = {
  id: string;
  title: string;
  phaseId: string | null;
  parentTaskId: string | null;
};

export type ResolvedTaskMove = {
  phaseId: string | null;
  parentTaskId: string | null;
  /** Root first, then every nested descendant (they keep their own parent links). */
  movingIds: string[];
};

export function descendantIdsOf(taskId: string, tasks: MoveTaskNode[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.parentTaskId) continue;
    const list = children.get(t.parentTaskId) ?? [];
    list.push(t.id);
    children.set(t.parentTaskId, list);
  }
  const out = new Set<string>();
  const stack = [...(children.get(taskId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

export function wouldCreateCycle(
  taskId: string,
  toParentTaskId: string | null,
  tasks: MoveTaskNode[],
): boolean {
  if (!toParentTaskId) return false;
  if (toParentTaskId === taskId) return true;
  return descendantIdsOf(taskId, tasks).has(toParentTaskId);
}

/** Tasks in the target section that this item may nest under (not self / descendants). */
export function eligibleParents(
  taskId: string,
  toPhaseId: string | null,
  tasks: MoveTaskNode[],
): MoveTaskNode[] {
  const blocked = descendantIdsOf(taskId, tasks);
  blocked.add(taskId);
  return tasks.filter((t) => !blocked.has(t.id) && t.phaseId === toPhaseId);
}

export function parentDepth(taskId: string, byId: Map<string, MoveTaskNode>): number {
  let depth = 0;
  let current = byId.get(taskId)?.parentTaskId ?? null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = byId.get(current)?.parentTaskId ?? null;
  }
  return depth;
}

export function parentOptionsForPhase(
  taskId: string,
  toPhaseId: string | null,
  tasks: MoveTaskNode[],
): Array<MoveTaskNode & { depth: number }> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return eligibleParents(taskId, toPhaseId, tasks).map((t) => ({
    ...t,
    depth: parentDepth(t.id, byId),
  }));
}

export function resolveTaskMove(input: {
  taskId: string;
  toPhaseId: string | null;
  toParentTaskId: string | null;
  tasks: MoveTaskNode[];
  phaseIds: ReadonlySet<string>;
}): { ok: true; value: ResolvedTaskMove } | { ok: false; error: string } {
  const task = input.tasks.find((t) => t.id === input.taskId);
  if (!task) return { ok: false, error: "Task not found." };

  let phaseId = input.toPhaseId;
  let parentTaskId = input.toParentTaskId;

  if (parentTaskId) {
    const parent = input.tasks.find((t) => t.id === parentTaskId);
    if (!parent) return { ok: false, error: "That parent task is not on this project." };
    if (wouldCreateCycle(input.taskId, parentTaskId, input.tasks)) {
      return {
        ok: false,
        error: "That would nest a task under itself or one of its sub-tasks.",
      };
    }
    phaseId = parent.phaseId;
    parentTaskId = parent.id;
  } else {
    parentTaskId = null;
    if (phaseId && !input.phaseIds.has(phaseId)) {
      return { ok: false, error: "That section is not on this project." };
    }
  }

  const movingIds = [input.taskId, ...descendantIdsOf(input.taskId, input.tasks)];
  return { ok: true, value: { phaseId, parentTaskId, movingIds } };
}
