import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref } from './router';

describe('parseRoute', () => {
  it('maps the three hash routes', () => {
    expect(parseRoute('#/overview')).toBe('overview');
    expect(parseRoute('#/send')).toBe('send');
    expect(parseRoute('#/receive')).toBe('receive');
  });

  it('maps routes written without the leading hash', () => {
    expect(parseRoute('/overview')).toBe('overview');
    expect(parseRoute('/send')).toBe('send');
    expect(parseRoute('/receive')).toBe('receive');
  });

  it('defaults empty hashes to overview', () => {
    expect(parseRoute('')).toBe('overview');
    expect(parseRoute('#')).toBe('overview');
  });

  it('defaults unknown routes to overview', () => {
    for (const value of ['#/unknown', '#/bogus', '#nonsense', '#/send/', '#/SEND', '/send/2']) {
      expect(parseRoute(value)).toBe('overview');
    }
  });
});

describe('routeHref', () => {
  it('returns the hash for each route', () => {
    expect(routeHref('overview')).toBe('#/overview');
    expect(routeHref('send')).toBe('#/send');
    expect(routeHref('receive')).toBe('#/receive');
  });
});