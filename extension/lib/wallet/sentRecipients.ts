import { browser } from 'wxt/browser';
import { getAddress, isAddress } from 'viem';

export const SENT_RECIPIENTS_KEY = 'nerafi.sentRecipients';
export const SENT_RECIPIENTS_LIMIT = 500;

export type SentRecipient = {
  address: string;
  lastSentAt: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function parseSentRecipient(value: unknown): SentRecipient | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, ['address', 'lastSentAt'])) return null;
  if (typeof value.address !== 'string' || !isAddress(value.address)) return null;
  if (typeof value.lastSentAt !== 'number' || !Number.isFinite(value.lastSentAt)) return null;
  return { address: getAddress(value.address), lastSentAt: value.lastSentAt };
}

// Strict entry parsing. Duplicates (case-insensitive) collapse to the newest
// timestamp, then the list is capped to the limit newest-first. This list is
// only ever written by our own send flow; it is deliberately never seeded from
// the activity feed (an attacker can send you a lookalike from a new address).
export function parseSentRecipients(value: unknown): SentRecipient[] | null {
  if (!Array.isArray(value)) return null;
  const byAddress = new Map<string, SentRecipient>();
  for (const item of value) {
    const parsed = parseSentRecipient(item);
    if (parsed === null) return null;
    const key = parsed.address.toLowerCase();
    const existing = byAddress.get(key);
    if (existing === undefined || parsed.lastSentAt > existing.lastSentAt) {
      byAddress.set(key, parsed);
    }
  }
  return Array.from(byAddress.values())
    .sort((a, b) => b.lastSentAt - a.lastSentAt)
    .slice(0, SENT_RECIPIENTS_LIMIT);
}

export async function loadSentRecipients(): Promise<SentRecipient[]> {
  const stored = await browser.storage.local.get(SENT_RECIPIENTS_KEY);
  return parseSentRecipients(stored[SENT_RECIPIENTS_KEY]) ?? [];
}

export async function recordSentRecipient(
  address: string,
  now: number = Date.now(),
): Promise<void> {
  if (!isAddress(address)) return;
  const current = await loadSentRecipients();
  const lower = address.toLowerCase();
  const next = [
    { address: getAddress(address), lastSentAt: now },
    ...current.filter((item) => item.address.toLowerCase() !== lower),
  ]
    .sort((a, b) => b.lastSentAt - a.lastSentAt)
    .slice(0, SENT_RECIPIENTS_LIMIT);
  await browser.storage.local.set({ [SENT_RECIPIENTS_KEY]: next });
}
