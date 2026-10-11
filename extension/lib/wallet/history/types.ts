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