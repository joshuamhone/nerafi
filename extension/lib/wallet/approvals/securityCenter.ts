import type { Finding } from '../risk/types';
import { isUnlimited } from './findings';
import type { ApprovalsSelection } from './store';

export const APPROVALS_NOT_LOADED_TEXT = 'Approvals not loaded yet. Open Approvals.';

// The Security Center's one approvals check. It reads only the in-memory result
// for the active account (see store.ts) and makes no request. When nothing is
// loaded for this account it says so rather than reporting the check as clear.
export function assessApprovalsForSecurityCenter(selection: ApprovalsSelection): {
  findings: Finding[];
  skipped: string[];
} {
  if (selection === 'not loaded') {
    return { findings: [], skipped: [APPROVALS_NOT_LOADED_TEXT] };
  }
  const unlimited = selection.active.filter((approval) => isUnlimited(approval.allowance)).length;
  if (unlimited === 0) return { findings: [], skipped: [] };
  return {
    findings: [
      {
        id: 'unlimited_approvals',
        severity: 'caution',
        title: `${unlimited} unlimited token ${unlimited === 1 ? 'approval' : 'approvals'}`,
        explanation:
          'These spenders can move any amount of the token from your account until the approval is removed.',
        action: 'Open Approvals and check that you still trust each spender.',
      },
    ],
    skipped: [],
  };
}
