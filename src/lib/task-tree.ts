/**
 * Flatten a parent/child task list for display (Dock nested checklists).
 * Orphans whose parent is missing (e.g. portal SHARED-only) stay at depth 0.
 */
export function orderTasksForNesting<T extends { id: string; parentTaskId: string | null; order: number }>(
  rows: T[],
): Array<T & { depth: number }> {
  const byParent = new Map<string | null, T[]>();
  for (const t of rows) {
    const key = t.parentTaskId;
    const list = byParent.get(key) ?? [];
    list.push(t);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.order - b.order);
  }

  const ids = new Set(rows.map((t) => t.id));
  const out: Array<T & { depth: number }> = [];
  const placed = new Set<string>();

  function walk(parentId: string | null, depth: number) {
    for (const t of byParent.get(parentId) ?? []) {
      if (placed.has(t.id)) continue;
      placed.add(t.id);
      out.push({ ...t, depth });
      walk(t.id, depth + 1);
    }
  }

  walk(null, 0);

  // Children whose parent is not in this list (filtered portal rows).
  // Stay at depth 0 so customer action items under a hidden specialist parent
  // present as top-level work, not a dangling indent.
  for (const t of rows) {
    if (placed.has(t.id)) continue;
    if (t.parentTaskId && !ids.has(t.parentTaskId)) {
      placed.add(t.id);
      out.push({ ...t, depth: 0 });
      walk(t.id, 1);
    }
  }

  for (const t of rows) {
    if (!placed.has(t.id)) {
      placed.add(t.id);
      out.push({ ...t, depth: 0 });
    }
  }

  return out;
}
