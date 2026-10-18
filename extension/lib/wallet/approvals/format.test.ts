import { describe, expect, it } from 'vitest';
import { AMOUNT_UNAVAILABLE_TEXT, formatAllowance, UNLIMITED_TEXT } from './format';

describe('formatAllowance', () => {
  it('shows "Unlimited" at 2^255', () => {
    expect(formatAllowance(2n ** 255n, 18)).toBe('Unlimited');
    expect(UNLIMITED_TEXT).toBe('Unlimited');
  });

  it('shows "Unlimited" above 2^255, including the largest value', () => {
    expect(formatAllowance(2n ** 256n - 1n, 6)).toBe('Unlimited');
    expect(formatAllowance(2n ** 255n + 1n, 0)).toBe('Unlimited');
  });

  it('does not say "Unlimited" one below 2^255', () => {
    expect(formatAllowance(2n ** 255n - 1n, 0)).toBe((2n ** 255n - 1n).toString());
    expect(formatAllowance(2n ** 255n - 1n, 0)).not.toBe('Unlimited');
  });

  it('formats an ordinary amount in full with the token decimals', () => {
    expect(formatAllowance(1_500_000n, 6)).toBe('1.5');
    expect(formatAllowance(1n, 18)).toBe('0.000000000000000001');
    expect(formatAllowance(42n, 0)).toBe('42');
    expect(formatAllowance(10n ** 24n, 18)).toBe('1000000');
  });

  it('says "Amount unavailable" when the decimals could not be read, and never guesses', () => {
    expect(formatAllowance(1_500_000n, null)).toBe('Amount unavailable');
    expect(AMOUNT_UNAVAILABLE_TEXT).toBe('Amount unavailable');
  });

  it('still says "Unlimited" when the decimals are unavailable, since the size no longer matters', () => {
    expect(formatAllowance(2n ** 256n - 1n, null)).toBe('Unlimited');
  });

  it('handles the maximum 36 decimals with integer maths', () => {
    expect(formatAllowance(10n ** 36n, 36)).toBe('1');
  });
});
