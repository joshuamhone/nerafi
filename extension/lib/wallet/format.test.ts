import { describe, expect, it } from 'vitest';
import { parseEther } from 'viem';
import { formatAtMost, formatBalance, formatExact } from './format';

const ONE_UNIT_WEI = 10n ** 12n;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s;
  };
}

function randomBigInt(next: () => number, bits: number): bigint {
  let out = 0n;
  for (let b = 0; b < bits; b += 32) {
    out = (out << 32n) | BigInt(next());
  }
  return out & ((1n << BigInt(bits)) - 1n);
}

describe('formatBalance (rounds down)', () => {
  it('is "0" for zero in every form', () => {
    expect(formatBalance(0n)).toBe('0');
  });

  it('hides any non-zero value below 0.000001', () => {
    for (const wei of [1n, 999n, ONE_UNIT_WEI - 1n, 5n * 10n ** 11n]) {
      expect(formatBalance(wei)).toBe('< 0.000001');
    }
  });

  it('shows exactly 0.000001 at the boundary', () => {
    expect(formatBalance(ONE_UNIT_WEI)).toBe('0.000001');
  });

  it('rounds the fifth decimal down', () => {
    expect(formatBalance(15n * 10n ** 11n)).toBe('0.000001');
  });

  it('trims trailing zeros', () => {
    expect(formatBalance(parseEther('1'))).toBe('1');
    expect(formatBalance(parseEther('1.0000009'))).toBe('1');
    expect(formatBalance(parseEther('1.5'))).toBe('1.5');
    expect(formatBalance(parseEther('1.05'))).toBe('1.05');
    expect(formatBalance(parseEther('1.230000'))).toBe('1.23');
    expect(formatBalance(parseEther('0.9999999'))).toBe('0.999999');
  });

  it('keeps six decimals when needed', () => {
    expect(formatBalance(parseEther('1.2345678'))).toBe('1.234567');
  });

  it('handles very large values', () => {
    expect(formatBalance(parseEther('123456789012345'))).toBe('123456789012345');
    expect(formatBalance(10n ** 30n)).toBe('1000000000000');
  });
});

describe('formatAtMost (rounds up)', () => {
  it('is "0" for zero', () => {
    expect(formatAtMost(0n)).toBe('0');
  });

  it('hides any non-zero value below 0.000001', () => {
    for (const wei of [1n, ONE_UNIT_WEI - 1n]) {
      expect(formatAtMost(wei)).toBe('< 0.000001');
    }
  });

  it('shows exactly 0.000001 at the boundary', () => {
    expect(formatAtMost(ONE_UNIT_WEI)).toBe('0.000001');
  });

  it('rounds the fifth decimal up', () => {
    expect(formatAtMost(15n * 10n ** 11n)).toBe('0.000002');
  });

  it('carries up across the whole-ether boundary', () => {
    expect(formatAtMost(parseEther('0.9999999'))).toBe('1');
    expect(formatAtMost(parseEther('1.0000009'))).toBe('1.000001');
  });

  it('keeps six decimals when needed', () => {
    expect(formatAtMost(parseEther('1.2345671'))).toBe('1.234568');
  });

  it('handles very large values', () => {
    expect(formatAtMost(10n ** 30n)).toBe('1000000000000');
  });
});

describe('formatExact', () => {
  it('keeps full viem precision', () => {
    expect(formatExact(parseEther('1.234567890123456789'))).toBe('1.234567890123456789');
  });

  it('is identical to viem formatEther', () => {
    expect(formatExact(10n ** 18n)).toBe('1');
    expect(formatExact(1n)).toBe('0.000000000000000001');
  });
});

describe('rounding invariants across many values', () => {
  it('formatBalance never overstates and is never more than one unit below', () => {
    const next = seeded(0xc0ffee);
    const values = Array.from({ length: 400 }, () => randomBigInt(next, 88));
    for (const x of values) {
      const text = formatBalance(x);
      if (x === 0n) {
        expect(text).toBe('0');
        continue;
      }
      if (text === '< 0.000001') {
        expect(x).toBeLessThan(ONE_UNIT_WEI);
        continue;
      }
      const parsed = parseEther(text);
      expect(parsed).toBeLessThanOrEqual(x);
      expect(x - parsed).toBeLessThan(ONE_UNIT_WEI);
    }
  });

  it('formatAtMost never understates and is never more than one unit above', () => {
    const next = seeded(0xbeef42);
    const values = Array.from({ length: 400 }, () => randomBigInt(next, 88));
    for (const x of values) {
      const text = formatAtMost(x);
      if (x === 0n) {
        expect(text).toBe('0');
        continue;
      }
      if (text === '< 0.000001') {
        expect(x).toBeLessThan(ONE_UNIT_WEI);
        continue;
      }
      const parsed = parseEther(text);
      expect(parsed).toBeGreaterThanOrEqual(x);
      expect(parsed - x).toBeLessThan(ONE_UNIT_WEI);
    }
  });

  it('atMost is at least balance by value', () => {
    const next = seeded(0x1234abcd);
    const values = Array.from({ length: 400 }, () => randomBigInt(next, 88));
    for (const x of values) {
      const b = formatBalance(x);
      const m = formatAtMost(x);
      if (b === '< 0.000001' || m === '< 0.000001') {
        expect(x).toBeGreaterThan(0n);
        expect(x).toBeLessThan(ONE_UNIT_WEI);
        continue;
      }
      expect(parseEther(m)).toBeGreaterThanOrEqual(parseEther(b));
    }
  });

  it('never emits more than six decimals', () => {
    const next = seeded(0xdecade);
    const values = Array.from({ length: 400 }, () => randomBigInt(next, 88));
    for (const x of values) {
      for (const text of [formatBalance(x), formatAtMost(x)]) {
        if (text === '< 0.000001') continue;
        const fraction = text.includes('.') ? (text.split('.')[1] ?? '') : '';
        expect(fraction.length).toBeLessThanOrEqual(6);
      }
    }
  });
});