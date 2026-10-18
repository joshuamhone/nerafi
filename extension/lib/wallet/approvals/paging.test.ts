import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_DISCOVERY_BUDGET_MS,
  approvalLogsUrl,
  fetchApprovalLogs,
  GETLOGS_PAGE_SIZE,
  MAX_LOG_REQUESTS,
} from './fetch';
import { loadApprovals } from './load';
import {
  APPROVAL_TOPIC0,
  ApprovalsError,
  MSG_RATE_LIMIT,
  MSG_TIMEOUT,
} from './parse';
import type { ApprovalClient } from './verify';

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OWNER_TOPIC = `0x000000000000000000000000${OWNER.slice(2).toLowerCase()}`;

// Items in the real getLogs shape (a SYNTHETIC page: the live API cannot be asked
// for exact boundary cases). Hex quantities, lower-case addresses and a topics
// array padded with null, as the real responses have.
function hex(n: number): string {
  return `0x${n.toString(16)}`;
}

function item(block: number, logIndex: number, n = block * 1000 + logIndex): Record<string, unknown> {
  return {
    address: `0x${(n % 0xffffff).toString(16).padStart(40, '0')}`,
    blockNumber: hex(block),
    data: `0x${'0'.repeat(63)}1`,
    gasPrice: '0x1',
    gasUsed: '0x1',
    logIndex: hex(logIndex),
    timeStamp: '0x1',
    topics: [
      APPROVAL_TOPIC0,
      OWNER_TOPIC,
      `0x${'0'.repeat(24)}${(n % 0xfffff).toString(16).padStart(40, '0')}`,
      null,
    ],
    transactionHash: `0x${n.toString(16).padStart(64, '0')}`,
    transactionIndex: '0x0',
  };
}

// `count` items in low blocks (all below block 600), each with a unique
// (transaction hash, log index), for filling a page before a boundary block.
function lowItems(count: number) {
  return Array.from({ length: count }, (_, i) => item(1 + Math.floor(i / 2), i % 2));
}

// `count` items in ascending order, the last one in block `lastBlock`.
function page(count: number, lastBlock: number, firstBlock = lastBlock - count + 1) {
  return Array.from({ length: count }, (_, i) => item(firstBlock + i, 0));
}

function ok(items: unknown[]): Response {
  return new Response(JSON.stringify({ message: 'OK', result: items, status: '1' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function rateLimited(): Response {
  return new Response(
    JSON.stringify({
      message: 'Too many requests. Increase limits now at https://dev.blockscout.com',
      result: null,
      status: '0',
    }),
    { status: 429, headers: { 'Content-Type': 'application/json' } },
  );
}

function stubPages(responses: Array<() => Response | Promise<Response>>) {
  const calls: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (target: string) => {
      calls.push(new URL(target));
      const next = responses[calls.length - 1];
      if (next === undefined) throw new Error('unexpected extra request');
      return next();
    }),
  );
  return calls;
}

function signal(): AbortSignal {
  return new AbortController().signal;
}

async function failureOf(promise: Promise<unknown>): Promise<ApprovalsError | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    return err instanceof ApprovalsError ? err : null;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the limits', () => {
  it('a page is 1,000 logs and at most three requests are made', () => {
    expect(GETLOGS_PAGE_SIZE).toBe(1000);
    expect(MAX_LOG_REQUESTS).toBe(3);
  });

  it('the first request starts at block 0', () => {
    expect(approvalLogsUrl(OWNER).searchParams.get('fromBlock')).toBe('0');
  });

  it('a later request starts at the given block, in decimal, with the same filters', () => {
    const url = approvalLogsUrl(OWNER, 11270352n);
    expect(url.searchParams.get('fromBlock')).toBe('11270352');
    expect(url.searchParams.get('topic0')).toBe(APPROVAL_TOPIC0);
    expect(url.searchParams.get('topic1')).toBe(OWNER_TOPIC);
    expect(url.searchParams.get('topic0_1_opr')).toBe('and');
  });
});

describe('one page', () => {
  it('a short page is one request and is complete', async () => {
    const calls = stubPages([() => ok(page(3, 100))]);
    const result = await fetchApprovalLogs(OWNER, signal());
    expect(calls).toHaveLength(1);
    expect(result.requests).toBe(1);
    expect(result.incomplete).toBe(false);
    expect(result.approvals).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it('an empty page is one request, no logs, and complete', async () => {
    const calls = stubPages([() => ok([])]);
    const result = await fetchApprovalLogs(OWNER, signal());
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ approvals: [], total: 0, incomplete: false, requests: 1 });
  });

  it('a page one short of full does not trigger a second request', async () => {
    const calls = stubPages([() => ok(page(999, 5000))]);
    const result = await fetchApprovalLogs(OWNER, signal());
    expect(calls).toHaveLength(1);
    expect(result.incomplete).toBe(false);
  });
});

describe('two pages', () => {
  it('a full first page triggers a second request that starts at the last block seen', async () => {
    const calls = stubPages([() => ok(page(1000, 5000)), () => ok(page(40, 5100, 5001))]);
    const result = await fetchApprovalLogs(OWNER, signal());
    expect(calls).toHaveLength(2);
    expect(calls[0]?.searchParams.get('fromBlock')).toBe('0');
    expect(calls[1]?.searchParams.get('fromBlock')).toBe('5000');
    expect(result.requests).toBe(2);
    expect(result.incomplete).toBe(false);
    expect(result.total).toBe(1040);
    expect(result.approvals).toHaveLength(1040);
  });

  it('removes the logs of the boundary block that come back on the second page', async () => {
    // The last block of page one (block 700) holds logs 1, 2 and 3; the second
    // request starts at block 700, so they are returned again, with new ones after.
    const first = [...lowItems(997), item(700, 1), item(700, 2), item(700, 3)];
    expect(first).toHaveLength(1000);
    const second = [item(700, 1), item(700, 2), item(700, 3), item(701, 0), item(702, 0)];
    const calls = stubPages([() => ok(first), () => ok(second)]);
    const result = await fetchApprovalLogs(OWNER, signal());
    expect(calls[1]?.searchParams.get('fromBlock')).toBe('700');
    expect(result.total).toBe(1002);
    expect(result.approvals).toHaveLength(1002);
    const keys = result.approvals.map((a) => `${a.transactionHash}:${a.logIndex}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.incomplete).toBe(false);
  });

  it('counts a repeated ERC-721-style or unreadable item once, not twice', async () => {
    const nft = { ...item(700, 9), topics: [APPROVAL_TOPIC0, OWNER_TOPIC, OWNER_TOPIC, OWNER_TOPIC] };
    const broken = { ...item(700, 8), data: 'nope' };
    const first = [...lowItems(998), nft, broken];
    const second = [nft, broken, item(701, 0)];
    stubPages([() => ok(first), () => ok(second)]);
    const result = await fetchApprovalLogs(OWNER, signal());
    expect(result.otherEvents).toBe(1);
    expect(result.unreadable).toBe(1);
    expect(result.approvals).toHaveLength(999);
    expect(result.total).toBe(1001);
    expect(result.approvals.length + result.otherEvents + result.unreadable).toBe(result.total);
  });
});

describe('the request budget', () => {
  it('stops at three requests, and flags the result when the third page is still full', async () => {
    const calls = stubPages([
      () => ok(page(1000, 1000)),
      () => ok(page(1000, 2000, 1001)),
      () => ok(page(1000, 3000, 2001)),
      () => ok(page(5, 4000)),
    ]);
    const result = await fetchApprovalLogs(OWNER, signal());
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.searchParams.get('fromBlock'))).toEqual(['0', '1000', '2000']);
    expect(result.requests).toBe(3);
    expect(result.incomplete).toBe(true);
    expect(result.total).toBe(3000);
  });

  it('is complete when the third page is not full', async () => {
    const calls = stubPages([
      () => ok(page(1000, 1000)),
      () => ok(page(1000, 2000, 1001)),
      () => ok(page(999, 2999, 2001)),
    ]);
    const result = await fetchApprovalLogs(OWNER, signal());
    expect(calls).toHaveLength(3);
    expect(result.incomplete).toBe(false);
  });

  it('stops, flagged, when a full page makes no progress (every log in the block it started at)', async () => {
    const same = Array.from({ length: 1000 }, (_, i) => item(7, i));
    const calls = stubPages([() => ok(page(1000, 7)), () => ok(same)]);
    const result = await fetchApprovalLogs(OWNER, signal());
    expect(calls).toHaveLength(2);
    expect(result.incomplete).toBe(true);
  });
});

describe('a failure in the middle is an error, never a partial list', () => {
  it('HTTP 429 on the second request fails the whole load, with no automatic retry', async () => {
    const calls = stubPages([() => ok(page(1000, 5000)), () => rateLimited(), () => ok([])]);
    const failure = await failureOf(fetchApprovalLogs(OWNER, signal()));
    expect(failure?.kind).toBe('rate_limit');
    expect(failure?.message).toBe(MSG_RATE_LIMIT);
    expect(calls).toHaveLength(2);
  });

  it('a 429 on the very first request is also exactly one request', async () => {
    const calls = stubPages([() => rateLimited(), () => ok([])]);
    const failure = await failureOf(fetchApprovalLogs(OWNER, signal()));
    expect(failure?.kind).toBe('rate_limit');
    expect(calls).toHaveLength(1);
  });

  it('a rate-limit body with HTTP 200 on the third request fails the whole load', async () => {
    const calls = stubPages([
      () => ok(page(1000, 1000)),
      () => ok(page(1000, 2000, 1001)),
      () =>
        new Response(JSON.stringify({ message: 'Too many requests.', result: null, status: '0' }), {
          status: 200,
        }),
    ]);
    expect((await failureOf(fetchApprovalLogs(OWNER, signal())))?.kind).toBe('rate_limit');
    expect(calls).toHaveLength(3);
  });

  it('an HTTP error, a network failure and an unreadable body mid-sequence all fail the load', async () => {
    const cases: Array<[string, () => Response | Promise<Response>]> = [
      ['http', () => new Response('boom', { status: 500 })],
      ['network', () => Promise.reject(new TypeError('failed'))],
      ['response', () => new Response('<html>', { status: 200 })],
    ];
    for (const [kind, second] of cases) {
      const calls = stubPages([() => ok(page(1000, 5000)), second]);
      const failure = await failureOf(fetchApprovalLogs(OWNER, signal()));
      expect(failure?.kind, kind).toBe(kind);
      expect(calls).toHaveLength(2);
      vi.unstubAllGlobals();
    }
  });

  it('through loadApprovals the load rejects, so nothing can be stored or shown', async () => {
    stubPages([() => ok(page(1000, 5000)), () => rateLimited()]);
    const client: ApprovalClient = {
      getChainId: async () => 11155111,
      getCode: async () => '0x',
      readAllowance: async () => 1n,
      readSymbol: async () => 'T',
      readName: async () => 'T',
      readDecimals: async () => 18,
    };
    await expect(
      loadApprovals({ fetchLogs: fetchApprovalLogs, client }, OWNER, [], signal()),
    ).rejects.toBeInstanceOf(ApprovalsError);
  });
});

describe('an incomplete read reaches the result', () => {
  it('sets pageFull when the last page was still full', async () => {
    stubPages([
      () => ok(page(1000, 1000)),
      () => ok(page(1000, 2000, 1001)),
      () => ok(page(1000, 3000, 2001)),
    ]);
    const client: ApprovalClient = {
      getChainId: async () => 11155111,
      getCode: async () => '0x6080',
      readAllowance: async () => 1n,
      readSymbol: async () => 'T',
      readName: async () => 'T',
      readDecimals: async () => 18,
    };
    const result = await loadApprovals({ fetchLogs: fetchApprovalLogs, client }, OWNER, [], signal());
    expect(result.pageFull).toBe(true);
  });
});

// A response that arrives after `delayMs` of (fake) time, or never if aborted first.
function slow(items: unknown[], delayMs: number) {
  return (init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(ok(items)), delayMs);
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
}

function stubSlowPages(pages: Array<{ items: unknown[]; delayMs: number }>) {
  const calls: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((target: string, init?: RequestInit) => {
      calls.push(new URL(target));
      const next = pages[calls.length - 1];
      if (next === undefined) return Promise.reject(new Error('unexpected extra request'));
      return slow(next.items, next.delayMs)(init);
    }),
  );
  return calls;
}

describe('the overall 60-second discovery budget', () => {
  it('is one budget of 60 seconds, not a limit per request', () => {
    expect(APPROVAL_DISCOVERY_BUDGET_MS).toBe(60_000);
  });

  it('a single request that never answers fails with the timeout error and message', async () => {
    vi.useFakeTimers();
    stubSlowPages([{ items: [], delayMs: 10 * 60_000 }]);
    const pending = failureOf(fetchApprovalLogs(OWNER, signal()));
    await vi.advanceTimersByTimeAsync(APPROVAL_DISCOVERY_BUDGET_MS - 1);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const failure = await pending;
    expect(failure?.kind).toBe('timeout');
    expect(failure?.message).toBe(MSG_TIMEOUT);
    expect(MSG_TIMEOUT).toBe('Blockscout took too long to answer. Try again in a moment.');
  });

  it('a request slower than the old 45-second limit now succeeds if the budget allows', async () => {
    vi.useFakeTimers();
    const calls = stubSlowPages([{ items: page(3, 100), delayMs: 50_000 }]);
    const pending = fetchApprovalLogs(OWNER, signal());
    await vi.advanceTimersByTimeAsync(50_001);
    const result = await pending;
    expect(calls).toHaveLength(1);
    expect(result.approvals).toHaveLength(3);
  });

  it('is shared across pages: slow pages that each fit but together exceed 60 seconds fail the whole load', async () => {
    vi.useFakeTimers();
    // Each page takes 35 seconds. Page 1 ends at 35 s, page 2 would end at 70 s.
    const calls = stubSlowPages([
      { items: page(1000, 1000), delayMs: 35_000 },
      { items: page(5, 2000, 1001), delayMs: 35_000 },
    ]);
    const pending = failureOf(fetchApprovalLogs(OWNER, signal()));
    await vi.advanceTimersByTimeAsync(35_001);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(25_000);
    const failure = await pending;
    expect(failure?.kind).toBe('timeout');
    expect(failure?.message).toBe(MSG_TIMEOUT);
  });

  it('two pages that together fit inside 60 seconds both succeed', async () => {
    vi.useFakeTimers();
    stubSlowPages([
      { items: page(1000, 1000), delayMs: 25_000 },
      { items: page(5, 2000, 1001), delayMs: 25_000 },
    ]);
    const pending = fetchApprovalLogs(OWNER, signal());
    await vi.advanceTimersByTimeAsync(50_001);
    const result = await pending;
    expect(result.requests).toBe(2);
    expect(result.total).toBe(1005);
  });

  it('the budget running out after the first page still fails the load, and returns nothing', async () => {
    vi.useFakeTimers();
    stubSlowPages([
      { items: page(1000, 1000), delayMs: 59_000 },
      { items: page(5, 2000, 1001), delayMs: 5_000 },
    ]);
    let value: unknown = null;
    const pending = fetchApprovalLogs(OWNER, signal()).then(
      (result) => {
        value = result;
        return null;
      },
      (err: unknown) => (err instanceof ApprovalsError ? err : null),
    );
    await vi.advanceTimersByTimeAsync(70_000);
    const failure = await pending;
    expect(failure?.kind).toBe('timeout');
    expect(value).toBeNull();
  });

  it('through loadApprovals an exceeded budget rejects, so the page shows the error state', async () => {
    vi.useFakeTimers();
    stubSlowPages([{ items: [], delayMs: 10 * 60_000 }]);
    const client: ApprovalClient = {
      getChainId: async () => 11155111,
      getCode: async () => '0x',
      readAllowance: async () => 1n,
      readSymbol: async () => 'T',
      readName: async () => 'T',
      readDecimals: async () => 18,
    };
    const pending = loadApprovals({ fetchLogs: fetchApprovalLogs, client }, OWNER, [], signal()).then(
      () => null,
      (err: unknown) => (err instanceof ApprovalsError ? err.kind : 'other'),
    );
    await vi.advanceTimersByTimeAsync(APPROVAL_DISCOVERY_BUDGET_MS + 1);
    expect(await pending).toBe('timeout');
  });

  it('a caller abort is a network failure, not a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_target: string, init?: RequestInit) => {
        if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
        return ok([]);
      }),
    );
    const controller = new AbortController();
    controller.abort();
    expect((await failureOf(fetchApprovalLogs(OWNER, controller.signal)))?.kind).toBe('network');
  });

  it('stops its timer when the load ends, so nothing fires later', async () => {
    vi.useFakeTimers();
    stubPages([() => ok(page(3, 100))]);
    await fetchApprovalLogs(OWNER, signal());
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('progress', () => {
  it('announces each request just before it is sent: 1, then 2, then 3', async () => {
    const events: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        events.push('request');
        return ok(page(1000, 1000 * (events.length)));
      }),
    );
    await fetchApprovalLogs(OWNER, signal(), (request) => events.push(`progress ${request}`));
    expect(events).toEqual([
      'progress 1',
      'request',
      'progress 2',
      'request',
      'progress 3',
      'request',
    ]);
  });

  it('announces only request 1 for a single short page', async () => {
    stubPages([() => ok(page(3, 100))]);
    const seen: number[] = [];
    await fetchApprovalLogs(OWNER, signal(), (request) => seen.push(request));
    expect(seen).toEqual([1]);
  });

  it('announces 1 and 2 when the second page is short', async () => {
    stubPages([() => ok(page(1000, 5000)), () => ok(page(4, 5100, 5001))]);
    const seen: number[] = [];
    await fetchApprovalLogs(OWNER, signal(), (request) => seen.push(request));
    expect(seen).toEqual([1, 2]);
  });

  it('never announces a fourth request', async () => {
    stubPages([
      () => ok(page(1000, 1000)),
      () => ok(page(1000, 2000, 1001)),
      () => ok(page(1000, 3000, 2001)),
    ]);
    const seen: number[] = [];
    await fetchApprovalLogs(OWNER, signal(), (request) => seen.push(request));
    expect(seen).toEqual([1, 2, 3]);
    expect(Math.max(...seen)).toBe(MAX_LOG_REQUESTS);
  });

  it('loadApprovals passes the request numbers on, then says it is verifying', async () => {
    stubPages([() => ok(page(1000, 5000)), () => ok(page(4, 5100, 5001))]);
    const client: ApprovalClient = {
      getChainId: async () => 11155111,
      getCode: async () => '0x6080',
      readAllowance: async () => 0n,
      readSymbol: async () => 'T',
      readName: async () => 'T',
      readDecimals: async () => 18,
    };
    const seen: Array<number | 'verifying'> = [];
    await loadApprovals({ fetchLogs: fetchApprovalLogs, client }, OWNER, [], signal(), (step) =>
      seen.push(step),
    );
    expect(seen).toEqual([1, 2, 'verifying']);
  });

  it('a failed request is announced, then the load fails without announcing verification', async () => {
    stubPages([() => ok(page(1000, 5000)), () => rateLimited()]);
    const client: ApprovalClient = {
      getChainId: async () => 11155111,
      getCode: async () => '0x',
      readAllowance: async () => 1n,
      readSymbol: async () => 'T',
      readName: async () => 'T',
      readDecimals: async () => 18,
    };
    const seen: Array<number | 'verifying'> = [];
    await expect(
      loadApprovals({ fetchLogs: fetchApprovalLogs, client }, OWNER, [], signal(), (step) =>
        seen.push(step),
      ),
    ).rejects.toBeInstanceOf(ApprovalsError);
    expect(seen).toEqual([1, 2]);
  });
});
