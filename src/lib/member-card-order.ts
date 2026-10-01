/**
 * Browser-local order for Team capacity headroom cards.
 * No schema. The capacity math stays on the server order; this only
 * rearranges the cards already on the page.
 */

export const CAPACITY_MEMBER_CARD_ORDER_KEY = "path.capacity.member-card-order";

export function parseMemberCardOrder(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== "string" || item.length === 0 || seen.has(item)) continue;
      seen.add(item);
      ids.push(item);
    }
    return ids;
  } catch {
    return [];
  }
}

/**
 * Apply a saved id list. Known ids stay in the saved order.
 * People who are new since the last save append in the incoming order.
 * Ids that are no longer on the roster are dropped.
 */
export function orderMembersByPreference<T extends { id: string }>(
  members: readonly T[],
  preferredIds: readonly string[],
): T[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const id of preferredIds) {
    const member = byId.get(id);
    if (!member || seen.has(id)) continue;
    seen.add(id);
    ordered.push(member);
  }
  for (const member of members) {
    if (seen.has(member.id)) continue;
    ordered.push(member);
  }
  return ordered;
}

/** Move `fromId` to the slot currently occupied by `toId`. */
export function reorderIds(ids: readonly string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return [...ids];
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0) return [...ids];
  const next = [...ids];
  const [item] = next.splice(from, 1);
  if (!item) return [...ids];
  next.splice(to, 0, item);
  return next;
}

/** Move one step. Out-of-range stays put. */
export function moveIdBy(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const to = from + delta;
  if (to < 0 || to >= ids.length) return [...ids];
  const target = ids[to];
  if (!target) return [...ids];
  return reorderIds(ids, id, target);
}
