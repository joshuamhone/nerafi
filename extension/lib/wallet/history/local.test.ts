import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { OTHER_ADDRESS, OWN_ADDRESS, TX_HASH } from './fixtures/transactions';
import {
  loadLocalTxRecords,
  LOCAL_PENDING_SUBLABEL,
  LOCAL_STALE_AFTER_MS,
  LOCAL_STALE_SUBLABEL,
  LOCAL_TX_KEY,
  localPendingSublabel,
  localRecordToItem,
  mergeLocalRecords,
  parseLocalTxRecord,
  pruneLocalTx,
  saveLocalTx,
} from './local';
import type { LocalTxRecord } from './local';
import type { ActivityItem, HistoryPage } from './types';

function mkRecord(overrides: Partial<LocalTxRecord> = {}): LocalTxRecord {
  return {
    hash: TX_HASH,
    from: OWN_ADDRESS,
    to: OTHER_ADDRESS,
    valueWei: '5000000000000000',
    nonce: 0,
    createdAt: 1000,
    ...overrides,
  };
}

function mkExplorerItem(hash: string): ActivityItem {
  return {
    hash,
    from: OWN_ADDRESS,
    to: OTHER_ADDRESS,
    createdContract: null,
    valueWei: 1n,
    feeWei: null,
    status: 'confirmed',
    errorMessage: null,
    timestamp: 1000,
    blockNumber: 10n,
    nonce: 0,
    direction: 'out',
    isContractCall: false,
    method: null,
    explorerFlags: { counterpartyScam: false, counterpartyReputation: null },
    source: 'explorer',
  };
}

function assertItem<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

describe('parseLocalTxRecord', () => {
  it('accepts a well-formed record', () => {
    expect(parseLocalTxRecord(mkRecord())).toEqual(mkRecord());
  });

  it('rejects malformed values', () => {
    expect(parseLocalTxRecord(mkRecord({ hash: '0x1234' }))).toBeNull();
    expect(parseLocalTxRecord(mkRecord({ from: 'nope' }))).toBeNull();
    expect(parseLocalTxRecord(mkRecord({ to: '0x123' }))).toBeNull();
    expect(parseLocalTxRecord(mkRecord({ valueWei: '1e18' }))).toBeNull();
    expect(parseLocalTxRecord(mkRecord({ valueWei: '-5' }))).toBeNull();
    expect(parseLocalTxRecord(mkRecord({ nonce: '1' as unknown as number }))).toBeNull();
    expect(parseLocalTxRecord(mkRecord({ nonce: 1.5 }))).toBeNull();
    expect(parseLocalTxRecord(mkRecord({ createdAt: 'yesterday' as unknown as number }))).toBeNull();
    expect(parseLocalTxRecord(mkRecord({ createdAt: Number.NaN }))).toBeNull();
  });

  it('rejects records with the wrong shape', () => {
    const missing = mkRecord();
    delete (missing as Partial<LocalTxRecord>).hash;
    expect(parseLocalTxRecord(missing)).toBeNull();
    expect(parseLocalTxRecord(null)).toBeNull();
    expect(parseLocalTxRecord(42)).toBeNull();
    expect(parseLocalTxRecord([mkRecord()])).toBeNull();
  });
});

describe('saving and loading', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('persists and loads a saved record', async () => {
    await saveLocalTx(mkRecord());
    const stored = await fakeBrowser.storage.local.get(LOCAL_TX_KEY);
    expect(stored[LOCAL_TX_KEY]).toHaveLength(1);
    const loaded = await loadLocalTxRecords();
    expect(loaded).toEqual([mkRecord()]);
  });

  it('deduplicates by hash, keeping the newest', async () => {
    await saveLocalTx(mkRecord());
    await saveLocalTx(mkRecord({ createdAt: 2000 }));
    const loaded = await loadLocalTxRecords();
    expect(loaded).toHaveLength(1);
    expect(assertItem(loaded[0], 'expected newest record').createdAt).toBe(2000);
  });

  it('keeps only the newest 50 records', async () => {
    for (let i = 1; i <= 55; i++) {
      const tail = i.toString(16).padStart(2, '0');
      await saveLocalTx(mkRecord({ hash: `0x${'a'.repeat(62)}${tail}`, createdAt: 1000 + i }));
    }
    const loaded = await loadLocalTxRecords();
    expect(loaded).toHaveLength(50);
    expect(assertItem(loaded[0], 'expected first').hash.endsWith('37')).toBe(true);
    expect(assertItem(loaded[49], 'expected last').hash.endsWith('06')).toBe(true);
  });

  it('drops malformed records when loading', async () => {
    await fakeBrowser.storage.local.set({
      [LOCAL_TX_KEY]: [mkRecord(), mkRecord({ hash: '0x1234' }), 'oops', 42, null],
    });
    const loaded = await loadLocalTxRecords();
    expect(loaded).toEqual([mkRecord()]);
  });
});

describe('localRecordToItem', () => {
  it('builds a pending local item with correct direction', () => {
    const item = localRecordToItem(mkRecord(), OWN_ADDRESS);
    expect(item.source).toBe('local');
    expect(item.status).toBe('pending');
    expect(item.direction).toBe('out');
    expect(item.valueWei).toBe(5000000000000000n);
    expect(item.feeWei).toBeNull();
    expect(item.blockNumber).toBeNull();
    expect(item.timestamp).toBe(1000);
  });

  it('marks self and incoming directions', () => {
    expect(localRecordToItem(mkRecord({ to: OWN_ADDRESS }), OWN_ADDRESS).direction).toBe('self');
    expect(localRecordToItem(mkRecord(), OTHER_ADDRESS).direction).toBe('in');
  });
});

describe('mergeLocalRecords', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('prepends local records the explorer has not returned', async () => {
    const explorerHash = `0x${'cd'.repeat(32)}`;
    const localHash = `0x${'ef'.repeat(32)}`;
    await fakeBrowser.storage.local.set({
      [LOCAL_TX_KEY]: [
        mkRecord({ hash: explorerHash, createdAt: 3000 }),
        mkRecord({ hash: localHash, createdAt: 2000 }),
      ],
    });
    const page: HistoryPage = {
      items: [mkExplorerItem(explorerHash)],
      nextCursor: { block_number: '5' },
      skipped: 1,
    };
    const merged = await mergeLocalRecords(page, OWN_ADDRESS);
    expect(merged.items).toHaveLength(2);
    const localItem = assertItem(merged.items[0], 'expected local item');
    const explorerItem = assertItem(merged.items[1], 'expected explorer item');
    expect(localItem.hash).toBe(localHash);
    expect(localItem.source).toBe('local');
    expect(localItem.status).toBe('pending');
    expect(explorerItem.hash).toBe(explorerHash);
    expect(explorerItem.source).toBe('explorer');
    expect(merged.nextCursor).toEqual({ block_number: '5' });
    expect(merged.skipped).toBe(1);
  });

  it('deduplicates regardless of hash letter case', async () => {
    const upperHash = `0x${'CD'.repeat(32)}`;
    await fakeBrowser.storage.local.set({
      [LOCAL_TX_KEY]: [mkRecord({ hash: upperHash, createdAt: 2000 })],
    });
    const page: HistoryPage = {
      items: [mkExplorerItem(upperHash.toLowerCase())],
      nextCursor: null,
      skipped: 0,
    };
    const merged = await mergeLocalRecords(page, OWN_ADDRESS);
    expect(merged.items).toHaveLength(1);
    expect(assertItem(merged.items[0], 'expected explorer item').source).toBe('explorer');
  });

  it('excludes local records older than the page when more pages exist', async () => {
    const explorerHash = `0x${'cd'.repeat(32)}`;
    const oldLocalHash = `0x${'ef'.repeat(32)}`;
    const freshLocalHash = `0x${'12'.repeat(32)}`;
    await fakeBrowser.storage.local.set({
      [LOCAL_TX_KEY]: [
        mkRecord({ hash: oldLocalHash, createdAt: 1000 }),
        mkRecord({ hash: freshLocalHash, createdAt: 9000 }),
      ],
    });
    const page: HistoryPage = {
      items: [mkExplorerItem(explorerHash)],
      nextCursor: { block_number: '5' },
      skipped: 0,
    };
    const merged = await mergeLocalRecords(page, OWN_ADDRESS);
    const hashes = merged.items.map((item) => item.hash);
    expect(hashes).toContain(freshLocalHash);
    expect(hashes).not.toContain(oldLocalHash);
  });

  it('includes all unmatched local records when the page has no next page', async () => {
    const explorerHash = `0x${'cd'.repeat(32)}`;
    const oldLocalHash = `0x${'ef'.repeat(32)}`;
    await fakeBrowser.storage.local.set({
      [LOCAL_TX_KEY]: [mkRecord({ hash: oldLocalHash, createdAt: 500 })],
    });
    const page: HistoryPage = {
      items: [mkExplorerItem(explorerHash)],
      nextCursor: null,
      skipped: 0,
    };
    const merged = await mergeLocalRecords(page, OWN_ADDRESS);
    expect(merged.items.map((item) => item.hash)).toEqual([oldLocalHash, explorerHash]);
  });
});

describe('pruneLocalTx', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('removes only the records whose hashes were seen', async () => {
    const a = `0x${'aa'.repeat(32)}`;
    const b = `0x${'bb'.repeat(32)}`;
    const c = `0x${'cc'.repeat(32)}`;
    await fakeBrowser.storage.local.set({
      [LOCAL_TX_KEY]: [
        mkRecord({ hash: a, createdAt: 3000 }),
        mkRecord({ hash: b, createdAt: 2000 }),
        mkRecord({ hash: c, createdAt: 1000 }),
      ],
    });
    await pruneLocalTx([b.toUpperCase()]);
    const loaded = await loadLocalTxRecords();
    expect(loaded.map((record) => record.hash)).toEqual([a, c]);
  });

  it('matches case-insensitively and leaves unmatched records alone', async () => {
    const a = `0x${'aa'.repeat(32)}`;
    await fakeBrowser.storage.local.set({
      [LOCAL_TX_KEY]: [mkRecord({ hash: a, createdAt: 1000 })],
    });
    await pruneLocalTx([`0x${'ff'.repeat(32)}`]);
    const loaded = await loadLocalTxRecords();
    expect(loaded).toEqual([mkRecord({ hash: a, createdAt: 1000 })]);
  });

  it('does nothing when no hashes are given', async () => {
    await fakeBrowser.storage.local.set({
      [LOCAL_TX_KEY]: [mkRecord({ createdAt: 1000 })],
    });
    await pruneLocalTx([]);
    expect(await loadLocalTxRecords()).toHaveLength(1);
  });
});

describe('localPendingSublabel', () => {
  it('uses the pending sublabel under 30 minutes', () => {
    const createdAt = 1_000_000;
    expect(localPendingSublabel(createdAt, createdAt + LOCAL_STALE_AFTER_MS)).toBe(
      LOCAL_PENDING_SUBLABEL,
    );
  });

  it('switches to the stale sublabel after 30 minutes', () => {
    const createdAt = 1_000_000;
    expect(localPendingSublabel(createdAt, createdAt + LOCAL_STALE_AFTER_MS + 1)).toBe(
      LOCAL_STALE_SUBLABEL,
    );
  });

  it('uses the stale sublabel just after 30 minutes with fake timers', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      expect(localPendingSublabel(-LOCAL_STALE_AFTER_MS - 1)).toBe(LOCAL_STALE_SUBLABEL);
    } finally {
      vi.useRealTimers();
    }
  });
});