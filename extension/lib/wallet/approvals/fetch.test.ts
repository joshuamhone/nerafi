import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { approvalLogsUrl, fetchApprovalLogs } from './fetch';
import { APPROVAL_TOPIC0, ApprovalsError } from './parse';

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const range = JSON.parse(
  readFileSync(new URL('./fixtures/approvals-getlogs-range-live.json', import.meta.url), 'utf8'),
) as unknown;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'none';
  } catch (err) {
    return err instanceof ApprovalsError ? err.kind : 'other';
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('approvalLogsUrl', () => {
  const url = approvalLogsUrl(OWNER);

  it('asks the existing Blockscout host, and only that host', () => {
    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('eth-sepolia.blockscout.com');
    expect(url.pathname).toBe('/api');
  });

  it('uses exactly the documented getLogs parameters', () => {
    const params = Object.fromEntries(url.searchParams.entries());
    expect(params).toEqual({
      module: 'logs',
      action: 'getLogs',
      fromBlock: '0',
      toBlock: 'latest',
      topic0: APPROVAL_TOPIC0,
      topic1: `0x000000000000000000000000${OWNER.slice(2).toLowerCase()}`,
      topic0_1_opr: 'and',
    });
  });

  it('pads the owner to 32 bytes regardless of its letter case', () => {
    const lower = approvalLogsUrl(OWNER.toLowerCase()).searchParams.get('topic1');
    expect(lower).toBe(url.searchParams.get('topic1'));
    expect(url.searchParams.get('topic1')).toHaveLength(66);
  });
});

describe('fetchApprovalLogs', () => {
  it('requests the URL once and parses the response', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (target: string) => {
        calls.push(target);
        return jsonResponse(range);
      }),
    );
    const parsed = await fetchApprovalLogs(OWNER, new AbortController().signal);
    expect(calls).toEqual([approvalLogsUrl(OWNER).toString()]);
    // The fixture mixes owners, so with an owner filter most of it is unreadable
    // here; what matters is that every item is accounted for.
    expect(parsed.approvals.length + parsed.otherEvents + parsed.unreadable).toBe(parsed.total);
  });

  it('turns HTTP 429 into a rate-limit error, never "no logs"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { message: 'Too many requests. Increase limits now at https://dev.blockscout.com', result: null, status: '0' },
          429,
        ),
      ),
    );
    expect(await kindOf(fetchApprovalLogs(OWNER, new AbortController().signal))).toBe('rate_limit');
  });

  it('turns a rate-limit body that arrives with HTTP 200 into a rate-limit error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'Too many requests.', result: null, status: '0' })),
    );
    expect(await kindOf(fetchApprovalLogs(OWNER, new AbortController().signal))).toBe('rate_limit');
  });

  it('turns another HTTP error into a fixed http error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    expect(await kindOf(fetchApprovalLogs(OWNER, new AbortController().signal))).toBe('http');
  });

  it('turns a network failure into a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('failed');
      }),
    );
    expect(await kindOf(fetchApprovalLogs(OWNER, new AbortController().signal))).toBe('network');
  });

  it('turns a body that is not JSON into an unreadable-response error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    expect(await kindOf(fetchApprovalLogs(OWNER, new AbortController().signal))).toBe('response');
  });

  it('stops when the caller aborts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_target: string, init?: RequestInit) => {
        if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
        return jsonResponse(range);
      }),
    );
    const controller = new AbortController();
    controller.abort();
    expect(await kindOf(fetchApprovalLogs(OWNER, controller.signal))).toBe('network');
  });

  it('does not make a request for something that is not an address', async () => {
    const spy = vi.fn(async () => jsonResponse(range));
    vi.stubGlobal('fetch', spy);
    expect(await kindOf(fetchApprovalLogs('nope', new AbortController().signal))).toBe('response');
    expect(spy).not.toHaveBeenCalled();
  });
});
