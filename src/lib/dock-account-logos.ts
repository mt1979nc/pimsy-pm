/**
 * One-time Dock → PATH logo match.
 *
 * Dock stores the mark on the Account (`logo` URI). PATH stores one logo on
 * the customer. The join key is the acronym: a Dock account or workspace
 * custom field (acronym, CRM acronym, CRM key, site code, client id) or a
 * Dock name that is itself a short acronym. PATH matches `crmAcronym`,
 * `prismClientId`, and a short `crmKey`. Project codes (IMP-0001) are not
 * keys. HubSpot ids are not read.
 */
import { isDisplayableLogoUrl } from "@/lib/customer-logo";

export type DockCustomField = {
  name?: string | null;
  variableName?: string | null;
  value?: unknown;
};

export type DockLogoAccount = {
  id: string;
  name: string;
  logo: string | null;
  customFields: DockCustomField[];
};

export type DockLogoWorkspace = {
  id: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  accountLogo: string | null;
  customFields: DockCustomField[];
};

export type PathLogoCustomer = {
  id: string;
  name: string;
  logoUrl: string | null;
  logoStorageKey: string | null;
  /** Normalized acronyms from this customer’s projects. */
  acronyms: string[];
};

const ACRONYM_FIELDS = new Set([
  "acronym",
  "crmacronym",
  "crmkey",
  "sitecode",
  "clientid",
  "clientcode",
  "accountacronym",
]);

export function normalizeAcronym(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Compact site code. Hyphenated secrets and IMP-0042 project codes are not keys. */
export function pathLogoKeys(project: {
  crmAcronym?: string | null;
  prismClientId?: string | null;
  crmKey?: string | null;
}): string[] {
  const keys: string[] = [];
  for (const raw of [project.crmAcronym, project.prismClientId, project.crmKey]) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!/^[A-Za-z0-9]{2,16}$/.test(trimmed)) continue;
    const n = trimmed.toUpperCase();
    if (/^(IMP|MIG|TRN|SUP|INT)\d+$/.test(n)) continue;
    keys.push(n);
  }
  return [...new Set(keys)];
}

function fieldKey(raw: string): string {
  const last = raw.split(".").pop() ?? raw;
  return last.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isAcronymField(name?: string | null, variableName?: string | null): boolean {
  for (const raw of [name, variableName]) {
    if (!raw) continue;
    if (ACRONYM_FIELDS.has(fieldKey(raw))) return true;
  }
  return false;
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

/** Acronyms declared on a Dock record via custom fields, plus a pure-acronym name. */
export function acronymsFromDockRecord(name: string, customFields: DockCustomField[]): string[] {
  const out = new Set<string>();
  for (const field of customFields) {
    if (!isAcronymField(field.name, field.variableName)) continue;
    for (const value of stringValues(field.value)) {
      const whole = normalizeAcronym(value);
      if (/^[A-Z0-9]{2,16}$/.test(whole)) out.add(whole);
      const first = value.trim().split(/[\s·|/–—-]+/).filter(Boolean)[0];
      if (first) {
        const token = normalizeAcronym(first);
        if (/^[A-Z0-9]{2,16}$/.test(token)) out.add(token);
      }
    }
  }
  const trimmed = name.trim();
  if (/^[A-Za-z0-9]{2,16}$/.test(trimmed)) out.add(trimmed.toUpperCase());
  return [...out];
}

export function usableLogoUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim() ?? "";
  if (!trimmed || !isDisplayableLogoUrl(trimmed)) return null;
  return trimmed;
}

export type DockLogoUpdate = {
  customerId: string;
  customerName: string;
  acronym: string;
  logoUrl: string;
  previousLogoUrl: string | null;
  clearsUpload: boolean;
  action: "set" | "replace" | "unchanged";
};

export type DockLogoSkip = {
  customerId: string;
  customerName: string;
  acronym: string;
  reason: "uploaded" | "existing-url" | "conflict";
  detail: string;
};

export type DockLogoPlan = {
  updates: DockLogoUpdate[];
  skipped: DockLogoSkip[];
  unmatchedDock: Array<{ acronym: string; logoUrl: string; label: string }>;
};

type LogoHit = { logoUrl: string; label: string };

/**
 * Build the write plan. Default keeps a PATH upload and a different URL.
 * `--overwrite` replaces both (the apply step deletes the stored file).
 */
export function planDockLogoImport(input: {
  accounts: DockLogoAccount[];
  workspaces: DockLogoWorkspace[];
  customers: PathLogoCustomer[];
  overwrite?: boolean;
}): DockLogoPlan {
  const accountById = new Map(input.accounts.map((a) => [a.id, a]));
  const hits = new Map<string, LogoHit[]>();

  function addHit(acronym: string, logoUrl: string | null, label: string) {
    const logo = usableLogoUrl(logoUrl);
    if (!logo) return;
    const list = hits.get(acronym) ?? [];
    if (!list.some((h) => h.logoUrl === logo)) list.push({ logoUrl: logo, label });
    hits.set(acronym, list);
  }

  for (const account of input.accounts) {
    for (const acronym of acronymsFromDockRecord(account.name, account.customFields)) {
      addHit(acronym, account.logo, account.name || account.id);
    }
  }

  for (const workspace of input.workspaces) {
    const account = workspace.accountId ? accountById.get(workspace.accountId) : undefined;
    const logo = workspace.accountLogo ?? account?.logo ?? null;
    const label = workspace.accountName || account?.name || workspace.name;
    for (const acronym of acronymsFromDockRecord(workspace.name, workspace.customFields)) {
      addHit(acronym, logo, label);
    }
  }

  const claimed = new Set<string>();
  const updates: DockLogoUpdate[] = [];
  const skipped: DockLogoSkip[] = [];

  for (const customer of input.customers) {
    const matched = new Map<string, LogoHit>();
    let acronym = "";
    for (const key of customer.acronyms) {
      const list = hits.get(key);
      if (!list || list.length === 0) continue;
      acronym = acronym || key;
      for (const hit of list) matched.set(hit.logoUrl, hit);
      claimed.add(key);
    }
    if (matched.size === 0) continue;

    if (matched.size > 1) {
      skipped.push({
        customerId: customer.id,
        customerName: customer.name,
        acronym: acronym || customer.acronyms[0] || "",
        reason: "conflict",
        detail: [...matched.keys()].join(" | "),
      });
      continue;
    }

    const hit = [...matched.values()][0]!;
    const key = acronym || customer.acronyms[0] || "";
    if (customer.logoStorageKey && !input.overwrite) {
      skipped.push({
        customerId: customer.id,
        customerName: customer.name,
        acronym: key,
        reason: "uploaded",
        detail: "PATH upload kept. Pass --overwrite to replace it with the Dock URL.",
      });
      continue;
    }
    if (
      customer.logoUrl &&
      customer.logoUrl !== hit.logoUrl &&
      !customer.logoStorageKey &&
      !input.overwrite
    ) {
      skipped.push({
        customerId: customer.id,
        customerName: customer.name,
        acronym: key,
        reason: "existing-url",
        detail: customer.logoUrl,
      });
      continue;
    }

    const same = customer.logoUrl === hit.logoUrl && !customer.logoStorageKey;
    updates.push({
      customerId: customer.id,
      customerName: customer.name,
      acronym: key,
      logoUrl: hit.logoUrl,
      previousLogoUrl: customer.logoUrl,
      clearsUpload: Boolean(customer.logoStorageKey),
      action: same ? "unchanged" : customer.logoUrl || customer.logoStorageKey ? "replace" : "set",
    });
  }

  const unmatchedDock: DockLogoPlan["unmatchedDock"] = [];
  for (const [acronym, list] of hits) {
    if (claimed.has(acronym)) continue;
    const hit = list[0];
    if (!hit) continue;
    unmatchedDock.push({ acronym, logoUrl: hit.logoUrl, label: hit.label });
  }
  unmatchedDock.sort((a, b) => a.acronym.localeCompare(b.acronym));

  return { updates, skipped, unmatchedDock };
}

export function dockAccountFromApi(row: unknown): DockLogoAccount | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  if (!id) return null;
  return {
    id,
    name: typeof r.name === "string" ? r.name : "",
    logo: typeof r.logo === "string" ? r.logo : null,
    customFields: parseCustomFields(r.customFields),
  };
}

export function dockWorkspaceFromApi(row: unknown): DockLogoWorkspace | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  if (!id) return null;
  const account = r.account && typeof r.account === "object" ? (r.account as Record<string, unknown>) : null;
  return {
    id,
    name: typeof r.name === "string" ? r.name : "",
    accountId:
      (typeof r.accountId === "string" ? r.accountId : null) ??
      (account && typeof account.id === "string" ? account.id : null),
    accountName: account && typeof account.name === "string" ? account.name : null,
    accountLogo: account && typeof account.logo === "string" ? account.logo : null,
    customFields: parseCustomFields(r.customFields),
  };
}

function parseCustomFields(value: unknown): DockCustomField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((field) => {
    if (!field || typeof field !== "object") return [];
    const f = field as Record<string, unknown>;
    return [
      {
        name: typeof f.name === "string" ? f.name : null,
        variableName: typeof f.variableName === "string" ? f.variableName : null,
        value: f.value,
      },
    ];
  });
}

export const DOCK_ACCOUNT_PROPERTIES = [
  "name",
  "logo",
  "customFields.name",
  "customFields.variableName",
  "customFields.value",
] as const;

export const DOCK_WORKSPACE_PROPERTIES = [
  "name",
  "accountId",
  "account.name",
  "account.logo",
  "customFields.name",
  "customFields.variableName",
  "customFields.value",
] as const;

export function dockListUrl(base: string, resource: "accounts" | "workspaces", page: number, limit: number): string {
  const root = base.replace(/\/$/, "");
  const url = new URL(`${root}/v1/${resource}`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  const props = resource === "accounts" ? DOCK_ACCOUNT_PROPERTIES : DOCK_WORKSPACE_PROPERTIES;
  for (const prop of props) url.searchParams.append("properties", prop);
  return url.toString();
}

export function rowsFromDockPage(body: unknown, resource: "accounts" | "workspaces"): unknown[] {
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  const bucket = data && typeof data === "object" ? (data as Record<string, unknown>)[resource] : undefined;
  return Array.isArray(bucket) ? bucket : [];
}

export function dockPageHasNext(body: unknown, rowCount: number, limit: number): boolean {
  if (!body || typeof body !== "object") return false;
  const data = (body as { data?: unknown }).data;
  const info =
    data && typeof data === "object" ? (data as { pageInfo?: { hasNextPage?: boolean } }).pageInfo : undefined;
  if (typeof info?.hasNextPage === "boolean") return info.hasNextPage;
  return rowCount >= limit;
}
