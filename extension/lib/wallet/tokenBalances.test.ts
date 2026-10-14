import { describe, expect, it } from 'vitest';
import { BALANCE_CONCURRENCY, readTokenBalances } from './tokens';
import type { Token, TokenClient } from './tokens';

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

function address(n: number): string {
  return `0x${n.toString(16).padStart(40, '0')}`;
}

function listOf(count: number): Token[] {
  return Array.from({ length: count }, (_, i) => ({
    address: address(i + 1),
    symbol: `T${i}`,
    name: `Token ${i}`,
    decimals: 18,
    addedAt: 1,
  }));
}

function client(readBalance: TokenClient['readBalance']): TokenClient {
  return {
    getChainId: async () => 11155111,
    getCode: async () => '0x6080',
    readDecimals: async () => 18,
    readSymbol: async () => 'T',
    readName: async () => 'Token',
    readBalance,
  };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

describe('readTokenBalances with many tokens', () => {
  it('all succeed: one balance per token, in list order', async () => {
    const tokens = listOf(10);
    const result = await readTokenBalances(
      client(async (token) => BigInt(parseInt(token.slice(2), 16)) * 10n),
      OWNER,
      tokens,
    );
    expect(result.map((r) => r.balance)).toEqual(tokens.map((_, i) => BigInt(i + 1) * 10n));
    expect(result.map((r) => r.address)).toEqual(tokens.map((t) => t.address));
  });

  it('one fails: only that token is "Couldn\'t load" (null), the rest keep their balance', async () => {
    const tokens = listOf(9);
    const bad = address(5);
    const result = await readTokenBalances(
      client(async (token) => {
        if (token.toLowerCase() === bad) throw new Error('rpc error');
        return 7n;
      }),
      OWNER,
      tokens,
    );
    const nulls = result.filter((r) => r.balance === null);
    expect(nulls).toHaveLength(1);
    expect(nulls[0]?.address.toLowerCase()).toBe(bad);
    expect(result.filter((r) => r.balance === 7n)).toHaveLength(8);
  });

  it('all fail: every token is null, never 0', async () => {
    const result = await readTokenBalances(
      client(async () => {
        throw new Error('down');
      }),
      OWNER,
      listOf(6),
    );
    expect(result).toHaveLength(6);
    for (const entry of result) expect(entry.balance).toBeNull();
    expect(result.some((entry) => entry.balance === 0n)).toBe(false);
  });

  it('a zero balance is a real 0n, distinct from a failed read', async () => {
    const result = await readTokenBalances(client(async () => 0n), OWNER, listOf(2));
    expect(result.map((r) => r.balance)).toEqual([0n, 0n]);
  });

  it('never has more than the limit of reads in flight, even for a full list of 50', async () => {
    expect(BALANCE_CONCURRENCY).toBe(4);
    let inFlight = 0;
    let peak = 0;
    const result = await readTokenBalances(
      client(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await tick();
        inFlight -= 1;
        return 1n;
      }),
      OWNER,
      listOf(50),
    );
    expect(result).toHaveLength(50);
    expect(result.every((r) => r.balance === 1n)).toBe(true);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('keeps going after failures while respecting the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await readTokenBalances(
      client(async (token) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await tick();
        inFlight -= 1;
        if (parseInt(token.slice(2), 16) % 3 === 0) throw new Error('flaky');
        return 2n;
      }),
      OWNER,
      listOf(20),
    );
    expect(result.filter((r) => r.balance === null)).toHaveLength(6);
    expect(result.filter((r) => r.balance === 2n)).toHaveLength(14);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('handles an empty list', async () => {
    expect(await readTokenBalances(client(async () => 1n), OWNER, [])).toEqual([]);
  });
});
