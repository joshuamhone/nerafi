import { describe, expect, it } from 'vitest';
import { assessApproval, isUnlimited, UNLIMITED_THRESHOLD } from './findings';
import type { ApprovalFindingInput } from './findings';
import type { KnownAddress } from '../lookalike';

const SPENDER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const KNOWN_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const base: ApprovalFindingInput = {
  allowance: 1000n,
  spender: SPENDER,
  spenderCode: 'contract',
  tokenListed: true,
  metadataComplete: true,
  known: [],
};

function ids(overrides: Partial<ApprovalFindingInput>): string[] {
  return assessApproval({ ...base, ...overrides }).map((finding) => finding.id);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

describe('a plain approval', () => {
  it('has no findings: a limited allowance, a contract spender, a listed token, full details', () => {
    expect(assessApproval(base)).toEqual([]);
  });
});

describe('approval_unlimited (heuristic: 2^255 and above)', () => {
  it('the threshold is 2^255', () => {
    expect(UNLIMITED_THRESHOLD).toBe(2n ** 255n);
  });

  it('does not fire one below 2^255', () => {
    expect(isUnlimited(2n ** 255n - 1n)).toBe(false);
    expect(ids({ allowance: 2n ** 255n - 1n })).not.toContain('approval_unlimited');
  });

  it('fires at exactly 2^255', () => {
    expect(isUnlimited(2n ** 255n)).toBe(true);
    const found = assessApproval({ ...base, allowance: 2n ** 255n });
    expect(found.find((f) => f.id === 'approval_unlimited')?.severity).toBe('caution');
  });

  it('fires for the largest possible value, 2^256 - 1', () => {
    expect(ids({ allowance: 2n ** 256n - 1n })).toContain('approval_unlimited');
  });

  it('does not fire for an ordinary amount', () => {
    expect(ids({ allowance: 10n ** 24n })).not.toContain('approval_unlimited');
  });
});

describe('approval_spender_is_wallet', () => {
  it('fires as caution for an ordinary wallet', () => {
    const found = assessApproval({ ...base, spenderCode: 'eoa' });
    expect(found.find((f) => f.id === 'approval_spender_is_wallet')?.severity).toBe('caution');
  });

  it('does not fire for a contract or an unknown spender type', () => {
    expect(ids({ spenderCode: 'contract' })).not.toContain('approval_spender_is_wallet');
    expect(ids({ spenderCode: 'unknown' })).not.toContain('approval_spender_is_wallet');
  });
});

describe('approval_spender_lookalike', () => {
  const known: KnownAddress[] = [{ address: KNOWN_ADDRESS, label: 'Alice', kind: 'contact' }];
  const lookalike = `${KNOWN_ADDRESS.slice(0, 7)}${'1'.repeat(30)}${KNOWN_ADDRESS.slice(-5)}`;

  it('is a lookalike address for the purposes of this test', () => {
    expect(lookalike).toHaveLength(42);
    expect(lookalike.toLowerCase()).not.toBe(KNOWN_ADDRESS.toLowerCase());
  });

  it('fires as danger and names the known address by label', () => {
    const found = assessApproval({ ...base, spender: lookalike, known });
    const finding = found.find((f) => f.id === 'approval_spender_lookalike');
    expect(finding?.severity).toBe('danger');
    expect(finding?.explanation).toContain('Alice');
  });

  it('covers own accounts, contacts and sent recipients', () => {
    for (const kind of ['account', 'contact', 'sent'] as const) {
      expect(
        ids({ spender: lookalike, known: [{ address: KNOWN_ADDRESS, label: 'x', kind }] }),
      ).toContain('approval_spender_lookalike');
    }
  });

  it('does not fire for the known address itself', () => {
    expect(ids({ spender: KNOWN_ADDRESS, known })).not.toContain('approval_spender_lookalike');
    expect(ids({ spender: KNOWN_ADDRESS.toLowerCase(), known })).not.toContain(
      'approval_spender_lookalike',
    );
  });

  it('does not fire for an unrelated spender or an empty known set', () => {
    expect(ids({ spender: SPENDER, known })).not.toContain('approval_spender_lookalike');
    expect(ids({ spender: lookalike, known: [] })).not.toContain('approval_spender_lookalike');
  });

  it('only reads the known set: it is never changed', () => {
    const frozen = deepFreeze<KnownAddress[]>([
      { address: KNOWN_ADDRESS, label: 'Alice', kind: 'contact' },
    ]);
    expect(() => assessApproval({ ...base, spender: lookalike, known: frozen })).not.toThrow();
    expect(frozen).toHaveLength(1);
  });
});

describe('approval_token_unlisted', () => {
  it('fires as info for a token that is not in the list, with the identity caution', () => {
    const found = assessApproval({ ...base, tokenListed: false });
    const finding = found.find((f) => f.id === 'approval_token_unlisted');
    expect(finding?.severity).toBe('info');
    expect(finding?.explanation).toContain('Anyone can create a token with any name');
  });

  it('does not fire for a listed token', () => {
    expect(ids({ tokenListed: true })).not.toContain('approval_token_unlisted');
  });
});

describe('approval_check_failed', () => {
  it('fires as caution when the spender type is unknown', () => {
    const found = assessApproval({ ...base, spenderCode: 'unknown' });
    const finding = found.find((f) => f.id === 'approval_check_failed');
    expect(finding?.severity).toBe('caution');
    expect(finding?.explanation).toContain('whether the spender is a contract');
  });

  it('fires as caution when token details could not be read', () => {
    const found = assessApproval({ ...base, metadataComplete: false });
    expect(found.find((f) => f.id === 'approval_check_failed')?.explanation).toContain(
      "token's details",
    );
  });

  it('fires once when both could not be read', () => {
    const found = assessApproval({ ...base, spenderCode: 'unknown', metadataComplete: false });
    expect(found.filter((f) => f.id === 'approval_check_failed')).toHaveLength(1);
  });

  it('does not fire when everything was read', () => {
    expect(ids({ spenderCode: 'eoa', metadataComplete: true })).not.toContain('approval_check_failed');
  });
});

describe('ordering, purity and wording', () => {
  const all: ApprovalFindingInput = {
    allowance: 2n ** 256n - 1n,
    spender: `${KNOWN_ADDRESS.slice(0, 7)}${'1'.repeat(30)}${KNOWN_ADDRESS.slice(-5)}`,
    spenderCode: 'unknown',
    tokenListed: false,
    metadataComplete: false,
    known: [{ address: KNOWN_ADDRESS, label: 'Alice', kind: 'contact' }],
  };

  it('sorts danger, then caution, then info', () => {
    const found = assessApproval(all);
    const rank = { danger: 0, caution: 1, info: 2 } as const;
    const order = found.map((f) => rank[f.severity]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(found[0]?.severity).toBe('danger');
    expect(found[found.length - 1]?.severity).toBe('info');
  });

  it('is deterministic and does not mutate a deeply frozen input', () => {
    const input = deepFreeze({ ...all });
    expect(assessApproval(input)).toEqual(assessApproval(input));
  });

  it('gives every finding an explanation and an action, and never claims safety', () => {
    const found = assessApproval({ ...all, spenderCode: 'eoa' });
    expect(found.length).toBeGreaterThanOrEqual(4);
    for (const finding of found) {
      expect(finding.explanation.length).toBeGreaterThan(10);
      expect(finding.action.length).toBeGreaterThan(10);
      const text = `${finding.title} ${finding.explanation} ${finding.action}`.toLowerCase();
      for (const word of ['safe', 'secure', 'verified', 'guarantee', 'score']) {
        expect(text).not.toContain(word);
      }
    }
  });
});
