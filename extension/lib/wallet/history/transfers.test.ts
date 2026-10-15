import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchInternalTransfers,
  fetchTokenTransfers,
  parseInternalTransfer,
  parseInternalTransfersResponse,
  parseTokenTransfer,
  parseTokenTransfersResponse,
} from './transfers';

// Every fixture is a trimmed, unedited response from eth-sepolia.blockscout.com,
// paired with the address it was requested for.
type Fixture = { file: string; account: string };

const TOKEN_FIXTURES: Fixture[] = [
  {
    file: 'token-transfers-live.json',
    account: '0x69ffa62060b9e425166f35789C4EeAc69EFFB37b',
  },
  {
    file: 'token-transfers-zero-live.json',
    account: '0x5496c4A6e05B166dAd2Aa0fab641B2E963A300D4',
  },
  {
    // Native-ETH transfer logs from the system address (null symbol, name and decimals).
    file: 'token-transfers-native-eth-live.json',
    account: '0x1Cd95D029a45f59c71AE0040e6A0a570091E3ac0',
  },
];

const INTERNAL_FIXTURES: Fixture[] = [
  {
    file: 'internal-transactions-live.json',
    account: '0x69ffa62060b9e425166f35789C4EeAc69EFFB37b',
  },
  {
    file: 'internal-transactions-value-live.json',
    account: '0x5cEF1DCe626bDf94D864eb5CAEBD8d9A5101CC61',
  },
  {
    file: 'internal-transactions-create-live.json',
    account: '0x82BB1fde985d1C3736AEA843E9f7023664a14a2D',
  },
  {
    file: 'internal-transactions-tonull-live.json',
    account: '0x1EcB63EDaF2ec875E3F4c5fa658746b64bf598fb',
  },
];

type Raw = { items: Array<Record<string, unknown>>; next_page_params: unknown };

function load(file: string): Raw {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'),
  ) as Raw;
}

describe('token transfer parser against live fixtures', () => {
  for (const { file, account } of TOKEN_FIXTURES) {
    it(`${file}: every raw item parses, none skipped`, () => {
      const raw = load(file);
      expect(raw.items.length).toBeGreaterThan(0);
      const page = parseTokenTransfersResponse(raw, account);
      expect(page.skipped).toBe(0);
      expect(page.items).toHaveLength(raw.items.length);
    });
  }

  it('reads the real field names of a normal transfer', () => {
    const raw = load('token-transfers-live.json');
    const item = parseTokenTransfer(raw.items[0], TOKEN_FIXTURES[0]?.account ?? '');
    expect(item).not.toBeNull();
    if (item === null) return;
    expect(item.kind).toBe('token');
    expect(item.tokenAddress).toBe('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238');
    expect(item.tokenSymbol).toBe('USDC');
    expect(item.decimals).toBe(6);
    expect(typeof item.value).toBe('bigint');
    expect(item.logIndex).toBeGreaterThanOrEqual(0);
    expect(item.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(item.source).toBe('explorer');
  });

  it('parses a zero-value transfer as value 0n', () => {
    const raw = load('token-transfers-zero-live.json');
    const page = parseTokenTransfersResponse(raw, TOKEN_FIXTURES[1]?.account ?? '');
    const zero = page.items.filter((item) => item.value === 0n);
    expect(zero).toHaveLength(1);
    expect(zero[0]?.direction).toBe('in');
    expect(zero[0]?.decimals).toBe(0);
  });

  it('keeps unavailable decimals as null and never guesses', () => {
    const raw = load('token-transfers-native-eth-live.json');
    const page = parseTokenTransfersResponse(raw, TOKEN_FIXTURES[2]?.account ?? '');
    expect(page.items).toHaveLength(raw.items.length);
    for (const item of page.items) {
      expect(item.decimals).toBeNull();
      expect(item.tokenSymbol).toBeNull();
      expect(item.tokenName).toBeNull();
    }
  });

  it('derives the direction from the account', () => {
    const raw = load('token-transfers-zero-live.json');
    const incoming = parseTokenTransfer(raw.items[0], TOKEN_FIXTURES[1]?.account ?? '');
    expect(incoming?.direction).toBe('in');
    const outgoing = parseTokenTransfer(raw.items[0], String(
      (raw.items[0]?.from as { hash: string }).hash,
    ));
    expect(outgoing?.direction).toBe('out');
  });

  it('counts an item that does not involve the account as skipped', () => {
    const raw = load('token-transfers-live.json');
    const page = parseTokenTransfersResponse(raw, '0x0000000000000000000000000000000000000001');
    expect(page.items).toHaveLength(0);
    expect(page.skipped).toBe(raw.items.length);
  });

  it('counts malformed items as skipped instead of throwing', () => {
    const account = TOKEN_FIXTURES[0]?.account ?? '';
    const good = load('token-transfers-live.json').items[0] ?? {};
    const bad: Array<Record<string, unknown>> = [
      { ...good, transaction_hash: 'nope' },
      { ...good, log_index: '3' },
      { ...good, total: { decimals: '6', value: '1.5' } },
      { ...good, total: null },
      { ...good, token: { address_hash: 'nope', decimals: '6' } },
      { ...good, token_type: 'ERC-721' },
      { ...good, from: { hash: 'nope' } },
    ];
    const page = parseTokenTransfersResponse(
      { items: [good, ...bad], next_page_params: null },
      account,
    );
    expect(page.items).toHaveLength(1);
    expect(page.skipped).toBe(bad.length);
  });

  it('treats unusable decimals as unavailable', () => {
    const account = TOKEN_FIXTURES[0]?.account ?? '';
    const good = load('token-transfers-live.json').items[0] ?? {};
    const token = good.token as Record<string, unknown>;
    for (const decimals of ['abc', '99', '-1', 6, true]) {
      const item = parseTokenTransfer(
        { ...good, token: { ...token, decimals }, total: { value: '5', decimals } },
        account,
      );
      expect(item?.decimals).toBeNull();
    }
  });

  it('flags a response without an items array', () => {
    expect(() => parseTokenTransfersResponse({ nope: 1 }, TOKEN_FIXTURES[0]?.account ?? '')).toThrow();
    expect(() => parseTokenTransfersResponse(null, TOKEN_FIXTURES[0]?.account ?? '')).toThrow();
  });

  it('reports whether there is more than the first page', () => {
    const raw = load('token-transfers-zero-live.json');
    expect(raw.next_page_params).not.toBeNull();
    expect(parseTokenTransfersResponse(raw, TOKEN_FIXTURES[1]?.account ?? '').hasMore).toBe(true);
    const single = load('token-transfers-live.json');
    expect(parseTokenTransfersResponse(single, TOKEN_FIXTURES[0]?.account ?? '').hasMore).toBe(
      false,
    );
  });
});

describe('internal transfer parser against live fixtures', () => {
  for (const { file, account } of INTERNAL_FIXTURES) {
    it(`${file}: every raw item parses, none skipped`, () => {
      const raw = load(file);
      expect(raw.items.length).toBeGreaterThan(0);
      const page = parseInternalTransfersResponse(raw, account);
      expect(page.skipped).toBe(0);
      expect(page.items).toHaveLength(raw.items.length);
    });
  }

  it('reads a transfer that carried value', () => {
    const raw = load('internal-transactions-value-live.json');
    const item = parseInternalTransfer(raw.items[0], INTERNAL_FIXTURES[1]?.account ?? '');
    expect(item).not.toBeNull();
    if (item === null) return;
    expect(item.kind).toBe('internal');
    expect(item.valueWei).toBe(12164318985972243573n);
    expect(item.direction).toBe('in');
    expect(item.success).toBe(true);
    expect(item.callType).toBe('call');
    expect(item.explorerFlags.counterpartyScam).toBe(true);
  });

  it('parses zero-value contract calls too (they are filtered later, not dropped here)', () => {
    const raw = load('internal-transactions-live.json');
    const page = parseInternalTransfersResponse(raw, INTERNAL_FIXTURES[0]?.account ?? '');
    expect(page.items.every((item) => item.valueWei === 0n)).toBe(true);
  });

  it('reads a contract creation with its created contract', () => {
    const raw = load('internal-transactions-create-live.json');
    const page = parseInternalTransfersResponse(raw, INTERNAL_FIXTURES[2]?.account ?? '');
    const created = page.items.find((item) => item.callType === 'create');
    expect(created?.createdContract).toBe('0x110C5D844a532A2AE7E66386056dd2178aCd7B54');
    const received = page.items.find((item) => item.callType === 'call');
    expect(received?.valueWei).toBe(22865000000000000n);
    expect(received?.direction).toBe('in');
  });

  it('accepts an item whose "to" is null without dropping it', () => {
    // Synthetic variation of a real item: no real sample has a null "to".
    const raw = load('internal-transactions-live.json');
    const account = INTERNAL_FIXTURES[0]?.account ?? '';
    const item = parseInternalTransfer({ ...raw.items[0], to: null }, account);
    expect(item).not.toBeNull();
    expect(item?.to).toBeNull();
    expect(item?.direction).toBe('out');
  });

  it('counts malformed items as skipped instead of throwing', () => {
    const account = INTERNAL_FIXTURES[1]?.account ?? '';
    const good = load('internal-transactions-value-live.json').items[0] ?? {};
    const bad: Array<Record<string, unknown>> = [
      { ...good, transaction_hash: 'nope' },
      { ...good, index: -1 },
      { ...good, index: '7' },
      { ...good, value: '1.5' },
      { ...good, value: 5 },
      { ...good, success: 'true' },
      { ...good, type: '' },
      { ...good, error: 5 },
      { ...good, from: { hash: 'nope' } },
    ];
    const page = parseInternalTransfersResponse(
      { items: [good, ...bad], next_page_params: null },
      account,
    );
    expect(page.items).toHaveLength(1);
    expect(page.skipped).toBe(bad.length);
  });

  it('counts an item that does not involve the account as skipped', () => {
    const raw = load('internal-transactions-value-live.json');
    const page = parseInternalTransfersResponse(raw, '0x0000000000000000000000000000000000000001');
    expect(page.skipped).toBe(raw.items.length);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetching', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the existing Blockscout host for ERC-20 transfers of the address only', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return jsonResponse(load('token-transfers-live.json'));
      }),
    );
    const account = TOKEN_FIXTURES[0]?.account ?? '';
    const page = await fetchTokenTransfers(account, new AbortController().signal);
    expect(page.items.length).toBeGreaterThan(0);
    expect(calls).toEqual([
      `https://eth-sepolia.blockscout.com/api/v2/addresses/${account}/token-transfers?type=ERC-20`,
    ]);
  });

  it('asks the existing Blockscout host for internal transactions of the address only', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return jsonResponse(load('internal-transactions-live.json'));
      }),
    );
    const account = INTERNAL_FIXTURES[0]?.account ?? '';
    await fetchInternalTransfers(account, new AbortController().signal);
    expect(calls).toEqual([
      `https://eth-sepolia.blockscout.com/api/v2/addresses/${account}/internal-transactions`,
    ]);
  });

  it('throws a fixed message on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    await expect(
      fetchTokenTransfers(TOKEN_FIXTURES[0]?.account ?? '', new AbortController().signal),
    ).rejects.toThrow('Blockscout returned an error.');
  });
});
