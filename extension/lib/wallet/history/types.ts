import { isNativeEthLogAddress } from '../nativeEthLog';

export type ActivityDirection = 'out' | 'in' | 'self';

export type ActivityStatus = 'confirmed' | 'failed' | 'pending';

export type ActivitySource = 'explorer' | 'local';

export type ActivityItem = {
  hash: string;
  from: string;
  to: string | null;
  createdContract: string | null;
  valueWei: bigint;
  feeWei: bigint | null;
  status: ActivityStatus;
  errorMessage: string | null;
  timestamp: number | null;
  blockNumber: bigint | null;
  nonce: number | null;
  direction: ActivityDirection;
  isContractCall: boolean;
  method: string | null;
  explorerFlags: {
    counterpartyScam: boolean;
    counterpartyReputation: string | null;
  };
  source: ActivitySource;
};

export type HistoryPage = {
  items: ActivityItem[];
  nextCursor: Record<string, string> | null;
  skipped: number;
};

export type HistoryProvider = {
  name: string;
  host: string;
  fetchPage(
    address: string,
    cursor: Record<string, string> | null,
    signal: AbortSignal,
  ): Promise<HistoryPage>;
};

export function isTransactionHash(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

// ETH moved by a contract call inside a transaction (Blockscout "internal
// transactions"). Identified by its transaction hash plus its index.
export type InternalTransferItem = {
  kind: 'internal';
  hash: string;
  index: number;
  from: string;
  to: string | null;
  createdContract: string | null;
  valueWei: bigint;
  callType: string;
  success: boolean;
  // True when Blockscout reports success false OR any error text. A failed
  // internal transfer moved no ETH and is never shown as a movement.
  failed: boolean;
  errorMessage: string | null;
  timestamp: number | null;
  blockNumber: bigint | null;
  direction: ActivityDirection;
  explorerFlags: {
    counterpartyScam: boolean;
    counterpartyReputation: string | null;
  };
  source: 'explorer';
};

// An ERC-20 transfer reported by Blockscout. Everything about the token (symbol,
// name, decimals) is the explorer's claim and is untrusted. `decimals` is null
// when Blockscout did not give a usable value; it is never guessed.
export type TokenTransferItem = {
  kind: 'token';
  hash: string;
  logIndex: number;
  from: string;
  to: string;
  tokenAddress: string;
  tokenSymbol: string | null;
  tokenName: string | null;
  decimals: number | null;
  value: bigint;
  timestamp: number | null;
  blockNumber: bigint | null;
  direction: ActivityDirection;
  explorerFlags: {
    counterpartyScam: boolean;
    counterpartyReputation: string | null;
  };
  source: 'explorer';
};

export type FeedItem = ActivityItem | InternalTransferItem | TokenTransferItem;

export function isInternalItem(item: FeedItem): item is InternalTransferItem {
  return 'kind' in item && item.kind === 'internal';
}

export function isTokenItem(item: FeedItem): item is TokenTransferItem {
  return 'kind' in item && item.kind === 'token';
}

// A native-ETH transfer log from the system address. It is parsed like any other
// item but is not a token and is left out of token rows and token counts.
export function isNativeEthLog(item: FeedItem): boolean {
  return isTokenItem(item) && isNativeEthLogAddress(item.tokenAddress);
}

// Unique within a feed: a transaction can hold several transfers.
export function feedKey(item: FeedItem): string {
  if (isTokenItem(item)) return `${item.hash}:token:${item.logIndex}`;
  if (isInternalItem(item)) return `${item.hash}:internal:${item.index}`;
  return item.hash;
}

// A page from an endpoint that is only ever read once (first page).
export type ExtraPage<T> = {
  items: T[];
  hasMore: boolean;
  skipped: number;
};
