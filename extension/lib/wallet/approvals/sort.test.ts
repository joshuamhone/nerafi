import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  approvalTier,
  buildApprovalRows,
  sortApprovals,
  TIER_CAUTION,
  TIER_DANGER,
  TIER_OTHER,
  TIER_UNLIMITED,
} from './sort';
import type { SortableRow } from './sort';
import type { ActiveApproval, SpenderCode } from './types';
import type { KnownAddress } from '../lookalike';

type Severity = 'danger' | 'caution' | 'info';
type Named = SortableRow & { name: string };

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function address(n: number): string {
  return `0x${n.toString(16).padStart(40, '0')}`;
}

// A row with only what the order depends on.
function row(
  name: string,
  allowance: bigint,
  findings: Array<[string, Severity]> = [],
  token = address(1),
  spender = address(2),
): Named {
  return {
    name,
    approval: { allowance, token, spender },
    findings: findings.map(([id, severity]) => ({ id, severity })),
  };
}

function names(rows: Named[]): string[] {
  return rows.map((r) => r.name);
}

describe('approvalTier', () => {
  it('puts a row in the first tier that fits', () => {
    expect(approvalTier(row('a', 1n, [['x', 'danger']]))).toBe(TIER_DANGER);
    expect(approvalTier(row('a', 1n, [['approval_unlimited', 'caution']]))).toBe(TIER_UNLIMITED);
    expect(approvalTier(row('a', 1n, [['approval_spender_is_wallet', 'caution']]))).toBe(TIER_CAUTION);
    expect(approvalTier(row('a', 1n, [['approval_token_unlisted', 'info']]))).toBe(TIER_OTHER);
    expect(approvalTier(row('a', 1n))).toBe(TIER_OTHER);
  });

  it('a danger finding outranks an unlimited allowance on the same row', () => {
    const both = row('a', 1n, [
      ['approval_unlimited', 'caution'],
      ['approval_spender_lookalike', 'danger'],
    ]);
    expect(approvalTier(both)).toBe(TIER_DANGER);
  });

  it('is unlimited by the finding id, not by guessing from the amount', () => {
    expect(approvalTier(row('a', 2n ** 256n - 1n))).toBe(TIER_OTHER);
  });
});

describe('tier order', () => {
  // The amounts are arranged so that sorting by amount alone would give the
  // opposite order: the highest tier always has the smallest allowance.
  const danger = row('danger', 1n, [['approval_spender_lookalike', 'danger']]);
  const unlimited = row('unlimited', 2n, [['approval_unlimited', 'caution']]);
  const caution = row('caution', 3n, [['approval_check_failed', 'caution']]);
  const other = row('other', 4n, [['approval_token_unlisted', 'info']]);

  it('danger, then unlimited, then any caution, then everything else', () => {
    expect(names(sortApprovals([other, caution, unlimited, danger]))).toEqual([
      'danger',
      'unlimited',
      'caution',
      'other',
    ]);
  });

  it('gives the same order whatever order the rows arrive in', () => {
    const all = [danger, unlimited, caution, other];
    const permutations: Named[][] = [
      [danger, unlimited, caution, other],
      [other, caution, unlimited, danger],
      [caution, other, danger, unlimited],
      [unlimited, danger, other, caution],
    ];
    for (const input of permutations) {
      expect(input).toHaveLength(all.length);
      expect(names(sortApprovals(input))).toEqual(['danger', 'unlimited', 'caution', 'other']);
    }
  });

  it('a row with a danger finding beats a row that is only unlimited, whatever the amounts', () => {
    const small = row('small danger', 1n, [
      ['approval_unlimited', 'caution'],
      ['approval_spender_lookalike', 'danger'],
    ]);
    const huge = row('huge unlimited', 2n ** 256n - 1n, [['approval_unlimited', 'caution']]);
    expect(names(sortApprovals([huge, small]))).toEqual(['small danger', 'huge unlimited']);
  });

  it('an unlimited row beats a caution-only row even when the caution amount is larger', () => {
    const lowUnlimited = row('unlimited', 5n, [['approval_unlimited', 'caution']]);
    const bigCaution = row('caution', 10n ** 30n, [['approval_spender_is_wallet', 'caution']]);
    expect(names(sortApprovals([bigCaution, lowUnlimited]))).toEqual(['unlimited', 'caution']);
  });

  it('a caution row beats a row with only info findings or none, whatever the amounts', () => {
    const smallCaution = row('caution', 1n, [['approval_spender_is_wallet', 'caution']]);
    const bigInfo = row('info', 10n ** 30n, [['approval_token_unlisted', 'info']]);
    const bigNone = row('none', 10n ** 31n);
    expect(names(sortApprovals([bigNone, bigInfo, smallCaution]))[0]).toBe('caution');
  });

  it('rows with only info findings and rows with none share the last tier and go by amount', () => {
    const info = row('info', 5n, [['approval_token_unlisted', 'info']]);
    const none = row('none', 9n);
    expect(names(sortApprovals([info, none]))).toEqual(['none', 'info']);
  });
});

describe('amount within a tier', () => {
  it('puts the larger allowance first', () => {
    const small = row('small', 5n);
    const large = row('large', 1000n);
    expect(names(sortApprovals([small, large]))).toEqual(['large', 'small']);
  });

  it('compares as bigint, not as a float: amounts that differ by 1 above 2^53', () => {
    const base = 2n ** 60n;
    // As numbers these are equal, so a float comparison could not order them.
    expect(Number(base + 1n)).toBe(Number(base));
    // The larger amount deliberately has the LATER token address, so the address
    // tiebreak would give the wrong answer if the amounts were wrongly seen as equal.
    const lower = row('lower', base, [], address(1), address(1));
    const higher = row('higher', base + 1n, [], address(9), address(9));
    expect(names(sortApprovals([lower, higher]))).toEqual(['higher', 'lower']);
    expect(names(sortApprovals([higher, lower]))).toEqual(['higher', 'lower']);
  });

  it('compares correctly near 2^255 and 2^256', () => {
    const a = row('a', 2n ** 255n + 1n, [['approval_unlimited', 'caution']]);
    const b = row('b', 2n ** 255n, [['approval_unlimited', 'caution']]);
    const c = row('c', 2n ** 256n - 1n, [['approval_unlimited', 'caution']]);
    expect(names(sortApprovals([b, a, c]))).toEqual(['c', 'a', 'b']);
  });

  it('uses the raw on-chain amount, not an amount adjusted for decimals', () => {
    // 5 whole tokens of an 18-decimal token (5e18 raw) outrank 1000 whole tokens
    // of a 6-decimal token (1e9 raw): the order is by raw amount, as specified.
    const eighteen = row('5 of 18-decimals', 5n * 10n ** 18n);
    const six = row('1000 of 6-decimals', 1000n * 10n ** 6n);
    expect(names(sortApprovals([six, eighteen]))).toEqual(['5 of 18-decimals', '1000 of 6-decimals']);
  });
});

describe('ties', () => {
  it('orders equal amounts by token address, then spender address', () => {
    const rows = [
      row('t2 s1', 7n, [], address(0x22), address(0x01)),
      row('t1 s2', 7n, [], address(0x11), address(0x02)),
      row('t1 s1', 7n, [], address(0x11), address(0x01)),
      row('t2 s2', 7n, [], address(0x22), address(0x02)),
    ];
    expect(names(sortApprovals(rows))).toEqual(['t1 s1', 't1 s2', 't2 s1', 't2 s2']);
  });

  it('compares addresses lower-cased, so letter case never changes the order', () => {
    // Raw strings would put "0xB..." before "0xa..." (uppercase sorts first); the
    // lower-cased addresses put "0xa..." first.
    const upper = row('upper B', 7n, [], `0xB${'0'.repeat(39)}`);
    const lower = row('lower a', 7n, [], `0xa${'0'.repeat(39)}`);
    expect(names(sortApprovals([upper, lower]))).toEqual(['lower a', 'upper B']);
    expect(names(sortApprovals([lower, upper]))).toEqual(['lower a', 'upper B']);
  });

  it('keeps the input order for rows that are equal in every respect', () => {
    const token = `0x${'a'.repeat(40)}`;
    const first = row('first', 7n, [], token, address(5));
    const second = row('second', 7n, [], token.toUpperCase().replace('0X', '0x'), address(5));
    const third = row('third', 7n, [], token, address(5));
    expect(names(sortApprovals([first, second, third]))).toEqual(['first', 'second', 'third']);
    expect(names(sortApprovals([third, first, second]))).toEqual(['third', 'first', 'second']);
  });

  it('is deterministic: sorting twice gives the same order', () => {
    const rows = [
      row('a', 3n, [['approval_unlimited', 'caution']], address(3)),
      row('b', 3n, [['approval_unlimited', 'caution']], address(1)),
      row('c', 9n, [], address(2)),
    ];
    expect(names(sortApprovals(sortApprovals(rows)))).toEqual(names(sortApprovals(rows)));
  });
});

describe('purity', () => {
  it('returns a new array and does not change the input', () => {
    const rows = deepFreeze([
      row('b', 1n),
      row('a', 9n, [['x', 'danger']]),
      row('c', 5n, [['approval_unlimited', 'caution']]),
    ]);
    const before = rows.map((r) => r.name);
    const out = sortApprovals(rows);
    expect(out).not.toBe(rows);
    expect(rows.map((r) => r.name)).toEqual(before);
    expect(names(out)).toEqual(['a', 'c', 'b']);
    // The rows themselves are passed through, not copied or altered.
    expect(out.every((item) => rows.includes(item))).toBe(true);
  });

  it('does not mutate a frozen input array (sorting in place would throw)', () => {
    const frozen = Object.freeze([row('x', 1n), row('y', 2n)]);
    expect(() => sortApprovals(frozen)).not.toThrow();
  });

  it('returns an empty array for an empty list', () => {
    const empty: Named[] = [];
    const out = sortApprovals(empty);
    expect(out).toEqual([]);
    expect(out).not.toBe(empty);
  });

  it('returns a one-item list unchanged', () => {
    const only = row('only', 1n);
    expect(sortApprovals([only])).toEqual([only]);
  });
});

// ---- the real case, built with the real findings ---------------------------------

const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const ACCOUNT_1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ACCOUNT_2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const UNIT = 10n ** 6n;

function usdc(
  allowance: bigint,
  spender: string,
  spenderCode: SpenderCode,
  metadataComplete = true,
): ActiveApproval {
  return {
    token: USDC,
    spender,
    allowance,
    spenderCode,
    tokenInfo: { symbol: 'USDC', name: 'USDC', decimals: 6, listed: false, metadataComplete },
  };
}

describe('the approvals made by the local test helper (real USDC case)', () => {
  const unlimitedToWallet = usdc(2n ** 256n - 1n, ACCOUNT_1, 'eoa');
  const thousandToContract = usdc(1000n * UNIT, USDC, 'contract');
  const fiveToWallet = usdc(5n * UNIT, ACCOUNT_2, 'eoa');

  function order(input: ActiveApproval[], known: KnownAddress[] = []): string[] {
    return buildApprovalRows(input, known).map((r) => {
      if (r.approval === unlimitedToWallet) return 'unlimited to wallet';
      if (r.approval === fiveToWallet) return '5 to wallet';
      if (r.approval === thousandToContract) return '1000 to contract';
      return 'other';
    });
  }

  it('the findings are what the tiers assume', () => {
    const rows = buildApprovalRows([unlimitedToWallet, thousandToContract, fiveToWallet], []);
    const ids = (a: ActiveApproval) =>
      (rows.find((r) => r.approval === a)?.findings ?? []).map((f) => f.id).sort();
    expect(ids(unlimitedToWallet)).toEqual([
      'approval_spender_is_wallet',
      'approval_token_unlisted',
      'approval_unlimited',
    ]);
    expect(ids(fiveToWallet)).toEqual(['approval_spender_is_wallet', 'approval_token_unlisted']);
    // To a contract, finite, with every detail read: only the info note remains.
    expect(ids(thousandToContract)).toEqual(['approval_token_unlisted']);
  });

  it('sorts Unlimited first, then 5 (a wallet: caution), then 1000 (a contract: no caution)', () => {
    expect(order([unlimitedToWallet, thousandToContract, fiveToWallet])).toEqual([
      'unlimited to wallet',
      '5 to wallet',
      '1000 to contract',
    ]);
  });

  it('gives that order for every discovery order, including the one seen on the real chain', () => {
    const all = [unlimitedToWallet, thousandToContract, fiveToWallet];
    // Unlimited discovered last, below the two lesser rows, as in the real test.
    const permutations = [
      [fiveToWallet, thousandToContract, unlimitedToWallet],
      [thousandToContract, fiveToWallet, unlimitedToWallet],
      [unlimitedToWallet, fiveToWallet, thousandToContract],
      [thousandToContract, unlimitedToWallet, fiveToWallet],
    ];
    for (const input of permutations) {
      expect(input).toHaveLength(all.length);
      expect(order(input)).toEqual(['unlimited to wallet', '5 to wallet', '1000 to contract']);
    }
  });

  it('the 5 and the 1000 are NOT ordered by amount: the wallet spender is the reason', () => {
    // Amount alone would put 1000 above 5. The tiers put 5 above 1000 because 5
    // goes to an ordinary wallet (a caution) and 1000 goes to a contract.
    expect(1000n * UNIT > 5n * UNIT).toBe(true);
    expect(order([thousandToContract, fiveToWallet])).toEqual(['5 to wallet', '1000 to contract']);
  });

  it('would order 1000 above 5 if the 1000 row also carried a caution (token details unreadable)', () => {
    // If the token's symbol or decimals could not be read, the 1000 row gains an
    // approval_check_failed caution, joins the same tier as the 5, and wins on amount.
    const thousandUnread = usdc(1000n * UNIT, USDC, 'contract', false);
    const rows = buildApprovalRows([fiveToWallet, thousandUnread, unlimitedToWallet], []);
    expect(rows.map((r) => r.approval)).toEqual([unlimitedToWallet, thousandUnread, fiveToWallet]);
  });

  it('puts an approval to a lookalike of a known address first, whatever the amount', () => {
    const known: KnownAddress[] = [{ address: ACCOUNT_1, label: 'Account 2', kind: 'account' }];
    const lookalike = `${ACCOUNT_1.slice(0, 7)}${'1'.repeat(30)}${ACCOUNT_1.slice(-5)}`;
    const tiny = usdc(1n, lookalike, 'contract');
    const rows = buildApprovalRows([unlimitedToWallet, fiveToWallet, tiny], known);
    expect(rows[0]?.approval).toBe(tiny);
    expect(rows[0]?.findings.some((f) => f.severity === 'danger')).toBe(true);
  });

  it('does not change the approvals or the known set it is given', () => {
    const input = deepFreeze([unlimitedToWallet, thousandToContract, fiveToWallet].map((a) => ({ ...a })));
    const known = deepFreeze<KnownAddress[]>([{ address: ACCOUNT_2, label: 'x', kind: 'contact' }]);
    expect(() => buildApprovalRows(input, known)).not.toThrow();
    expect(input).toHaveLength(3);
    expect(known).toHaveLength(1);
  });

  it('returns nothing for no approvals', () => {
    expect(buildApprovalRows([], [])).toEqual([]);
  });
});

// ---- where the sort is applied ------------------------------------------------------

describe('the page gets its sorted rows from the library, not from the component', () => {
  const page = readFileSync(
    new URL('../../../entrypoints/wallet/pages/ApprovalsPage.tsx', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');

  it('builds the rows with buildApprovalRows and renders them in that order', () => {
    expect(page).toContain("from '../../../lib/wallet/approvals/sort'");
    expect(page).toContain('buildApprovalRows(selection.active, known)');
    expect(page).toContain('{rows.map((row) => (');
  });

  it('has no sorting logic of its own', () => {
    expect(page).not.toMatch(/\.sort\(/);
    expect(page).not.toContain('toSorted');
  });

  it('no longer works out findings inside the row component', () => {
    expect(page).not.toContain('assessApproval');
  });

  it('leaves the "couldn\'t check" list exactly as it was, unsorted', () => {
    expect(page).toContain('{selection.couldNotCheck.map((item) => (');
    expect(page).not.toMatch(/couldNotCheck[^\n]*sort/);
  });
});
