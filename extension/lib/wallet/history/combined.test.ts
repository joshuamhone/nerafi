import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  extrasMayBeIncomplete,
  failureNotes,
  loadFirstPages,
  mergeFeed,
  PART_FAILURE_NOTES,
  visibleInternalTransfers,
} from './combined';
import type { FirstPageSources } from './combined';
import { parseInternalTransfersResponse, parseTokenTransfersResponse } from './transfers';
import { feedKey } from './types';
import type {
  ActivityItem,
  ExtraPage,
  HistoryPage,
  InternalTransferItem,
  TokenTransferItem,
} from './types';

const TOKEN_ACCOUNT = '0x69ffa62060b9e425166f35789C4EeAc69EFFB37b';

type Raw = { items: Array<Record<string, unknown>>; next_page_params: unknown };

function load(file: string): Raw {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'),
  ) as Raw;
}

const tokenPage: ExtraPage<TokenTransferItem> = parseTokenTransfersResponse(
  load('token-transfers-live.json'),
  TOKEN_ACCOUNT,
);
const internalPage: ExtraPage<InternalTransferItem> = parseInternalTransfersResponse(
  load('internal-transactions-create-live.json'),
  '0x82BB1fde985d1C3736AEA843E9f7023664a14a2D',
);

function tx(hash: string, timestamp: number | null): ActivityItem {
  return {
    hash,
    from: TOKEN_ACCOUNT,
    to: null,
    createdContract: null,
    valueWei: 1n,
    feeWei: null,
    status: 'confirmed',
    errorMessage: null,
    timestamp,
    blockNumber: null,
    nonce: null,
    direction: 'out',
    isContractCall: false,
    method: null,
    explorerFlags: { counterpartyScam: false, counterpartyReputation: null },
    source: 'explorer',
  };
}

const txPage: HistoryPage = { items: [tx(`0x${'1'.repeat(64)}`, 5)], nextCursor: null, skipped: 0 };

function sources(overrides: Partial<FirstPageSources> = {}): FirstPageSources {
  return {
    transactions: async () => txPage,
    internal: async () => internalPage,
    tokens: async () => tokenPage,
    ...overrides,
  };
}

const boom = async (): Promise<never> => {
  throw new Error('down');
};

describe('loadFirstPages: independent failure', () => {
  it('returns all three when nothing fails', async () => {
    const result = await loadFirstPages(sources());
    expect(result.failed).toEqual([]);
    expect(result.transactions).toBe(txPage);
    expect(result.internal).toBe(internalPage);
    expect(result.tokens).toBe(tokenPage);
  });

  it('names the token part when only token transfers fail and keeps the rest', async () => {
    const result = await loadFirstPages(sources({ tokens: boom }));
    expect(result.failed).toEqual(['tokens']);
    expect(result.tokens).toBeNull();
    expect(result.transactions).toBe(txPage);
    expect(result.internal).toBe(internalPage);
    expect(failureNotes(result.failed)).toEqual(["Token transfers couldn't be loaded."]);
  });

  it('names the internal part when only internal transfers fail', async () => {
    const result = await loadFirstPages(sources({ internal: boom }));
    expect(result.failed).toEqual(['internal']);
    expect(failureNotes(result.failed)).toEqual(["Internal transfers couldn't be loaded."]);
    expect(result.tokens).toBe(tokenPage);
  });

  it('keeps token and internal rows when transactions fail', async () => {
    const result = await loadFirstPages(sources({ transactions: boom }));
    expect(result.failed).toEqual(['transactions']);
    expect(result.transactions).toBeNull();
    expect(result.internal).toBe(internalPage);
    expect(result.tokens).toBe(tokenPage);
  });

  it('reports every failed part when all three fail', async () => {
    const result = await loadFirstPages(
      sources({ transactions: boom, internal: boom, tokens: boom }),
    );
    expect(result.failed).toEqual(['transactions', 'internal', 'tokens']);
    expect(failureNotes(result.failed)).toEqual([
      PART_FAILURE_NOTES.transactions,
      PART_FAILURE_NOTES.internal,
      PART_FAILURE_NOTES.tokens,
    ]);
  });

  it('a failing part never turns the result into a clean one', async () => {
    const result = await loadFirstPages(sources({ tokens: boom }));
    expect(result.failed.length).toBeGreaterThan(0);
  });
});

describe('mergeFeed', () => {
  it('sorts rows of every kind together, newest first, nulls last', () => {
    const early = tx(`0x${'a'.repeat(64)}`, 1);
    const undated = tx(`0x${'b'.repeat(64)}`, null);
    const merged = mergeFeed([early, undated], internalPage.items, tokenPage.items);
    const stamps = merged.map((item) => item.timestamp);
    const dated = stamps.filter((value): value is number => value !== null);
    expect(dated).toEqual([...dated].sort((a, b) => b - a));
    expect(stamps[stamps.length - 1]).toBeNull();
  });

  it('leaves out internal calls that moved no ETH', () => {
    const items = visibleInternalTransfers(internalPage.items);
    expect(internalPage.items.length).toBe(2);
    expect(items).toHaveLength(1);
    expect(items[0]?.valueWei).toBe(22865000000000000n);
  });

  it('gives every row of a shared transaction its own key', () => {
    const merged = mergeFeed([], internalPage.items, tokenPage.items);
    const keys = merged.map(feedKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps every transaction row untouched', () => {
    const first = tx(`0x${'c'.repeat(64)}`, 9);
    expect(mergeFeed([first], [], [])).toEqual([first]);
  });
});

describe('extrasMayBeIncomplete', () => {
  it('is true when either list has another page', () => {
    expect(extrasMayBeIncomplete({ ...internalPage, hasMore: true }, tokenPage)).toBe(true);
    expect(extrasMayBeIncomplete(internalPage, { ...tokenPage, hasMore: true })).toBe(true);
  });

  it('is false when both are whole, or missing', () => {
    expect(extrasMayBeIncomplete({ ...internalPage, hasMore: false }, { ...tokenPage, hasMore: false })).toBe(false);
    expect(extrasMayBeIncomplete(null, null)).toBe(false);
  });
});
