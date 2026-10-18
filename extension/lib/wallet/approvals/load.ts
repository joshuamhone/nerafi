import type { Token } from '../tokens';
import { deriveCandidates } from './candidates';
import { verifyApprovals } from './verify';
import type { ApprovalClient } from './verify';
import type { ApprovalsResult, FetchedApprovalLogs } from './types';

// Where a load has got to: the number of the Blockscout request being sent, then
// the on-chain checks once every request is done.
export type LoadProgress = number | 'verifying';

export type ApprovalsDeps = {
  // Reads Approval logs for the owner from Blockscout, announcing each request
  // (1, 2, 3) just before it is sent.
  fetchLogs: (
    owner: string,
    signal: AbortSignal,
    onRequest?: (request: number) => void,
  ) => Promise<FetchedApprovalLogs>;
  // Reads current state from the Sepolia RPC.
  client: ApprovalClient;
};

// Discovery (the logs say where to look) then verification (the chain says what
// is true now). Read-only throughout.
export async function loadApprovals(
  deps: ApprovalsDeps,
  owner: string,
  tokens: Token[],
  signal: AbortSignal,
  onProgress?: (progress: LoadProgress) => void,
): Promise<ApprovalsResult> {
  const parsed = await deps.fetchLogs(owner, signal, (request) => onProgress?.(request));
  onProgress?.('verifying');
  const set = deriveCandidates(parsed.approvals, parsed.incomplete);
  const checked = await verifyApprovals(deps.client, owner, set.candidates, tokens);
  return {
    owner,
    active: checked.active,
    couldNotCheck: checked.couldNotCheck,
    unreadable: parsed.unreadable,
    otherEvents: parsed.otherEvents,
    capped: set.capped,
    pageFull: set.pageFull,
  };
}
