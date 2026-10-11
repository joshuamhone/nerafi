import { describe, expect, it } from 'vitest';
import { activityHref, parseActivityId, parseRoute } from './router';

const HASH = '0x' + 'ab'.repeat(32);

describe('parseRoute', () => {
  it('maps the activity list route', () => {
    expect(parseRoute('#/activity')).toBe('activity');
    expect(parseRoute('/activity')).toBe('activity');
  });

  it('maps an activity detail route', () => {
    expect(parseRoute(`#/activity/${HASH}`)).toBe('activity');
  });

  it('keeps invalid detail hashes on the activity route', () => {
    expect(parseRoute('#/activity/not-a-hash')).toBe('activity');
    expect(parseRoute('#/activity/0x123')).toBe('activity');
    expect(parseRoute('#/activity/')).toBe('activity');
  });
});

describe('parseActivityId', () => {
  it('returns the hash for a valid detail route', () => {
    expect(parseActivityId(`#/activity/${HASH}`)).toBe(HASH);
  });

  it('returns null for the list route', () => {
    expect(parseActivityId('#/activity')).toBeNull();
    expect(parseActivityId('/activity')).toBeNull();
  });

  it('returns null for empty and invalid hashes', () => {
    expect(parseActivityId('')).toBeNull();
    expect(parseActivityId('#/activity/0x123')).toBeNull();
    expect(parseActivityId('#/activity/not-a-hash')).toBeNull();
    expect(parseActivityId('#/activity/0x' + 'g'.repeat(63))).toBeNull();
  });

  it('accepts uppercase hex', () => {
    const upper = '0x' + 'AB'.repeat(32);
    expect(parseActivityId(`#/activity/${upper}`)).toBe(upper);
  });
});

describe('activityHref', () => {
  it('builds the detail hash', () => {
    expect(activityHref(HASH)).toBe(`#/activity/${HASH}`);
  });
});