import { isAddress } from 'viem';
import type { Address, Hex } from 'viem';
import type { Token } from '../tokens';
import type { RecipientCode } from './assess';

export const CODE_LOOKUP_TIMEOUT_MS = 8_000;

// The one network call the risk check makes: eth_getCode on the recipient.
export type CodeClient = {
  getCode(address: Address): Promise<Hex | undefined>;
};

function timeoutAfter(ms: number): { promise: Promise<'timeout'>; cancel: () => void } {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<'timeout'>((resolve) => {
    handle = setTimeout(() => resolve('timeout'), ms);
  });
  return {
    promise,
    cancel: () => {
      if (handle !== undefined) clearTimeout(handle);
    },
  };
}

// 'contract' when the address has code, 'eoa' when it has none, and 'unknown'
// for anything else: a thrown error, a timeout, an unexpected answer or an
// invalid address. A failed lookup is never reported as 'eoa'.
export async function gatherRecipientCode(
  client: CodeClient,
  address: string,
  timeoutMs: number = CODE_LOOKUP_TIMEOUT_MS,
): Promise<RecipientCode> {
  if (!isAddress(address)) return 'unknown';
  const timer = timeoutAfter(timeoutMs);
  try {
    const result = await Promise.race([client.getCode(address), timer.promise]);
    if (result === 'timeout') return 'unknown';
    if (result === undefined || result === '0x') return 'eoa';
    if (typeof result === 'string' && /^0x[0-9a-fA-F]+$/.test(result)) return 'contract';
    return 'unknown';
  } catch {
    return 'unknown';
  } finally {
    timer.cancel();
  }
}

// True when the recipient is the contract address of a token in the user's list
// (case-insensitive).
export function isListedTokenAddress(tokens: Token[], address: string): boolean {
  const lower = address.trim().toLowerCase();
  return tokens.some((token) => token.address.toLowerCase() === lower);
}

export type RecipientFacts = {
  recipientCode: RecipientCode;
  recipientIsListedToken: boolean;
};

// Everything the transaction check needs from outside: the contract lookup (the
// only network call) and the token-list comparison (local).
export async function gatherRecipientFacts(
  client: CodeClient,
  address: string,
  tokens: Token[],
  timeoutMs: number = CODE_LOOKUP_TIMEOUT_MS,
): Promise<RecipientFacts> {
  return {
    recipientCode: await gatherRecipientCode(client, address, timeoutMs),
    recipientIsListedToken: isListedTokenAddress(tokens, address),
  };
}

// A contract-lookup result stored together with the address it was fetched for.
export type CodeResultStore = { address: string; code: RecipientCode } | null;

export type CodeSelection = RecipientCode | 'pending';

// The cheque may use a stored lookup result only for the recipient it was
// fetched for (case-insensitive). Anything else, including no result at all, is
// 'pending': the cheque shows "Checking this address..." and signing stays off.
export function selectCodeResult(stored: CodeResultStore, currentAddress: string): CodeSelection {
  if (stored === null) return 'pending';
  if (stored.address.trim().toLowerCase() !== currentAddress.trim().toLowerCase()) {
    return 'pending';
  }
  return stored.code;
}
