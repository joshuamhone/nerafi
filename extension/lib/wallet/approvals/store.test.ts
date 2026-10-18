import { afterEach, describe, expect, it } from 'vitest';
import {
  clearLoadedApprovals,
  getLoadedApprovals,
  selectApprovals,
  setLoadedApprovals,
} from './store';
import type { ApprovalsStore } from './store';
import type { ApprovalsResult } from './types';

const ACCOUNT_A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ACCOUNT_B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

function result(owner: string, count = 0): ApprovalsResult {
  return {
    owner,
    active: Array.from({ length: count }, (_, i) => ({
      token: `0x${(i + 1).toString(16).padStart(40, '0')}`,
      spender: `0x${(i + 100).toString(16).padStart(40, '0')}`,
      allowance: 1n,
      tokenInfo: { symbol: 'T', name: 'T', decimals: 18, listed: true, metadataComplete: true },
      spenderCode: 'contract' as const,
    })),
    couldNotCheck: [],
    unreadable: 0,
    otherEvents: 0,
    capped: false,
    pageFull: false,
  };
}

afterEach(() => {
  clearLoadedApprovals();
});

describe('selectApprovals', () => {
  it('is "not loaded" when nothing has been stored', () => {
    expect(selectApprovals(null, ACCOUNT_A)).toBe('not loaded');
  });

  it('returns the stored result for the same account', () => {
    const stored: ApprovalsStore = { owner: ACCOUNT_A, result: result(ACCOUNT_A, 2) };
    expect(selectApprovals(stored, ACCOUNT_A)).toBe(stored.result);
  });

  it('is "not loaded" for any other account', () => {
    expect(selectApprovals({ owner: ACCOUNT_A, result: result(ACCOUNT_A, 2) }, ACCOUNT_B)).toBe(
      'not loaded',
    );
  });

  it('matches the account in every letter-case combination', () => {
    const forms = [ACCOUNT_A, ACCOUNT_A.toLowerCase(), `0x${ACCOUNT_A.slice(2).toUpperCase()}`];
    for (const stored of forms) {
      for (const current of forms) {
        expect(selectApprovals({ owner: stored, result: result(stored) }, current)).not.toBe(
          'not loaded',
        );
      }
    }
  });

  it('ignores whitespace around addresses', () => {
    expect(selectApprovals({ owner: ` ${ACCOUNT_A} `, result: result(ACCOUNT_A) }, ACCOUNT_A)).not.toBe(
      'not loaded',
    );
  });
});

describe('a late result for an old account', () => {
  // The user switches from account A to account B while A's load is still running.
  it('never applies to the new account', () => {
    let stored: ApprovalsStore = null;

    stored = { owner: ACCOUNT_A, result: result(ACCOUNT_A, 3) };
    expect(selectApprovals(stored, ACCOUNT_A)).not.toBe('not loaded');

    // Account B is now active and A's result is still in memory.
    expect(selectApprovals(stored, ACCOUNT_B)).toBe('not loaded');

    // A's late result arrives again: still not B's.
    stored = { owner: ACCOUNT_A, result: result(ACCOUNT_A, 5) };
    expect(selectApprovals(stored, ACCOUNT_B)).toBe('not loaded');

    // Only B's own load makes B's list appear, and then A reads as not loaded.
    stored = { owner: ACCOUNT_B, result: result(ACCOUNT_B, 1) };
    const forB = selectApprovals(stored, ACCOUNT_B);
    expect(forB === 'not loaded' ? 0 : forB.active.length).toBe(1);
    expect(selectApprovals(stored, ACCOUNT_A)).toBe('not loaded');
  });
});

describe('the in-memory store', () => {
  it('reads back for the account it was set for', () => {
    const value = result(ACCOUNT_A, 2);
    setLoadedApprovals(ACCOUNT_A, value);
    expect(getLoadedApprovals(ACCOUNT_A)).toBe(value);
  });

  it('is invisible to another account', () => {
    setLoadedApprovals(ACCOUNT_A, result(ACCOUNT_A, 2));
    expect(getLoadedApprovals(ACCOUNT_B)).toBe('not loaded');
  });

  it('matches the account case-insensitively', () => {
    setLoadedApprovals(ACCOUNT_A, result(ACCOUNT_A, 1));
    expect(getLoadedApprovals(ACCOUNT_A.toLowerCase())).not.toBe('not loaded');
  });

  it('is cleared on account switch and on lock', () => {
    setLoadedApprovals(ACCOUNT_A, result(ACCOUNT_A, 2));
    clearLoadedApprovals();
    expect(getLoadedApprovals(ACCOUNT_A)).toBe('not loaded');
    expect(getLoadedApprovals(ACCOUNT_B)).toBe('not loaded');
  });

  it('a newer load for another account replaces the old one and never mixes the two', () => {
    setLoadedApprovals(ACCOUNT_A, result(ACCOUNT_A, 4));
    setLoadedApprovals(ACCOUNT_B, result(ACCOUNT_B, 1));
    expect(getLoadedApprovals(ACCOUNT_A)).toBe('not loaded');
    const forB = getLoadedApprovals(ACCOUNT_B);
    expect(forB === 'not loaded' ? -1 : forB.active.length).toBe(1);
  });
});
