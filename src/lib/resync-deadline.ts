/** Default Cloud Shell budget so dry-run cannot sit forever with no output. */
export const DEFAULT_RESYNC_DEADLINE_MS = 180_000;

export function resyncElapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

export function resyncTimedOut(startedAt: number, deadlineMs: number | undefined): boolean {
  if (deadlineMs == null || deadlineMs <= 0) return false;
  return resyncElapsedMs(startedAt) >= deadlineMs;
}

export function formatResyncSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
