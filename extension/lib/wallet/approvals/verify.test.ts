import { describe, expect, it } from 'vitest';
import { VERIFY_CONCURRENCY, verifyApprovals } from './verify';
import type { ApprovalClient } from './verify';
import type { Candidate } from './types';
import type { Token } from '../tokens';

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

function address(n: number): string {
  return `0x${n.toString(16).padStart(40, '0')}`;
}

function candidate(token: number, spender: number): Candidate {
  return { token: address(token), spender: address(spender), blockNumber: 1n, logIndex: 0 };
}

type Overrides = Partial<ApprovalClient>;

function client(overrides: Overrides = {}): ApprovalClient {
  return {
    getChainId: async () => 11155111,
    getCode: async () => '0x6080',
    readAllowance: async () => 5n,
    readSymbol: async () => 'TKN',
    readName: async () => 'Token',
    readDecimals: async () => 18,
    ...overrides,
  };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

function listed(token: number): Token {
  return { address: address(token), symbol: 'LST', name: 'Listed', decimals: 6, addedAt: 1 };
}

describe('only allowance above zero is an active approval', () => {
  it('filters out zero allowances', async () => {
    const result = await verifyApprovals(
      client({ readAllowance: async (_t, _o, spender) => (spender === address(2) ? 0n : 7n) }),
      OWNER,
      [candidate(1, 2), candidate(1, 3)],
      [],
    );
    expect(result.active.map((a) => a.spender)).toEqual([address(3)]);
    expect(result.couldNotCheck).toEqual([]);
  });

  it('keeps the current on-chain allowance, not any value from a log', async () => {
    const result = await verifyApprovals(client({ readAllowance: async () => 42n }), OWNER, [candidate(1, 2)], []);
    expect(result.active[0]?.allowance).toBe(42n);
  });

  it('keeps the newest-first order of the candidates', async () => {
    const result = await verifyApprovals(client(), OWNER, [candidate(3, 1), candidate(2, 1), candidate(1, 1)], []);
    expect(result.active.map((a) => a.token)).toEqual([address(3), address(2), address(1)]);
  });

  it('does nothing for no candidates', async () => {
    expect(await verifyApprovals(client(), OWNER, [], [])).toEqual({ active: [], couldNotCheck: [] });
  });
});

describe('a failed allowance read', () => {
  it('goes to "couldn\'t check", never to the active list, and never vanishes', async () => {
    const result = await verifyApprovals(
      client({
        readAllowance: async (_t, _o, spender) => {
          if (spender === address(2)) throw new Error('rpc down');
          return 9n;
        },
      }),
      OWNER,
      [candidate(1, 2), candidate(1, 3)],
      [],
    );
    expect(result.couldNotCheck).toEqual([{ token: address(1), spender: address(2) }]);
    expect(result.active.map((a) => a.spender)).toEqual([address(3)]);
  });

  it('treats an answer that is not a non-negative bigint as unreadable', async () => {
    for (const value of ['5', 5, null, undefined, -1n, {}]) {
      const result = await verifyApprovals(
        client({ readAllowance: async () => value }),
        OWNER,
        [candidate(1, 2)],
        [],
      );
      expect(result.active).toEqual([]);
      expect(result.couldNotCheck).toHaveLength(1);
    }
  });

  it('isolates failures: one bad candidate does not affect the other 99', async () => {
    const candidates = Array.from({ length: 100 }, (_, i) => candidate(i + 1, 500));
    const result = await verifyApprovals(
      client({
        readAllowance: async (token) => {
          if (token === address(37)) throw new Error('x');
          return 1n;
        },
      }),
      OWNER,
      candidates,
      [],
    );
    expect(result.couldNotCheck).toHaveLength(1);
    expect(result.active).toHaveLength(99);
  });

  it('puts every candidate in exactly one place when all reads fail', async () => {
    const result = await verifyApprovals(
      client({
        readAllowance: async () => {
          throw new Error('down');
        },
      }),
      OWNER,
      [candidate(1, 1), candidate(2, 2), candidate(3, 3)],
      [],
    );
    expect(result.active).toEqual([]);
    expect(result.couldNotCheck).toHaveLength(3);
  });
});

describe('concurrency', () => {
  it('never has more than four requests in flight, with 100 candidates, across every kind of read', async () => {
    expect(VERIFY_CONCURRENCY).toBe(4);
    let inFlight = 0;
    let peak = 0;
    let calls = 0;
    const track = async <T,>(value: T): Promise<T> => {
      inFlight += 1;
      calls += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
      return value;
    };
    const candidates = Array.from({ length: 100 }, (_, i) => candidate(i + 1, i + 1000));
    const result = await verifyApprovals(
      client({
        readAllowance: () => track(3n),
        readSymbol: () => track('SYM'),
        readName: () => track('Name'),
        readDecimals: () => track(18),
        getCode: () => track('0x6080' as const),
      }),
      OWNER,
      candidates,
      [],
    );
    expect(result.active).toHaveLength(100);
    // 100 allowances + 3 reads x 100 tokens + 100 spender lookups.
    expect(calls).toBe(100 + 300 + 100);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });
});

describe('spender type', () => {
  it('is contract when the spender has code', async () => {
    const result = await verifyApprovals(client({ getCode: async () => '0x6080' }), OWNER, [candidate(1, 2)], []);
    expect(result.active[0]?.spenderCode).toBe('contract');
  });

  it('is eoa when there is no code', async () => {
    for (const code of ['0x', undefined] as const) {
      const result = await verifyApprovals(client({ getCode: async () => code }), OWNER, [candidate(1, 2)], []);
      expect(result.active[0]?.spenderCode).toBe('eoa');
    }
  });

  it('is unknown, never eoa, when the lookup fails', async () => {
    const result = await verifyApprovals(
      client({
        getCode: async () => {
          throw new Error('rpc down');
        },
      }),
      OWNER,
      [candidate(1, 2)],
      [],
    );
    expect(result.active[0]?.spenderCode).toBe('unknown');
  });

  it('is unknown for an answer that is not code', async () => {
    const result = await verifyApprovals(
      client({ getCode: async () => 'nope' as unknown as '0x' }),
      OWNER,
      [candidate(1, 2)],
      [],
    );
    expect(result.active[0]?.spenderCode).toBe('unknown');
  });

  it('looks each distinct spender up once, even when it appears for several tokens', async () => {
    const seen: string[] = [];
    await verifyApprovals(
      client({
        getCode: async (spender) => {
          seen.push(spender);
          return '0x';
        },
      }),
      OWNER,
      [candidate(1, 9), candidate(2, 9), candidate(3, 8)],
      [],
    );
    expect(seen.sort()).toEqual([address(8), address(9)].map((a) => a).sort());
  });

  it('does not look up spenders for approvals that turned out to be zero', async () => {
    let lookups = 0;
    await verifyApprovals(
      client({
        readAllowance: async () => 0n,
        getCode: async () => {
          lookups += 1;
          return '0x';
        },
      }),
      OWNER,
      [candidate(1, 2)],
      [],
    );
    expect(lookups).toBe(0);
  });
});

describe('token details', () => {
  it('reads them for an unlisted token and sanitises the text', async () => {
    const result = await verifyApprovals(
      client({
        readSymbol: async () => 'U‮SD​C',
        readName: async () => 'Evil\u0000 \n Coin',
        readDecimals: async () => 6,
      }),
      OWNER,
      [candidate(1, 2)],
      [],
    );
    expect(result.active[0]?.tokenInfo).toEqual({
      symbol: 'USDC',
      name: 'Evil Coin',
      decimals: 6,
      listed: false,
      metadataComplete: true,
    });
  });

  it('marks a token in the user list as listed and uses the stored details, not the chain', async () => {
    let metadataReads = 0;
    const result = await verifyApprovals(
      client({
        readSymbol: async () => {
          metadataReads += 1;
          return 'FAKE';
        },
        readDecimals: async () => {
          metadataReads += 1;
          return 2;
        },
      }),
      OWNER,
      [candidate(1, 2)],
      [listed(1)],
    );
    expect(metadataReads).toBe(0);
    expect(result.active[0]?.tokenInfo).toEqual({
      symbol: 'LST',
      name: 'Listed',
      decimals: 6,
      listed: true,
      metadataComplete: true,
    });
  });

  it('matches the user list by address in any letter case', async () => {
    const token = candidate(0xabc, 2);
    const upper: Token = { ...listed(0xabc), address: `0x${address(0xabc).slice(2).toUpperCase()}` };
    const result = await verifyApprovals(client(), OWNER, [token], [upper]);
    expect(result.active[0]?.tokenInfo.listed).toBe(true);
  });

  it('tolerates a failed read for one token: the other fields and other tokens are unaffected', async () => {
    const result = await verifyApprovals(
      client({
        readDecimals: async (token) => {
          if (token === address(1)) throw new Error('no decimals');
          return 18;
        },
      }),
      OWNER,
      [candidate(1, 2), candidate(2, 2)],
      [],
    );
    const [a, b] = result.active;
    expect(a?.tokenInfo.decimals).toBeNull();
    expect(a?.tokenInfo.symbol).toBe('TKN');
    expect(a?.tokenInfo.metadataComplete).toBe(false);
    expect(b?.tokenInfo.decimals).toBe(18);
    expect(b?.tokenInfo.metadataComplete).toBe(true);
  });

  it('rejects decimals that are not an integer from 0 to 36, and a non-string symbol or name', async () => {
    for (const decimals of [37, -1, 1.5, '6', 6n, null]) {
      const result = await verifyApprovals(client({ readDecimals: async () => decimals }), OWNER, [candidate(1, 2)], []);
      expect(result.active[0]?.tokenInfo.decimals).toBeNull();
    }
    const result = await verifyApprovals(
      client({ readSymbol: async () => 5n, readName: async () => null }),
      OWNER,
      [candidate(1, 2)],
      [],
    );
    expect(result.active[0]?.tokenInfo.symbol).toBeNull();
    expect(result.active[0]?.tokenInfo.name).toBeNull();
    expect(result.active[0]?.tokenInfo.metadataComplete).toBe(false);
  });

  it('reads each distinct token once', async () => {
    let reads = 0;
    await verifyApprovals(
      client({
        readSymbol: async () => {
          reads += 1;
          return 'T';
        },
      }),
      OWNER,
      [candidate(1, 2), candidate(1, 3), candidate(1, 4)],
      [],
    );
    expect(reads).toBe(1);
  });
});

describe('the network', () => {
  it('refuses to read anything when the RPC is not Sepolia', async () => {
    let reads = 0;
    await expect(
      verifyApprovals(
        client({
          getChainId: async () => 1,
          readAllowance: async () => {
            reads += 1;
            return 1n;
          },
        }),
        OWNER,
        [candidate(1, 2)],
        [],
      ),
    ).rejects.toThrow();
    expect(reads).toBe(0);
  });
});
