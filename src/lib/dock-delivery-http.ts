/**
 * Request parsing for POST /api/internal/dock-delivery/ingest.
 * Accepts a JSON body `{ wip, threads }` or multipart fields of the same names.
 */

export type DockIngestPayload = {
  wip: unknown;
  threads: unknown;
  dryRun: boolean;
};

export type DockIngestParseResult = { ok: true; payload: DockIngestPayload } | { ok: false; error: string };

const WIP_KEYS = ["wip", "dockWip", "dock-wip", "dock_wip"];
const THREAD_KEYS = ["threads", "dockThreads", "dock-threads", "dock_threads"];

function flagIsTrue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const token = value.trim().toLowerCase();
  return token === "1" || token === "true" || token === "yes";
}

async function jsonFromPart(value: FormDataEntryValue): Promise<unknown> {
  const text = typeof value === "string" ? value : await value.text();
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty");
  return JSON.parse(trimmed) as unknown;
}

function firstField(form: FormData, keys: string[]): FormDataEntryValue | null {
  for (const key of keys) {
    const value = form.get(key);
    if (value != null && value !== "") return value;
  }
  return null;
}

export function dockDeliveryAuthorized(authorizationHeader: string | null, configuredSecret: string): boolean {
  const configured = configuredSecret.trim();
  if (!configured) return false;
  const header = (authorizationHeader ?? "").trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(header);
  const offered = bearer?.[1]?.trim() ?? "";
  if (!offered) return false;
  return offered === configured;
}

export async function parseIngestRequest(req: Request): Promise<DockIngestParseResult> {
  const url = new URL(req.url);
  let dryRun = flagIsTrue(url.searchParams.get("dryRun") ?? url.searchParams.get("dry-run"));
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      dryRun = dryRun || flagIsTrue(form.get("dryRun") ?? form.get("dry-run"));
      const wipPart = firstField(form, WIP_KEYS);
      const threadsPart = firstField(form, THREAD_KEYS);
      if (!wipPart || !threadsPart) {
        return { ok: false, error: "Multipart body needs wip and threads files (or dock-wip and dock-threads)." };
      }
      return {
        ok: true,
        payload: {
          wip: await jsonFromPart(wipPart),
          threads: await jsonFromPart(threadsPart),
          dryRun,
        },
      };
    }

    const body = (await req.json()) as unknown;
    const obj = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
    if (!obj) return { ok: false, error: "JSON body must be an object with wip and threads." };
    dryRun = dryRun || flagIsTrue(obj.dryRun);
    const wip = WIP_KEYS.map((key) => obj[key]).find((value) => value != null);
    const threads = THREAD_KEYS.map((key) => obj[key]).find((value) => value != null);
    if (wip == null || threads == null) {
      return { ok: false, error: "JSON body must include wip and threads." };
    }
    return { ok: true, payload: { wip, threads, dryRun } };
  } catch {
    return { ok: false, error: "Could not parse wip and threads JSON." };
  }
}
