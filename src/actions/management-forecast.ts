"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { requirePortfolioAccess } from "@/lib/guard";
import { canManagePrismCapacity, ForbiddenError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { loadCapacityForecast, loadForecastExclusions, saveForecastExclusions } from "@/lib/forecast-data";
import { normalizeForecastCode, parseExclusionCodes } from "@/lib/forecast";
import type { ActionState } from "@/actions/messages";

export async function getManagementForecast(weeksAhead = 12) {
  await requirePortfolioAccess();
  const [forecast, exclusions, knownCodes] = await Promise.all([
    loadCapacityForecast(weeksAhead),
    loadForecastExclusions(),
    listImplementationCodes(),
  ]);
  return { forecast, exclusions, knownCodes };
}

export async function listImplementationCodes(): Promise<string[]> {
  const rows = await db.query.projects.findMany({
    where: and(isNull(projects.archivedAt), eq(projects.type, "IMPLEMENTATION"), ne(projects.status, "CANCELLED")),
    columns: { code: true, crmAcronym: true, prismClientId: true },
    orderBy: [asc(projects.code)],
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const code = normalizeForecastCode(r.crmAcronym || r.prismClientId || r.code);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

export async function updateForecastExclusions(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePortfolioAccess();
  if (!canManagePrismCapacity(actor)) {
    throw new ForbiddenError("Management access required.");
  }

  const raw = formData.get("exclusions")?.toString() ?? "";
  const fromText = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const fromBoxes = formData.getAll("exclusionCode").map((v) => String(v));
  const merged = parseExclusionCodes([...fromBoxes, ...fromText]);

  const saved = await saveForecastExclusions(merged);

  await audit({
    actor,
    action: "management.forecast.exclusions",
    entityType: "org_settings",
    entityId: "singleton",
    summary: `Forecast Analysis exclusions: ${saved.join(", ") || "(none)"}`,
    metadata: { exclusions: saved },
  });

  revalidatePath("/management");
  revalidatePath("/management/forecast");
  revalidatePath("/reports/analysis");
  revalidatePath("/reports/capacity");
  return { ok: true };
}
