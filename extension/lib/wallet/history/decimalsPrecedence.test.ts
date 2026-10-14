import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AMOUNT_UNAVAILABLE,
  signedTokenAmount,
  tokenAmountText,
  tokenDecimals,
} from './display';
import { parseTokenTransfersResponse } from './transfers';
import type { Token } from '../tokens';

type Raw = { items: Array<Record<string, unknown>>; next_page_params: unknown };

function load(file: string): Raw {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'),
  ) as Raw;
}

// Real USDC transfer: value 150000, Blockscout says 6 decimals (0.15 USDC).
const usdc = parseTokenTransfersResponse(
  load('token-transfers-live.json'),
  '0x69ffa62060b9e425166f35789C4EeAc69EFFB37b',
).items[0];
// Real transfer of a token Blockscout reports with null decimals.
const noDecimals = parseTokenTransfersResponse(
  load('token-transfers-nulldecimals-live.json'),
  '0x1Cd95D029a45f59c71AE0040e6A0a570091E3ac0',
).items[0];

function listed(address: string, decimals: number): Token {
  return { address, symbol: 'TKN', name: 'Token', decimals, addedAt: 1 };
}

describe('decimals precedence for transfer amounts', () => {
  it('a listed token uses the stored decimals even when the API disagrees', () => {
    if (usdc === undefined) return;
    expect(usdc.decimals).toBe(6);
    const tokens = [listed(usdc.tokenAddress, 18)];
    expect(tokenDecimals(usdc, tokens)).toBe(18);
    expect(tokenAmountText(usdc, tokens)).toBe('0.00000000000015');
    expect(signedTokenAmount({ ...usdc, direction: 'in' }, tokens)).toBe('+0.00000000000015');
  });

  it('matches the listed token by address in any letter case', () => {
    if (usdc === undefined) return;
    const tokens = [listed(usdc.tokenAddress.toLowerCase(), 18)];
    expect(tokenDecimals(usdc, tokens)).toBe(18);
  });

  it('a listed token with null API decimals still formats with the stored ones', () => {
    if (noDecimals === undefined) return;
    expect(noDecimals.decimals).toBeNull();
    const tokens = [listed(noDecimals.tokenAddress, 18)];
    expect(tokenAmountText(noDecimals, tokens)).toBe('0.01');
  });

  it('an unlisted token uses the API decimals', () => {
    if (usdc === undefined) return;
    expect(tokenDecimals(usdc, [])).toBe(6);
    expect(tokenAmountText(usdc, [])).toBe('0.15');
    // A different token in the list does not affect it.
    const other = [listed('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 18)];
    expect(tokenAmountText(usdc, other)).toBe('0.15');
  });

  it('an unlisted token with null API decimals is "Amount unavailable", never guessed', () => {
    if (noDecimals === undefined) return;
    expect(tokenDecimals(noDecimals, [])).toBeNull();
    expect(tokenAmountText(noDecimals, [])).toBe(AMOUNT_UNAVAILABLE);
    expect(signedTokenAmount(noDecimals, [])).toBe(AMOUNT_UNAVAILABLE);
  });

  it('an unlisted token with unusable API decimals is also unavailable', () => {
    if (usdc === undefined) return;
    expect(tokenAmountText({ ...usdc, decimals: null }, [])).toBe('Amount unavailable');
  });
});
