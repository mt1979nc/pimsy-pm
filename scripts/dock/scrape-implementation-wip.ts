/**
 * Scrape Dock Implementation WIP + the Open threads panel.
 *
 * Runs only where a Dock session already exists. PATH App Service does not
 * log in to Dock. See scripts/dock/README.md.
 *
 *   DOCK_CDP_URL=http://127.0.0.1:9222 npx tsx scripts/dock/scrape-implementation-wip.ts \
 *     --wip /tmp/dock-wip.json --threads /tmp/dock-threads.json
 *
 *   DOCK_STORAGE_STATE=./dock-state.json npx tsx scripts/dock/scrape-implementation-wip.ts \
 *     --wip /tmp/dock-wip.json --threads /tmp/dock-threads.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

import { DOCK_IMPLEMENTATION_WIP_URL } from "@/lib/dock-delivery";
import { buildScrapeFiles, type RawThreadCard, type ScrapedCells } from "./map-board";

type GridExtract = { headers: string[]; rows: string[][]; footer: string };

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function extractGrid(): GridExtract {
  const headerNodes = Array.from(document.querySelectorAll('[role="columnheader"], thead th'));
  const headers = headerNodes.map((node) => (node.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  const rowNodes = Array.from(document.querySelectorAll('[role="row"], tbody tr'));
  const rows: string[][] = [];
  for (const row of rowNodes) {
    const cells = Array.from(row.querySelectorAll('[role="gridcell"], [role="cell"], td'));
    const text = cells.map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim());
    if (!text.some(Boolean)) continue;
    if (headers.length > 0 && text.join(" | ") === headers.join(" | ")) continue;
    rows.push(text);
  }
  const footer = document.body.innerText.match(/\d+\s*[–-]\s*\d+\s+of\s+\d+/)?.[0] ?? "";
  return { headers, rows, footer };
}

function extractThreadCards(): { url: string; title: string; text: string }[] {
  const anchors = Array.from(document.querySelectorAll('a[href*="dock.us"]')) as HTMLAnchorElement[];
  const cards: { url: string; title: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const anchor of anchors) {
    const url = anchor.href;
    if (!/(message-|section-|comment-|stepId=)/.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const card =
      anchor.closest("article, li, [role='listitem']") ??
      anchor.parentElement?.parentElement ??
      anchor.parentElement;
    cards.push({
      url,
      title: (anchor.textContent || "").replace(/\s+/g, " ").trim(),
      text: ((card as HTMLElement | null)?.innerText || anchor.innerText || "").trim(),
    });
  }
  return cards;
}

function cellsFromGrid(grid: GridExtract): ScrapedCells[] {
  const headers = grid.headers.length > 0 ? grid.headers : grid.rows[0]?.map((_, index) => `Column ${index + 1}`) ?? [];
  return grid.rows.map((row) => {
    const cells: Record<string, string> = {};
    headers.forEach((header, index) => {
      cells[header] = row[index] ?? "";
    });
    return { cells };
  });
}

async function connect(): Promise<{ browser: Browser; page: Page; close: () => Promise<void> }> {
  const cdp = process.env.DOCK_CDP_URL?.trim();
  const storageState = process.env.DOCK_STORAGE_STATE?.trim();
  if (cdp) {
    const browser = await chromium.connectOverCDP(cdp);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    return { browser, page, close: async () => undefined };
  }
  if (storageState) {
    const browser = await chromium.launch({ headless: process.env.DOCK_HEADLESS !== "0" });
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    return { browser, page, close: () => browser.close() };
  }
  throw new Error(
    "Set DOCK_CDP_URL (Chrome remote debugging) or DOCK_STORAGE_STATE. This script does not log in to Dock.",
  );
}

async function scrapeBoard(page: Page): Promise<{ headers: string[]; rows: ScrapedCells[]; footers: string[] }> {
  const seen = new Set<string>();
  const rows: ScrapedCells[] = [];
  const footers: string[] = [];
  let headers: string[] = [];

  for (let pageNum = 0; pageNum < 8; pageNum++) {
    const grid = await page.evaluate(extractGrid);
    if (grid.headers.length > 0 && headers.length === 0) headers = grid.headers;
    if (grid.footer) footers.push(grid.footer);
    for (const row of cellsFromGrid({ ...grid, headers: headers.length > 0 ? headers : grid.headers })) {
      const key = JSON.stringify(row.cells);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
    const next = page.getByRole("button", { name: /next/i });
    if ((await next.count()) === 0) break;
    const enabled = await next.first().isEnabled().catch(() => false);
    if (!enabled) break;
    const before = grid.footer;
    await next.first().click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => document.body.innerText.match(/\d+\s*[–-]\s*\d+\s+of\s+\d+/)?.[0] ?? "");
    if (before && after && before === after) break;
  }

  return { headers, rows, footers };
}

async function scrapeThreads(page: Page): Promise<RawThreadCard[]> {
  const opener = page.getByRole("button", { name: /open threads/i }).or(page.getByText(/^open threads$/i));
  if ((await opener.count()) > 0) {
    await opener.first().click();
    await page.waitForTimeout(800);
  }
  return page.evaluate(extractThreadCards);
}

async function main() {
  const wipPath = arg("--wip");
  const threadsPath = arg("--threads");
  if (!wipPath || !threadsPath) {
    console.error("Usage: scrape-implementation-wip.ts --wip dock-wip.json --threads dock-threads.json");
    process.exit(1);
  }
  const viewUrl = process.env.DOCK_VIEW_URL?.trim() || DOCK_IMPLEMENTATION_WIP_URL;
  const session = await connect();
  try {
    await session.page.goto(viewUrl, { waitUntil: "domcontentloaded" });
    await session.page.waitForTimeout(1500);
    const board = await scrapeBoard(session.page);
    if (board.rows.length === 0 && !process.argv.includes("--allow-empty")) {
      console.error("No WIP rows found. The Dock view may still be signed out, or the grid selectors need a tweak. Nothing was written.");
      process.exit(1);
    }
    const cards = await scrapeThreads(session.page);
    const files = buildScrapeFiles({
      rows: board.rows,
      cards,
      sourceUrl: viewUrl,
      footers: board.footers,
      headers: board.headers,
    });
    if (files.excluded.length + Number(files.wip.totalIncluded) === 0 && !process.argv.includes("--allow-empty")) {
      console.error("Rows were on the page but none mapped to an Account or Workspace column. Nothing was written.");
      process.exit(1);
    }
    mkdirSync(dirname(resolve(wipPath)), { recursive: true });
    mkdirSync(dirname(resolve(threadsPath)), { recursive: true });
    writeFileSync(resolve(wipPath), `${JSON.stringify(files.wip, null, 2)}\n`);
    writeFileSync(resolve(threadsPath), `${JSON.stringify(files.threads, null, 2)}\n`);
    console.log(
      `Wrote ${files.wip.totalIncluded} sites and ${(files.threads.threads as unknown[]).length} threads. Excluded ${files.excluded.length}.`,
    );
    if (!board.headers.some((header) => header.toLowerCase().includes("overdue"))) {
      console.log("Overdue column was not visible. overdueTaskCount is null (the PATH page shows —).");
    }
  } finally {
    await session.close();
  }
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
