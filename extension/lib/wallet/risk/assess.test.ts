import { describe, expect, it } from 'vitest';
import {
  assessTransaction,
  DEAD_ADDRESS,
  isHighFeeRatio,
  isLargeShareOfBalance,
  ZERO_ADDRESS,
} from './assess';
import type { RiskInput } from './assess';
import type { RiskReport } from './types';

const ETH = 10n ** 18n;
const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

// A transfer that triggers nothing: a saved contact, a plain account, a small
// share of a large balance, a small fee.
const base: RiskInput = {
  recipientAddress: ADDRESS,
  recipient: { kind: 'contact', name: 'Alice', addedAt: 1 },
  recipientCode: 'eoa',
  recipientIsListedToken: false,
  amountWei: ETH,
  feeWei: ETH / 1000n,
  balanceWei: 100n * ETH,
  isSelfSend: false,
};

function ids(report: RiskReport): string[] {
  return report.findings.map((finding) => finding.id);
}

function assess(overrides: Partial<RiskInput>): RiskReport {
  return assessTransaction({ ...base, ...overrides });
}

const lookalike: RiskInput['recipient'] = {
  kind: 'lookalike',
  match: {
    known: { address: ADDRESS, label: 'Alice', kind: 'contact' },
    prefixMatch: 5,
    suffixMatch: 1,
  },
};

describe('assessTransaction: a clean transfer', () => {
  it('has no findings, level none, and every check ran', () => {
    const report = assessTransaction(base);
    expect(report.findings).toEqual([]);
    expect(report.level).toBe('none');
    expect(report.checksFailed).toEqual([]);
    expect(report.checksRun).toEqual([
      'recipient_classification',
      'burn_address',
      'token_contract',
      'balance_share',
      'fee_ratio',
      'self_send',
      'contract_lookup',
    ]);
  });

  it('has no numeric score anywhere in the report', () => {
    const report = assessTransaction({ ...base, recipient: lookalike });
    expect(Object.keys(report).sort()).toEqual(['checksFailed', 'checksRun', 'findings', 'level']);
    for (const finding of report.findings) {
      expect(Object.keys(finding).sort()).toEqual([
        'action',
        'explanation',
        'id',
        'severity',
        'title',
      ]);
    }
  });
});

describe('lookalike_recipient', () => {
  it('fires as danger and names the known address by label', () => {
    const report = assess({ recipient: lookalike });
    expect(ids(report)).toContain('lookalike_recipient');
    const finding = report.findings.find((f) => f.id === 'lookalike_recipient');
    expect(finding?.severity).toBe('danger');
    expect(finding?.explanation).toContain('Alice');
  });

  it('does not fire for any other classification', () => {
    for (const recipient of [
      { kind: 'own', name: 'Main' },
      { kind: 'contact', name: 'Alice', addedAt: 1 },
      { kind: 'sent' },
      { kind: 'unknown' },
    ] as const) {
      expect(ids(assess({ recipient }))).not.toContain('lookalike_recipient');
    }
  });
});

describe('burn_address', () => {
  it('fires as danger for the zero address and the dead address, in any case', () => {
    for (const address of [ZERO_ADDRESS, DEAD_ADDRESS, DEAD_ADDRESS.toUpperCase().replace('0X', '0x')]) {
      const report = assess({ recipientAddress: address });
      const finding = report.findings.find((f) => f.id === 'burn_address');
      expect(finding?.severity).toBe('danger');
      expect(finding?.explanation).toBe('Funds sent here cannot be recovered.');
    }
  });

  it('does not fire for an ordinary address or one that only resembles dead', () => {
    expect(ids(assess({}))).not.toContain('burn_address');
    expect(
      ids(assess({ recipientAddress: '0x000000000000000000000000000000000000dEaE' })),
    ).not.toContain('burn_address');
  });
});

describe('sending_to_token_contract', () => {
  it('fires as danger when the recipient is a listed token', () => {
    const report = assess({ recipientIsListedToken: true, recipientCode: 'contract' });
    const finding = report.findings.find((f) => f.id === 'sending_to_token_contract');
    expect(finding?.severity).toBe('danger');
    expect(finding?.explanation).toContain('Sending ETH here does not send tokens');
    // The contract finding does not also fire for the same address.
    expect(ids(report)).not.toContain('recipient_is_contract');
  });

  it('does not fire otherwise', () => {
    expect(ids(assess({ recipientIsListedToken: false }))).not.toContain(
      'sending_to_token_contract',
    );
  });
});

describe('recipient_is_contract', () => {
  it('fires as caution for a contract that is not a listed token', () => {
    const report = assess({ recipientCode: 'contract' });
    const finding = report.findings.find((f) => f.id === 'recipient_is_contract');
    expect(finding?.severity).toBe('caution');
    expect(finding?.explanation).toContain('Nerafi cannot yet show what it will do');
  });

  it('does not fire for a plain account, an unknown lookup, or a listed token', () => {
    expect(ids(assess({ recipientCode: 'eoa' }))).not.toContain('recipient_is_contract');
    expect(ids(assess({ recipientCode: 'unknown' }))).not.toContain('recipient_is_contract');
    expect(
      ids(assess({ recipientCode: 'contract', recipientIsListedToken: true })),
    ).not.toContain('recipient_is_contract');
  });
});

describe('first_time_recipient', () => {
  it('fires as caution for an unknown recipient', () => {
    const report = assess({ recipient: { kind: 'unknown' } });
    expect(report.findings.find((f) => f.id === 'first_time_recipient')?.severity).toBe('caution');
  });

  it('does not fire for own, contact, sent or lookalike', () => {
    for (const recipient of [
      { kind: 'own', name: 'Main' },
      { kind: 'contact', name: 'Alice', addedAt: 1 },
      { kind: 'sent' },
      lookalike,
    ] as const) {
      expect(ids(assess({ recipient }))).not.toContain('first_time_recipient');
    }
  });
});

describe('large_share_of_balance (heuristic: 90%)', () => {
  const balance = 1000n;

  it('fires at exactly 90%', () => {
    expect(ids(assess({ balanceWei: balance, amountWei: 890n, feeWei: 10n }))).toContain(
      'large_share_of_balance',
    );
  });

  it('does not fire one wei below 90%', () => {
    expect(ids(assess({ balanceWei: balance, amountWei: 889n, feeWei: 10n }))).not.toContain(
      'large_share_of_balance',
    );
  });

  it('fires one wei above 90%', () => {
    expect(ids(assess({ balanceWei: balance, amountWei: 891n, feeWei: 10n }))).toContain(
      'large_share_of_balance',
    );
  });

  it('counts the fee as part of the share', () => {
    expect(isLargeShareOfBalance(850n, 50n, 1000n)).toBe(true);
    expect(isLargeShareOfBalance(850n, 49n, 1000n)).toBe(false);
  });

  it('is caution, and works with very large balances (bigint maths)', () => {
    const huge = 10n ** 30n;
    expect(isLargeShareOfBalance((huge * 9n) / 10n, 0n, huge)).toBe(true);
    expect(isLargeShareOfBalance((huge * 9n) / 10n - 1n, 0n, huge)).toBe(false);
    const report = assess({ balanceWei: balance, amountWei: 900n, feeWei: 0n });
    expect(report.findings.find((f) => f.id === 'large_share_of_balance')?.severity).toBe('caution');
  });
});

describe('high_fee_ratio (heuristic: fee over 10% of the amount)', () => {
  it('does not fire at exactly 10%', () => {
    expect(isHighFeeRatio(1000n, 100n)).toBe(false);
    expect(ids(assess({ amountWei: 1000n, feeWei: 100n }))).not.toContain('high_fee_ratio');
  });

  it('fires one wei over 10%', () => {
    expect(isHighFeeRatio(1000n, 101n)).toBe(true);
    const report = assess({ amountWei: 1000n, feeWei: 101n });
    expect(report.findings.find((f) => f.id === 'high_fee_ratio')?.severity).toBe('caution');
  });

  it('does not fire one wei under 10%', () => {
    expect(isHighFeeRatio(1000n, 99n)).toBe(false);
  });

  it('does not fire for a zero amount', () => {
    expect(isHighFeeRatio(0n, 5n)).toBe(false);
    expect(ids(assess({ amountWei: 0n, feeWei: 5n }))).not.toContain('high_fee_ratio');
  });
});

describe('self_send', () => {
  it('fires as info', () => {
    const report = assess({ isSelfSend: true });
    expect(report.findings.find((f) => f.id === 'self_send')?.severity).toBe('info');
    expect(report.level).toBe('info');
  });

  it('does not fire otherwise', () => {
    expect(ids(assess({ isSelfSend: false }))).not.toContain('self_send');
  });
});

describe('contract_check_failed', () => {
  it("fires as caution and records 'contract_lookup' as failed, not run", () => {
    const report = assess({ recipientCode: 'unknown' });
    const finding = report.findings.find((f) => f.id === 'contract_check_failed');
    expect(finding?.severity).toBe('caution');
    expect(finding?.explanation).toBe(
      'Nerafi could not check whether this address is a contract.',
    );
    expect(report.checksFailed).toEqual(['contract_lookup']);
    expect(report.checksRun).not.toContain('contract_lookup');
  });

  it('does not fire when the lookup worked, whatever it found', () => {
    for (const recipientCode of ['eoa', 'contract'] as const) {
      const report = assess({ recipientCode });
      expect(ids(report)).not.toContain('contract_check_failed');
      expect(report.checksFailed).toEqual([]);
      expect(report.checksRun).toContain('contract_lookup');
    }
  });

  it('never treats a failed lookup as a plain account', () => {
    expect(ids(assess({ recipientCode: 'unknown' }))).not.toContain('recipient_is_contract');
  });
});

describe('ordering and level', () => {
  it('sorts danger before caution before info', () => {
    const report = assess({
      recipient: lookalike,
      recipientCode: 'unknown',
      isSelfSend: true,
      balanceWei: 1000n,
      amountWei: 950n,
      feeWei: 10n,
    });
    const severities = report.findings.map((f) => f.severity);
    const rank = { danger: 0, caution: 1, info: 2 } as const;
    expect(severities).toEqual([...severities].sort((a, b) => rank[a] - rank[b]));
    expect(severities[0]).toBe('danger');
    expect(severities[severities.length - 1]).toBe('info');
    expect(report.level).toBe('danger');
  });

  it('the level is the highest severity present', () => {
    expect(assess({ recipient: { kind: 'unknown' } }).level).toBe('caution');
    expect(assess({ isSelfSend: true }).level).toBe('info');
    expect(assess({}).level).toBe('none');
    expect(assess({ recipientAddress: DEAD_ADDRESS }).level).toBe('danger');
  });
});

describe('purity', () => {
  it('is deterministic', () => {
    const input: RiskInput = { ...base, recipient: lookalike, recipientCode: 'contract' };
    expect(assessTransaction(input)).toEqual(assessTransaction(input));
  });

  it('does not mutate a deeply frozen input', () => {
    const input = deepFreeze<RiskInput>({
      ...base,
      recipient: lookalike,
      recipientCode: 'unknown',
      recipientIsListedToken: true,
      isSelfSend: true,
      balanceWei: 1000n,
      amountWei: 950n,
      feeWei: 200n,
    });
    expect(() => assessTransaction(input)).not.toThrow();
  });
});

describe('wording', () => {
  it('never claims a transaction or wallet is safe, secure or verified', () => {
    const report = assess({
      recipient: lookalike,
      recipientCode: 'unknown',
      recipientIsListedToken: true,
      isSelfSend: true,
      recipientAddress: DEAD_ADDRESS,
      balanceWei: 1000n,
      amountWei: 950n,
      feeWei: 200n,
    });
    const text = report.findings
      .map((f) => `${f.title} ${f.explanation} ${f.action}`)
      .join(' ')
      .toLowerCase();
    for (const word of ['safe', 'secure', 'verified', 'guarantee']) {
      expect(text).not.toContain(word);
    }
  });
});
