import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockscoutProvider, HistoryError } from './blockscout';
import {
  bareContractCreationItem,
  CONTRACT_ADDRESS,
  contractCreationItem,
  errorRevertedItem,
  failedItem,
  incomingItem,
  longReasonItem,
  makeItem,
  malformedItems,
  nullStatusWithBlockItem,
  okWithOddResultItem,
  outgoingItem,
  OWN_ADDRESS,
  OTHER_ADDRESS,
  pendingItem,
  REAL_HASH,
  realItem,
  TX_HASH,
  unrelatedItem,
  weirdStatusItem,
} from './fixtures/transactions';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function signal(): AbortSignal {
  return new AbortController().signal;
}

function firstItem<T>(items: T[]): T {
  const [value] = items;
  if (value === undefined) throw new Error('expected an item');
  return value;
}

const provider = new BlockscoutProvider();

describe('BlockscoutProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('exposes its name and host', () => {
    expect(provider.name).toBe('Blockscout');
    expect(provider.host).toBe('eth-sepolia.blockscout.com');
  });

  it('parses the real fixture as a confirmed self transfer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [realItem], next_page_params: null })));
    const page = await provider.fetchPage(OWN_ADDRESS, null, signal());
    expect(page.skipped).toBe(0);
    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(1);
    const item = firstItem(page.items);
    expect(item.hash).toBe(REAL_HASH);
    expect(item.direction).toBe('self');
    expect(item.valueWei).toBe(100000000000n);
    expect(item.feeWei).toBe(12000216000n);
    expect(item.status).toBe('confirmed');
    expect(item.blockNumber).toBe(11894000n);
    expect(item.nonce).toBe(3);
    expect(item.timestamp).toBe(Date.parse('2026-10-11T20:06:00.000000Z'));
    expect(item.from).toBe(OWN_ADDRESS);
    expect(item.to).toBe(OWN_ADDRESS);
    expect(item.method).toBeNull();
    expect(item.source).toBe('explorer');
  });

  it('parses an incoming transfer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [incomingItem], next_page_params: null })));
    const item = firstItem((await provider.fetchPage(OWN_ADDRESS, null, signal())).items);
    expect(item.direction).toBe('in');
    expect(item.from).toBe(OTHER_ADDRESS);
    expect(item.to).toBe(OWN_ADDRESS);
    expect(item.explorerFlags.counterpartyScam).toBe(false);
    expect(item.explorerFlags.counterpartyReputation).toBe('ok');
  });

  it('parses an outgoing transfer and surfaces scam flags', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [outgoingItem], next_page_params: null })));
    const item = firstItem((await provider.fetchPage(OWN_ADDRESS, null, signal())).items);
    expect(item.direction).toBe('out');
    expect(item.from).toBe(OWN_ADDRESS);
    expect(item.to).toBe(OTHER_ADDRESS);
    expect(item.explorerFlags.counterpartyScam).toBe(true);
    expect(item.explorerFlags.counterpartyReputation).toBe('low_risk');
  });

  it('parses a failed transfer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [failedItem], next_page_params: null })));
    const item = firstItem((await provider.fetchPage(OWN_ADDRESS, null, signal())).items);
    expect(item.status).toBe('failed');
    expect(item.blockNumber).toBe(11894000n);
  });

  it('parses a pending transfer with no block', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [pendingItem], next_page_params: null })));
    const item = firstItem((await provider.fetchPage(OWN_ADDRESS, null, signal())).items);
    expect(item.status).toBe('pending');
    expect(item.blockNumber).toBeNull();
  });

  it('parses a contract creation with no recipient and the created contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [contractCreationItem], next_page_params: null })));
    const item = firstItem((await provider.fetchPage(OWN_ADDRESS, null, signal())).items);
    expect(item.to).toBeNull();
    expect(item.direction).toBe('out');
    expect(item.isContractCall).toBe(false);
    expect(item.createdContract).toBe(CONTRACT_ADDRESS);
  });

  it('parses a contract creation whose created contract was not returned', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [bareContractCreationItem], next_page_params: null })));
    const item = firstItem((await provider.fetchPage(OWN_ADDRESS, null, signal())).items);
    expect(item.to).toBeNull();
    expect(item.createdContract).toBeNull();
    expect(item.direction).toBe('out');
  });

  it('confirms a status "ok" even when the result text suggests an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [okWithOddResultItem], next_page_params: null })));
    const item = firstItem((await provider.fetchPage(OWN_ADDRESS, null, signal())).items);
    expect(item.status).toBe('confirmed');
    expect(item.errorMessage).toBeNull();
    expect(item.blockNumber).toBe(11894000n);
  });

  it('treats a missing status as pending even with a block number', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [nullStatusWithBlockItem], next_page_params: null })));
    const item = firstItem((await provider.fetchPage(OWN_ADDRESS, null, signal())).items);
    expect(item.status).toBe('pending');
    expect(item.blockNumber).toBe(11894000n);
  });

  it('exposes the result text as the reason for a failed transaction', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [errorRevertedItem], next_page_params: null })));
    const item = firstItem((await provider.fetchPage(OWN_ADDRESS, null, signal())).items);
    expect(item.status).toBe('failed');
    expect(item.errorMessage).toBe('Reverted');
  });

  it('truncates a long failed reason to 200 characters', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [longReasonItem], next_page_params: null })));
    const item = firstItem((await provider.fetchPage(OWN_ADDRESS, null, signal())).items);
    expect(item.status).toBe('failed');
    expect(item.errorMessage).toBe('x'.repeat(200));
  });

  it('treats an unknown status string as pending', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [weirdStatusItem], next_page_params: null })));
    const item = firstItem((await provider.fetchPage(OWN_ADDRESS, null, signal())).items);
    expect(item.status).toBe('pending');
    expect(item.errorMessage).toBeNull();
  });

  it('drops a transaction for neither side of the wallet address', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [unrelatedItem], next_page_params: null })));
    const page = await provider.fetchPage(OWN_ADDRESS, null, signal());
    expect(page.items).toHaveLength(0);
    expect(page.skipped).toBe(1);
  });

  it('skips malformed items and reports the count instead of throwing', async () => {
    const items = [outgoingItem, ...malformedItems];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items, next_page_params: null })));
    const page = await provider.fetchPage(OWN_ADDRESS, null, signal());
    expect(page.items).toHaveLength(1);
    expect(page.skipped).toBe(5);
  });

  it('skips an item that only carries the legacy transaction_hash field', async () => {
    const legacy = makeItem({});
    delete legacy.hash;
    legacy.transaction_hash = TX_HASH;
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [legacy], next_page_params: null })));
    const page = await provider.fetchPage(OWN_ADDRESS, null, signal());
    expect(page.items).toHaveLength(0);
    expect(page.skipped).toBe(1);
  });

  it('appends the cursor to the next request', async () => {
    const calls: Array<{ url: string }> = [];
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      calls.push({ url });
      if (url.includes('block_number=11893155')) {
        return jsonResponse({ items: [outgoingItem], next_page_params: null });
      }
      return jsonResponse({
        items: [realItem],
        next_page_params: { block_number: 11893155, index: '4' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await provider.fetchPage(OWN_ADDRESS, null, signal());
    expect(first.nextCursor).toEqual({ block_number: '11893155', index: '4' });

    const second = await provider.fetchPage(OWN_ADDRESS, first.nextCursor, signal());
    const firstCall = calls[0];
    const secondCall = calls[1];
    if (firstCall === undefined || secondCall === undefined) {
      throw new Error('expected two fetch calls');
    }
    expect(firstCall.url).toContain(`/addresses/${OWN_ADDRESS}/transactions`);
    expect(secondCall.url).toContain('block_number=11893155');
    expect(secondCall.url).toContain('index=4');
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });

  it('stringifies numeric cursor values', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [], next_page_params: { block_number: 42 } })));
    const page = await provider.fetchPage(OWN_ADDRESS, null, signal());
    expect(page.nextCursor).toEqual({ block_number: '42' });
  });

  it('returns null when a cursor value is not scalar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ items: [], next_page_params: { block_number: { nested: true } } })),
    );
    const page = await provider.fetchPage(OWN_ADDRESS, null, signal());
    expect(page.nextCursor).toBeNull();
  });

  it('throws the network error on request failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(provider.fetchPage(OWN_ADDRESS, null, signal())).rejects.toThrow(
      'Could not reach Blockscout.',
    );
  });

  it('throws the network error on timeout', async () => {
    vi.useFakeTimers();
    const abortError = new DOMException('Aborted', 'AbortError');
    const fetchMock = vi.fn(
      (_input: unknown, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(abortError));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const promise = provider.fetchPage(OWN_ADDRESS, null, controller.signal);
    vi.runAllTimers();
    await expect(promise).rejects.toThrow('Could not reach Blockscout.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops silently when the caller aborts', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: unknown, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(abortError));
          }),
      ),
    );
    const controller = new AbortController();
    const promise = provider.fetchPage(OWN_ADDRESS, null, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow(HistoryError);
  });

  it('throws the HTTP error on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"error"}', { status: 500 })));
    await expect(provider.fetchPage(OWN_ADDRESS, null, signal())).rejects.toThrow(
      'Blockscout returned an error.',
    );
  });

  it('throws the response error on invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(provider.fetchPage(OWN_ADDRESS, null, signal())).rejects.toThrow(
      'Blockscout returned an unreadable response.',
    );
  });

  it('throws the response error when items is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ next_page_params: null })));
    await expect(provider.fetchPage(OWN_ADDRESS, null, signal())).rejects.toThrow(
      'Blockscout returned an unreadable response.',
    );
  });
});