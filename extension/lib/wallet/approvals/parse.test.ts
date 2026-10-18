import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APPROVAL_TOPIC0,
  ApprovalsError,
  parseApprovalLog,
  parseApprovalLogsResponse,
} from './parse';

type Raw = { message: string; result: Array<Record<string, unknown>>; status: string };

function load(file: string): Raw {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'),
  ) as Raw;
}

// A real, unedited getLogs response (trimmed to a handful of items). It came
// from a BLOCK-RANGE query with no owner filter, so it mixes owners; that is why
// the parser is called with no expected owner below.
const range = load('approvals-getlogs-range-live.json');
const firstErc20 = range.result.find((item) => (item.topics as unknown[])[3] === null) ?? {};
const firstOwner = `0x${String((firstErc20.topics as string[])[1]).slice(26)}`;

describe('the Approval topic', () => {
  it('is keccak256("Approval(address,address,uint256)")', () => {
    expect(APPROVAL_TOPIC0).toBe(
      '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
    );
  });
});

describe('the live getLogs fixture', () => {
  it('has the real envelope', () => {
    expect(Object.keys(range).sort()).toEqual(['message', 'result', 'status']);
    expect(range.status).toBe('1');
    expect(range.message).toBe('OK');
  });

  it('accounts for every raw item: none are dropped silently', () => {
    const parsed = parseApprovalLogsResponse(range, null);
    expect(parsed.total).toBe(range.result.length);
    expect(parsed.approvals.length + parsed.otherEvents + parsed.unreadable).toBe(
      range.result.length,
    );
  });

  it('reads every real item: ERC-20 ones as approvals, ERC-721 style ones as "other"', () => {
    const parsed = parseApprovalLogsResponse(range, null);
    expect(parsed.unreadable).toBe(0);
    expect(parsed.approvals).toHaveLength(6);
    expect(parsed.otherEvents).toBe(3);
  });

  it('reads the real field names and hex quantities of an ERC-20 log', () => {
    const [first] = parseApprovalLogsResponse(range, null).approvals;
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.token).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(first.owner).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(first.spender).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(typeof first.value).toBe('bigint');
    expect(first.blockNumber).toBe(BigInt(String(firstErc20.blockNumber)));
    expect(first.logIndex).toBe(Number(BigInt(String(firstErc20.logIndex))));
    expect(first.value).toBe(BigInt(String(firstErc20.data)));
    expect(first.transactionHash).toBe(firstErc20.transactionHash);
  });

  it('checksums addresses that Blockscout sends in lower case', () => {
    const [first] = parseApprovalLogsResponse(range, null).approvals;
    expect(String(firstErc20.address)).toBe(String(firstErc20.address).toLowerCase());
    expect(first?.token.toLowerCase()).toBe(String(firstErc20.address));
    expect(first?.token).not.toBe(String(firstErc20.address));
  });

  it('skips ERC-721 style logs (four topics) and counts them apart from unreadable ones', () => {
    const nft = range.result.filter((item) => (item.topics as unknown[])[3] !== null);
    expect(nft).toHaveLength(3);
    const parsed = parseApprovalLogsResponse({ ...range, result: nft }, null);
    expect(parsed.approvals).toHaveLength(0);
    expect(parsed.otherEvents).toBe(3);
    expect(parsed.unreadable).toBe(0);
  });

  it('only keeps logs for the owner it asked about', () => {
    const forOwner = parseApprovalLogsResponse(range, firstOwner);
    expect(forOwner.approvals.length).toBeGreaterThan(0);
    for (const log of forOwner.approvals) {
      expect(log.owner.toLowerCase()).toBe(firstOwner.toLowerCase());
    }
    // Logs for any other owner are counted, not silently dropped.
    expect(forOwner.approvals.length + forOwner.otherEvents + forOwner.unreadable).toBe(
      range.result.length,
    );
    expect(forOwner.unreadable).toBeGreaterThan(0);
  });

  it('matches the expected owner whatever its letter case', () => {
    const upper = `0x${firstOwner.slice(2).toUpperCase()}`;
    const a = parseApprovalLogsResponse(range, firstOwner);
    const b = parseApprovalLogsResponse(range, upper);
    expect(b.approvals).toEqual(a.approvals);
  });
});

describe('malformed items are counted as unreadable (synthetic variations of a real item)', () => {
  const good = firstErc20;
  const topics = good.topics as Array<string | null>;

  function one(item: unknown) {
    return parseApprovalLogsResponse({ message: 'OK', result: [item], status: '1' }, null);
  }

  it('the unmodified real item parses', () => {
    expect(one(good).approvals).toHaveLength(1);
  });

  const bad: Array<[string, unknown]> = [
    ['not an object', 'text'],
    ['null', null],
    ['an array', []],
    ['no topics', { ...good, topics: undefined }],
    ['too few topics', { ...good, topics: topics.slice(0, 2) }],
    ['too many topics', { ...good, topics: [...topics, 'x'] }],
    ['a non-string topic', { ...good, topics: [topics[0], 5, topics[2], null] }],
    ['another event signature', { ...good, topics: [`0x${'1'.repeat(64)}`, topics[1], topics[2], null] }],
    ['an owner topic with non-zero padding', { ...good, topics: [topics[0], `0x${'1'.repeat(64)}`, topics[2], null] }],
    ['a short spender topic', { ...good, topics: [topics[0], topics[1], '0x1234', null] }],
    ['no address', { ...good, address: undefined }],
    ['a bad address', { ...good, address: '0x123' }],
    ['no data', { ...good, data: undefined }],
    ['data that is not 32 bytes', { ...good, data: '0x01' }],
    ['non-hex data', { ...good, data: `0x${'z'.repeat(64)}` }],
    ['a decimal block number', { ...good, blockNumber: '12345' }],
    ['a missing log index', { ...good, logIndex: undefined }],
    ['a bad transaction hash', { ...good, transactionHash: '0xabc' }],
  ];

  for (const [name, item] of bad) {
    it(`counts ${name} as unreadable, never as an approval or an "other" event`, () => {
      const parsed = one(item);
      expect(parsed.unreadable).toBe(1);
      expect(parsed.approvals).toHaveLength(0);
      expect(parsed.otherEvents).toBe(0);
    });
  }

  it('reads a three-topic log (no null padding) as an ERC-20 approval', () => {
    const parsed = one({ ...good, topics: topics.slice(0, 3) });
    expect(parsed.approvals).toHaveLength(1);
  });

  it('parseApprovalLog reports the kind of each item', () => {
    expect(parseApprovalLog(good, null).kind).toBe('erc20');
    expect(parseApprovalLog({ ...good, topics: [topics[0], topics[1], topics[2], topics[1]] }, null).kind).toBe('other');
    expect(parseApprovalLog('x', null).kind).toBe('unreadable');
  });
});

describe('the response envelope', () => {
  it('reads an empty result array as no logs, whatever the status', () => {
    for (const status of ['0', '1']) {
      const parsed = parseApprovalLogsResponse({ message: 'No logs found', result: [], status }, null);
      expect(parsed).toEqual({ approvals: [], otherEvents: 0, unreadable: 0, total: 0 });
    }
  });

  it('treats the rate-limit reply (result null) as an error, never as "no logs"', () => {
    const limited = {
      message: 'Too many requests. Increase limits now at https://dev.blockscout.com',
      result: null,
      status: '0',
    };
    expect(() => parseApprovalLogsResponse(limited, null)).toThrow(ApprovalsError);
    try {
      parseApprovalLogsResponse(limited, null);
    } catch (err) {
      expect(err instanceof ApprovalsError && err.kind).toBe('rate_limit');
    }
  });

  it('treats any other non-array result as an unreadable response', () => {
    for (const result of [null, undefined, 'x', 5, {}]) {
      let kind: string | null = null;
      try {
        parseApprovalLogsResponse({ message: 'NOTOK', result, status: '0' }, null);
      } catch (err) {
        kind = err instanceof ApprovalsError ? err.kind : 'other';
      }
      expect(kind).toBe('response');
    }
  });

  it('rejects a response that is not an object', () => {
    for (const json of [null, 'x', 5, [], undefined]) {
      expect(() => parseApprovalLogsResponse(json, null)).toThrow(ApprovalsError);
    }
  });

  it('uses fixed messages that never include response text', () => {
    try {
      parseApprovalLogsResponse({ message: 'secret-looking text', result: 'x', status: '0' }, null);
    } catch (err) {
      expect(String(err instanceof Error ? err.message : '')).not.toContain('secret-looking');
    }
  });
});
