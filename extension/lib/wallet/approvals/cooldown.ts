// Refresh is disabled for this long after it is pressed, so a user cannot spend
// the tightly rate-limited keyless Blockscout quota by pressing it repeatedly.
export const REFRESH_COOLDOWN_MS = 10_000;

// True while the cooldown from the last press is still running.
export function isRefreshCoolingDown(lastPressAt: number | null, now: number): boolean {
  if (lastPressAt === null) return false;
  return now - lastPressAt < REFRESH_COOLDOWN_MS;
}

// How long until Refresh is available again; 0 when it already is.
export function refreshCooldownRemaining(lastPressAt: number | null, now: number): number {
  if (lastPressAt === null) return 0;
  return Math.max(0, REFRESH_COOLDOWN_MS - (now - lastPressAt));
}
