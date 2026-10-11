import { getAddress, isAddress } from 'viem';
import { browser } from 'wxt/browser';
import type { ActivityDirection, ActivityItem, HistoryPage } from './types';
import { isTransactionHash } from './types';

export const LOCAL_TX_KEY = 'nerafi.localTx';
export const LOCAL_TX_LIMIT = 50;
export const LOCAL_STALE_AFTER_MS = 30 * 60 * 1000;
export const LOCAL_PENDING_SUBLABEL = 'Sent from Nerafi · not yet indexed by Blockscout';
export const LOCAL_STALE_SUBLABEL =
  'Not seen by the network after 30 minutes. It may have been dropped. Check your balance before sending again.';

export type LocalTxRecord = {
  hash: string;
  from: string;
  to: string;
  valueWei: string;
  nonce: number | null;
  createdAt: number;
};

function isValidAddress(value: unknown): value is string {
  return typeof value === 'string' && isAddress(value);
}

export function parseLocalTxRecord(value: unknown): LocalTxRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = ['createdAt', 'from', 'hash', 'nonce', 'to', 'valueWei'];
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) return null;
  if (!isTransactionHash(record.hash)) return null;
  if (!isValidAddress(record.from) || !isValidAddress(record.to)) return null;
  if (typeof record.valueWei !== 'string' || !/^\d+$/.test(record.valueWei)) return null;
  if (
    record.nonce !== null &&
    (typeof record.nonce !== 'number' || !Number.isSafeInteger(record.nonce))
  ) {
    return null;
  }
  if (typeof record.createdAt !== 'number' || !Number.isFinite(record.createdAt)) return null;
  return {
    hash: record.hash,
    from: getAddress(record.from),
    to: getAddress(record.to),
    valueWei: record.valueWei,
    nonce: record.nonce as number | null,
    createdAt: record.createdAt,
  };
}

export async function loadLocalTxRecords(): Promise<LocalTxRecord[]> {
  const stored = await browser.storage.local.get(LOCAL_TX_KEY);
  const raw = stored[LOCAL_TX_KEY];
  if (!Array.isArray(raw)) return [];
  const records = raw.filter(parseLocalTxRecord);
  records.sort((a, b) => b.createdAt - a.createdAt);
  return records.slice(0, LOCAL_TX_LIMIT);
}

export async function saveLocalTx(record: LocalTxRecord): Promise<void> {
  const current = await loadLocalTxRecords();
  const next = [record, ...current.filter((item) => item.hash !== record.hash)].slice(
    0,
    LOCAL_TX_LIMIT,
  );
  await browser.storage.local.set({ [LOCAL_TX_KEY]: next });
}

export async function pruneLocalTx(hashes: string[]): Promise<void> {
  if (hashes.length === 0) return;
  const lowered = new Set(hashes.map((hash) => hash.toLowerCase()));
  const current = await loadLocalTxRecords();
  const remaining = current.filter((record) => !lowered.has(record.hash.toLowerCase()));
  if (remaining.length === current.length) return;
  await browser.storage.local.set({ [LOCAL_TX_KEY]: remaining });
}

export function localPendingSublabel(createdAt: number, now: number = Date.now()): string {
  if (now - createdAt > LOCAL_STALE_AFTER_MS) return LOCAL_STALE_SUBLABEL;
  return LOCAL_PENDING_SUBLABEL;
}

export function localRecordToItem(record: LocalTxRecord, account: string): ActivityItem {
  const own = account.toLowerCase();
  const from = record.from.toLowerCase();
  const to = record.to.toLowerCase();
  let direction: ActivityDirection;
  if (from === own && to === own) {
    direction = 'self';
  } else if (from === own) {
    direction = 'out';
  } else if (to === own) {
    direction = 'in';
  } else {
    direction = 'out';
  }
  return {
    hash: record.hash,
    from: record.from,
    to: record.to,
    createdContract: null,
    valueWei: BigInt(record.valueWei),
    feeWei: null,
    status: 'pending',
    errorMessage: null,
    timestamp: record.createdAt,
    blockNumber: null,
    nonce: record.nonce,
    direction,
    isContractCall: false,
    method: null,
    explorerFlags: { counterpartyScam: false, counterpartyReputation: null },
    source: 'local',
  };
}

export async function mergeLocalRecords(page: HistoryPage, account: string): Promise<HistoryPage> {
  const records = await loadLocalTxRecords();
  const seen = new Set(page.items.map((item) => item.hash.toLowerCase()));
  let oldestOnPage: number | null = null;
  for (const item of page.items) {
    if (item.timestamp === null) continue;
    if (oldestOnPage === null || item.timestamp < oldestOnPage) oldestOnPage = item.timestamp;
  }
  const localItems: ActivityItem[] = [];
  for (const record of records) {
    if (seen.has(record.hash.toLowerCase())) continue;
    if (page.nextCursor !== null && oldestOnPage !== null && record.createdAt <= oldestOnPage) {
      continue;
    }
    localItems.push(localRecordToItem(record, account));
  }
  localItems.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return { items: [...localItems, ...page.items], nextCursor: page.nextCursor, skipped: page.skipped };
}