/** Prism completed-history era. Column wins; the import sentence is the fallback. */

export function eraLabel(input: { prismEra?: string | null; description?: string | null }): string {
  const explicit = (input.prismEra ?? "").trim().toLowerCase();
  if (explicit === "legacy" || explicit === "current") return explicit;
  const match = /\((legacy|current) era\)/i.exec(input.description ?? "");
  if (match?.[1]) return match[1].toLowerCase();
  return "unspecified";
}

export function eraTitle(era: string): string {
  if (era === "legacy") return "Legacy";
  if (era === "current") return "Current";
  return "Unspecified";
}
