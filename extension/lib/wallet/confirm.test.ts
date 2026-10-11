import { describe, it, expect } from 'vitest';
import { pickConfirmationIndices, checkConfirmation } from './confirm';

const WORDS = 'test test test test test test test test test test test junk'.split(' ');

describe('pickConfirmationIndices', () => {
  it('returns the requested number of positions', () => {
    expect(pickConfirmationIndices(12, 3)).toHaveLength(3);
  });

  it('never repeats a position', () => {
    const picked = pickConfirmationIndices(12, 3);
    expect(new Set(picked).size).toBe(3);
  });

  it('only returns positions inside the phrase', () => {
    for (const i of pickConfirmationIndices(12, 3)) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(12);
    }
  });

  it('returns positions in ascending order', () => {
    const picked = pickConfirmationIndices(12, 3);
    expect(picked).toEqual([...picked].sort((a, b) => a - b));
  });

  it('can pick every position over many runs', () => {
    const seen = new Set<number>();
    for (let run = 0; run < 200; run++) {
      for (const i of pickConfirmationIndices(12, 3)) seen.add(i);
    }
    expect(seen.size).toBe(12);
  });

  it('rejects impossible requests', () => {
    expect(() => pickConfirmationIndices(12, 0)).toThrow();
    expect(() => pickConfirmationIndices(12, 13)).toThrow();
  });
});

describe('checkConfirmation', () => {
  const indices = [0, 5, 11];

  it('accepts correct answers', () => {
    expect(checkConfirmation(WORDS, indices, ['test', 'test', 'junk'])).toBe(true);
  });
  
  it('rejects when there are no questions', () => {
    expect(checkConfirmation(WORDS, [], [])).toBe(false);
  });

  it('rejects a wrong answer', () => {
    expect(checkConfirmation(WORDS, indices, ['test', 'test', 'test'])).toBe(false);
  });

  it('ignores extra spaces and capital letters', () => {
    expect(checkConfirmation(WORDS, indices, [' Test', 'TEST ', ' Junk '])).toBe(true);
  });

  it('rejects an empty answer', () => {
    expect(checkConfirmation(WORDS, indices, ['test', '', 'junk'])).toBe(false);
  });

  it('rejects the wrong number of answers', () => {
    expect(checkConfirmation(WORDS, indices, ['test', 'test'])).toBe(false);
  });
});