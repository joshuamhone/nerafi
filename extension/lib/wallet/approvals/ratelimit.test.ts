import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchApprovalLogs } from './fetch';
import { loadApprovals } from './load';
import { ApprovalsError, MSG_RATE_LIMIT } from './parse';
import {
  MAX_PLAUSIBLE_RESET_MS,
  MSG_RATE_LIMIT_FIXED,
  parseRateLimitReset,
  rateLimitMessage,
  waitMinutes,
} from './ratelimit';
import type { ApprovalClient } from './verify';

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the fixed wording', () => {
  it('does not promise a short wait and tells the user not to keep pressing Refresh', () => {
    expect(MSG_RATE_LIMIT_FIXED).toBe(
      'Blockscout is rate limiting requests. This can take 15 minutes or more to clear. Refreshing again will not help until then.',
    );
    expect(MSG_RATE_LIMIT_FIXED).not.toContain('in a minute');
  });

  it('is the message the rest of the code already uses for a rate limit', () => {
    expect(MSG_RATE_LIMIT).toBe(MSG_RATE_LIMIT_FIXED);
  });

  it('makes no safety claim', () => {
    const text = MSG_RATE_LIMIT_FIXED.toLowerCase();
    for (const word of ['safe', 'secure', 'verified']) expect(text).not.toContain(word);
  });
});

describe('parseRateLimitReset', () => {
  it('reads milliseconds', () => {
    expect(parseRateLimitReset('837000')).toBe(837_000);
    expect(parseRateLimitReset('654257')).toBe(654_257);
    expect(parseRateLimitReset(' 1000 ')).toBe(1000);
    expect(parseRateLimitReset('1500.5')).toBe(1500.5);
  });

  it('ignores a missing value', () => {
    expect(parseRateLimitReset(null)).toBeNull();
    expect(parseRateLimitReset(undefined)).toBeNull();
    expect(parseRateLimitReset('')).toBeNull();
    expect(parseRateLimitReset('   ')).toBeNull();
  });

  it('ignores anything that is not a plain number', () => {
    for (const bad of ['soon', 'abc', '12abc', '1e9', '0x10', '1,000', 'NaN', 'Infinity', '--5', '5 minutes']) {
      expect(parseRateLimitReset(bad), bad).toBeNull();
    }
  });

  it('ignores a negative value and zero', () => {
    expect(parseRateLimitReset('-5')).toBeNull();
    expect(parseRateLimitReset('-837000')).toBeNull();
    expect(parseRateLimitReset('0')).toBeNull();
  });

  it('ignores an absurdly large value, but accepts exactly one hour', () => {
    expect(MAX_PLAUSIBLE_RESET_MS).toBe(3_600_000);
    expect(parseRateLimitReset('3600000')).toBe(3_600_000);
    expect(parseRateLimitReset('3600001')).toBeNull();
    expect(parseRateLimitReset('999999999999999999999')).toBeNull();
  });
});

describe('the wait in minutes', () => {
  it('rounds up and is never less than one', () => {
    expect(waitMinutes(1)).toBe(1);
    expect(waitMinutes(60_000)).toBe(1);
    expect(waitMinutes(60_001)).toBe(2);
    expect(waitMinutes(837_000)).toBe(14);
    expect(waitMinutes(654_257)).toBe(11);
    expect(waitMinutes(3_600_000)).toBe(60);
  });

  it('is shown in the message, singular for one minute', () => {
    expect(rateLimitMessage(837_000)).toBe(
      'Blockscout is rate limiting requests. Try again in about 14 minutes. Refreshing again will not help until then.',
    );
    expect(rateLimitMessage(30_000)).toContain('about 1 minute.');
  });

  it('falls back to the fixed wording when there is no wait', () => {
    expect(rateLimitMessage(null)).toBe(MSG_RATE_LIMIT_FIXED);
  });
});

// ---- a 429 reaching the fetcher -------------------------------------------------

function limitedBody(): string {
  return JSON.stringify({
    message: 'Too many requests. Increase limits now at https://dev.blockscout.com',
    result: null,
    status: '0',
  });
}

function limited(headers: Record<string, string> = {}): Response {
  return new Response(limitedBody(), {
    status: 429,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function ok(items: unknown[]): Response {
  return new Response(JSON.stringify({ message: 'OK', result: items, status: '1' }), { status: 200 });
}

const client: ApprovalClient = {
  getChainId: async () => 11155111,
  getCode: async () => '0x6080',
  readAllowance: async () => 1n,
  readSymbol: async () => 'T',
  readName: async () => 'T',
  readDecimals: async () => 18,
};

function stub(responses: Array<() => Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (target: string) => {
      calls.push(target);
      const next = responses[calls.length - 1];
      if (next === undefined) throw new Error('unexpected extra request');
      return next();
    }),
  );
  return calls;
}

async function outcome(promise: Promise<unknown>): Promise<{ error: ApprovalsError | null; value: unknown }> {
  try {
    return { error: null, value: await promise };
  } catch (err) {
    return { error: err instanceof ApprovalsError ? err : null, value: undefined };
  }
}

const signal = () => new AbortController().signal;

const CASES: Array<{ name: string; headers: Record<string, string>; message: string; wait: number | null }> = [
  {
    name: 'a valid reset header',
    headers: { 'x-ratelimit-reset': '837000' },
    message: rateLimitMessage(837_000),
    wait: 837_000,
  },
  { name: 'a missing header', headers: {}, message: MSG_RATE_LIMIT_FIXED, wait: null },
  {
    name: 'a garbage header',
    headers: { 'x-ratelimit-reset': 'soon' },
    message: MSG_RATE_LIMIT_FIXED,
    wait: null,
  },
  {
    name: 'a huge value',
    headers: { 'x-ratelimit-reset': '99999999999' },
    message: MSG_RATE_LIMIT_FIXED,
    wait: null,
  },
  {
    name: 'a negative value',
    headers: { 'x-ratelimit-reset': '-1' },
    message: MSG_RATE_LIMIT_FIXED,
    wait: null,
  },
];

describe('HTTP 429 is always an error, never an empty list', () => {
  for (const { name, headers, message, wait } of CASES) {
    it(`fetchApprovalLogs with ${name}: rejects with a rate-limit error, one request, no result`, async () => {
      const calls = stub([() => limited(headers), () => ok([])]);
      const { error, value } = await outcome(fetchApprovalLogs(OWNER, signal()));
      expect(error?.kind).toBe('rate_limit');
      expect(error?.message).toBe(message);
      expect(error?.retryAfterMs).toBe(wait);
      expect(value).toBeUndefined();
      // No automatic retry.
      expect(calls).toHaveLength(1);
    });

    it(`loadApprovals with ${name}: rejects, so the page shows the error and never "no approvals"`, async () => {
      stub([() => limited(headers), () => ok([])]);
      const { error, value } = await outcome(
        loadApprovals({ fetchLogs: fetchApprovalLogs, client }, OWNER, [], signal()),
      );
      expect(error?.kind).toBe('rate_limit');
      expect(error?.message).toBe(message);
      expect(value).toBeUndefined();
    });
  }

  it('the message with a valid header names the wait in whole minutes', async () => {
    stub([() => limited({ 'x-ratelimit-reset': '837000' })]);
    const { error } = await outcome(fetchApprovalLogs(OWNER, signal()));
    expect(error?.message).toContain('about 14 minutes');
  });

  it('the header name is read whatever its letter case', async () => {
    stub([() => limited({ 'X-RateLimit-Reset': '120000' })]);
    const { error } = await outcome(fetchApprovalLogs(OWNER, signal()));
    expect(error?.message).toContain('about 2 minutes');
  });

  it('a rate-limit body that arrives with HTTP 200 is also an error and also uses the header', async () => {
    stub([
      () =>
        new Response(limitedBody(), { status: 200, headers: { 'x-ratelimit-reset': '300000' } }),
    ]);
    const { error, value } = await outcome(fetchApprovalLogs(OWNER, signal()));
    expect(error?.kind).toBe('rate_limit');
    expect(error?.message).toContain('about 5 minutes');
    expect(value).toBeUndefined();
  });

  it('a rate-limit body with HTTP 200 and no header uses the fixed wording', async () => {
    stub([() => new Response(limitedBody(), { status: 200 })]);
    const { error } = await outcome(fetchApprovalLogs(OWNER, signal()));
    expect(error?.message).toBe(MSG_RATE_LIMIT_FIXED);
  });

  it('a 429 on a later page fails the whole load and keeps the wait; nothing is retried', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, '0')}`,
      blockNumber: `0x${(i + 1).toString(16)}`,
      data: `0x${'0'.repeat(63)}1`,
      logIndex: '0x0',
      topics: [
        '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
        `0x000000000000000000000000${OWNER.slice(2).toLowerCase()}`,
        `0x${'0'.repeat(24)}${(i + 5).toString(16).padStart(40, '0')}`,
        null,
      ],
      transactionHash: `0x${(i + 1).toString(16).padStart(64, '0')}`,
    }));
    const calls = stub([() => ok(fullPage), () => limited({ 'x-ratelimit-reset': '600000' }), () => ok([])]);
    const { error, value } = await outcome(fetchApprovalLogs(OWNER, signal()));
    expect(error?.kind).toBe('rate_limit');
    expect(error?.message).toContain('about 10 minutes');
    expect(value).toBeUndefined();
    expect(calls).toHaveLength(2);
  });

  it('other HTTP errors are unaffected and are not called rate limits', async () => {
    stub([() => new Response('boom', { status: 500, headers: { 'x-ratelimit-reset': '1000' } })]);
    const { error } = await outcome(fetchApprovalLogs(OWNER, signal()));
    expect(error?.kind).toBe('http');
    expect(error?.message).toBe('Blockscout returned an error.');
  });
});
