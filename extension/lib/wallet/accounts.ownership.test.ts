import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  ACCOUNTS_KEY,
  ACTIVE_ACCOUNT_KEY,
  ownAccountLabel,
  resolveActiveIndex,
  unlockAccounts,
} from './accounts';
import type { SessionAccount, StoredAccount } from './accounts';
import { SESSION_ACCOUNTS_KEY, SESSION_KEY } from './storage';

const PHRASE = 'test test test test test test test test test test test junk';
const A0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const A1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const A2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const STRANGER = '0x000000000000000000000000000000000000dEaD';
const DURATION = 15 * 60 * 1000;

function storedAccounts(): StoredAccount[] {
  return [
    { index: 0, name: 'Account 1', address: A0 },
    { index: 1, name: 'Savings', address: A1 },
  ];
}

function sessionAccounts(): SessionAccount[] {
  return [
    { index: 0, address: A0 },
    { index: 1, address: A1 },
  ];
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('ownAccountLabel', () => {
  it('labels a verified, named address', () => {
    expect(ownAccountLabel(A1, sessionAccounts(), storedAccounts())).toBe('Savings');
  });

  it('matches the address case-insensitively', () => {
    expect(ownAccountLabel(A1.toLowerCase(), sessionAccounts(), storedAccounts())).toBe('Savings');
  });

  it('returns null when the address is verified but unnamed', () => {
    const verified: SessionAccount[] = [{ index: 2, address: A2 }];
    expect(ownAccountLabel(A2, verified, storedAccounts())).toBeNull();
  });

  it('never labels an address that is not in the verified session list', () => {
    // A tampered local list names a stranger's address "Account 2". The verified
    // session list does not contain it, so no label is produced.
    const tampered: StoredAccount[] = [
      ...storedAccounts(),
      { index: 2, name: 'Account 2', address: STRANGER },
    ];
    expect(ownAccountLabel(STRANGER, sessionAccounts(), tampered)).toBeNull();
  });

  it('rejects an invalid address', () => {
    expect(ownAccountLabel('0x1234', sessionAccounts(), storedAccounts())).toBeNull();
  });
});

describe('resolveActiveIndex', () => {
  it('returns the index of the verified session address', async () => {
    await fakeBrowser.storage.local.set({
      [ACCOUNTS_KEY]: storedAccounts(),
      [ACTIVE_ACCOUNT_KEY]: 1,
    });
    await unlockAccounts(PHRASE, DURATION, 1_000);
    // unlockAccounts starts on the remembered account (index 1, address A1).
    expect(await resolveActiveIndex(1_000)).toBe(1);
  });

  it('returns null when the session address is not in the verified list', async () => {
    await fakeBrowser.storage.local.set({ [ACCOUNTS_KEY]: storedAccounts() });
    await unlockAccounts(PHRASE, DURATION, 1_000);

    // Overwrite the session address with one that was never derived at unlock.
    await fakeBrowser.storage.session.set({ [SESSION_KEY]: { address: A2, expiresAt: 1_000_000 } });

    expect(await resolveActiveIndex(1_000)).toBeNull();
  });

  it('returns null when there is no session or it has expired', async () => {
    expect(await resolveActiveIndex(1_000)).toBeNull();

    await fakeBrowser.storage.session.set({ [SESSION_KEY]: { address: A0, expiresAt: 500 } });
    await fakeBrowser.storage.session.set({
      [SESSION_ACCOUNTS_KEY]: { accounts: [{ index: 0, address: A0 }] },
    });
    expect(await resolveActiveIndex(1_000)).toBeNull();
  });
});
