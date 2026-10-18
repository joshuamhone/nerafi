import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCandidates } from './candidates';
import { fetchApprovalLogs } from './fetch';
import { APPROVAL_TOPIC0, ApprovalsError, parseApprovalLogsResponse } from './parse';

// Every fixture here is a response saved from the live Blockscout API for the
// per-owner query (topic0 = Approval, topic1 = the owner, topic0_1_opr = and).
// The long ones are trimmed to a handful of unedited items; the small-owner and
// empty ones are whole, byte for byte.
type Raw = { message: string; result: Array<Record<string, unknown>>; status: string };

function loadText(file: string): string {
  return readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');
}

function load(file: string): Raw {
  return JSON.parse(loadText(file)) as Raw;
}

const OWNER_SEVERAL = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OWNER_SMALL = '0x1111111111111111111111111111111111111111';
const OWNER_NFT = '0xc2a2edbed8f76856d7e308b110c2e2a7747aae60';
const OWNER_NONE = '0x4f7a1c9e3b5d8062a4c1e7f9b3d5a8c2e6f01934';

const several = load('approvals-getlogs-owner-live.json');
const small = load('approvals-getlogs-small-owner-live.json');
const nft = load('approvals-getlogs-erc721-live.json');
const empty = load('approvals-getlogs-empty-live.json');

function ownerOf(item: Record<string, unknown>): string {
  return `0x${String((item.topics as string[])[1]).slice(26)}`.toLowerCase();
}

function ok(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the per-owner fixtures have the real shape', () => {
  it('an owner with several approvals: every log is an ERC-20 Approval for that owner', () => {
    expect(several.status).toBe('1');
    expect(several.message).toBe('OK');
    expect(several.result.length).toBeGreaterThan(1);
    for (const item of several.result) {
      const topics = item.topics as Array<string | null>;
      expect(topics).toHaveLength(4);
      expect(topics[0]).toBe(APPROVAL_TOPIC0);
      expect(topics[3]).toBeNull();
      expect(ownerOf(item)).toBe(OWNER_SEVERAL.toLowerCase());
      expect(String(item.blockNumber)).toMatch(/^0x[0-9a-f]+$/);
    }
  });

  it('a small owner: a whole response with two ERC-20 logs', () => {
    expect(small.status).toBe('1');
    expect(small.result).toHaveLength(2);
    for (const item of small.result) expect(ownerOf(item)).toBe(OWNER_SMALL.toLowerCase());
  });

  it('an NFT-style owner: four non-null topics and empty data', () => {
    expect(nft.result.length).toBeGreaterThan(0);
    for (const item of nft.result) {
      const topics = item.topics as Array<string | null>;
      expect(topics).toHaveLength(4);
      expect(topics[3]).not.toBeNull();
      expect(item.data).toBe('0x');
      expect(ownerOf(item)).toBe(OWNER_NFT.toLowerCase());
    }
  });

  it('an owner with nothing: status "0", "No logs found" and an empty array, not a null result', () => {
    expect(loadText('approvals-getlogs-empty-live.json')).toBe(
      '{"message":"No logs found","result":[],"status":"0"}',
    );
    expect(empty.status).toBe('0');
    expect(empty.message).toBe('No logs found');
    expect(Array.isArray(empty.result)).toBe(true);
    expect(empty.result).toHaveLength(0);
  });
});

describe('every real per-owner item is read or counted', () => {
  it('several approvals: all read, none unreadable, none other', () => {
    const parsed = parseApprovalLogsResponse(several, OWNER_SEVERAL);
    expect(parsed.total).toBe(several.result.length);
    expect(parsed.approvals).toHaveLength(several.result.length);
    expect(parsed.unreadable).toBe(0);
    expect(parsed.otherEvents).toBe(0);
    for (const log of parsed.approvals) {
      expect(log.owner.toLowerCase()).toBe(OWNER_SEVERAL.toLowerCase());
      expect(typeof log.value).toBe('bigint');
      expect(typeof log.blockNumber).toBe('bigint');
      expect(log.transactionHash).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it('small owner: both logs read', () => {
    const parsed = parseApprovalLogsResponse(small, OWNER_SMALL);
    expect(parsed).toMatchObject({ total: 2, otherEvents: 0, unreadable: 0 });
    expect(parsed.approvals).toHaveLength(2);
  });

  it('NFT-style owner: every item is an "other approval event", none unreadable, none approvals', () => {
    const parsed = parseApprovalLogsResponse(nft, OWNER_NFT);
    expect(parsed.total).toBe(nft.result.length);
    expect(parsed.otherEvents).toBe(nft.result.length);
    expect(parsed.unreadable).toBe(0);
    expect(parsed.approvals).toHaveLength(0);
  });

  it('empty owner: no logs, nothing unreadable, and not an error', () => {
    expect(parseApprovalLogsResponse(empty, OWNER_NONE)).toEqual({
      approvals: [],
      otherEvents: 0,
      unreadable: 0,
      total: 0,
    });
  });

  it('every fixture accounts for every raw item', () => {
    const cases: Array<[Raw, string]> = [
      [several, OWNER_SEVERAL],
      [small, OWNER_SMALL],
      [nft, OWNER_NFT],
      [empty, OWNER_NONE],
    ];
    for (const [raw, owner] of cases) {
      const parsed = parseApprovalLogsResponse(raw, owner);
      expect(parsed.approvals.length + parsed.otherEvents + parsed.unreadable).toBe(raw.result.length);
    }
  });

  it('asking about a different owner makes every ERC-20 log unreadable, never an approval', () => {
    const parsed = parseApprovalLogsResponse(several, OWNER_SMALL);
    expect(parsed.approvals).toHaveLength(0);
    expect(parsed.unreadable).toBe(several.result.length);
  });
});

describe('empty and rate-limited replies are different things', () => {
  it('"No logs found" (status 0, result []) is no approvals; the rate-limit reply (status 0, result null) is an error', () => {
    expect(parseApprovalLogsResponse(empty, OWNER_NONE).total).toBe(0);
    const limited = { message: 'Too many requests. Increase limits now at https://dev.blockscout.com', result: null, status: '0' };
    expect(() => parseApprovalLogsResponse(limited, OWNER_NONE)).toThrow(ApprovalsError);
  });
});

describe('through the fetcher, with each live response', () => {
  async function fetched(file: string, owner: string) {
    vi.stubGlobal('fetch', vi.fn(async () => ok(loadText(file))));
    return fetchApprovalLogs(owner, new AbortController().signal);
  }

  it('several approvals: one request, complete, every item read', async () => {
    const result = await fetched('approvals-getlogs-owner-live.json', OWNER_SEVERAL);
    expect(result.requests).toBe(1);
    expect(result.incomplete).toBe(false);
    expect(result.approvals).toHaveLength(several.result.length);
  });

  it('empty: one request, no logs, complete', async () => {
    const result = await fetched('approvals-getlogs-empty-live.json', OWNER_NONE);
    expect(result).toMatchObject({ approvals: [], total: 0, requests: 1, incomplete: false });
  });

  it('NFT-style: counted as other events', async () => {
    const result = await fetched('approvals-getlogs-erc721-live.json', OWNER_NFT);
    expect(result.otherEvents).toBe(nft.result.length);
    expect(result.approvals).toHaveLength(0);
  });
});

describe('candidates from the real logs', () => {
  it('turns the several-approvals fixture into distinct (token, spender) pairs, newest first', () => {
    const parsed = parseApprovalLogsResponse(several, OWNER_SEVERAL);
    const set = deriveCandidates(parsed.approvals, false);
    expect(set.candidates.length).toBeGreaterThan(0);
    expect(set.candidates.length).toBeLessThanOrEqual(parsed.approvals.length);
    const blocks = set.candidates.map((c) => c.blockNumber);
    expect(blocks).toEqual([...blocks].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)));
    expect(set.truncated).toBe(false);
  });
});
