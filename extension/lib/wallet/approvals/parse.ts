import { getAddress, isAddress, keccak256, toHex } from 'viem';
import { isTransactionHash } from '../history/types';
import { MSG_RATE_LIMIT_FIXED } from './ratelimit';
import type { ApprovalLog, ParsedApprovalLogs } from './types';

// keccak256("Approval(address,address,uint256)"). Computed, not typed in, so a
// typo cannot slip in; a test pins it to its known value.
export const APPROVAL_TOPIC0 = keccak256(toHex('Approval(address,address,uint256)'));

// The wording used when the wait is not known (see ratelimit.ts).
export const MSG_RATE_LIMIT = MSG_RATE_LIMIT_FIXED;
export const MSG_TIMEOUT = 'Blockscout took too long to answer. Try again in a moment.';
export const MSG_NETWORK = 'Could not reach Blockscout.';
export const MSG_HTTP = 'Blockscout returned an error.';
export const MSG_RESPONSE = 'Blockscout returned an unreadable response.';

export class ApprovalsError extends Error {
  readonly kind: 'rate_limit' | 'timeout' | 'network' | 'http' | 'response';
  // For a rate limit: how long Blockscout said the limit will last, when it said.
  readonly retryAfterMs: number | null;

  constructor(kind: ApprovalsError['kind'], message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'ApprovalsError';
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// "0x" followed by 24 zero hex characters and a 40-character address: how an
// address is written in a 32-byte log topic.
const TOPIC_ADDRESS = /^0x0{24}([0-9a-fA-F]{40})$/;

function topicAddress(topic: unknown): string | null {
  if (typeof topic !== 'string') return null;
  const match = TOPIC_ADDRESS.exec(topic);
  const body = match?.[1];
  if (body === undefined) return null;
  const candidate = `0x${body}`;
  return isAddress(candidate, { strict: false }) ? getAddress(candidate.toLowerCase()) : null;
}

export function hexQuantity(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) return null;
  return BigInt(value);
}

type ItemResult =
  | { kind: 'erc20'; log: ApprovalLog }
  | { kind: 'other' }
  | { kind: 'unreadable' };

// One getLogs item. Blockscout pads `topics` to four slots with null, so an
// ERC-20 Approval is [signature, owner, spender, null] and an ERC-721-style one
// has a fourth, non-null topic (the token id).
export function parseApprovalLog(raw: unknown, owner: string | null): ItemResult {
  if (!isRecord(raw)) return { kind: 'unreadable' };
  const topics = raw.topics;
  if (!Array.isArray(topics) || topics.length < 3 || topics.length > 4) {
    return { kind: 'unreadable' };
  }
  if (!topics.every((topic) => topic === null || typeof topic === 'string')) {
    return { kind: 'unreadable' };
  }
  const signature = topics[0];
  if (typeof signature !== 'string' || signature.toLowerCase() !== APPROVAL_TOPIC0) {
    return { kind: 'unreadable' };
  }

  const fourth: unknown = topics.length === 4 ? topics[3] : null;
  if (fourth !== null && fourth !== undefined) return { kind: 'other' };

  const logOwner = topicAddress(topics[1]);
  const spender = topicAddress(topics[2]);
  if (logOwner === null || spender === null) return { kind: 'unreadable' };
  if (owner !== null && logOwner.toLowerCase() !== owner.trim().toLowerCase()) {
    return { kind: 'unreadable' };
  }

  if (typeof raw.address !== 'string' || !isAddress(raw.address, { strict: false })) {
    return { kind: 'unreadable' };
  }
  if (typeof raw.data !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(raw.data)) {
    return { kind: 'unreadable' };
  }
  const blockNumber = hexQuantity(raw.blockNumber);
  const logIndexBig = hexQuantity(raw.logIndex);
  if (blockNumber === null || logIndexBig === null) return { kind: 'unreadable' };
  if (logIndexBig > BigInt(Number.MAX_SAFE_INTEGER)) return { kind: 'unreadable' };
  if (!isTransactionHash(raw.transactionHash)) return { kind: 'unreadable' };

  return {
    kind: 'erc20',
    log: {
      token: getAddress(raw.address.toLowerCase()),
      owner: logOwner,
      spender,
      value: BigInt(raw.data),
      blockNumber,
      logIndex: Number(logIndexBig),
      transactionHash: raw.transactionHash,
    },
  };
}

// The raw items of one response. `result` must be an array: an empty array is
// "no logs", but anything else (null from a rate limit, a string, an object) is
// an error and is never read as "no logs".
export function approvalResultItems(json: unknown): unknown[] {
  if (!isRecord(json)) throw new ApprovalsError('response', MSG_RESPONSE);
  const message = typeof json.message === 'string' ? json.message : '';
  if (!Array.isArray(json.result)) {
    if (/too many requests/i.test(message)) throw new ApprovalsError('rate_limit', MSG_RATE_LIMIT);
    throw new ApprovalsError('response', MSG_RESPONSE);
  }
  return json.result;
}

// Every item is counted exactly once: an approval, an "other" (ERC-721 style)
// event, or unreadable.
export function parseApprovalLogItems(items: unknown[], owner: string | null): ParsedApprovalLogs {
  const approvals: ApprovalLog[] = [];
  let otherEvents = 0;
  let unreadable = 0;
  for (const raw of items) {
    const parsed = parseApprovalLog(raw, owner);
    if (parsed.kind === 'erc20') approvals.push(parsed.log);
    else if (parsed.kind === 'other') otherEvents += 1;
    else unreadable += 1;
  }
  return { approvals, otherEvents, unreadable, total: items.length };
}

// One whole response.
export function parseApprovalLogsResponse(json: unknown, owner: string | null): ParsedApprovalLogs {
  return parseApprovalLogItems(approvalResultItems(json), owner);
}
