import type { KnownAddress } from '../lookalike';
import type { Finding } from '../risk/types';
import { assessApproval } from './findings';
import type { ActiveApproval } from './types';

// Orders the Approvals list so the approval most worth a look comes first. This
// is a display order only: nothing here changes an approval, a finding or what is
// checked, and it assigns no number to anything.

// One row of the list: an approval that was checked on-chain and the findings about it.
export type ApprovalRowData = {
  approval: ActiveApproval;
  findings: Finding[];
};

// The only parts of a row the order depends on, so the function can be tested
// without building a whole approval.
export type SortableRow = {
  approval: { allowance: bigint; token: string; spender: string };
  findings: ReadonlyArray<{ id: string; severity: string }>;
};

// Tiers, highest priority first. A row is placed in the first tier that fits.
//   0: any 'danger' finding
//   1: an unlimited allowance (approval_unlimited) with no danger
//   2: any other 'caution' finding
//   3: everything else
export const TIER_DANGER = 0;
export const TIER_UNLIMITED = 1;
export const TIER_CAUTION = 2;
export const TIER_OTHER = 3;

export function approvalTier(row: SortableRow): number {
  if (row.findings.some((finding) => finding.severity === 'danger')) return TIER_DANGER;
  if (row.findings.some((finding) => finding.id === 'approval_unlimited')) return TIER_UNLIMITED;
  if (row.findings.some((finding) => finding.severity === 'caution')) return TIER_CAUTION;
  return TIER_OTHER;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Returns a NEW array; the input array and its rows are left as they were.
//
// Within a tier the larger allowance comes first. Amounts are the raw on-chain
// integers (bigint, never floats), so they are not adjusted for each token's
// decimals: a raw amount of a token with more decimals can rank above a larger
// real amount of a token with fewer. Full ties are ordered by token address and
// then spender address, lower-cased, and rows that are equal in every respect
// keep the order they came in.
export function sortApprovals<T extends SortableRow>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index, tier: approvalTier(row) }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const left = a.row.approval.allowance;
      const right = b.row.approval.allowance;
      if (left !== right) return left > right ? -1 : 1;
      const byToken = compareText(
        a.row.approval.token.toLowerCase(),
        b.row.approval.token.toLowerCase(),
      );
      if (byToken !== 0) return byToken;
      const bySpender = compareText(
        a.row.approval.spender.toLowerCase(),
        b.row.approval.spender.toLowerCase(),
      );
      if (bySpender !== 0) return bySpender;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

// The rows the page shows: each checked approval with its findings, in order.
// `known` is only read (for the lookalike check); it is never changed.
export function buildApprovalRows(
  active: readonly ActiveApproval[],
  known: KnownAddress[],
): ApprovalRowData[] {
  return sortApprovals(
    active.map((approval) => ({
      approval,
      findings: assessApproval({
        allowance: approval.allowance,
        spender: approval.spender,
        spenderCode: approval.spenderCode,
        tokenListed: approval.tokenInfo.listed,
        metadataComplete: approval.tokenInfo.metadataComplete,
        known,
      }),
    })),
  );
}
