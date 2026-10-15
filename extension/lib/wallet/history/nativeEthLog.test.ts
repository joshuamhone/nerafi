import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeFeed } from './combined';
import { tokenAmountText, tokenIdentity } from './display';
import { parseTokenTransfersResponse } from './transfers';
import { isNativeEthLog } from './types';
import type { FeedItem, TokenTransferItem } from './types';
import { findFeedItem } from '../../../entrypoints/wallet/pages/activityUtils';
import { isNativeEthLogAddress, NATIVE_ETH_LOG_ADDRESS } from '../nativeEthLog';
import type { KnownAddress } from '../lookalike';
import { assessWallet } from '../risk/posture';
import type { PostureInput } from '../risk/posture';
import { sameSymbolAddresses } from '../tokens';
import type { Token } from '../tokens';

type Raw = { items: Array<Record<string, unknown>>; next_page_params: unknown };

function load(file: string): Raw {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'),
  ) as Raw;
}

const SYSTEM_MIXED_CASE = '0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE';
const REAL_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const OTHER_TOKEN = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const KNOWN = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const LOOKALIKE_SENDER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C9';

// Real native-ETH transfer logs (Blockscout "ERC-20" transfers from the system
// address). The account is the receiving side of the first item, so it reads as
// an incoming transfer.
const nativeRaw = load('token-transfers-native-eth-live.json');
const nativeFirst = nativeRaw.items[0] ?? {};
const nativeAccount = String((nativeFirst.to as { hash: string }).hash);
const nativeItems = parseTokenTransfersResponse(nativeRaw, String((nativeFirst.from as { hash: string }).hash)).items;
const nativeIncoming = parseTokenTransfersResponse(
  { items: [nativeFirst], next_page_params: null },
  nativeAccount,
).items[0];

// A real, ordinary token transfer (USDC).
const usdcRaw = load('token-transfers-live.json');
const usdcAccount = '0x69ffa62060b9e425166f35789C4EeAc69EFFB37b';
const usdcItems = parseTokenTransfersResponse(usdcRaw, usdcAccount).items;
const usdcIncoming = usdcItems.find((item) => item.direction === 'in');

// A real token with null metadata would look like the native item but with an
// ordinary token address. None turned up live (1,750 transfers scanned), so this
// is a SYNTHETIC variation of a real item: the real item with a different token
// address.
const nullMetadataToken = parseTokenTransfersResponse(
  {
    items: [
      {
        ...nativeFirst,
        token: {
          ...(nativeFirst.token as Record<string, unknown>),
          address_hash: OTHER_TOKEN,
        },
      },
    ],
    next_page_params: null,
  },
  nativeAccount,
).items[0];

function tokenRow(overrides: Partial<TokenTransferItem>): TokenTransferItem {
  if (usdcIncoming === undefined) throw new Error('fixture missing');
  return { ...usdcIncoming, ...overrides };
}

describe('the native-ETH log address', () => {
  it('is the system address, written in lower case', () => {
    expect(NATIVE_ETH_LOG_ADDRESS).toBe('0xfffffffffffffffffffffffffffffffffffffffe');
  });

  it('matches every letter-case form, and only that exact address', () => {
    expect(isNativeEthLogAddress(NATIVE_ETH_LOG_ADDRESS)).toBe(true);
    expect(isNativeEthLogAddress(SYSTEM_MIXED_CASE)).toBe(true);
    expect(isNativeEthLogAddress(`0x${NATIVE_ETH_LOG_ADDRESS.slice(2).toUpperCase()}`)).toBe(true);
    expect(isNativeEthLogAddress(` ${SYSTEM_MIXED_CASE} `)).toBe(true);
  });

  it('does not match near misses or ordinary addresses', () => {
    expect(isNativeEthLogAddress('0xfffffffffffffffffffffffffffffffffffffffd')).toBe(false);
    expect(isNativeEthLogAddress('0xffffffffffffffffffffffffffffffffffffffff')).toBe(false);
    expect(isNativeEthLogAddress('0xeffffffffffffffffffffffffffffffffffffffe')).toBe(false);
    expect(isNativeEthLogAddress(REAL_USDC)).toBe(false);
    expect(isNativeEthLogAddress('')).toBe(false);
  });
});

describe('real native-ETH log items from the fixture', () => {
  it('are all emitted from the system address and carry null metadata', () => {
    expect(nativeItems.length).toBeGreaterThan(0);
    for (const item of nativeItems) {
      expect(isNativeEthLogAddress(item.tokenAddress)).toBe(true);
      expect(item.tokenSymbol).toBeNull();
      expect(item.tokenName).toBeNull();
      expect(item.decimals).toBeNull();
      expect(isNativeEthLog(item)).toBe(true);
    }
  });

  it('are parsed normally and never counted as entries that could not be read', () => {
    const page = parseTokenTransfersResponse(
      nativeRaw,
      String((nativeFirst.from as { hash: string }).hash),
    );
    expect(page.skipped).toBe(0);
    expect(page.items).toHaveLength(nativeRaw.items.length);
  });
});

describe('Activity rows', () => {
  it('leave out native-ETH logs and keep every other kind of row', () => {
    if (nativeIncoming === undefined || usdcIncoming === undefined || nullMetadataToken === undefined) {
      throw new Error('fixture missing');
    }
    const merged = mergeFeed([], [], [...nativeItems, nativeIncoming, usdcIncoming, nullMetadataToken]);
    expect(merged.some(isNativeEthLog)).toBe(false);
    expect(merged).toHaveLength(2);
    expect(merged).toContain(usdcIncoming);
    expect(merged).toContain(nullMetadataToken);
  });

  it('an ordinary token transfer is unaffected', () => {
    if (usdcIncoming === undefined) throw new Error('fixture missing');
    expect(mergeFeed([], [], usdcItems)).toHaveLength(usdcItems.length);
    expect(isNativeEthLog(usdcIncoming)).toBe(false);
  });

  it('a token with null metadata still shows, as an unlisted token with no amount', () => {
    if (nullMetadataToken === undefined) throw new Error('fixture missing');
    expect(nullMetadataToken.tokenSymbol).toBeNull();
    expect(nullMetadataToken.decimals).toBeNull();
    const merged = mergeFeed([], [], [nullMetadataToken]);
    expect(merged).toEqual([nullMetadataToken]);
    expect(tokenIdentity(nullMetadataToken, []).unit).toBe('Unlisted token');
    expect(tokenAmountText(nullMetadataToken, [])).toBe('Amount unavailable');
  });

  it('nothing is hidden because its metadata is null: only the exact address is', () => {
    if (nativeIncoming === undefined) throw new Error('fixture missing');
    // Same metadata (all null), different address: shown. Native address: hidden.
    expect(mergeFeed([], [], [{ ...nativeIncoming, tokenAddress: OTHER_TOKEN }])).toHaveLength(1);
    expect(mergeFeed([], [], [nativeIncoming])).toHaveLength(0);
    // A real token that does report its metadata is, of course, shown.
    expect(mergeFeed([], [], [tokenRow({})])).toHaveLength(1);
  });
});

describe('detail links for a native-ETH log', () => {
  it('find nothing, so the existing "not in the loaded history" message is used', () => {
    if (nativeIncoming === undefined || usdcIncoming === undefined) throw new Error('fixture missing');
    const feed = mergeFeed([], [], [nativeIncoming, usdcIncoming]);
    const ref = { kind: 'token', hash: nativeIncoming.hash, index: nativeIncoming.logIndex } as const;
    expect(() => findFeedItem(feed, ref)).not.toThrow();
    expect(findFeedItem(feed, ref)).toBeUndefined();
  });

  it('still find an ordinary token row', () => {
    if (usdcIncoming === undefined) throw new Error('fixture missing');
    const feed = mergeFeed([], [], [usdcIncoming]);
    expect(
      findFeedItem(feed, { kind: 'token', hash: usdcIncoming.hash, index: usdcIncoming.logIndex }),
    ).toBe(usdcIncoming);
  });

  it('find nothing for a link to an empty feed', () => {
    expect(findFeedItem([], { kind: 'token', hash: `0x${'a'.repeat(64)}`, index: 1 })).toBeUndefined();
    expect(findFeedItem([], { kind: 'transaction', hash: `0x${'a'.repeat(64)}` })).toBeUndefined();
  });
});

describe('Security Center counts', () => {
  const known: KnownAddress[] = [{ address: KNOWN, label: 'Alice', kind: 'contact' }];
  const listed: Token = { address: REAL_USDC, symbol: 'USDC', name: 'USD Coin', decimals: 6, addedAt: 1 };

  function posture(items: FeedItem[], tokens: Token[] = [listed]) {
    const input: PostureInput = {
      autoLockMinutes: 15,
      securityLog: [],
      now: 1,
      loadedActivity: items,
      known,
      tokens,
      manifest: { permissions: ['storage'] },
    };
    return assessWallet(input).findings.map((finding) => ({ id: finding.id, title: finding.title }));
  }

  function ids(items: FeedItem[], tokens?: Token[]): string[] {
    return posture(items, tokens).map((f) => f.id);
  }

  it('do not count a native-ETH log as an unlisted token received', () => {
    if (nativeIncoming === undefined) throw new Error('fixture missing');
    expect(ids([nativeIncoming])).not.toContain('unlisted_tokens_received');
  });

  it('do not count a zero-value native-ETH log as a zero-value inbound transfer', () => {
    if (nativeIncoming === undefined) throw new Error('fixture missing');
    expect(ids([{ ...nativeIncoming, value: 0n }])).not.toContain('zero_value_inbound');
  });

  it('do not count a native-ETH log from a lookalike sender', () => {
    if (nativeIncoming === undefined) throw new Error('fixture missing');
    const lookalike = { ...nativeIncoming, from: LOOKALIKE_SENDER };
    expect(ids([lookalike])).not.toContain('lookalike_senders');
    // The same sender through an ordinary token transfer is counted.
    expect(ids([{ ...lookalike, tokenAddress: OTHER_TOKEN }])).toContain('lookalike_senders');
  });

  it('count exactly the real tokens in a mixed list with one of each', () => {
    if (nativeIncoming === undefined || nullMetadataToken === undefined) {
      throw new Error('fixture missing');
    }
    const items: FeedItem[] = [
      // native-ETH logs: excluded from every count
      nativeIncoming,
      { ...nativeIncoming, value: 0n, logIndex: 900 },
      { ...nativeIncoming, from: LOOKALIKE_SENDER, logIndex: 901 },
      // a real token with null metadata, incoming with value: one unlisted token
      nullMetadataToken,
      // a listed token transfer: neither unlisted nor zero-value
      tokenRow({ logIndex: 902 }),
    ];
    const found = posture(items);
    const byId = new Map(found.map((f) => [f.id, f.title]));
    expect(byId.get('unlisted_tokens_received')).toContain('1 unlisted token has sent to you');
    expect(byId.has('zero_value_inbound')).toBe(false);
    expect(byId.has('lookalike_senders')).toBe(false);
  });

  it('exclude native logs even when they are passed in alongside ordinary zero-value ones', () => {
    if (nativeIncoming === undefined) throw new Error('fixture missing');
    const found = posture([
      { ...nativeIncoming, value: 0n, logIndex: 1 },
      tokenRow({ value: 0n, logIndex: 2, tokenAddress: OTHER_TOKEN }),
    ]);
    expect(found.find((f) => f.id === 'zero_value_inbound')?.title).toContain(
      '1 incoming zero-value token transfer',
    );
  });
});

describe('same-symbol logic', () => {
  const real: Token = { address: REAL_USDC, symbol: 'ETH', name: 'Ether', decimals: 18, addedAt: 1 };

  it('ignores the native-ETH log address', () => {
    const native: Token = { ...real, address: SYSTEM_MIXED_CASE };
    expect(sameSymbolAddresses([real, native]).size).toBe(0);
    expect(sameSymbolAddresses([native, { ...native, address: NATIVE_ETH_LOG_ADDRESS }]).size).toBe(0);
  });

  it('still flags two real tokens that share a symbol', () => {
    expect(sameSymbolAddresses([real, { ...real, address: OTHER_TOKEN }]).size).toBe(2);
  });
});
