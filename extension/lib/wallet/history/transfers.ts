import { getAddress, isAddress } from 'viem';
import {
  BLOCKSCOUT_HOST,
  fetchExplorerJson,
  HistoryError,
  parseAddressObject,
  parseBlockNumber,
  parseWeiValue,
} from './blockscout';
import { isTransactionHash } from './types';
import type {
  ActivityDirection,
  ExtraPage,
  InternalTransferItem,
  TokenTransferItem,
} from './types';

const MSG_RESPONSE = 'Blockscout returned an unreadable response.';
const MAX_DECIMALS = 36;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

// Blockscout sends decimals as a decimal string ("6") or null. Anything else is
// treated as "not available" rather than guessed, so the amount shows as
// unavailable instead of being scaled wrongly.
function parseDecimals(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,2}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed <= MAX_DECIMALS ? parsed : null;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function directionOf(fromMatches: boolean, toMatches: boolean): ActivityDirection {
  if (fromMatches && toMatches) return 'self';
  return fromMatches ? 'out' : 'in';
}

export function parseTokenTransfer(raw: unknown, account: string): TokenTransferItem | null {
  if (!isRecord(raw)) return null;
  if (raw.type !== 'token_transfer') return null;
  if (raw.token_type !== 'ERC-20') return null;
  if (!isTransactionHash(raw.transaction_hash)) return null;
  const logIndex = parseIndex(raw.log_index);
  if (logIndex === null) return null;

  const from = parseAddressObject(raw.from);
  const to = parseAddressObject(raw.to);
  if (from === null || to === null) return null;

  const own = account.toLowerCase();
  const fromMatches = from.hash.toLowerCase() === own;
  const toMatches = to.hash.toLowerCase() === own;
  if (!fromMatches && !toMatches) return null;

  if (!isRecord(raw.token)) return null;
  const tokenHash = raw.token.address_hash;
  if (typeof tokenHash !== 'string' || !isAddress(tokenHash)) return null;

  if (!isRecord(raw.total)) return null;
  const value = parseWeiValue(raw.total.value);
  if (value === null) return null;

  // The transfer's own decimals win; the token's are only used when the
  // transfer carries none. If neither is usable the amount is unavailable.
  const decimals = parseDecimals(raw.total.decimals) ?? parseDecimals(raw.token.decimals);

  const direction = directionOf(fromMatches, toMatches);
  const counterparty = direction === 'out' ? to : from;

  return {
    kind: 'token',
    hash: raw.transaction_hash,
    logIndex,
    from: from.hash,
    to: to.hash,
    tokenAddress: getAddress(tokenHash),
    tokenSymbol: typeof raw.token.symbol === 'string' ? raw.token.symbol : null,
    tokenName: typeof raw.token.name === 'string' ? raw.token.name : null,
    decimals,
    value,
    timestamp: parseTimestamp(raw.timestamp),
    blockNumber: parseBlockNumber(raw.block_number),
    direction,
    explorerFlags: {
      counterpartyScam: counterparty.isScam,
      counterpartyReputation: counterparty.reputation,
    },
    source: 'explorer',
  };
}

export function parseInternalTransfer(raw: unknown, account: string): InternalTransferItem | null {
  if (!isRecord(raw)) return null;
  if (!isTransactionHash(raw.transaction_hash)) return null;
  const index = parseIndex(raw.index);
  if (index === null) return null;
  if (typeof raw.type !== 'string' || raw.type === '') return null;
  if (typeof raw.success !== 'boolean') return null;

  const from = parseAddressObject(raw.from);
  if (from === null) return null;
  const hasTo = raw.to !== null && raw.to !== undefined;
  const to = hasTo ? parseAddressObject(raw.to) : null;
  if (hasTo && to === null) return null;

  const hasCreated = raw.created_contract !== null && raw.created_contract !== undefined;
  const created = hasCreated ? parseAddressObject(raw.created_contract) : null;
  if (hasCreated && created === null) return null;

  // A contract creation reports `to: null` and names the new contract in
  // `created_contract`, so the account can be involved as that contract.
  const own = account.toLowerCase();
  const fromMatches = from.hash.toLowerCase() === own;
  const toMatches =
    (to !== null && to.hash.toLowerCase() === own) ||
    (created !== null && created.hash.toLowerCase() === own);
  if (!fromMatches && !toMatches) return null;

  const valueWei = parseWeiValue(raw.value);
  if (valueWei === null) return null;

  if (raw.error !== null && raw.error !== undefined && typeof raw.error !== 'string') return null;

  const direction = directionOf(fromMatches, toMatches);
  const counterparty = direction === 'out' ? to : from;
  const failed = !raw.success || (typeof raw.error === 'string' && raw.error !== '');

  return {
    kind: 'internal',
    hash: raw.transaction_hash,
    index,
    from: from.hash,
    to: to === null ? null : to.hash,
    createdContract: created === null ? null : created.hash,
    valueWei,
    callType: raw.type,
    success: raw.success,
    failed,
    errorMessage:
      typeof raw.error === 'string' && raw.error !== '' ? raw.error.slice(0, 200) : null,
    timestamp: parseTimestamp(raw.timestamp),
    blockNumber: parseBlockNumber(raw.block_number),
    direction,
    explorerFlags: {
      counterpartyScam: counterparty?.isScam ?? false,
      counterpartyReputation: counterparty?.reputation ?? null,
    },
    source: 'explorer',
  };
}

function parseExtraPage<T>(
  json: unknown,
  account: string,
  parseItem: (raw: unknown, account: string) => T | null,
): ExtraPage<T> {
  if (!isRecord(json) || !Array.isArray(json.items)) throw new HistoryError(MSG_RESPONSE);
  const items: T[] = [];
  let skipped = 0;
  for (const raw of json.items) {
    const item = parseItem(raw, account);
    if (item === null) skipped += 1;
    else items.push(item);
  }
  // Only the first page is ever read; a cursor just means there is more.
  return { items, hasMore: json.next_page_params !== null && json.next_page_params !== undefined, skipped };
}

export function parseTokenTransfersResponse(
  json: unknown,
  account: string,
): ExtraPage<TokenTransferItem> {
  return parseExtraPage(json, account, parseTokenTransfer);
}

export function parseInternalTransfersResponse(
  json: unknown,
  account: string,
): ExtraPage<InternalTransferItem> {
  return parseExtraPage(json, account, parseInternalTransfer);
}

function addressUrl(address: string, path: string): URL {
  const url = new URL(`https://${BLOCKSCOUT_HOST}/api/v2/addresses/${address}/${path}`);
  return url;
}

export async function fetchTokenTransfers(
  address: string,
  signal: AbortSignal,
): Promise<ExtraPage<TokenTransferItem>> {
  const url = addressUrl(address, 'token-transfers');
  url.searchParams.set('type', 'ERC-20');
  return parseTokenTransfersResponse(await fetchExplorerJson(url, signal), address);
}

export async function fetchInternalTransfers(
  address: string,
  signal: AbortSignal,
): Promise<ExtraPage<InternalTransferItem>> {
  const url = addressUrl(address, 'internal-transactions');
  return parseInternalTransfersResponse(await fetchExplorerJson(url, signal), address);
}
