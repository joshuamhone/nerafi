import { formatTokenExact } from '../format';
import { isUnlimited } from './findings';

export const UNLIMITED_TEXT = 'Unlimited';
export const AMOUNT_UNAVAILABLE_TEXT = 'Amount unavailable';

// "Unlimited" at or above 2^255; otherwise the exact amount in the token's own
// decimals. Unreadable decimals are never guessed.
export function formatAllowance(allowance: bigint, decimals: number | null): string {
  if (isUnlimited(allowance)) return UNLIMITED_TEXT;
  if (decimals === null) return AMOUNT_UNAVAILABLE_TEXT;
  return formatTokenExact(allowance, decimals);
}
