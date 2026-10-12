import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { deriveAccountAddress } from './account';
import {
  ACCOUNTS_KEY,
  ACTIVE_ACCOUNT_KEY,
  addAccount,
  findAccountName,
  MAX_ACCOUNTS,
  normalizeAccountName,
  parseAccounts,
  parseActiveIndex,
  parseSessionAccounts,
  renameAccount,
  switchAccount,
  unlockAccounts,
} from './accounts';
import { ADDRESS_KEY, SESSION_ACCOUNTS_KEY, SESSION_KEY } from './storage';
import type { StoredAccount } from './accounts';

const PHRASE = 'test test test test test test test test test test test junk';
const A0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const A1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const A2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const ZERO = '0x0000000000000000000000000000000000000000';
const DURATION = 15 * 60 * 1000;

function sampleAccounts(): StoredAccount[] {
  return [
    { index: 0, name: 'Account 1', address: A0 },
    { index: 1, name: 'Savings', address: A1 },
  ];
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('deriveAccountAddress', () => {
  it('matches the standard BIP-44 test vectors', () => {
    expect(deriveAccountAddress(PHRASE, 0)).toBe(A0);
    expect(deriveAccountAddress(PHRASE, 1)).toBe(A1);
    expect(deriveAccountAddress(PHRASE, 2)).toBe(A2);
  });

  it('rejects invalid indices', () => {
    expect(() => deriveAccountAddress(PHRASE, -1)).toThrow();
    expect(() => deriveAccountAddress(PHRASE, 1.5)).toThrow();
    expect(() => deriveAccountAddress(PHRASE, MAX_ACCOUNTS)).toThrow();
  });
});

describe('normalizeAccountName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeAccountName('  Savings  ')).toEqual({ ok: true, name: 'Savings' });
  });

  it('rejects empty names', () => {
    expect(normalizeAccountName('   ').ok).toBe(false);
  });

  it('rejects names longer than the limit', () => {
    expect(normalizeAccountName('a'.repeat(33)).ok).toBe(false);
    expect(normalizeAccountName('a'.repeat(32)).ok).toBe(true);
  });

  it('rejects control characters', () => {
    expect(normalizeAccountName('bad\u0000name').ok).toBe(false);
    expect(normalizeAccountName('zero\u200bwidth').ok).toBe(false);
  });
});

describe('parseAccounts', () => {
  it('accepts a valid list', () => {
    expect(parseAccounts(sampleAccounts())).toEqual(sampleAccounts());
  });

  it('rejects non-arrays, empty lists and over-long lists', () => {
    expect(parseAccounts(null)).toBeNull();
    expect(parseAccounts({})).toBeNull();
    expect(parseAccounts([])).toBeNull();
    const tooMany = Array.from({ length: MAX_ACCOUNTS + 1 }, (_, i) => ({
      index: i,
      name: `Account ${i + 1}`,
      address: A0,
    }));
    expect(parseAccounts(tooMany)).toBeNull();
  });

  it('rejects duplicate or non-contiguous indices', () => {
    expect(
      parseAccounts([
        { index: 0, name: 'Account 1', address: A0 },
        { index: 0, name: 'Account 1', address: A0 },
      ]),
    ).toBeNull();
    expect(
      parseAccounts([
        { index: 1, name: 'Account 2', address: A1 },
      ]),
    ).toBeNull();
  });

  it('rejects unknown keys, bad names and bad addresses', () => {
    expect(parseAccounts([{ index: 0, name: 'Account 1', address: A0, extra: 1 }])).toBeNull();
    expect(parseAccounts([{ index: 0, name: '', address: A0 }])).toBeNull();
    expect(parseAccounts([{ index: 0, name: 'Account 1', address: '0x1234' }])).toBeNull();
  });
});

describe('parseSessionAccounts', () => {
  it('accepts a valid verified list', () => {
    const value = { accounts: [{ index: 0, address: A0 }] };
    expect(parseSessionAccounts(value)).toEqual([{ index: 0, address: A0 }]);
  });

  it('rejects unknown keys and non-contiguous indices', () => {
    expect(parseSessionAccounts({ accounts: [{ index: 0, address: A0 }], extra: true })).toBeNull();
    expect(parseSessionAccounts({ accounts: [{ index: 1, address: A1 }] })).toBeNull();
    expect(parseSessionAccounts({ accounts: [] })).toBeNull();
  });
});

describe('parseActiveIndex', () => {
  it('accepts valid indices and rejects the rest', () => {
    expect(parseActiveIndex(0)).toBe(0);
    expect(parseActiveIndex(MAX_ACCOUNTS - 1)).toBe(MAX_ACCOUNTS - 1);
    expect(parseActiveIndex(-1)).toBeNull();
    expect(parseActiveIndex(MAX_ACCOUNTS)).toBeNull();
    expect(parseActiveIndex(1.5)).toBeNull();
    expect(parseActiveIndex('0')).toBeNull();
  });
});

describe('unlockAccounts', () => {
  it('migrates a single first account when none is stored', async () => {
    const result = await unlockAccounts(PHRASE, DURATION, 1_000);
    expect(result).toEqual({
      accounts: [{ index: 0, name: 'Account 1', address: A0 }],
      index: 0,
      address: A0,
      corrected: false,
    });

    const stored: Record<string, unknown> = await fakeBrowser.storage.local.get([
      ACCOUNTS_KEY,
      ADDRESS_KEY,
      ACTIVE_ACCOUNT_KEY,
    ]);
    expect(stored[ACCOUNTS_KEY]).toEqual([{ index: 0, name: 'Account 1', address: A0 }]);
    expect(stored[ADDRESS_KEY]).toBe(A0);
    expect(stored[ACTIVE_ACCOUNT_KEY]).toBe(0);

    const session: Record<string, unknown> = await fakeBrowser.storage.session.get([
      SESSION_KEY,
      SESSION_ACCOUNTS_KEY,
    ]);
    expect(session[SESSION_KEY]).toEqual({ address: A0, expiresAt: 1_000 + DURATION });
    expect(session[SESSION_ACCOUNTS_KEY]).toEqual({ accounts: [{ index: 0, address: A0 }] });
  });

  it('re-derives every stored account and reports a correction', async () => {
    const tampered: StoredAccount[] = [
      { index: 0, name: 'Account 1', address: A0 },
      { index: 1, name: 'Savings', address: ZERO },
    ];
    await fakeBrowser.storage.local.set({ [ACCOUNTS_KEY]: tampered });

    const result = await unlockAccounts(PHRASE, DURATION, 2_000);
    expect(result.corrected).toBe(true);
    expect(result.accounts[1]).toEqual({ index: 1, name: 'Savings', address: A1 });

    const stored: Record<string, unknown> = await fakeBrowser.storage.local.get(ACCOUNTS_KEY);
    expect(stored[ACCOUNTS_KEY]).toEqual([
      { index: 0, name: 'Account 1', address: A0 },
      { index: 1, name: 'Savings', address: A1 },
    ]);
  });

  it('starts on the last-used account and stores its address as the session', async () => {
    await fakeBrowser.storage.local.set({
      [ACCOUNTS_KEY]: sampleAccounts(),
      [ACTIVE_ACCOUNT_KEY]: 1,
    });
    const result = await unlockAccounts(PHRASE, DURATION, 3_000);
    expect(result.index).toBe(1);
    expect(result.address).toBe(A1);

    const session: Record<string, unknown> = await fakeBrowser.storage.session.get(SESSION_KEY);
    expect(session[SESSION_KEY]).toEqual({ address: A1, expiresAt: 3_000 + DURATION });
    const local: Record<string, unknown> = await fakeBrowser.storage.local.get(ADDRESS_KEY);
    expect(local[ADDRESS_KEY]).toBe(A1);
  });

  it('falls back to the first account when the stored index is out of range', async () => {
    await fakeBrowser.storage.local.set({
      [ACCOUNTS_KEY]: sampleAccounts(),
      [ACTIVE_ACCOUNT_KEY]: 7,
    });
    const result = await unlockAccounts(PHRASE, DURATION, 4_000);
    expect(result.index).toBe(0);
  });
});

describe('switchAccount', () => {
  it('switches the session address without changing the expiry', async () => {
    await fakeBrowser.storage.local.set({ [ACCOUNTS_KEY]: sampleAccounts() });
    await unlockAccounts(PHRASE, DURATION, 5_000);

    const result = await switchAccount(1, 5_500);
    expect(result).toEqual({ ok: true, index: 1, address: A1 });

    const session: Record<string, unknown> = await fakeBrowser.storage.session.get(SESSION_KEY);
    expect(session[SESSION_KEY]).toEqual({ address: A1, expiresAt: 5_000 + DURATION });
    const active: Record<string, unknown> = await fakeBrowser.storage.local.get(ACTIVE_ACCOUNT_KEY);
    expect(active[ACTIVE_ACCOUNT_KEY]).toBe(1);
  });

  it('refuses an unknown account or a locked wallet', async () => {
    await fakeBrowser.storage.local.set({ [ACCOUNTS_KEY]: sampleAccounts() });
    await unlockAccounts(PHRASE, DURATION, 5_000);
    expect((await switchAccount(9, 5_500)).ok).toBe(false);

    fakeBrowser.reset();
    expect((await switchAccount(0, 5_500)).ok).toBe(false);
  });
});

describe('addAccount', () => {
  it('appends the next index with a default name', async () => {
    await unlockAccounts(PHRASE, DURATION, 1_000);
    const result = await addAccount(PHRASE, undefined, 1_100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account).toEqual({ index: 1, name: 'Account 2', address: A1 });

    const session: Record<string, unknown> = await fakeBrowser.storage.session.get(
      SESSION_ACCOUNTS_KEY,
    );
    expect(session[SESSION_ACCOUNTS_KEY]).toEqual({
      accounts: [
        { index: 0, address: A0 },
        { index: 1, address: A1 },
      ],
    });
  });

  it('accepts a custom name and rejects an invalid one', async () => {
    await unlockAccounts(PHRASE, DURATION, 1_000);
    const named = await addAccount(PHRASE, '  Savings  ', 1_100);
    expect(named.ok).toBe(true);
    if (named.ok) expect(named.account.name).toBe('Savings');

    const bad = await addAccount(PHRASE, '  ', 1_200);
    expect(bad.ok).toBe(false);
  });

  it('refuses to go past the account limit', async () => {
    const full: StoredAccount[] = Array.from({ length: MAX_ACCOUNTS }, (_, i) => ({
      index: i,
      name: `Account ${i + 1}`,
      address: A0,
    }));
    await fakeBrowser.storage.local.set({ [ACCOUNTS_KEY]: full });
    await unlockAccounts(PHRASE, DURATION, 1_000);
    const result = await addAccount(PHRASE, undefined, 1_100);
    expect(result.ok).toBe(false);
  });

  it('requires a live session', async () => {
    await fakeBrowser.storage.local.set({ [ACCOUNTS_KEY]: sampleAccounts() });
    const result = await addAccount(PHRASE, undefined, 1_100);
    expect(result.ok).toBe(false);
  });
});

describe('renameAccount', () => {
  it('renames without needing the password', async () => {
    await fakeBrowser.storage.local.set({ [ACCOUNTS_KEY]: sampleAccounts() });
    const result = await renameAccount(1, 'Cold storage');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored: Record<string, unknown> = await fakeBrowser.storage.local.get(ACCOUNTS_KEY);
    expect(stored[ACCOUNTS_KEY]).toEqual([
      { index: 0, name: 'Account 1', address: A0 },
      { index: 1, name: 'Cold storage', address: A1 },
    ]);
  });

  it('rejects an invalid name or unknown account', async () => {
    await fakeBrowser.storage.local.set({ [ACCOUNTS_KEY]: sampleAccounts() });
    expect((await renameAccount(0, '')).ok).toBe(false);
    expect((await renameAccount(5, 'X')).ok).toBe(false);
  });
});

describe('findAccountName', () => {
  it('matches addresses case-insensitively', () => {
    expect(findAccountName(sampleAccounts(), A1.toLowerCase())).toBe('Savings');
    expect(findAccountName(sampleAccounts(), ZERO)).toBeNull();
  });
});
