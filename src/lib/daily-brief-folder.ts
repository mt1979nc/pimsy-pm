/**
 * Read one folder of morning snapshots into daily-brief inputs.
 * No database. The backfill script writes; tests call this directly.
 *
 * Day folder:
 *   2026-09-08/dock-wip.json
 *   2026-09-08/dock-threads.json          missing file → gap (missing thread data)
 *   2026-09-08/delivery-status.json       optional metrics / vsWed
 *   2026-09-08/prism.json                 optional
 *   2026-09-08/prism-live.md              optional, or prism-live-2026-09-08.md
 *   2026-09-08/zendesk.json               optional
 *
 * Flat names in the same directory also work:
 *   dock-wip-2026-09-08.json
 *   delivery-status-2026-09-08.json
 *   prism-live-2026-09-08.md
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { type DailyBriefInput } from "@/lib/daily-brief";

export type DailyBriefDayFiles = {
  date: string;
  input: DailyBriefInput;
};

const DAY = /^(\d{4}-\d{2}-\d{2})$/;
const FLAT_JSON = /^(dock-wip|dock-threads|prism|zendesk|delivery-status)-(\d{4}-\d{2}-\d{2})\.json$/;
const FLAT_MD = /^prism-live-(\d{4}-\d{2}-\d{2})\.md$/;

type DayPaths = {
  wip?: string;
  threads?: string;
  prism?: string;
  zendesk?: string;
  delivery?: string;
  markdown?: string;
  sawDockWip: boolean;
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function ensure(days: Map<string, DayPaths>, day: string): DayPaths {
  const row = days.get(day) ?? { sawDockWip: false };
  days.set(day, row);
  return row;
}

function assign(row: DayPaths, kind: string, path: string) {
  if (kind === "dock-wip") {
    row.wip = path;
    row.sawDockWip = true;
  } else if (kind === "dock-threads") row.threads = path;
  else if (kind === "prism") row.prism = path;
  else if (kind === "zendesk") row.zendesk = path;
  else if (kind === "delivery-status") row.delivery = path;
}

function takeFile(dir: string, name: string): string | undefined {
  const path = join(dir, name);
  return existsSync(path) ? path : undefined;
}

/** One directory level: day folders and flat dated files. */
export function loadDailyBriefDir(dir: string): DailyBriefDayFiles[] {
  const days = new Map<string, DayPaths>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory() && DAY.test(name)) {
      const row = ensure(days, name);
      const wip = takeFile(path, "dock-wip.json");
      if (wip) {
        row.wip = wip;
        row.sawDockWip = true;
      }
      row.threads = row.threads ?? takeFile(path, "dock-threads.json");
      row.prism = row.prism ?? takeFile(path, "prism.json");
      row.zendesk = row.zendesk ?? takeFile(path, "zendesk.json");
      row.delivery = row.delivery ?? takeFile(path, "delivery-status.json");
      row.markdown = row.markdown ?? takeFile(path, "prism-live.md") ?? takeFile(path, `prism-live-${name}.md`);
      continue;
    }
    const flat = FLAT_JSON.exec(name);
    if (flat) {
      assign(ensure(days, flat[2]!), flat[1]!, path);
      continue;
    }
    const markdown = FLAT_MD.exec(name);
    if (markdown) ensure(days, markdown[1]!).markdown = path;
  }

  return [...days.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, files]) => ({
      date,
      input: {
        date,
        dockWip: files.wip ? readJson(files.wip) : undefined,
        dockThreads: files.threads ? readJson(files.threads) : undefined,
        prism: files.prism ? readJson(files.prism) : undefined,
        zendesk: files.zendesk ? readJson(files.zendesk) : undefined,
        deliveryStatus: files.delivery ? readJson(files.delivery) : undefined,
        prismMarkdown: files.markdown ? readFileSync(files.markdown, "utf8") : undefined,
        threadsMissing: files.sawDockWip && !files.threads,
      },
    }));
}
