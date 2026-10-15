import { describe, expect, it } from 'vitest';
import {
  assessWallet,
  AUTO_LOCK_LONG_MINUTES,
  DAY_MS,
  DEV_BUILD_NOTE,
  devBuildNoteFor,
  FAILED_UNLOCK_CAUTION_COUNT,
  PERMISSIONS_OK_TEXT,
  permissionsAreMinimal,
} from './posture';
import type { PostureInput } from './posture';
import type { FeedItem, TokenTransferItem, ActivityItem } from '../history/types';
import type { KnownAddress } from '../lookalike';
import type { SecurityLogEntry } from '../securityLog';
import type { Token } from '../tokens';

const NOW = 1_800_000_000_000;
const OWN = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const KNOWN = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const LISTED = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const OTHER_TOKEN = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const SPAMMER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

const known: KnownAddress[] = [{ address: KNOWN, label: 'Alice', kind: 'contact' }];
const listedToken: Token = {
  address: LISTED,
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  addedAt: 1,
};

function tokenIn(overrides: Partial<TokenTransferItem>): TokenTransferItem {
  return {
    kind: 'token',
    hash: `0x${'1'.repeat(64)}`,
    logIndex: 1,
    from: SPAMMER,
    to: OWN,
    tokenAddress: LISTED,
    tokenSymbol: 'USDC',
    tokenName: 'USD Coin',
    decimals: 6,
    value: 5n,
    timestamp: 1,
    blockNumber: null,
    direction: 'in',
    explorerFlags: { counterpartyScam: false, counterpartyReputation: null },
    source: 'explorer',
    ...overrides,
  };
}

function txIn(from: string): ActivityItem {
  return {
    hash: `0x${'2'.repeat(64)}`,
    from,
    to: OWN,
    createdContract: null,
    valueWei: 1n,
    feeWei: null,
    status: 'confirmed',
    errorMessage: null,
    timestamp: 1,
    blockNumber: null,
    nonce: null,
    direction: 'in',
    isContractCall: false,
    method: null,
    explorerFlags: { counterpartyScam: false, counterpartyReputation: null },
    source: 'explorer',
  };
}

const base: PostureInput = {
  autoLockMinutes: 15,
  securityLog: [],
  now: NOW,
  loadedActivity: [],
  known,
  tokens: [listedToken],
  manifest: { permissions: ['storage'] },
};

function run(overrides: Partial<PostureInput>) {
  return assessWallet({ ...base, ...overrides });
}

function ids(overrides: Partial<PostureInput>): string[] {
  return run(overrides).findings.map((f) => f.id);
}

function failedAt(at: number): SecurityLogEntry {
  return { type: 'unlock_failed', at };
}

describe('auto_lock_long', () => {
  it('fires as caution above 30 minutes', () => {
    const report = run({ autoLockMinutes: 60 });
    expect(report.findings.find((f) => f.id === 'auto_lock_long')?.severity).toBe('caution');
  });

  it('does not fire at 30 minutes or less', () => {
    expect(AUTO_LOCK_LONG_MINUTES).toBe(30);
    expect(ids({ autoLockMinutes: 30 })).not.toContain('auto_lock_long');
    expect(ids({ autoLockMinutes: 1 })).not.toContain('auto_lock_long');
  });
});

describe('recent_failed_unlocks', () => {
  it('does not fire with no failed attempts', () => {
    expect(ids({ securityLog: [] })).not.toContain('recent_failed_unlocks');
  });

  it('is info for one or two attempts in the last 24 hours', () => {
    const report = run({ securityLog: [failedAt(NOW - 1000), failedAt(NOW - 2000)] });
    const finding = report.findings.find((f) => f.id === 'recent_failed_unlocks');
    expect(finding?.severity).toBe('info');
    expect(finding?.title).toContain('2 failed password attempts');
  });

  it('is caution at three or more', () => {
    expect(FAILED_UNLOCK_CAUTION_COUNT).toBe(3);
    const log = [failedAt(NOW - 1), failedAt(NOW - 2), failedAt(NOW - 3)];
    expect(run({ securityLog: log }).findings.find((f) => f.id === 'recent_failed_unlocks')?.severity).toBe('caution');
  });

  it('ignores attempts older than 24 hours, other event types, and counts the boundary', () => {
    const log: SecurityLogEntry[] = [
      failedAt(NOW - DAY_MS - 1),
      { type: 'unlock', at: NOW - 10 },
      { type: 'lockout_started', at: NOW - 10 },
    ];
    expect(ids({ securityLog: log })).not.toContain('recent_failed_unlocks');
    expect(ids({ securityLog: [failedAt(NOW - DAY_MS)] })).toContain('recent_failed_unlocks');
  });

  it('uses the singular for one attempt', () => {
    const report = run({ securityLog: [failedAt(NOW - 5)] });
    expect(report.findings.find((f) => f.id === 'recent_failed_unlocks')?.title).toContain(
      '1 failed password attempt in',
    );
  });
});

describe('zero_value_inbound', () => {
  it('fires as caution and counts incoming zero-value token transfers', () => {
    const activity: FeedItem[] = [tokenIn({ value: 0n }), tokenIn({ value: 0n, logIndex: 2 })];
    const finding = run({ loadedActivity: activity }).findings.find((f) => f.id === 'zero_value_inbound');
    expect(finding?.severity).toBe('caution');
    expect(finding?.title).toContain('2 incoming zero-value token transfers');
  });

  it('does not fire for outgoing zero-value, or for incoming with value', () => {
    expect(
      ids({ loadedActivity: [tokenIn({ value: 0n, direction: 'out' }), tokenIn({ value: 5n })] }),
    ).not.toContain('zero_value_inbound');
  });
});

describe('lookalike_senders', () => {
  const lookalikeSender = '0x70997970C51812dc3A010C7d01b50e0d17dc79C9';

  it('fires as caution for an incoming sender that resembles a known address', () => {
    const report = run({ loadedActivity: [txIn(lookalikeSender)] });
    const finding = report.findings.find((f) => f.id === 'lookalike_senders');
    expect(finding?.severity).toBe('caution');
    expect(finding?.title).toContain('1 incoming sender looks like');
  });

  it('counts each sender once', () => {
    const report = run({ loadedActivity: [txIn(lookalikeSender), txIn(lookalikeSender)] });
    expect(report.findings.find((f) => f.id === 'lookalike_senders')?.title).toContain('1 incoming');
  });

  it('does not fire for the known address itself, an unrelated sender, or outgoing items', () => {
    expect(ids({ loadedActivity: [txIn(KNOWN), txIn(SPAMMER)] })).not.toContain('lookalike_senders');
    expect(
      ids({ loadedActivity: [{ ...txIn(lookalikeSender), direction: 'out', from: OWN, to: lookalikeSender }] }),
    ).not.toContain('lookalike_senders');
  });
});

describe('token_symbol_clash', () => {
  it('fires as caution when two listed tokens share a symbol', () => {
    const clash: Token = { ...listedToken, address: OTHER_TOKEN };
    const report = run({ tokens: [listedToken, clash] });
    expect(report.findings.find((f) => f.id === 'token_symbol_clash')?.severity).toBe('caution');
  });

  it('does not fire for distinct symbols or an empty list', () => {
    expect(ids({ tokens: [listedToken, { ...listedToken, address: OTHER_TOKEN, symbol: 'DAI' }] })).not.toContain('token_symbol_clash');
    expect(ids({ tokens: [] })).not.toContain('token_symbol_clash');
  });
});

describe('unlisted_tokens_received', () => {
  it('fires as info and counts distinct unlisted contracts that sent to you', () => {
    const activity: FeedItem[] = [
      tokenIn({ tokenAddress: OTHER_TOKEN }),
      tokenIn({ tokenAddress: OTHER_TOKEN, logIndex: 2 }),
      tokenIn({ tokenAddress: SPAMMER, logIndex: 3 }),
    ];
    const finding = run({ loadedActivity: activity }).findings.find((f) => f.id === 'unlisted_tokens_received');
    expect(finding?.severity).toBe('info');
    expect(finding?.title).toContain('2 unlisted tokens have sent to you');
  });

  it('does not fire for listed tokens, outgoing transfers, or no activity', () => {
    expect(ids({ loadedActivity: [tokenIn({ tokenAddress: LISTED })] })).not.toContain('unlisted_tokens_received');
    expect(ids({ loadedActivity: [tokenIn({ tokenAddress: OTHER_TOKEN, direction: 'out' })] })).not.toContain('unlisted_tokens_received');
  });
});

describe('history-based checks when Activity is not loaded', () => {
  it('skips them and says so, rather than reporting them as clear', () => {
    const report = run({ loadedActivity: null });
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0]).toContain('Activity has not been loaded');
    const found = report.findings.map((f) => f.id);
    for (const id of ['zero_value_inbound', 'lookalike_senders', 'unlisted_tokens_received']) {
      expect(found).not.toContain(id);
    }
  });

  it('runs them, with nothing skipped, once Activity is loaded', () => {
    expect(run({ loadedActivity: [] }).skipped).toEqual([]);
  });
});

describe('permissions check', () => {
  it('reports the plain minimal statement for exactly ["storage"] and no hosts', () => {
    const report = run({ manifest: { permissions: ['storage'] } });
    const finding = report.findings.find((f) => f.id === 'permissions_minimal');
    expect(finding?.severity).toBe('info');
    expect(finding?.explanation).toBe(PERMISSIONS_OK_TEXT);
    expect(finding?.explanation).toBe(
      'This extension can only use browser storage. It has no access to websites.',
    );
    expect(report.findings.map((f) => f.id)).not.toContain('permissions_expanded');
  });

  it('accepts an empty host_permissions list', () => {
    expect(permissionsAreMinimal({ permissions: ['storage'], host_permissions: [] })).toBe(true);
  });

  it('is danger for an extra permission', () => {
    for (const permissions of [['storage', 'tabs'], ['tabs'], [], ['storage', 'storage']]) {
      const report = run({ manifest: { permissions } });
      expect(report.findings.find((f) => f.id === 'permissions_expanded')?.severity).toBe('danger');
      expect(report.findings.map((f) => f.id)).not.toContain('permissions_minimal');
    }
  });

  it('is danger for any host permission', () => {
    const report = run({ manifest: { permissions: ['storage'], host_permissions: ['https://example.com/*'] } });
    expect(report.findings.find((f) => f.id === 'permissions_expanded')?.severity).toBe('danger');
  });

  it('is danger for a missing or malformed manifest, never a pass', () => {
    for (const manifest of [{}, { permissions: 'storage' }, { permissions: [1] }, { permissions: null }]) {
      expect(ids({ manifest })).toContain('permissions_expanded');
    }
    expect(ids({ manifest: { permissions: ['storage'], host_permissions: 'x' } })).toContain('permissions_expanded');
  });
});

describe('ordering, purity', () => {
  it('sorts danger first', () => {
    const report = run({
      manifest: { permissions: ['storage', 'tabs'] },
      autoLockMinutes: 60,
      securityLog: [failedAt(NOW - 1)],
    });
    expect(report.findings[0]?.severity).toBe('danger');
    const rank = { danger: 0, caution: 1, info: 2 } as const;
    const order = report.findings.map((f) => rank[f.severity]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('does not mutate a deeply frozen input and is deterministic', () => {
    const input = deepFreeze<PostureInput>({
      ...base,
      autoLockMinutes: 60,
      securityLog: [failedAt(NOW - 1)],
      loadedActivity: [tokenIn({ value: 0n }), txIn('0x70997970C51812dc3A010C7d01b50e0d17dc79C9')],
      tokens: [listedToken, { ...listedToken, address: OTHER_TOKEN }],
    });
    const first = assessWallet(input);
    expect(first).toEqual(assessWallet(input));
  });

  it('has no numeric score and never calls anything safe, secure or verified', () => {
    const report = run({
      autoLockMinutes: 60,
      securityLog: [failedAt(NOW - 1), failedAt(NOW - 2), failedAt(NOW - 3)],
      loadedActivity: [tokenIn({ value: 0n })],
      tokens: [listedToken, { ...listedToken, address: OTHER_TOKEN }],
      manifest: { permissions: ['storage', 'tabs'] },
    });
    expect(Object.keys(report).sort()).toEqual(['findings', 'skipped']);
    const text = report.findings
      .map((f) => `${f.title} ${f.explanation} ${f.action}`)
      .join(' ')
      .toLowerCase();
    for (const word of ['safe', 'secure', 'verified', 'guarantee', 'score']) {
      expect(text).not.toContain(word);
    }
  });

  it('the clean case yields only the informational permissions line', () => {
    expect(run({}).findings.map((f) => f.id)).toEqual(['permissions_minimal']);
  });
});

describe('development-build note', () => {
  it('is the exact sentence', () => {
    expect(DEV_BUILD_NOTE).toBe(
      'Development builds add extra permissions. If you are running a build made with the development server, this is expected; check a production build.',
    );
  });

  it('is shown when the permissions check fails, without changing its severity', () => {
    const report = run({ manifest: { permissions: ['storage', 'tabs', 'scripting'] } });
    expect(devBuildNoteFor(report.findings)).toBe(DEV_BUILD_NOTE);
    expect(report.findings.find((f) => f.id === 'permissions_expanded')?.severity).toBe('danger');
  });

  it('is not shown when the permissions match', () => {
    expect(devBuildNoteFor(run({}).findings)).toBeNull();
  });

  it('is not shown for unrelated findings', () => {
    expect(devBuildNoteFor(run({ autoLockMinutes: 60 }).findings)).toBeNull();
  });
});
