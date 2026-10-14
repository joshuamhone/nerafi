import { describe, expect, it } from 'vitest';
import { formatTokenBalance, formatTokenExact } from './format';

describe('formatTokenBalance', () => {
  it('shows zero as 0', () => {
    expect(formatTokenBalance(0n, 18)).toBe('0');
  });

  it('formats whole and fractional amounts', () => {
    expect(formatTokenBalance(1_500_000n, 6)).toBe('1.5');
    expect(formatTokenBalance(2_000_000n, 6)).toBe('2');
    expect(formatTokenBalance(7n, 0)).toBe('7');
  });

  it('rounds down, never up', () => {
    expect(formatTokenBalance(1_999_999_999_999_999_999n, 18)).toBe('1.999999');
  });

  it('never shows a tiny non-zero amount as 0', () => {
    expect(formatTokenBalance(1n, 18)).toBe('< 0.000001');
    expect(formatTokenBalance(999_999_999_999n, 18)).toBe('< 0.000001');
    expect(formatTokenBalance(1_000_000_000_000n, 18)).toBe('0.000001');
  });

  it('shows the smallest unit of a low-decimal token in full', () => {
    expect(formatTokenBalance(1n, 6)).toBe('0.000001');
    expect(formatTokenBalance(1n, 2)).toBe('0.01');
  });

  it('handles the maximum 36 decimals with bigint maths', () => {
    expect(formatTokenBalance(10n ** 36n, 36)).toBe('1');
  });

  it('keeps the exact form available', () => {
    expect(formatTokenExact(1n, 18)).toBe('0.000000000000000001');
    expect(formatTokenExact(1_234_567n, 6)).toBe('1.234567');
  });
});
