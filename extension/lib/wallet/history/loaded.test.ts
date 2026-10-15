import { afterEach, describe, expect, it } from 'vitest';
import { clearLoadedHistory, getLoadedHistory, setLoadedHistory } from './loaded';
import type { FeedItem } from './types';

const ACCOUNT_A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ACCOUNT_B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

function item(hash: string): FeedItem {
  return {
    hash,
    from: ACCOUNT_B,
    to: ACCOUNT_A,
    createdContract: null,
    valueWei: 1n,
    feeWei: null,
    status: 'confirmed',
    errorMessage: null,
    timestamp: 1,
    blockNumber: null,
    nonce: null,
    direction: 'in',
    isContractCall: false,
    method: null,
    explorerFlags: { counterpartyScam: false, counterpartyReputation: null },
    source: 'explorer',
  };
}

const itemsA = [item(`0x${'a'.repeat(64)}`)];

afterEach(() => {
  clearLoadedHistory();
});

describe('the loaded-history store is bound to its account', () => {
  it('reads back for the same account', () => {
    setLoadedHistory({ address: ACCOUNT_A, items: itemsA, failedParts: [] });
    expect(getLoadedHistory(ACCOUNT_A)?.items).toEqual(itemsA);
  });

  it('is invisible to another account', () => {
    setLoadedHistory({ address: ACCOUNT_A, items: itemsA, failedParts: [] });
    expect(getLoadedHistory(ACCOUNT_B)).toBeNull();
  });

  it('matches the address case-insensitively', () => {
    setLoadedHistory({ address: ACCOUNT_A, items: itemsA, failedParts: [] });
    expect(getLoadedHistory(ACCOUNT_A.toLowerCase())).not.toBeNull();
    expect(getLoadedHistory(`0x${ACCOUNT_A.slice(2).toUpperCase()}`)).not.toBeNull();
  });

  it('reads as "not loaded" when nothing has been stored', () => {
    expect(getLoadedHistory(ACCOUNT_A)).toBeNull();
  });

  it('is cleared on account switch and on lock, so the old account reads as not loaded', () => {
    setLoadedHistory({ address: ACCOUNT_A, items: itemsA, failedParts: [] });
    clearLoadedHistory();
    expect(getLoadedHistory(ACCOUNT_A)).toBeNull();
    expect(getLoadedHistory(ACCOUNT_B)).toBeNull();
  });

  it('a newer load for another account replaces the old one and never mixes them', () => {
    setLoadedHistory({ address: ACCOUNT_A, items: itemsA, failedParts: [] });
    const itemsB = [item(`0x${'b'.repeat(64)}`)];
    setLoadedHistory({ address: ACCOUNT_B, items: itemsB, failedParts: ['tokens'] });
    expect(getLoadedHistory(ACCOUNT_A)).toBeNull();
    expect(getLoadedHistory(ACCOUNT_B)?.items).toEqual(itemsB);
    expect(getLoadedHistory(ACCOUNT_B)?.failedParts).toEqual(['tokens']);
  });
});
