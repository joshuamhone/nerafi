import type { RecipientInfo } from '../recipientSafety';
import { highestSeverity, sortFindings } from './types';
import type { Finding, RiskReport } from './types';

// Every threshold below is a heuristic: a rule of thumb chosen to be generous
// about asking the user to look again, not a measured or validated limit. A
// finding means "worth a second look", never "this is wrong", and no finding
// means only that none of these particular checks fired.

// Heuristic: sending 90% or more of the balance (amount plus the maximum fee)
// leaves little for the next transaction and is often a typo in the amount.
export const LARGE_SHARE_NUMERATOR = 9n;
export const LARGE_SHARE_DENOMINATOR = 10n;

// Heuristic: a maximum fee above 10% of the amount sent is unusual for a plain
// transfer and may mean a very small amount or an unusually busy network.
export const HIGH_FEE_MULTIPLIER = 10n;

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dead';

export type RecipientCode = 'contract' | 'eoa' | 'unknown';

export type RiskInput = {
  // The address being sent to (needed for the burn-address check).
  recipientAddress: string;
  recipient: RecipientInfo;
  // 'unknown' means the lookup failed; it is never treated as 'eoa'.
  recipientCode: RecipientCode;
  recipientIsListedToken: boolean;
  amountWei: bigint;
  feeWei: bigint;
  balanceWei: bigint;
  isSelfSend: boolean;
};

// Check ids, used in checksRun / checksFailed.
export const CHECK_RECIPIENT = 'recipient_classification';
export const CHECK_BURN = 'burn_address';
export const CHECK_TOKEN_CONTRACT = 'token_contract';
export const CHECK_CONTRACT_LOOKUP = 'contract_lookup';
export const CHECK_BALANCE_SHARE = 'balance_share';
export const CHECK_FEE_RATIO = 'fee_ratio';
export const CHECK_SELF_SEND = 'self_send';

// What a failed check means, in plain words, for "Some checks could not run".
export const CHECK_PLAIN_NAMES: Record<string, string> = {
  [CHECK_CONTRACT_LOOKUP]: 'whether this address is a contract',
};

export function plainCheckName(id: string): string {
  return CHECK_PLAIN_NAMES[id] ?? id;
}

export function isBurnAddress(address: string): boolean {
  const lower = address.trim().toLowerCase();
  return lower === ZERO_ADDRESS || lower === DEAD_ADDRESS;
}

// True when amount + fee is at least 90% of the balance. Integer maths only:
// (amount + fee) / balance >= 9 / 10  <=>  (amount + fee) * 10 >= balance * 9.
export function isLargeShareOfBalance(
  amountWei: bigint,
  feeWei: bigint,
  balanceWei: bigint,
): boolean {
  return (
    (amountWei + feeWei) * LARGE_SHARE_DENOMINATOR >= balanceWei * LARGE_SHARE_NUMERATOR
  );
}

// True when the fee is more than 10% of a non-zero amount.
export function isHighFeeRatio(amountWei: bigint, feeWei: bigint): boolean {
  return amountWei > 0n && feeWei * HIGH_FEE_MULTIPLIER > amountWei;
}

// Pure and deterministic: no network, no storage, no clock, and the input is
// never modified. The report is advisory and cannot alter the transaction.
export function assessTransaction(input: RiskInput): RiskReport {
  const findings: Finding[] = [];
  const checksRun: string[] = [CHECK_RECIPIENT, CHECK_BURN, CHECK_TOKEN_CONTRACT];
  const checksFailed: string[] = [];

  if (input.recipient.kind === 'lookalike') {
    const label = input.recipient.match.known.label;
    findings.push({
      id: 'lookalike_recipient',
      severity: 'danger',
      title: 'This address looks like one you know',
      explanation: `It starts and ends like ${label} but it is a different address. Copying an address from your history can send funds to someone who made a lookalike.`,
      action: 'Compare every character with the address you meant to use before you send.',
    });
  }

  if (isBurnAddress(input.recipientAddress)) {
    findings.push({
      id: 'burn_address',
      severity: 'danger',
      title: 'This is a burn address',
      explanation: 'Funds sent here cannot be recovered.',
      action: 'Cancel unless you really mean to destroy these funds.',
    });
  }

  if (input.recipientIsListedToken) {
    findings.push({
      id: 'sending_to_token_contract',
      severity: 'danger',
      title: 'This is a token contract from your list',
      explanation:
        'This is the contract of a token in your list. Sending ETH here does not send tokens and the ETH is likely lost.',
      action: 'Cancel and use the address of the person you want to pay.',
    });
  }

  if (input.recipientCode === 'contract' && !input.recipientIsListedToken) {
    findings.push({
      id: 'recipient_is_contract',
      severity: 'caution',
      title: 'This address is a contract',
      explanation:
        'This address is a contract. Nerafi cannot yet show what it will do with your ETH.',
      action: 'Only continue if you know and trust what this contract does.',
    });
  }

  if (input.recipient.kind === 'unknown') {
    findings.push({
      id: 'first_time_recipient',
      severity: 'caution',
      title: 'First time sending to this address',
      explanation: 'You have not saved or sent to this address before.',
      action: 'Check it against a source you trust, not your transaction history.',
    });
  }

  checksRun.push(CHECK_BALANCE_SHARE);
  if (isLargeShareOfBalance(input.amountWei, input.feeWei, input.balanceWei)) {
    findings.push({
      id: 'large_share_of_balance',
      severity: 'caution',
      title: 'This is most of your balance',
      explanation:
        'The amount plus the maximum fee is 90% or more of what this account holds. A slip in the amount is hard to undo.',
      action: 'Check the amount, and keep some test ETH back for later fees.',
    });
  }

  checksRun.push(CHECK_FEE_RATIO);
  if (isHighFeeRatio(input.amountWei, input.feeWei)) {
    findings.push({
      id: 'high_fee_ratio',
      severity: 'caution',
      title: 'The fee is large compared with the amount',
      explanation: 'The maximum network fee is more than a tenth of the amount you are sending.',
      action: 'Check the amount, or wait for a quieter moment on the network.',
    });
  }

  checksRun.push(CHECK_SELF_SEND);
  if (input.isSelfSend) {
    findings.push({
      id: 'self_send',
      severity: 'info',
      title: 'You are sending to yourself',
      explanation: 'The recipient is the account you are sending from.',
      action: 'Continue only if that is what you meant.',
    });
  }

  if (input.recipientCode === 'unknown') {
    checksFailed.push(CHECK_CONTRACT_LOOKUP);
    findings.push({
      id: 'contract_check_failed',
      severity: 'caution',
      title: 'Could not check this address',
      explanation: 'Nerafi could not check whether this address is a contract.',
      action: 'Try again in a moment, or continue only if you trust this address.',
    });
  } else {
    checksRun.push(CHECK_CONTRACT_LOOKUP);
  }

  const sorted = sortFindings(findings);
  return {
    findings: sorted,
    level: highestSeverity(sorted),
    checksRun,
    checksFailed,
  };
}
