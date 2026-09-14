/**
 * Rename a PATH/Prism project acronym to the Dock WIP canonical code.
 *
 * Production case (2026-09-14): Transformation ANew / Redemption Alliance is
 * TANC on Dock, but PATH stored it as RAC. Alexander's path is rename
 * code / crmAcronym / prismClientId RAC → TANC. Never delete the site.
 */
import { normalizeKey, projectAcronyms, type DemoProjectRef } from "@/lib/demo-entities";
import type { DockAcronymAlias } from "@/lib/dock-allowlist";

export type AcronymRenameTarget = DemoProjectRef & {
  status?: string | null;
};

export type FieldPatch = {
  code?: string;
  crmAcronym?: string | null;
  prismClientId?: string | null;
};

export type AcronymRenameAction = {
  projectId: string;
  name: string | null;
  customerName: string | null;
  from: string;
  to: string;
  before: { code: string | null; crmAcronym: string | null; prismClientId: string | null };
  patch: FieldPatch;
};

export type AcronymRenameCollision = {
  fromId: string;
  fromLabel: string;
  toId: string;
  toLabel: string;
  from: string;
  to: string;
  detail: string;
};

export type AcronymRenamePlan = {
  remap: { from: string; to: string; note: string };
  actions: AcronymRenameAction[];
  collisions: AcronymRenameCollision[];
  alreadyCanonical: number;
};

function fieldEquals(value: string | null | undefined, key: string): boolean {
  return normalizeKey(value) === key;
}

export function patchAcronymFields(
  p: AcronymRenameTarget,
  from: string,
  to: string,
): FieldPatch | null {
  const src = normalizeKey(from);
  const dest = normalizeKey(to);
  if (!src || !dest || src === dest) return null;
  const patch: FieldPatch = {};
  if (fieldEquals(p.code, src)) patch.code = dest;
  if (fieldEquals(p.crmAcronym, src)) patch.crmAcronym = dest;
  if (fieldEquals(p.prismClientId, src)) patch.prismClientId = dest;
  return Object.keys(patch).length > 0 ? patch : null;
}

function label(p: AcronymRenameTarget): string {
  return [p.code, p.crmAcronym, p.prismClientId, p.name].filter(Boolean).join(" / ");
}

export function planAcronymRename(
  projects: AcronymRenameTarget[],
  remap: { from: string; to: string; note?: string },
): AcronymRenamePlan {
  const from = normalizeKey(remap.from);
  const to = normalizeKey(remap.to);
  const actions: AcronymRenameAction[] = [];
  const collisions: AcronymRenameCollision[] = [];
  let alreadyCanonical = 0;

  const holdersOfTo = projects.filter((p) => projectAcronyms(p).includes(to));

  for (const p of projects) {
    const patch = patchAcronymFields(p, from, to);
    if (!patch) {
      if (projectAcronyms(p).includes(to) && !projectAcronyms(p).includes(from)) {
        alreadyCanonical += 1;
      }
      continue;
    }

    const otherTo = holdersOfTo.find((q) => q.id !== p.id);
    if (otherTo) {
      collisions.push({
        fromId: p.id,
        fromLabel: label(p),
        toId: otherTo.id,
        toLabel: label(otherTo),
        from,
        to,
        detail: `Refusing to rename — ${to} already exists as a different project. Do not delete; reconcile by hand.`,
      });
      continue;
    }

    actions.push({
      projectId: p.id,
      name: p.name ?? null,
      customerName: p.customerName ?? null,
      from,
      to,
      before: {
        code: p.code ?? null,
        crmAcronym: p.crmAcronym ?? null,
        prismClientId: p.prismClientId ?? null,
      },
      patch,
    });
  }

  // project.code is unique. Two RAC rows cannot both become TANC.
  const codeWriters = new Map<string, AcronymRenameAction[]>();
  for (const action of actions) {
    if (!action.patch.code) continue;
    const list = codeWriters.get(action.patch.code) ?? [];
    list.push(action);
    codeWriters.set(action.patch.code, list);
  }
  const dropIds = new Set<string>();
  for (const [dest, writers] of codeWriters) {
    if (writers.length < 2) continue;
    for (const action of writers) {
      const other = writers.find((w) => w.projectId !== action.projectId)!;
      dropIds.add(action.projectId);
      collisions.push({
        fromId: action.projectId,
        fromLabel: [action.before.code, action.name].filter(Boolean).join(" / "),
        toId: other.projectId,
        toLabel: [other.before.code, other.name].filter(Boolean).join(" / "),
        from,
        to: dest,
        detail: `Refusing to rename — more than one project would take unique code ${dest}. Do not delete; reconcile by hand.`,
      });
    }
  }

  return {
    remap: { from, to, note: remap.note ?? "" },
    actions: actions.filter((a) => !dropIds.has(a.projectId)),
    collisions,
    alreadyCanonical,
  };
}

export function remapsFromAliases(aliases: readonly DockAcronymAlias[]): Array<{
  from: string;
  to: string;
  note: string;
}> {
  return aliases.map((a) => ({
    from: a.from,
    to: a.to,
    note: a.note || `${a.from} is the PATH/Prism code; Dock WIP acronym is ${a.to}. Rename — do not delete.`,
  }));
}
