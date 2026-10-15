import { describe, expect, it } from 'vitest';
import { selectCodeResult } from './gather';
import type { CodeResultStore } from './gather';

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const B = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

describe('selectCodeResult', () => {
  it('returns the stored result when it was fetched for the current recipient', () => {
    expect(selectCodeResult({ address: A, code: 'contract' }, A)).toBe('contract');
    expect(selectCodeResult({ address: A, code: 'eoa' }, A)).toBe('eoa');
    expect(selectCodeResult({ address: A, code: 'unknown' }, A)).toBe('unknown');
  });

  it('is pending when nothing has been stored yet', () => {
    expect(selectCodeResult(null, A)).toBe('pending');
  });

  it('is pending for a result that belongs to a different recipient', () => {
    expect(selectCodeResult({ address: A, code: 'eoa' }, B)).toBe('pending');
    expect(selectCodeResult({ address: A, code: 'contract' }, B)).toBe('pending');
    expect(selectCodeResult({ address: A, code: 'unknown' }, B)).toBe('pending');
  });

  it('matches case-insensitively, in every combination of forms', () => {
    const forms = [A, A.toLowerCase(), `0x${A.slice(2).toUpperCase()}`];
    for (const stored of forms) {
      for (const current of forms) {
        expect(selectCodeResult({ address: stored, code: 'contract' }, current)).toBe('contract');
      }
    }
  });

  it('ignores surrounding whitespace in the addresses', () => {
    expect(selectCodeResult({ address: ` ${A} `, code: 'eoa' }, A)).toBe('eoa');
  });

  it('never matches a different address that only looks similar', () => {
    const near = `${A.slice(0, -1)}9`;
    expect(selectCodeResult({ address: A, code: 'eoa' }, near)).toBe('pending');
  });
});

describe('a late result for an old recipient', () => {
  // The review moves from recipient A to recipient B. A's lookup finishes late.
  it('never applies to the new recipient, and the new recipient waits for its own result', () => {
    let stored: CodeResultStore = null;

    // Review for A: its result arrives and applies to A.
    stored = { address: A, code: 'eoa' };
    expect(selectCodeResult(stored, A)).toBe('eoa');

    // The user starts a new send to B. A's result is still sitting in state.
    expect(selectCodeResult(stored, B)).toBe('pending');

    // Even a result for A arriving again (late) does not apply to B.
    stored = { address: A, code: 'contract' };
    expect(selectCodeResult(stored, B)).toBe('pending');

    // Only B's own lookup makes B ready.
    stored = { address: B, code: 'contract' };
    expect(selectCodeResult(stored, B)).toBe('contract');
    expect(selectCodeResult(stored, A)).toBe('pending');
  });
});
