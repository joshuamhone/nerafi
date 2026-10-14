import { describe, expect, it } from 'vitest';
import {
  sanitizeTokenName,
  sanitizeTokenSymbol,
  sanitizeTokenText,
  UNKNOWN_TOKEN,
} from './tokenText';

describe('sanitizeTokenText', () => {
  it('leaves ordinary text alone', () => {
    expect(sanitizeTokenSymbol('USDC')).toBe('USDC');
    expect(sanitizeTokenName('USD Coin')).toBe('USD Coin');
  });

  it('removes control characters', () => {
    expect(sanitizeTokenSymbol('US\u0000D\u0007C\u007f')).toBe('USDC');
  });

  it('turns tabs and newlines into single spaces', () => {
    expect(sanitizeTokenName('Free\n\n Token\t Name')).toBe('Free Token Name');
  });

  it('removes every bidi control character', () => {
    const bidi = ['‪', '‫', '‬', '‭', '‮', '⁦', '⁧', '⁨', '⁩'];
    for (const mark of bidi) {
      expect(sanitizeTokenSymbol(`AB${mark}CD`)).toBe('ABCD');
    }
    // A right-to-left override cannot reverse what follows it.
    expect(sanitizeTokenName('Safe ‮gnp.exe')).toBe('Safe gnp.exe');
  });

  it('removes zero-width characters', () => {
    const zeroWidth = ['​', '‌', '‍', '‎', '‏', '⁠', '﻿'];
    for (const mark of zeroWidth) {
      expect(sanitizeTokenSymbol(`U${mark}S${mark}DC`)).toBe('USDC');
    }
  });

  it('collapses runs of whitespace and trims', () => {
    expect(sanitizeTokenName('   Wrapped    Ether   ')).toBe('Wrapped Ether');
    expect(sanitizeTokenName('A B C D')).toBe('A B C D');
  });

  it('truncates the symbol to 11 and the name to 40 code points', () => {
    expect(sanitizeTokenSymbol('ABCDEFGHIJKLMNOP')).toBe('ABCDEFGHIJK');
    expect(sanitizeTokenName('x'.repeat(60))).toBe('x'.repeat(40));
  });

  it('counts code points, not UTF-16 units, when truncating', () => {
    const result = sanitizeTokenSymbol('\u{1F600}'.repeat(20));
    expect([...result]).toHaveLength(11);
  });

  it('does not leave a trailing space after truncation', () => {
    expect(sanitizeTokenText('abcde fghij', 6)).toBe('abcde');
  });

  it('returns "Unknown token" when nothing is left', () => {
    expect(sanitizeTokenSymbol('')).toBe(UNKNOWN_TOKEN);
    expect(sanitizeTokenSymbol('   ')).toBe(UNKNOWN_TOKEN);
    expect(sanitizeTokenName('‮​\u0000')).toBe(UNKNOWN_TOKEN);
  });
});
