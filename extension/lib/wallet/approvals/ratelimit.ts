// What to tell the user when Blockscout answers HTTP 429. Keyless access is
// limited to about 10 requests per window, one Refresh can use up to 3 requests,
// and the window takes many minutes to clear, so the message must not promise a
// short wait and must not invite pressing Refresh again.

// Blockscout sends the time until the limit resets in this header, in
// milliseconds, and lists it in access-control-expose-headers, so a page in the
// extension can read it.
export const RATE_LIMIT_RESET_HEADER = 'x-ratelimit-reset';

// A reset longer than this is not believed and is ignored (heuristic: windows
// measured so far were between about 11 and 46 minutes).
export const MAX_PLAUSIBLE_RESET_MS = 60 * 60 * 1000;

// Used when the header is missing or cannot be trusted.
export const MSG_RATE_LIMIT_FIXED =
  'Blockscout is rate limiting requests. This can take 15 minutes or more to clear. Refreshing again will not help until then.';

// Milliseconds from the header, or null when it is missing, not a plain
// non-negative number, zero, or longer than an hour. Never throws.
export function parseRateLimitReset(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const ms = Number(trimmed);
  if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_PLAUSIBLE_RESET_MS) return null;
  return ms;
}

// Whole minutes, rounded up, and never less than one.
export function waitMinutes(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000));
}

export function rateLimitMessage(resetMs: number | null): string {
  if (resetMs === null) return MSG_RATE_LIMIT_FIXED;
  const minutes = waitMinutes(resetMs);
  return `Blockscout is rate limiting requests. Try again in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}. Refreshing again will not help until then.`;
}
