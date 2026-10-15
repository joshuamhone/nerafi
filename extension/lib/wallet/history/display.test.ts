import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AMOUNT_UNAVAILABLE,
  signedInternalAmount,
  signedTokenAmount,
  tokenAmountText,
  tokenIdentity,
  UNLISTED_TOKEN,
  ZERO_VALUE_WARNING,
  zeroValueWarning,
} from './display';
import { parseInternalTransfersResponse, parseTokenTransfersResponse } from './transfers';
import type { Token } from '../tokens';

type Raw = { items: Array<Record<string, unknown>>; next_page_params: unknown };

function load(file: string): Raw {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'),
  ) as Raw;
}

const ZERO_ACCOUNT = '0x5496c4A6e05B166dAd2Aa0fab641B2E963A300D4';
const zeroPage = parseTokenTransfersResponse(load('token-transfers-zero-live.json'), ZERO_ACCOUNT);
const zeroIncoming = zeroPage.items.find((item) => item.value === 0n);
const normal = parseTokenTransfersResponse(
  load('token-transfers-live.json'),
  '0x69ffa62060b9e425166f35789C4EeAc69EFFB37b',
).items[0];
// The null-metadata items in token-transfers-native-eth-live.json are native-ETH
// transfer logs from the system address, not tokens, and no live token with null
// metadata turned up. So this stand-in is SYNTHETIC: the real item with a
// different (ordinary) token address.
const nativeRaw = load('token-transfers-native-eth-live.json');
const nativeFirst = nativeRaw.items[0] ?? {};
const noDecimals = parseTokenTransfersResponse(
  {
    items: [
      {
        ...nativeFirst,
        token: {
          ...(nativeFirst.token as Record<string, unknown>),
          address_hash: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        },
      },
    ],
    next_page_params: null,
  },
  '0x1Cd95D029a45f59c71AE0040e6A0a570091E3ac0',
).items[0];

describe('zero-value warning', () => {
  it('warns on an incoming zero-value transfer with the exact sentence', () => {
    expect(zeroIncoming?.direction).toBe('in');
    if (zeroIncoming === undefined) return;
    expect(zeroValueWarning(zeroIncoming)).toBe(
      'Zero-value transfer. Attackers use these to plant lookalike addresses in your history.',
    );
    expect(ZERO_VALUE_WARNING).toBe(zeroValueWarning(zeroIncoming));
  });

  it('does not warn on an outgoing zero-value transfer', () => {
    if (zeroIncoming === undefined) return;
    expect(zeroValueWarning({ ...zeroIncoming, direction: 'out' })).toBeNull();
    expect(zeroValueWarning({ ...zeroIncoming, direction: 'self' })).toBeNull();
  });

  it('does not warn on an incoming transfer that carries value', () => {
    const withValue = zeroPage.items.find((item) => item.value > 0n);
    expect(withValue?.direction).toBe('in');
    if (withValue === undefined) return;
    expect(zeroValueWarning(withValue)).toBeNull();
  });
});

describe('token amounts', () => {
  it('formats with the transfer decimals, in full', () => {
    if (normal === undefined) return;
    expect(tokenAmountText(normal, [])).toBe('0.15');
    expect(signedTokenAmount({ ...normal, direction: 'out' }, [])).toBe('−0.15');
    expect(signedTokenAmount({ ...normal, direction: 'in' }, [])).toBe('+0.15');
  });

  it('says "Amount unavailable" when decimals are missing, and never guesses', () => {
    expect(noDecimals?.decimals).toBeNull();
    if (noDecimals === undefined) return;
    expect(tokenAmountText(noDecimals, [])).toBe(AMOUNT_UNAVAILABLE);
    expect(signedTokenAmount(noDecimals, [])).toBe(AMOUNT_UNAVAILABLE);
    expect(AMOUNT_UNAVAILABLE).toBe('Amount unavailable');
  });

  it('shows a zero-decimal token as a whole number', () => {
    if (zeroIncoming === undefined) return;
    expect(tokenAmountText({ ...zeroIncoming, value: 7n }, [])).toBe('7');
  });
});

describe('internal amounts', () => {
  it('signs and formats ETH in full precision', () => {
    const page = parseInternalTransfersResponse(
      load('internal-transactions-value-live.json'),
      '0x5cEF1DCe626bDf94D864eb5CAEBD8d9A5101CC61',
    );
    expect(signedInternalAmount(page.items[0] as (typeof page.items)[number])).toBe(
      '+12.164318985972243573',
    );
  });
});

describe('token identity', () => {
  const listed: Token = {
    address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addedAt: 1,
  };

  it('uses the symbol from the user list for a listed token', () => {
    if (normal === undefined) return;
    const identity = tokenIdentity({ ...normal, tokenSymbol: 'SCAM' }, [listed]);
    expect(identity.listed).toBe(true);
    expect(identity.unit).toBe('USDC');
  });

  it('recognises a listed token by address in any letter case', () => {
    if (normal === undefined) return;
    const identity = tokenIdentity(normal, [{ ...listed, address: listed.address.toLowerCase() }]);
    expect(identity.listed).toBe(true);
  });

  it('labels an unlisted token "Unlisted token", whatever its symbol says', () => {
    if (normal === undefined) return;
    const identity = tokenIdentity({ ...normal, tokenSymbol: 'USDC' }, []);
    expect(identity.listed).toBe(false);
    expect(identity.unit).toBe(UNLISTED_TOKEN);
    expect(UNLISTED_TOKEN).toBe('Unlisted token');
  });

  it('sanitises the reported symbol and name', () => {
    if (normal === undefined) return;
    const identity = tokenIdentity(
      { ...normal, tokenSymbol: 'U‮SD​C', tokenName: 'Evil\u0000 \n Coin' },
      [],
    );
    expect(identity.reportedSymbol).toBe('USDC');
    expect(identity.reportedName).toBe('Evil Coin');
  });

  it('leaves reported text null when Blockscout gave none', () => {
    if (noDecimals === undefined) return;
    const identity = tokenIdentity(noDecimals, []);
    expect(identity.reportedSymbol).toBeNull();
    expect(identity.reportedName).toBeNull();
  });

  it('never adds anything to the list', () => {
    if (normal === undefined) return;
    const tokens: Token[] = [];
    tokenIdentity(normal, tokens);
    expect(tokens).toHaveLength(0);
  });
});
