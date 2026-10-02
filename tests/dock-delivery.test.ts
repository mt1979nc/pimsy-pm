import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DOCK_DELIVERY_KEEP_SNAPSHOTS,
  DOCK_IMPLEMENTATION_WIP_URL,
  buildDockDeliverySnapshot,
  chicagoCalendarDay,
  dockWorkspaceExclusionReason,
  isDockDeliveryStale,
  matchDockAcronym,
  nextDockSort,
  parseOverdueCount,
  sortDockRows,
  type DockDeliveryTableRow,
  type PathProjectRef,
} from "@/lib/dock-delivery";
import { dockDeliveryAuthorized, parseIngestRequest } from "@/lib/dock-delivery-http";
import { buildScrapeFiles, classifyWaitingOn, mapWipRows } from "../scripts/dock/map-board";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), "scripts/dock/fixtures", name), "utf8")) as unknown;
}

function row(partial: Partial<DockDeliveryTableRow> & Pick<DockDeliveryTableRow, "acronym">): DockDeliveryTableRow {
  return {
    name: partial.acronym,
    owners: [],
    targetEnd: null,
    actualEnd: null,
    overdueTaskCount: null,
    status: null,
    acronymInferred: false,
    waitingOnPimsy: 0,
    waitingOnCustomer: 0,
    waitingUnknown: 0,
    openThreadCount: 0,
    path: null,
    threads: [],
    ...partial,
  };
}

describe("dock delivery snapshot", () => {
  const now = new Date("2026-10-02T16:00:00.000Z");

  it("keeps the sample WIP sites and attaches threads by acronym", () => {
    const built = buildDockDeliverySnapshot(fixture("dock-wip.sample.json"), fixture("dock-threads.sample.json"), { now });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.draft.sites.map((site) => site.acronym)).toEqual([
      "CEDAR",
      "EBHKY",
      "NSPA",
      "OCE",
      "PWMI",
      "RMC",
      "TAC",
      "THS",
    ]);
    expect(built.draft.totals.overdueTaskSum).toBeNull();
    expect(built.draft.totals.overdueUnknownSites).toBe(8);
    const cedar = built.draft.sites.find((site) => site.acronym === "CEDAR");
    const ths = built.draft.sites.find((site) => site.acronym === "THS");
    const ebhky = built.draft.sites.find((site) => site.acronym === "EBHKY");
    expect(cedar).toMatchObject({ openThreadCount: 1, waitingOnCustomer: 1, waitingOnPimsy: 0 });
    expect(ths).toMatchObject({ openThreadCount: 1, waitingOnPimsy: 1, waitingOnCustomer: 0 });
    expect(ebhky).toMatchObject({ openThreadCount: 1, waitingOnCustomer: 1 });
    expect(built.draft.threads.filter((thread) => thread.acronym === "CEDAR")).toHaveLength(1);
    expect(built.draft.totals.unlistedThreads).toBeGreaterThan(0);
    expect(built.draft.threads.some((thread) => thread.acronym === "BDMH")).toBe(false);
    expect(built.draft.sourceUrl).toBe(DOCK_IMPLEMENTATION_WIP_URL);
    expect(cedar?.overdueTaskCount).toBeNull();
  });

  it("is idempotent for the same board", () => {
    const first = buildDockDeliverySnapshot(fixture("dock-wip.sample.json"), fixture("dock-threads.sample.json"), { now });
    const second = buildDockDeliverySnapshot(fixture("dock-wip.sample.json"), fixture("dock-threads.sample.json"), {
      now: new Date("2026-10-03T16:00:00.000Z"),
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.draft.contentHash).toBe(second.draft.contentHash);
  });

  it("drops actual end, draft, test, RCM-only, and GROK E2E", () => {
    const wip = {
      retrievedAt: "2026-10-02T15:00:00.000Z",
      sourceUrl: DOCK_IMPLEMENTATION_WIP_URL,
      workspaces: [
        { name: "Kept", acronym: "KEEP", actualEnd: "2026-10-03", overdueTaskCount: 2, owners: ["AM"] },
        { name: "Ended", acronym: "END", actualEnd: "2026-10-01", overdueTaskCount: 9 },
        { name: "Ends today", acronym: "TODAY", actualEnd: "2026-10-02" },
        { name: "DRAFT Impl. Billing/RCM tab", acronym: "DRAFT" },
        { name: "MT Test 5", acronym: "MTT" },
        { name: "RCM only billing", acronym: "RCMX", rcmOnly: true },
        { name: "Billing lane", acronym: "BILL", product: "RCM" },
        { name: "GROK E2E", acronym: "GROK" },
        { name: "Regional Management Care", acronym: "RMC", status: "Warm" },
        { name: "No acronym site", acronym: "" },
      ],
    };
    const threads = { retrievedAt: "2026-10-02T15:00:00.000Z", threads: [], by_site: {} };
    const built = buildDockDeliverySnapshot(wip, threads, { now });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.draft.sites.map((site) => site.acronym).sort()).toEqual(["KEEP", "RMC"]);
    expect(built.draft.totals.overdueTaskSum).toBe(2);
    expect(built.draft.totals.excluded.map((site) => site.reason).sort()).toEqual([
      "actual-end",
      "actual-end",
      "draft-impl",
      "grok-e2e",
      "no-acronym",
      "rcm-only",
      "rcm-only",
      "test-workspace",
    ]);
    expect(chicagoCalendarDay(new Date("2026-10-02T03:00:00.000Z"))).toBe("2026-10-01");
    expect(dockWorkspaceExclusionReason({ name: "Ended", acronym: "END", actualEnd: "2026-10-01" }, new Date("2026-10-02T03:00:00.000Z"))).toBe(
      "actual-end",
    );
    expect(dockWorkspaceExclusionReason({ name: "Tomorrow", acronym: "NEXT", actualEnd: "2026-10-02" }, new Date("2026-10-02T03:00:00.000Z"))).toBe(
      null,
    );
  });

  it("marks a missing overdue count as null", () => {
    expect(parseOverdueCount(null)).toBeNull();
    expect(parseOverdueCount("—")).toBeNull();
    expect(parseOverdueCount("")).toBeNull();
    expect(parseOverdueCount(0)).toBe(0);
    expect(parseOverdueCount("4")).toBe(4);
  });

  it("warns when the scrape is older than 24 hours", () => {
    const retrieved = "2026-10-01T16:00:00.000Z";
    expect(isDockDeliveryStale(retrieved, new Date("2026-10-02T16:00:00.000Z"))).toBe(false);
    expect(isDockDeliveryStale(retrieved, new Date("2026-10-02T16:00:00.001Z"))).toBe(true);
  });

  it("matches crmAcronym before code and skips archived when a live row exists", () => {
    const projects: PathProjectRef[] = [
      { id: "code", name: "By code", code: "CEDAR", crmAcronym: null, status: "IN_PROGRESS", archivedAt: null },
      { id: "old", name: "Old", code: "OLD", crmAcronym: "CEDAR", status: "COMPLETED", archivedAt: "2026-01-01" },
      { id: "live", name: "Live", code: "CEDAR-2", crmAcronym: "cedar", status: "IN_PROGRESS", archivedAt: null },
    ];
    expect(matchDockAcronym("cedar", projects)).toMatchObject({ id: "live", via: "crmAcronym", extra: 2 });
    expect(matchDockAcronym("NOPE", projects)).toBeNull();
    expect(matchDockAcronym("CEDAR", [{ id: "only", name: "Only", code: "cedar", crmAcronym: "OTHER", status: "IN_PROGRESS", archivedAt: null }])).toMatchObject({
      id: "only",
      via: "code",
    });
  });

  it("sorts overdue descending with blanks last", () => {
    const rows = [
      row({ acronym: "B", overdueTaskCount: null, openThreadCount: 3 }),
      row({ acronym: "A", overdueTaskCount: 1, openThreadCount: 0 }),
      row({ acronym: "C", overdueTaskCount: 4, openThreadCount: 1 }),
    ];
    expect(sortDockRows(rows, { key: "overdue", dir: "desc" }).map((item) => item.acronym)).toEqual(["C", "A", "B"]);
    expect(sortDockRows(rows, { key: "overdue", dir: "asc" }).map((item) => item.acronym)).toEqual(["A", "C", "B"]);
    expect(nextDockSort({ key: "overdue", dir: "desc" }, "overdue")).toEqual({ key: "overdue", dir: "asc" });
    expect(nextDockSort({ key: "overdue", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
  });

  it("keeps eight snapshots and documents the refresh path", () => {
    expect(DOCK_DELIVERY_KEEP_SNAPSHOTS).toBe(8);
    const readme = readFileSync(resolve(process.cwd(), "scripts/dock/README.md"), "utf8");
    expect(readme).toMatch(/DOCK_DELIVERY_INGEST_SECRET/);
    expect(readme).toMatch(/Logic App/);
    expect(readme).toMatch(/crmAcronym/);
    expect(readme).toMatch(/DOCK_CDP_URL/);
    expect(readme).toMatch(/DOCK_STORAGE_STATE/);
    expect(readme).toMatch(/does not log in to Dock/);
    expect(readme).toMatch(/0030_dock_delivery/);
    expect(readme).toMatch(/08:15 America\/Chicago/);
    const page = readFileSync(resolve(process.cwd(), "src/app/(app)/management/dock-delivery/page.tsx"), "utf8");
    expect(page).toMatch(/loadDockDeliveryBoard/);
    expect(page).toMatch(/How to refresh/);
    expect(page).toMatch(/does not import/);
    expect(page).not.toMatch(/from "@\/db\/schema"/);
    const store = readFileSync(resolve(process.cwd(), "src/lib/dock-delivery-store.ts"), "utf8");
    expect(store).not.toMatch(/from "@\/db\/schema"[\s\S]*\btasks\b/);
    expect(store).not.toMatch(/\btasks\b/);
    expect(store).toMatch(/dockDeliverySnapshots/);
    const seed = readFileSync(resolve(process.cwd(), "src/db/seed.ts"), "utf8");
    expect(seed).not.toMatch(/dock_delivery/);
    const sql = readFileSync(resolve(process.cwd(), "drizzle/0030_dock_delivery.sql"), "utf8");
    expect(sql).toMatch(/dock_delivery_snapshots/);
    expect(sql).toMatch(/dock_delivery_sites/);
    expect(sql).toMatch(/dock_delivery_threads/);
  });
});

describe("dock delivery ingest request", () => {
  it("requires the bearer secret and hides the route when it is unset", () => {
    expect(dockDeliveryAuthorized("Bearer secret", "secret")).toBe(true);
    expect(dockDeliveryAuthorized("Bearer no", "secret")).toBe(false);
    expect(dockDeliveryAuthorized(null, "")).toBe(false);
    expect(dockDeliveryAuthorized("Bearer secret", "  ")).toBe(false);
  });

  it("accepts JSON and multipart wip + threads bodies", async () => {
    const wip = { retrievedAt: "2026-10-02T00:00:00.000Z", workspaces: [] };
    const threads = { retrievedAt: "2026-10-02T00:00:00.000Z", threads: [], by_site: {} };
    const json = await parseIngestRequest(
      new Request("https://pimsy-app.azurewebsites.net/api/internal/dock-delivery/ingest?dryRun=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wip, threads }),
      }),
    );
    expect(json.ok).toBe(true);
    if (!json.ok) return;
    expect(json.payload.dryRun).toBe(true);
    expect(json.payload.wip).toEqual(wip);

    const form = new FormData();
    form.set("dock-wip", JSON.stringify(wip));
    form.set("dock-threads", JSON.stringify(threads));
    const multipart = await parseIngestRequest(
      new Request("https://pimsy-app.azurewebsites.net/api/internal/dock-delivery/ingest", {
        method: "POST",
        body: form,
      }),
    );
    expect(multipart.ok).toBe(true);
    if (!multipart.ok) return;
    expect(multipart.payload.threads).toEqual(threads);
  });
});

describe("dock board mapping", () => {
  const asOf = new Date("2026-10-02T16:00:00.000Z");

  it("infers acronyms, keeps a null overdue count, and drops excluded rows", () => {
    const mapped = mapWipRows(
      [
        { cells: { Account: "The Anxiety Center", Owner: "AM, JR", Trend: "Hot", "Target end": "2026-12-14" } },
        { cells: { Account: "CEDAR Health", Acronym: "CEDAR", Overdue: "3", Owner: "AM" } },
        { cells: { Account: "DRAFT Impl. Billing/RCM tab", Acronym: "DRAFT" } },
        { cells: { Account: "Done", Acronym: "DONE", "Actual end": "2026-10-01" } },
      ],
      { asOf, accountAcronyms: new Map([["the anxiety center", "TAC"]]) },
    );
    expect(mapped.workspaces.map((workspace) => workspace.acronym)).toEqual(["TAC", "CEDAR"]);
    expect(mapped.workspaces[0]).toMatchObject({ acronymInferred: false, overdueTaskCount: null, status: "Hot" });
    expect(mapped.workspaces[1]?.overdueTaskCount).toBe(3);
    expect(mapped.excluded.map((site) => site.reason)).toEqual(["draft-impl", "actual-end"]);
  });

  it("classifies waiting on from the last poster when the card does not say", () => {
    expect(classifyWaitingOn("Morgan Davis")).toBe("customer");
    expect(classifyWaitingOn("Nicole Artis")).toBe("pimsy");
    expect(classifyWaitingOn("Nicole Artis", "customer")).toBe("customer");
    expect(classifyWaitingOn("")).toBe("unknown");
  });

  it("writes the two JSON shapes from a grid extract", () => {
    const files = buildScrapeFiles({
      asOf,
      rows: [{ cells: { Account: "Triangle Health Services", Acronym: "THS", Trend: "Hot" } }],
      cards: [
        {
          account: "Triangle Health Services",
          acronym: "THS",
          title: "Follow-up",
          lastPoster: "Nicole Artis",
          url: "https://pimsyehr.dock.us/triangle#message-1",
          type: "Message",
          lastActivity: "10h",
        },
      ],
    });
    const built = buildDockDeliverySnapshot(files.wip, files.threads, { now: asOf });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.draft.sites).toHaveLength(1);
    expect(built.draft.sites[0]).toMatchObject({
      acronym: "THS",
      overdueTaskCount: null,
      openThreadCount: 1,
      waitingOnPimsy: 1,
    });
    expect(built.draft.threads[0]?.url).toContain("dock.us");
  });
});
