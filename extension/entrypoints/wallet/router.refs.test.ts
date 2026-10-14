import { describe, expect, it } from 'vitest';
import { activityRefHref, parseActivityRef, parseRoute } from './router';

const HASH = `0x${'ab'.repeat(32)}`;

describe('activity detail references', () => {
  it('parses a plain transaction link', () => {
    expect(parseActivityRef(`#/activity/${HASH}`)).toEqual({ kind: 'transaction', hash: HASH });
  });

  it('parses a token transfer link with its log index', () => {
    expect(parseActivityRef(`#/activity/${HASH}/token/12`)).toEqual({
      kind: 'token',
      hash: HASH,
      index: 12,
    });
  });

  it('parses an internal transfer link with its index', () => {
    expect(parseActivityRef(`#/activity/${HASH}/internal/0`)).toEqual({
      kind: 'internal',
      hash: HASH,
      index: 0,
    });
  });

  it('rejects anything else', () => {
    expect(parseActivityRef('#/activity')).toBeNull();
    expect(parseActivityRef('#/activity/0x123')).toBeNull();
    expect(parseActivityRef(`#/activity/${HASH}/nft/1`)).toBeNull();
    expect(parseActivityRef(`#/activity/${HASH}/token`)).toBeNull();
    expect(parseActivityRef(`#/activity/${HASH}/token/-1`)).toBeNull();
    expect(parseActivityRef(`#/activity/${HASH}/token/1/extra`)).toBeNull();
    expect(parseActivityRef(`#/activity/${HASH}/token/9999999999`)).toBeNull();
  });

  it('round-trips through href', () => {
    for (const ref of [
      { kind: 'transaction', hash: HASH },
      { kind: 'token', hash: HASH, index: 7 },
      { kind: 'internal', hash: HASH, index: 3 },
    ] as const) {
      expect(parseActivityRef(activityRefHref(ref))).toEqual(ref);
    }
  });

  it('still routes every detail link to the activity page', () => {
    expect(parseRoute(`#/activity/${HASH}/token/1`)).toBe('activity');
    expect(parseRoute(`#/activity/${HASH}/internal/1`)).toBe('activity');
  });
});
