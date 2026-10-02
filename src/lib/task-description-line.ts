/**
 * Client-safe task-list copy. No playbook catalog, Postgres, or server imports.
 */

export function descriptionSnippet(text: string | null | undefined, max = 160): string | null {
  if (!text) return null;
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return null;
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

/**
 * One scannable line for a task list row. Hidden when the copy is blank or
 * just repeats the title — the title is already on the row.
 */
export function listDescriptionLine(
  title: string,
  text: string | null | undefined,
  max = 160,
): string | null {
  const snippet = descriptionSnippet(text, max);
  if (!snippet) return null;
  const titleNorm = title.replace(/\s+/g, " ").trim().toLowerCase();
  const snippetNorm = snippet.replace(/…$/, "").trim().toLowerCase();
  if (!titleNorm) return snippet;
  if (snippetNorm === titleNorm) return null;
  if (titleNorm.startsWith(snippetNorm)) return null;
  return snippet;
}
