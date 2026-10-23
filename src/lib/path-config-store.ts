/**
 * Process cache for PATH settings. No database import — client bundles can
 * read the fallback. Server code fills the cache from Postgres.
 */

import { DEFAULT_PATH_CONFIG, type PathConfig } from "@/lib/path-config-defaults";

const TTL_MS = 30_000;

let cached: { at: number; value: PathConfig } | null = null;

export function peekPathConfig(): PathConfig | null {
  if (!cached) return null;
  if (Date.now() - cached.at > TTL_MS) {
    cached = null;
    return null;
  }
  return cached.value;
}

/** Current settings, or the hardcoded defaults when nothing has been loaded. */
export function currentPathConfig(): PathConfig {
  return peekPathConfig() ?? DEFAULT_PATH_CONFIG;
}

export function applyPathConfig(value: PathConfig) {
  cached = { at: Date.now(), value };
}

export function resetPathConfigCache() {
  cached = null;
}
