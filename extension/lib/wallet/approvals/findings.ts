import type { Finding } from '../risk/types';
import { highestSeverity, sortFindings } from '../risk/types';
import { findLookalike } from '../lookalike';
import type { KnownAddress } from '../lookalike';
import type { SpenderCode } from './types';

// Plain-language findings for one active approval. Advisory: they never change
// anything, and there is no score. Thresholds are heuristics.

// An allowance of 2^255 or more is treated as "unlimited". Wallets and apps
// usually ask for 2^256 - 1 (the largest value), but any amount this large can
// never be used up, so it is treated the same. Heuristic cut-off.
export const UNLIMITED_THRESHOLD = 2n ** 255n;

export type ApprovalFindingInput = {
  allowance: bigint;
  spender: string;
  spenderCode: SpenderCode;
  // True when the token is in the user's own list.
  tokenListed: boolean;
  // True when symbol, name and decimals were all read.
  metadataComplete: boolean;
  // The user's accounts, contacts and sent recipients. Read only here: nothing
  // is added to it.
  known: KnownAddress[];
};

export function isUnlimited(allowance: bigint): boolean {
  return allowance >= UNLIMITED_THRESHOLD;
}

export function assessApproval(input: ApprovalFindingInput): Finding[] {
  const findings: Finding[] = [];

  const lookalike = findLookalike(input.spender, input.known);
  if (lookalike !== null) {
    findings.push({
      id: 'approval_spender_lookalike',
      severity: 'danger',
      title: 'The spender looks like an address you know',
      explanation: `It starts and ends like ${lookalike.known.label} but it is a different address. A lookalike is a common trick to get an approval granted.`,
      action: 'Check every character against the address you expected before leaving this approval in place.',
    });
  }

  if (isUnlimited(input.allowance)) {
    findings.push({
      id: 'approval_unlimited',
      severity: 'caution',
      title: 'Unlimited allowance',
      explanation:
        'The spender can move any amount of this token from your account, now or later, until the approval is removed.',
      action: 'Only keep this if you trust the spender and still use it.',
    });
  }

  if (input.spenderCode === 'eoa') {
    findings.push({
      id: 'approval_spender_is_wallet',
      severity: 'caution',
      title: 'The spender is an ordinary wallet',
      explanation:
        'Apps that use approvals are normally contracts. A person or script controlling a plain wallet can take this token whenever they like.',
      action: 'Be sure you know who controls this address.',
    });
  }

  if (input.spenderCode === 'unknown' || !input.metadataComplete) {
    findings.push({
      id: 'approval_check_failed',
      severity: 'caution',
      title: 'Some details could not be read',
      explanation:
        input.spenderCode === 'unknown'
          ? 'Nerafi could not check whether the spender is a contract.'
          : "Nerafi could not read all of this token's details.",
      action: 'Refresh to try again, and treat the missing details with care.',
    });
  }

  if (!input.tokenListed) {
    findings.push({
      id: 'approval_token_unlisted',
      severity: 'info',
      title: 'This token is not in your list',
      explanation:
        'Anyone can create a token with any name. The contract address is its identity.',
      action: 'Check the token contract address, not its name.',
    });
  }

  return sortFindings(findings);
}

export function approvalLevel(findings: Finding[]) {
  return highestSeverity(findings);
}
