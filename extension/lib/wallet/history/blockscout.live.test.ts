import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockscoutProvider } from './blockscout';
import { FAUCET_ADDRESS, OWN_ADDRESS } from './fixtures/transactions';

const liveJson = JSON.parse(
  readFileSync(new URL('./fixtures/blockscout-live.json', import.meta.url), 'utf8'),
) as { items: Array<Record<string, unknown>>; next_page_params: unknown };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const provider = new BlockscoutProvider();

describe('BlockscoutProvider against the live Blockscout response', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses every item of the live file without skipping', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(liveJson)));
    const page = await provider.fetchPage(OWN_ADDRESS, null, new AbortController().signal);
    expect(page.skipped).toBe(0);
    expect(page.items).toHaveLength(liveJson.items.length);
  });

  it('confirms every item and preserves the file hashes in order', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(liveJson)));
    const page = await provider.fetchPage(OWN_ADDRESS, null, new AbortController().signal);
    page.items.forEach((item, index) => {
      const raw = liveJson.items[index] as Record<string, unknown>;
      expect(item.status).toBe('confirmed');
      expect(item.hash).toBe(raw.hash);
    });
  });

  it('labels the faucet transfer as incoming and the rest as self transfers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(liveJson)));
    const page = await provider.fetchPage(OWN_ADDRESS, null, new AbortController().signal);
    const incoming = page.items.filter(
      (item) => item.from.toLowerCase() === FAUCET_ADDRESS.toLowerCase(),
    );
    expect(incoming).toHaveLength(1);
    for (const item of incoming) expect(item.direction).toBe('in');
    const selfTransfers = page.items.filter(
      (item) => item.from.toLowerCase() !== FAUCET_ADDRESS.toLowerCase(),
    );
    for (const item of selfTransfers) expect(item.direction).toBe('self');
  });

  it('returns a null next cursor when the live file has no next page', async () => {
    expect(liveJson.next_page_params).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(liveJson)));
    const page = await provider.fetchPage(OWN_ADDRESS, null, new AbortController().signal);
    expect(page.nextCursor).toBeNull();
  });
});