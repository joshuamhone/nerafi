import type { ApprovalLog, Candidate } from './types';

// Heuristic cap on how many (token, spender) pairs are checked on-chain. Each
// pair costs a request to the public RPC, so the list is bounded.
export const MAX_CANDIDATES = 100;

export type CandidateSet = {
  candidates: Candidate[];
  // More than MAX_CANDIDATES distinct pairs existed.
  capped: boolean;
  // The last page read was still full, so newer logs may be missing.
  pageFull: boolean;
  // capped || pageFull
  truncated: boolean;
};

function newer(a: Candidate, b: Candidate): boolean {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber;
  return a.logIndex > b.logIndex;
}

// Distinct (token, spender) pairs, compared case-insensitively, each represented
// by its newest log, ordered newest first and cut to MAX_CANDIDATES.
export function deriveCandidates(logs: ApprovalLog[], logsMayBeIncomplete: boolean): CandidateSet {
  const byPair = new Map<string, Candidate>();
  for (const log of logs) {
    const key = `${log.token.toLowerCase()}:${log.spender.toLowerCase()}`;
    const candidate: Candidate = {
      token: log.token,
      spender: log.spender,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
    };
    const existing = byPair.get(key);
    if (existing === undefined || newer(candidate, existing)) byPair.set(key, candidate);
  }
  const sorted = Array.from(byPair.values()).sort((a, b) => {
    if (newer(a, b)) return -1;
    if (newer(b, a)) return 1;
    return 0;
  });
  const capped = sorted.length > MAX_CANDIDATES;
  const pageFull = logsMayBeIncomplete;
  return {
    candidates: sorted.slice(0, MAX_CANDIDATES),
    capped,
    pageFull,
    truncated: capped || pageFull,
  };
}
