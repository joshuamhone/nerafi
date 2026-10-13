import { describe, expect, it } from 'vitest';
import {
  diffAddress,
  findLookalike,
  isLookalike,
  type KnownAddress,
} from './lookalike';

const A_BODY = 'f39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const A = `0x${A_BODY}`;

function make(prefix: string, middle: string, suffix: string): string {
  const body = `${prefix}${middle}${suffix}`;
  if (body.length !== 40) throw new Error(`bad body length ${body.length}`);
  return `0x${body}`;
}

function changeAt(body: string, index: number, char: string): string {
  return `${body.slice(0, index)}${char}${body.slice(index + 1)}`;
}

function known(address: string, label = 'Label', kind: KnownAddress['kind'] = 'account'): KnownAddress {
  return { address, label, kind };
}

describe('isLookalike', () => {
  it('never flags an identical address, even across case', () => {
    expect(isLookalike(A, A)).toBe(false);
    expect(isLookalike(A, `0x${A_BODY.toUpperCase()}`)).toBe(false);
  });

  it('flags 3 prefix + 3 suffix', () => {
    const base = make('abc', '0'.repeat(34), 'def');
    const near = make('abc', '1'.repeat(34), 'def');
    expect(isLookalike(base, near)).toBe(true);
  });

  it('does not flag 2 prefix + 2 suffix', () => {
    const base = make('ab', '0'.repeat(36), 'cd');
    const near = make('ab', '1'.repeat(36), 'cd');
    expect(isLookalike(base, near)).toBe(false);
  });

  it('flags a run of five at the prefix', () => {
    const base = make('abcde', '0'.repeat(32), 'aaa');
    const near = make('abcde', '1'.repeat(32), 'bbb');
    expect(isLookalike(base, near)).toBe(true);
  });

  it('flags a run of five at the suffix', () => {
    const base = make('aaa', '0'.repeat(32), 'abcde');
    const near = make('bbb', '1'.repeat(32), 'abcde');
    expect(isLookalike(base, near)).toBe(true);
  });

  it('does not flag a run of four at one end alone', () => {
    const base = make('abcd', '0'.repeat(33), 'abc');
    const near = make('abcd', '1'.repeat(33), 'def');
    expect(isLookalike(base, near)).toBe(false);
  });

  it('is case-insensitive', () => {
    const lower = make('abc', '0'.repeat(34), 'def');
    const upper = `0x${'ABC'}${'1'.repeat(34)}${'DEF'}`;
    expect(isLookalike(lower, upper)).toBe(true);
  });

  it('returns false for malformed input', () => {
    expect(isLookalike('0x1234', A)).toBe(false);
    expect(isLookalike('not-an-address', A)).toBe(false);
  });
});

describe('findLookalike', () => {
  it('returns null when nothing is close', () => {
    const other = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    expect(findLookalike(other, [known(A)])).toBeNull();
  });

  it('returns null for a malformed candidate', () => {
    expect(findLookalike('nope', [known(A)])).toBeNull();
  });

  it('ignores the exact same address', () => {
    expect(findLookalike(A, [known(A)])).toBeNull();
  });

  it('finds a one-character change with a long shared run', () => {
    const candidate = `0x${changeAt(A_BODY, 20, '7')}`;
    const match = findLookalike(candidate, [known(A)]);
    expect(match).not.toBeNull();
    expect(match?.known.address).toBe(A);
    expect(match?.prefixMatch).toBe(20);
    expect(match?.suffixMatch).toBe(19);
  });

  it('returns the strongest of several matches', () => {
    const weak = make('abc', '0'.repeat(34), 'def');
    const strong = make('abcdef', '0'.repeat(31), 'abc');
    const candidateB = make('abcdef', '1'.repeat(31), 'abc');
    const match = findLookalike(candidateB, [known(weak), known(strong)]);
    expect(match?.known.address).toBe(strong);
    expect(match?.prefixMatch).toBe(6);
  });
});

describe('diffAddress', () => {
  it('marks no differences for an identical address', () => {
    const flags = diffAddress(A, A);
    expect(flags).toHaveLength(40);
    expect(flags.every((flag) => flag === false)).toBe(true);
  });

  it('marks exactly the changed character', () => {
    const candidate = `0x${changeAt(A_BODY, 20, '7')}`;
    const flags = diffAddress(A, candidate);
    expect(flags).toHaveLength(40);
    expect(flags.filter(Boolean)).toHaveLength(1);
    expect(flags[20]).toBe(true);
  });

  it('marks everything when the other value is malformed', () => {
    const flags = diffAddress(A, 'nope');
    expect(flags).toHaveLength(40);
    expect(flags.every(Boolean)).toBe(true);
  });
});
