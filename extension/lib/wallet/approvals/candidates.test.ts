import { describe, expect, it } from 'vitest';
import { deriveCandidates, MAX_CANDIDATES } from './candidates';
import type { ApprovalLog } from './types';

function address(n: number): string {
  return `0x${n.toString(16).padStart(40, '0')}`;
}

const OWNER = address(0xabc);

function log(token: number | string, spender: number | string, block: number, logIndex = 0): ApprovalLog {
  return {
    token: typeof token === 'number' ? address(token) : token,
    owner: OWNER,
    spender: typeof spender === 'number' ? address(spender) : spender,
    value: 1n,
    blockNumber: BigInt(block),
    logIndex,
    transactionHash: `0x${'a'.repeat(64)}`,
  };
}

describe('deriveCandidates', () => {
  it('returns nothing for no logs', () => {
    expect(deriveCandidates([], false)).toEqual({
      candidates: [],
      capped: false,
      pageFull: false,
      truncated: false,
    });
  });

  it('keeps one candidate per distinct (token, spender) pair', () => {
    const set = deriveCandidates([log(1, 2, 10), log(1, 2, 20), log(1, 3, 15), log(2, 2, 5)], false);
    expect(set.candidates).toHaveLength(3);
    const pairs = set.candidates.map((c) => `${c.token}:${c.spender}`);
    expect(new Set(pairs).size).toBe(3);
  });

  it('compares addresses case-insensitively', () => {
    const lower = log(0xdead, 0xbeef, 1);
    const upper = log(
      `0x${address(0xdead).slice(2).toUpperCase()}`,
      `0x${address(0xbeef).slice(2).toUpperCase()}`,
      2,
    );
    const set = deriveCandidates([lower, upper], false);
    expect(set.candidates).toHaveLength(1);
    // The newer log represents the pair.
    expect(set.candidates[0]?.blockNumber).toBe(2n);
  });

  it('represents each pair by its newest log, using the log index within a block', () => {
    const set = deriveCandidates([log(1, 2, 10, 3), log(1, 2, 10, 7), log(1, 2, 9, 99)], false);
    expect(set.candidates).toHaveLength(1);
    expect(set.candidates[0]?.blockNumber).toBe(10n);
    expect(set.candidates[0]?.logIndex).toBe(7);
  });

  it('orders candidates newest first, whatever order the logs came in', () => {
    const set = deriveCandidates([log(1, 1, 5), log(2, 2, 50), log(3, 3, 20), log(4, 4, 50, 4)], false);
    expect(set.candidates.map((c) => Number(c.blockNumber))).toEqual([50, 50, 20, 5]);
    expect(set.candidates[0]?.logIndex).toBe(4);
  });

  it('does not mutate its input', () => {
    const logs = [log(1, 1, 5), log(2, 2, 6)];
    const copy = logs.map((item) => ({ ...item }));
    deriveCandidates(logs, false);
    expect(logs).toEqual(copy);
  });
});

describe('the cap', () => {
  it('is 100 pairs', () => {
    expect(MAX_CANDIDATES).toBe(100);
  });

  it('keeps exactly 100 without flagging anything', () => {
    const logs = Array.from({ length: 100 }, (_, i) => log(i + 1, 1, i + 1));
    const set = deriveCandidates(logs, false);
    expect(set.candidates).toHaveLength(100);
    expect(set.capped).toBe(false);
    expect(set.truncated).toBe(false);
  });

  it('cuts 150 pairs to the 100 most recent and flags it', () => {
    const logs = Array.from({ length: 150 }, (_, i) => log(i + 1, 1, i + 1));
    const set = deriveCandidates(logs, false);
    expect(set.candidates).toHaveLength(100);
    expect(set.capped).toBe(true);
    expect(set.truncated).toBe(true);
    // The newest block is first and the oldest kept is block 51.
    expect(set.candidates[0]?.blockNumber).toBe(150n);
    expect(set.candidates[99]?.blockNumber).toBe(51n);
  });

  it('counts distinct pairs, not logs: many logs for few pairs is not capped', () => {
    const logs = Array.from({ length: 300 }, (_, i) => log(1 + (i % 5), 1, i));
    const set = deriveCandidates(logs, false);
    expect(set.candidates).toHaveLength(5);
    expect(set.capped).toBe(false);
  });
});

describe('logs that may be incomplete', () => {
  it('flags the result when the last page read was still full, even when few pairs result', () => {
    const set = deriveCandidates([log(1, 2, 3)], true);
    expect(set.pageFull).toBe(true);
    expect(set.truncated).toBe(true);
    expect(set.capped).toBe(false);
  });

  it('does not flag a complete read', () => {
    const set = deriveCandidates([log(1, 2, 3)], false);
    expect(set.pageFull).toBe(false);
    expect(set.truncated).toBe(false);
  });

  it('reports both reasons when the cap and an incomplete read apply together', () => {
    const logs = Array.from({ length: 120 }, (_, i) => log(i + 1, 1, i + 1));
    const set = deriveCandidates(logs, true);
    expect(set.capped).toBe(true);
    expect(set.pageFull).toBe(true);
    expect(set.truncated).toBe(true);
  });
});
