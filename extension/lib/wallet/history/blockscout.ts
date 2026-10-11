import { getAddress, isAddress } from 'viem';
import type { ActivityDirection, ActivityItem, HistoryPage, HistoryProvider } from './types';
import { isTransactionHash } from './types';

export const BLOCKSCOUT_NAME = 'Blockscout';
export const BLOCKSCOUT_HOST = 'eth-sepolia.blockscout.com';
export const BLOCKSCOUT_TIMEOUT_MS = 10_000;

const MSG_NETWORK = 'Could not reach Blockscout.';
const MSG_HTTP = 'Blockscout returned an error.';
const MSG_RESPONSE = 'Blockscout returned an unreadable response.';

export class HistoryError extends Error {}

type AddressFlags = {
  hash: string;
  isContract: boolean;
  isScam: boolean;
  reputation: string | null;
};

function isValidAddress(value: unknown): value is string {
  return typeof value === 'string' && isAddress(value);
}

function parseAddressObject(value: unknown): AddressFlags | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!isValidAddress(record.hash)) return null;
  return {
    hash: getAddress(record.hash),
    isContract: record.is_contract === true,
    isScam: record.is_scam === true,
    reputation: typeof record.reputation === 'string' ? record.reputation : null,
  };
}

function parseWeiValue(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function parseBlockNumber(value: unknown): bigint | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function parseNonce(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function deriveStatus(status: unknown): 'confirmed' | 'failed' | 'pending' {
  if (status === 'error') return 'failed';
  if (status === 'ok') return 'confirmed';
  return 'pending';
}

function parseErrorMessage(status: 'confirmed' | 'failed' | 'pending', result: unknown): string | null {
  if (status !== 'failed') return null;
  if (typeof result !== 'string' || result === '') return null;
  return result.length > 200 ? result.slice(0, 200) : result;
}

function parseItem(raw: unknown, account: string): ActivityItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (!isTransactionHash(record.hash)) return null;
  const from = parseAddressObject(record.from);
  if (from === null) return null;
  const hasTo = record.to !== null && record.to !== undefined;
  const to = hasTo ? parseAddressObject(record.to) : null;
  if (hasTo && to === null) return null;

  const own = account.toLowerCase();
  const fromLower = from.hash.toLowerCase();
  const toLower = to === null ? null : to.hash.toLowerCase();
  const fromMatches = fromLower === own;
  const toMatches = toLower !== null && toLower === own;
  if (!fromMatches && !toMatches) return null;

  const valueWei = parseWeiValue(record.value);
  if (valueWei === null) return null;

  let feeWei: bigint | null = null;
  if (record.fee !== null && record.fee !== undefined) {
    const feeRecord = record.fee as Record<string, unknown>;
    feeWei = parseWeiValue(feeRecord.value);
  }

  const blockNumber = parseBlockNumber(record.block_number);
  const nonce = parseNonce(record.nonce);
  const status = deriveStatus(record.status);
  const errorMessage = parseErrorMessage(status, record.result);

  const createdContract =
    to === null ? (parseAddressObject(record.created_contract)?.hash ?? null) : null;

  let timestamp: number | null = null;
  if (typeof record.timestamp === 'string') {
    const parsed = Date.parse(record.timestamp);
    timestamp = Number.isNaN(parsed) ? null : parsed;
  }

  let direction: ActivityDirection;
  if (fromMatches && toMatches) {
    direction = 'self';
  } else if (fromMatches) {
    direction = 'out';
  } else {
    direction = 'in';
  }

  const counterparty = direction === 'out' ? to : from;

  return {
    hash: record.hash,
    from: from.hash,
    to: to === null ? null : to.hash,
    createdContract,
    valueWei,
    feeWei,
    status,
    errorMessage,
    timestamp,
    blockNumber,
    nonce,
    direction,
    isContractCall: to !== null && to.isContract,
    method: typeof record.method === 'string' ? record.method : null,
    explorerFlags: {
      counterpartyScam: counterparty?.isScam ?? false,
      counterpartyReputation: counterparty?.reputation ?? null,
    },
    source: 'explorer',
  };
}

function parseNextCursor(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null) return null;
  const cursor: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === 'string') cursor[key] = val;
    else if (typeof val === 'number') cursor[key] = String(val);
    else return null;
  }
  return cursor;
}

function parseExplorerResponse(json: unknown, account: string): HistoryPage {
  if (typeof json !== 'object' || json === null) throw new HistoryError(MSG_RESPONSE);
  const record = json as Record<string, unknown>;
  if (!Array.isArray(record.items)) throw new HistoryError(MSG_RESPONSE);
  let skipped = 0;
  const items: ActivityItem[] = [];
  for (const raw of record.items) {
    const item = parseItem(raw, account);
    if (item === null) skipped += 1;
    else items.push(item);
  }
  return { items, nextCursor: parseNextCursor(record.next_page_params), skipped };
}

async function fetchExplorerPage(
  url: URL,
  externalSignal: AbortSignal,
  account: string,
): Promise<HistoryPage> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  externalSignal.addEventListener('abort', onExternalAbort);
  if (externalSignal.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), BLOCKSCOUT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: controller.signal });
  } catch {
    throw new HistoryError(MSG_NETWORK);
  } finally {
    clearTimeout(timeout);
    externalSignal.removeEventListener('abort', onExternalAbort);
  }

  if (!response.ok) throw new HistoryError(MSG_HTTP);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new HistoryError(MSG_RESPONSE);
  }

  return parseExplorerResponse(json, account);
}

export function fetchTransactionsPage(
  address: string,
  cursor: Record<string, string> | null,
  signal: AbortSignal,
): Promise<HistoryPage> {
  const url = new URL(`https://${BLOCKSCOUT_HOST}/api/v2/addresses/${address}/transactions`);
  if (cursor !== null) {
    for (const [key, value] of Object.entries(cursor)) {
      url.searchParams.set(key, value);
    }
  }
  return fetchExplorerPage(url, signal, address);
}

export class BlockscoutProvider implements HistoryProvider {
  readonly name = BLOCKSCOUT_NAME;
  readonly host = BLOCKSCOUT_HOST;

  fetchPage(
    address: string,
    cursor: Record<string, string> | null,
    signal: AbortSignal,
  ): Promise<HistoryPage> {
    return fetchTransactionsPage(address, cursor, signal);
  }
}