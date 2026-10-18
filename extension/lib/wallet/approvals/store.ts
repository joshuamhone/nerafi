import type { ApprovalsResult } from './types';

// The most recent approvals result, in memory only, bound to the account it was
// loaded for. Same pattern as history/loaded.ts: it is never written to storage,
// it is read back only for that same account, and it is cleared on lock, on
// account switch and when the session expires.

export type ApprovalsStore = { owner: string; result: ApprovalsResult } | null;

export type ApprovalsSelection = ApprovalsResult | 'not loaded';

// A stored result applies only to the account it was loaded for (case-insensitive).
// Anything else, including nothing stored, is 'not loaded', so a late result for
// an old account can never show on a new one.
export function selectApprovals(store: ApprovalsStore, currentOwner: string): ApprovalsSelection {
  if (store === null) return 'not loaded';
  if (store.owner.trim().toLowerCase() !== currentOwner.trim().toLowerCase()) {
    return 'not loaded';
  }
  return store.result;
}

let snapshot: ApprovalsStore = null;

export function setLoadedApprovals(owner: string, result: ApprovalsResult): void {
  snapshot = { owner, result };
}

export function getLoadedApprovals(currentOwner: string): ApprovalsSelection {
  return selectApprovals(snapshot, currentOwner);
}

export function clearLoadedApprovals(): void {
  snapshot = null;
}
