import { browser } from 'wxt/browser';

export const SECURITY_LOG_KEY = 'nerafi.securityLog';
export const SECURITY_LOG_LIMIT = 200;
const DETAIL_MAX_LENGTH = 120;

export const SECURITY_LOG_TYPES = [
  'unlock',
  'unlock_failed',
  'lockout_started',
  'lock_manual',
  'lock_auto',
  'password_changed',
  'account_added',
  'account_renamed',
  'auto_lock_changed',
  'address_mismatch',
  'wallet_restored',
  'contact_added',
  'contact_removed',
  'contact_renamed',
  'lookalike_acknowledged',
] as const;

export type SecurityLogType = (typeof SECURITY_LOG_TYPES)[number];

export type SecurityLogEntry = {
  type: SecurityLogType;
  at: number;
  detail?: string;
};

export const SECURITY_LOG_LABELS: Record<SecurityLogType, string> = {
  unlock: 'Wallet unlocked',
  unlock_failed: 'Unlock attempt failed',
  lockout_started: 'Too many failed attempts',
  lock_manual: 'Locked manually',
  lock_auto: 'Locked automatically',
  password_changed: 'Password changed',
  account_added: 'Account added',
  account_renamed: 'Account renamed',
  auto_lock_changed: 'Auto-lock changed',
  address_mismatch: 'Saved address corrected',
  wallet_restored: 'Wallet restored from recovery phrase',
  contact_added: 'Contact added',
  contact_removed: 'Contact removed',
  contact_renamed: 'Contact renamed',
  lookalike_acknowledged: 'Look-alike address acknowledged',
};

const TYPE_SET = new Set<string>(SECURITY_LOG_TYPES);

function isType(value: unknown): value is SecurityLogType {
  return typeof value === 'string' && TYPE_SET.has(value);
}

export function parseSecurityLogEntry(value: unknown): SecurityLogEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = keys.includes('detail') ? ['at', 'detail', 'type'] : ['at', 'type'];
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) return null;
  if (!isType(record.type)) return null;
  if (typeof record.at !== 'number' || !Number.isFinite(record.at)) return null;
  if (record.detail !== undefined && typeof record.detail !== 'string') return null;
  const entry: SecurityLogEntry = { type: record.type, at: record.at };
  if (typeof record.detail === 'string') entry.detail = record.detail;
  return entry;
}

export function parseSecurityLog(value: unknown): SecurityLogEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: SecurityLogEntry[] = [];
  for (const item of value) {
    const entry = parseSecurityLogEntry(item);
    if (entry !== null) entries.push(entry);
  }
  entries.sort((a, b) => b.at - a.at);
  return entries.slice(0, SECURITY_LOG_LIMIT);
}

export async function loadSecurityLog(): Promise<SecurityLogEntry[]> {
  const stored = await browser.storage.local.get(SECURITY_LOG_KEY);
  return parseSecurityLog(stored[SECURITY_LOG_KEY]);
}

export function sanitizeDetail(detail: string): string {
  const trimmed = detail.trim();
  return trimmed.length > DETAIL_MAX_LENGTH ? trimmed.slice(0, DETAIL_MAX_LENGTH) : trimmed;
}

export async function appendSecurityLog(
  type: SecurityLogType,
  detail?: string,
  now: number = Date.now(),
): Promise<void> {
  // A record is a courtesy, not a guarantee: never let it break the operation
  // it describes. Note the deliberate empty catch.
  try {
    const current = await loadSecurityLog();
    const entry: SecurityLogEntry = { type, at: now };
    if (typeof detail === 'string' && detail.trim().length > 0) {
      entry.detail = sanitizeDetail(detail);
    }
    const next = [entry, ...current].slice(0, SECURITY_LOG_LIMIT);
    await browser.storage.local.set({ [SECURITY_LOG_KEY]: next });
  } catch {
    // Ignore: logging must never fail or delay the caller.
  }
}
