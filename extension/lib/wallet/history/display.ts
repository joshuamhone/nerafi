import { formatExact, formatTokenExact } from '../format';
import { sanitizeTokenName, sanitizeTokenSymbol } from '../tokenText';
import type { Token } from '../tokens';
import type { InternalTransferItem, TokenTransferItem } from './types';

export const ZERO_VALUE_WARNING =
  'Zero-value transfer. Attackers use these to plant lookalike addresses in your history.';

export const AMOUNT_UNAVAILABLE = 'Amount unavailable';
export const UNLISTED_TOKEN = 'Unlisted token';

// Only an incoming zero-value transfer is a poisoning attempt; an outgoing one
// is the user's own action and gets no warning.
export function zeroValueWarning(item: TokenTransferItem): string | null {
  return item.direction === 'in' && item.value === 0n ? ZERO_VALUE_WARNING : null;
}

// Decimals for a transfer. A token in the user's list uses the decimals stored
// when it was added (read from the contract on-chain), even if Blockscout says
// something else. Only an unlisted token falls back to Blockscout's decimals,
// and null means "unavailable". Decimals are never guessed.
export function tokenDecimals(item: TokenTransferItem, tokens: Token[]): number | null {
  const lower = item.tokenAddress.toLowerCase();
  const listed = tokens.find((token) => token.address.toLowerCase() === lower);
  return listed !== undefined ? listed.decimals : item.decimals;
}

// The amount of a token transfer in full precision, or "Amount unavailable".
export function tokenAmountText(item: TokenTransferItem, tokens: Token[]): string {
  const decimals = tokenDecimals(item, tokens);
  if (decimals === null) return AMOUNT_UNAVAILABLE;
  return formatTokenExact(item.value, decimals);
}

function sign(direction: 'out' | 'in' | 'self'): string {
  if (direction === 'out') return '−';
  if (direction === 'in') return '+';
  return '';
}

export function signedTokenAmount(item: TokenTransferItem, tokens: Token[]): string {
  const decimals = tokenDecimals(item, tokens);
  if (decimals === null) return AMOUNT_UNAVAILABLE;
  return `${sign(item.direction)}${formatTokenExact(item.value, decimals)}`;
}

export const FAILED_INTERNAL_LABEL = 'Failed internal transfer';
export const NO_ETH_MOVED = 'No ETH moved';

export function internalLabel(item: InternalTransferItem): string {
  if (item.failed) return FAILED_INTERNAL_LABEL;
  if (item.direction === 'out') return 'Internal transfer out';
  if (item.direction === 'in') return 'Internal transfer in';
  return 'Internal transfer to yourself';
}

// A failed internal transfer moved nothing, so no amount is presented for it.
export function signedInternalAmount(item: InternalTransferItem): string {
  if (item.failed) return NO_ETH_MOVED;
  return `${sign(item.direction)}${formatExact(item.valueWei)}`;
}

// Only a successful internal transfer that carried ETH into the wallet counts
// as something received.
export function isReceivedInternal(item: InternalTransferItem): boolean {
  return !item.failed && item.direction === 'in' && item.valueWei > 0n;
}

export type TokenIdentity = {
  listed: boolean;
  // What to print next to an amount: the symbol from the user's own list for a
  // listed token, the fixed words "Unlisted token" otherwise.
  unit: string;
  // The explorer's own symbol and name, sanitised. Untrusted; shown only in the
  // detail view for an unlisted token.
  reportedSymbol: string | null;
  reportedName: string | null;
};

// The contract address is the identity. A listed token is recognised by its
// address and shown with the symbol the user saw when adding it.
export function tokenIdentity(item: TokenTransferItem, tokens: Token[]): TokenIdentity {
  const lower = item.tokenAddress.toLowerCase();
  const listed = tokens.find((token) => token.address.toLowerCase() === lower);
  return {
    listed: listed !== undefined,
    unit: listed !== undefined ? listed.symbol : UNLISTED_TOKEN,
    reportedSymbol: item.tokenSymbol === null ? null : sanitizeTokenSymbol(item.tokenSymbol),
    reportedName: item.tokenName === null ? null : sanitizeTokenName(item.tokenName),
  };
}
