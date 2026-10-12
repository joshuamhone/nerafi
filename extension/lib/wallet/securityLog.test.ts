import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  appendSecurityLog,
  loadSecurityLog,
  parseSecurityLog,
  parseSecurityLogEntry,
  SECURITY_LOG_KEY,
  SECURITY_LOG_LIMIT,
} from './securityLog';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('parseSecurityLogEntry', () => {
  it('accepts a minimal entry', () => {
    expect(parseSecurityLogEntry({ type: 'unlock', at: 5 })).toEqual({ type: 'unlock', at: 5 });
  });

  it('accepts an entry with a detail', () => {
    expect(parseSecurityLogEntry({ type: 'account_added', at: 5, detail: 'Account 3' })).toEqual({
      type: 'account_added',
      at: 5,
      detail: 'Account 3',
    });
  });

  it('rejects unknown types, unknown keys and bad timestamps', () => {
    expect(parseSecurityLogEntry({ type: 'nonsense', at: 5 })).toBeNull();
    expect(parseSecurityLogEntry({ type: 'unlock', at: 5, extra: 1 })).toBeNull();
    expect(parseSecurityLogEntry({ type: 'unlock', at: 'x' })).toBeNull();
    expect(parseSecurityLogEntry(null)).toBeNull();
  });
});

describe('parseSecurityLog', () => {
  it('filters invalid entries and sorts newest first', () => {
    const parsed = parseSecurityLog([
      { type: 'unlock', at: 100 },
      { type: 'bogus', at: 999 },
      { type: 'lock_manual', at: 300 },
    ]);
    expect(parsed.map((entry) => entry.type)).toEqual(['lock_manual', 'unlock']);
  });

  it('caps the list at the limit', () => {
    const raw = Array.from({ length: SECURITY_LOG_LIMIT + 25 }, (_, i) => ({
      type: 'unlock',
      at: i + 1,
    }));
    expect(parseSecurityLog(raw)).toHaveLength(SECURITY_LOG_LIMIT);
  });

  it('returns an empty array for non-arrays', () => {
    expect(parseSecurityLog(null)).toEqual([]);
  });
});

describe('appendSecurityLog', () => {
  it('prepends the newest entry and keeps a fixed detail format', async () => {
    await appendSecurityLog('auto_lock_changed', '5 minutes', 1_000);
    await appendSecurityLog('unlock', undefined, 2_000);

    const log = await loadSecurityLog();
    expect(log).toEqual([
      { type: 'unlock', at: 2_000 },
      { type: 'auto_lock_changed', at: 1_000, detail: '5 minutes' },
    ]);
  });

  it('ignores a malformed stored log', async () => {
    await fakeBrowser.storage.local.set({ [SECURITY_LOG_KEY]: 'not-an-array' });
    await appendSecurityLog('lock_manual', undefined, 1_000);
    const log = await loadSecurityLog();
    expect(log).toEqual([{ type: 'lock_manual', at: 1_000 }]);
  });

  it('never throws when the write fails', async () => {
    const spy = vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('nope'));
    await expect(appendSecurityLog('unlock', undefined, 1_000)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
