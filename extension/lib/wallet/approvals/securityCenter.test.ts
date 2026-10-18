import { describe, expect, it } from 'vitest';
import { APPROVALS_NOT_LOADED_TEXT, assessApprovalsForSecurityCenter } from './securityCenter';
import type { ActiveApproval, ApprovalsResult } from './types';

function approval(allowance: bigint, n = 1): ActiveApproval {
  return {
    token: `0x${n.toString(16).padStart(40, '0')}`,
    spender: `0x${(n + 500).toString(16).padStart(40, '0')}`,
    allowance,
    tokenInfo: { symbol: 'T', name: 'T', decimals: 18, listed: true, metadataComplete: true },
    spenderCode: 'contract',
  };
}

function loaded(active: ActiveApproval[]): ApprovalsResult {
  return {
    owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    active,
    couldNotCheck: [],
    unreadable: 0,
    otherEvents: 0,
    capped: false,
    pageFull: false,
  };
}

describe('the Security Center approvals check', () => {
  it('says approvals are not loaded when nothing is loaded for this account, and reports no finding', () => {
    const out = assessApprovalsForSecurityCenter('not loaded');
    expect(out.findings).toEqual([]);
    expect(out.skipped).toEqual(['Approvals not loaded yet. Open Approvals.']);
    expect(APPROVALS_NOT_LOADED_TEXT).toBe('Approvals not loaded yet. Open Approvals.');
  });

  it('fires unlimited_approvals as caution when an approval is unlimited', () => {
    const out = assessApprovalsForSecurityCenter(loaded([approval(2n ** 256n - 1n)]));
    expect(out.skipped).toEqual([]);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]?.id).toBe('unlimited_approvals');
    expect(out.findings[0]?.severity).toBe('caution');
    expect(out.findings[0]?.title).toBe('1 unlimited token approval');
  });

  it('counts only the unlimited ones and pluralises', () => {
    const out = assessApprovalsForSecurityCenter(
      loaded([approval(2n ** 255n, 1), approval(5n, 2), approval(2n ** 256n - 1n, 3)]),
    );
    expect(out.findings[0]?.title).toBe('2 unlimited token approvals');
  });

  it('does not fire at 2^255 - 1, for an empty list, or for limited approvals only', () => {
    expect(assessApprovalsForSecurityCenter(loaded([approval(2n ** 255n - 1n)])).findings).toEqual([]);
    expect(assessApprovalsForSecurityCenter(loaded([])).findings).toEqual([]);
    expect(assessApprovalsForSecurityCenter(loaded([approval(1n), approval(2n)])).findings).toEqual([]);
  });

  it('a loaded list with nothing to report skips nothing and says nothing', () => {
    expect(assessApprovalsForSecurityCenter(loaded([approval(1n)]))).toEqual({
      findings: [],
      skipped: [],
    });
  });

  it('never claims anything is safe, secure or verified', () => {
    const out = assessApprovalsForSecurityCenter(loaded([approval(2n ** 256n - 1n)]));
    const text = out.findings.map((f) => `${f.title} ${f.explanation} ${f.action}`).join(' ').toLowerCase();
    for (const word of ['safe', 'secure', 'verified', 'guarantee', 'score']) {
      expect(text).not.toContain(word);
    }
  });
});
