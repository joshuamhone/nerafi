import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addToken,
  loadTokens,
  MAX_TOKENS,
  MSG_NO_CONTRACT,
  MSG_NOT_ERC20,
  parseToken,
  parseTokens,
  readTokenBalances,
  removeToken,
  sameSymbolAddresses,
  symbolIsListed,
  TOKENS_KEY,
  verifyToken,
} from './tokens';
import type { Token, TokenClient } from './tokens';

const T1 = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const T2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

function token(address: string, symbol = 'USDC', overrides: Partial<Token> = {}): Token {
  return { address, symbol, name: `${symbol} coin`, decimals: 6, addedAt: 1, ...overrides };
}

function mockClient(overrides: Partial<TokenClient> = {}): TokenClient {
  return {
    getChainId: async () => 11155111,
    getCode: async () => '0x6080',
    readDecimals: async () => 6,
    readSymbol: async () => 'USDC',
    readName: async () => 'USD Coin',
    readBalance: async () => 5n,
    ...overrides,
  };
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('parseToken / parseTokens', () => {
  it('accepts a valid entry and checksums the address', () => {
    const parsed = parseToken({ ...token(T1.toLowerCase()) });
    expect(parsed?.address).toBe(T1);
  });

  it('rejects unknown keys, wrong types and bad decimals', () => {
    expect(parseToken({ ...token(T1), extra: 1 })).toBeNull();
    expect(parseToken({ ...token(T1), decimals: 37 })).toBeNull();
    expect(parseToken({ ...token(T1), decimals: -1 })).toBeNull();
    expect(parseToken({ ...token(T1), decimals: 1.5 })).toBeNull();
    expect(parseToken({ ...token(T1), decimals: '6' })).toBeNull();
    expect(parseToken({ ...token(T1), addedAt: Number.NaN })).toBeNull();
    expect(parseToken({ ...token('0x123') })).toBeNull();
    expect(parseToken(null)).toBeNull();
    expect(parseToken([])).toBeNull();
  });

  it('accepts decimals 0 and 36', () => {
    expect(parseToken(token(T1, 'A', { decimals: 0 }))).not.toBeNull();
    expect(parseToken(token(T1, 'A', { decimals: 36 }))).not.toBeNull();
  });

  it('rejects an entry whose text is not already sanitised', () => {
    expect(parseToken(token(T1, 'US‮DC'))).toBeNull();
    expect(parseToken(token(T1, 'USDC', { name: 'x​y' }))).toBeNull();
    expect(parseToken(token(T1, 'ABCDEFGHIJKLMNOP'))).toBeNull();
  });

  it('drops bad entries and duplicates one by one and never throws', () => {
    const list = parseTokens([
      token(T1),
      { nonsense: true },
      token(T1.toLowerCase()),
      token(T2, 'DAI'),
    ]);
    expect(list.map((t) => t.address)).toEqual([T1, T2]);
    expect(parseTokens('garbage')).toEqual([]);
    expect(parseTokens(undefined)).toEqual([]);
  });

  it('caps the list at the maximum', () => {
    const many = Array.from({ length: MAX_TOKENS + 5 }, (_, i) =>
      token(`0x${(i + 1).toString(16).padStart(40, '0')}`, `T${i}`),
    );
    expect(parseTokens(many)).toHaveLength(MAX_TOKENS);
  });
});

describe('addToken / removeToken / loadTokens', () => {
  it('stores a token, then reads it back', async () => {
    const result = await addToken(
      { address: T1, symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      7,
    );
    expect(result.ok).toBe(true);
    expect(await loadTokens()).toEqual([
      { address: T1, symbol: 'USDC', name: 'USD Coin', decimals: 6, addedAt: 7 },
    ]);
  });

  it('sanitises text on the way in', async () => {
    await addToken({ address: T1, symbol: 'US‮DC', name: 'USD​ Coin', decimals: 6 });
    const [saved] = await loadTokens();
    expect(saved?.symbol).toBe('USDC');
    expect(saved?.name).toBe('USD Coin');
  });

  it('refuses duplicates in any letter case', async () => {
    await addToken({ address: T1, symbol: 'A', name: 'A', decimals: 1 });
    const again = await addToken({
      address: T1.toLowerCase(),
      symbol: 'A',
      name: 'A',
      decimals: 1,
    });
    expect(again).toEqual({ ok: false, error: 'This token is already in your list.' });
    expect(await loadTokens()).toHaveLength(1);
  });

  it('refuses to exceed the limit', async () => {
    const stored = Array.from({ length: MAX_TOKENS }, (_, i) =>
      token(`0x${(i + 1).toString(16).padStart(40, '0')}`, `T${i}`),
    );
    await fakeBrowser.storage.local.set({ [TOKENS_KEY]: stored });
    const result = await addToken({ address: T1, symbol: 'A', name: 'A', decimals: 1 });
    expect(result.ok).toBe(false);
    expect(await loadTokens()).toHaveLength(MAX_TOKENS);
  });

  it('removes a token and tolerates a missing one', async () => {
    await addToken({ address: T1, symbol: 'A', name: 'A', decimals: 1 });
    await addToken({ address: T2, symbol: 'B', name: 'B', decimals: 1 });
    expect((await removeToken(T1.toLowerCase())).map((t) => t.address)).toEqual([T2]);
    expect(await removeToken(OWNER)).toHaveLength(1);
  });

  it('reads damaged storage as an empty list', async () => {
    await fakeBrowser.storage.local.set({ [TOKENS_KEY]: { not: 'a list' } });
    expect(await loadTokens()).toEqual([]);
  });
});

describe('same-symbol detection', () => {
  it('marks both tokens that share a symbol, case-insensitively', () => {
    const set = sameSymbolAddresses([token(T1, 'USDC'), token(T2, 'usdc')]);
    expect(set.has(T1.toLowerCase())).toBe(true);
    expect(set.has(T2.toLowerCase())).toBe(true);
  });

  it('marks nothing when every symbol is different', () => {
    expect(sameSymbolAddresses([token(T1, 'USDC'), token(T2, 'DAI')]).size).toBe(0);
  });

  it('compares the sanitised symbol', () => {
    const a = token(T1, 'USDC');
    const b = token(T2, 'USDC');
    expect(sameSymbolAddresses([a, b]).size).toBe(2);
    expect(symbolIsListed([a], 'US​DC')).toBe(true);
    expect(symbolIsListed([a], 'DAI')).toBe(false);
  });
});

describe('verifyToken', () => {
  it('accepts a standard token and returns sanitised text', async () => {
    const result = await verifyToken(
      mockClient({ readSymbol: async () => 'US‮DC', readName: async () => ' USD\nCoin ' }),
      T1.toLowerCase(),
    );
    expect(result).toEqual({
      ok: true,
      token: { address: T1, symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    });
  });

  it('rejects a malformed address before touching the network', async () => {
    let called = false;
    const client = mockClient({
      getChainId: async () => {
        called = true;
        return 11155111;
      },
    });
    expect(await verifyToken(client, 'nope')).toEqual({
      ok: false,
      error: 'That is not a valid Ethereum address.',
    });
    expect(called).toBe(false);
  });

  it('rejects a mixed-case address with a bad checksum', async () => {
    const result = await verifyToken(mockClient(), '0x1C7d4b196cb0c7b01d743fbc6116a902379c7238');
    expect(result).toEqual({
      ok: false,
      error: 'This address has a checksum error — check it for typos.',
    });
  });

  it('rejects an address with no contract', async () => {
    expect(await verifyToken(mockClient({ getCode: async () => '0x' }), T1)).toEqual({
      ok: false,
      error: MSG_NO_CONTRACT,
    });
    expect(await verifyToken(mockClient({ getCode: async () => undefined }), T1)).toEqual({
      ok: false,
      error: MSG_NO_CONTRACT,
    });
  });

  it('rejects when any read fails', async () => {
    const fail = async () => {
      throw new Error('revert');
    };
    for (const key of ['readDecimals', 'readSymbol', 'readName'] as const) {
      expect(await verifyToken(mockClient({ [key]: fail }), T1)).toEqual({
        ok: false,
        error: MSG_NOT_ERC20,
      });
    }
  });

  it('rejects a symbol or name that is not a plain string', async () => {
    expect((await verifyToken(mockClient({ readSymbol: async () => 12n }), T1)).ok).toBe(false);
    expect((await verifyToken(mockClient({ readName: async () => null }), T1)).ok).toBe(false);
    expect(
      (await verifyToken(mockClient({ readSymbol: async () => new Uint8Array(4) }), T1)).ok,
    ).toBe(false);
  });

  it('rejects out-of-range or non-integer decimals', async () => {
    for (const value of [37, -1, 1.5, '6', 6n, null]) {
      expect((await verifyToken(mockClient({ readDecimals: async () => value }), T1)).ok).toBe(
        false,
      );
    }
  });

  it('refuses when the chain is not Sepolia', async () => {
    const result = await verifyToken(mockClient({ getChainId: async () => 1 }), T1);
    expect(result.ok).toBe(false);
  });

  it('reports an unreachable network when the code lookup fails', async () => {
    const result = await verifyToken(
      mockClient({
        getCode: async () => {
          throw new Error('down');
        },
      }),
      T1,
    );
    expect(result).toEqual({ ok: false, error: 'Could not reach the Sepolia network.' });
  });
});

describe('readTokenBalances', () => {
  it('returns one balance per token', async () => {
    const result = await readTokenBalances(
      mockClient({ readBalance: async (t) => (t === T1 ? 100n : 0n) }),
      OWNER,
      [token(T1), token(T2, 'DAI')],
    );
    expect(result).toEqual([
      { address: T1, balance: 100n },
      { address: T2, balance: 0n },
    ]);
  });

  it('turns a failed read into null, never 0, and keeps the others', async () => {
    const result = await readTokenBalances(
      mockClient({
        readBalance: async (t) => {
          if (t === T1) throw new Error('rpc down');
          return 9n;
        },
      }),
      OWNER,
      [token(T1), token(T2, 'DAI')],
    );
    expect(result).toEqual([
      { address: T1, balance: null },
      { address: T2, balance: 9n },
    ]);
  });

  it('treats a non-bigint or negative answer as unavailable', async () => {
    for (const value of ['5', 5, null, -1n]) {
      const [entry] = await readTokenBalances(
        mockClient({ readBalance: async () => value }),
        OWNER,
        [token(T1)],
      );
      expect(entry?.balance).toBeNull();
    }
  });

  it('is unavailable for every token when the owner is not an address', async () => {
    const result = await readTokenBalances(mockClient(), 'nope', [token(T1)]);
    expect(result).toEqual([{ address: T1, balance: null }]);
  });
});
