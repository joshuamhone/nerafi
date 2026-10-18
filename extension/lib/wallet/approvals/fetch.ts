import { isAddress } from 'viem';
import { BLOCKSCOUT_HOST } from '../history/blockscout';
import {
  APPROVAL_TOPIC0,
  approvalResultItems,
  ApprovalsError,
  hexQuantity,
  MSG_HTTP,
  MSG_NETWORK,
  MSG_RESPONSE,
  MSG_TIMEOUT,
  parseApprovalLogItems,
} from './parse';
import { parseRateLimitReset, RATE_LIMIT_RESET_HEADER, rateLimitMessage } from './ratelimit';
import type { FetchedApprovalLogs } from './types';

// One getLogs call returns at most this many logs (checked live: exactly 1,000,
// oldest first, with the page and offset parameters ignored). A reply this size
// may be only the start of the history.
export const GETLOGS_PAGE_SIZE = 1000;

// At most this many requests per refresh. Keyless Blockscout access is tightly
// rate limited (about 10 requests, then HTTP 429 for most of an hour), so the
// number is deliberately small. If the last page is still full the result is
// flagged as possibly missing newer approvals instead of asking for more.
export const MAX_LOG_REQUESTS = 3;

// One budget for the whole discovery, across every request: getLogs over every
// block for one owner is slow (2 to 8 seconds typical; one request got no answer
// in 90 seconds when tested). When the budget runs out, whatever request is
// running is cancelled and the whole load fails; nothing is returned partially.
export const APPROVAL_DISCOVERY_BUDGET_MS = 60_000;

// Called just before each request is sent, with its number (1, 2 or 3).
export type ProgressCallback = (request: number) => void;

function padOwner(owner: string): string {
  return `0x${owner.slice(2).toLowerCase().padStart(64, '0')}`;
}

// The request this module family makes to Blockscout: Approval logs whose owner
// topic is this account, from `fromBlock` on. Same host as the rest of the
// wallet, keyless.
export function approvalLogsUrl(owner: string, fromBlock: bigint = 0n): URL {
  const url = new URL(`https://${BLOCKSCOUT_HOST}/api`);
  url.searchParams.set('module', 'logs');
  url.searchParams.set('action', 'getLogs');
  url.searchParams.set('fromBlock', fromBlock.toString());
  url.searchParams.set('toBlock', 'latest');
  url.searchParams.set('topic0', APPROVAL_TOPIC0);
  url.searchParams.set('topic1', padOwner(owner));
  url.searchParams.set('topic0_1_opr', 'and');
  return url;
}

type Budget = {
  signal: AbortSignal;
  timedOut: () => boolean;
};

// A rate-limit error whose message says how long to wait when Blockscout told us
// (the x-ratelimit-reset header, readable here because Blockscout lists it in
// access-control-expose-headers) and gives the fixed wording otherwise. This is an
// error, never "no approvals", and nothing retries it.
function rateLimited(response: Response): ApprovalsError {
  const wait = parseRateLimitReset(response.headers.get(RATE_LIMIT_RESET_HEADER));
  return new ApprovalsError('rate_limit', rateLimitMessage(wait), wait);
}

// One request. Every failure is a fixed-message ApprovalsError; nothing is
// retried here or by the caller. `budget.signal` aborts when the caller cancels
// or the overall budget runs out.
async function fetchPage(
  owner: string,
  fromBlock: bigint,
  budget: Budget,
): Promise<unknown[]> {
  const failure = (kind: ApprovalsError['kind'], message: string): ApprovalsError =>
    budget.timedOut() ? new ApprovalsError('timeout', MSG_TIMEOUT) : new ApprovalsError(kind, message);

  let response: Response;
  try {
    response = await fetch(approvalLogsUrl(owner, fromBlock).toString(), {
      signal: budget.signal,
    });
  } catch {
    throw failure('network', MSG_NETWORK);
  }

  // Blockscout answers a rate-limited keyless caller with HTTP 429.
  if (response.status === 429) throw rateLimited(response);
  if (!response.ok) throw failure('http', MSG_HTTP);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw failure('response', MSG_RESPONSE);
  }
  try {
    return approvalResultItems(json);
  } catch (err) {
    // A rate-limit reply can also arrive with HTTP 200 and a "Too many requests" body.
    if (err instanceof ApprovalsError && err.kind === 'rate_limit') throw rateLimited(response);
    throw err;
  }
}

function itemKey(item: unknown): string {
  if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
    const record = item as Record<string, unknown>;
    if (typeof record.transactionHash === 'string' && typeof record.logIndex === 'string') {
      return `${record.transactionHash.toLowerCase()}:${record.logIndex.toLowerCase()}`;
    }
  }
  // An item that cannot be keyed is kept as it is, so it is counted, not lost.
  return JSON.stringify(item);
}

function highestBlock(items: unknown[]): bigint | null {
  let best: bigint | null = null;
  for (const item of items) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const block = hexQuantity((item as Record<string, unknown>).blockNumber);
    if (block !== null && (best === null || block > best)) best = block;
  }
  return best;
}

// All the logs for one owner, in up to MAX_LOG_REQUESTS requests within one
// overall budget. The API returns the oldest logs first and ignores page and
// offset, so when a reply is exactly full the next request starts at the last
// block seen; logs of that block come back again and are removed by (transaction
// hash, log index). Any failure in any request, or the budget running out, fails
// the whole load: a partial list is never returned as complete.
export async function fetchApprovalLogs(
  owner: string,
  externalSignal: AbortSignal,
  onProgress?: ProgressCallback,
): Promise<FetchedApprovalLogs> {
  if (!isAddress(owner)) throw new ApprovalsError('response', MSG_RESPONSE);

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  externalSignal.addEventListener('abort', onExternalAbort);
  if (externalSignal.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, APPROVAL_DISCOVERY_BUDGET_MS);
  const budget: Budget = { signal: controller.signal, timedOut: () => timedOut };

  try {
    const merged: unknown[] = [];
    const seen = new Set<string>();
    let fromBlock = 0n;
    let requests = 0;
    let incomplete = false;

    while (requests < MAX_LOG_REQUESTS) {
      onProgress?.(requests + 1);
      const items = await fetchPage(owner, fromBlock, budget);
      requests += 1;
      for (const item of items) {
        const key = itemKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }

      if (items.length < GETLOGS_PAGE_SIZE) {
        incomplete = false;
        break;
      }

      // A full page: there may be more. Continue from the last block seen, unless
      // that block cannot be read or does not move forward (then asking again would
      // return the same logs), or the request budget is spent.
      incomplete = true;
      const last = highestBlock(items);
      if (last === null || last <= fromBlock) break;
      fromBlock = last;
    }

    return { ...parseApprovalLogItems(merged, owner), incomplete, requests };
  } finally {
    clearTimeout(timer);
    externalSignal.removeEventListener('abort', onExternalAbort);
  }
}
