import { describe, expect, it } from 'vitest';
import { acknowledgementLabel, canSignReport, hasDanger, NO_WARNINGS_TEXT } from './gate';
import { canSign } from '../recipientSafety';
import { assessTransaction } from './assess';
import type { RiskInput } from './assess';
import type { Finding, RiskReport } from './types';

function finding(id: string, severity: Finding['severity'], title = id): Finding {
  return { id, severity, title, explanation: 'x', action: 'y' };
}

function report(findings: Finding[]): RiskReport {
  const level = findings.some((f) => f.severity === 'danger')
    ? 'danger'
    : findings.some((f) => f.severity === 'caution')
      ? 'caution'
      : findings.length > 0
        ? 'info'
        : 'none';
  return { findings, level, checksRun: [], checksFailed: [] };
}

describe('canSignReport', () => {
  it('blocks a danger finding that has not been acknowledged', () => {
    expect(canSignReport(report([finding('a', 'danger')]), false)).toBe(false);
  });

  it('allows a danger finding once acknowledged', () => {
    expect(canSignReport(report([finding('a', 'danger')]), true)).toBe(true);
  });

  it('allows caution and info findings without any acknowledgement', () => {
    expect(canSignReport(report([finding('a', 'caution'), finding('b', 'info')]), false)).toBe(true);
  });

  it('allows an empty report', () => {
    expect(canSignReport(report([]), false)).toBe(true);
    expect(canSignReport(report([]), true)).toBe(true);
  });

  it('blocks when any one of several findings is danger', () => {
    expect(
      canSignReport(report([finding('a', 'caution'), finding('b', 'danger')]), false),
    ).toBe(false);
  });
});

describe('hasDanger', () => {
  it('is true only when a danger finding exists', () => {
    expect(hasDanger(report([finding('a', 'danger')]))).toBe(true);
    expect(hasDanger(report([finding('a', 'caution')]))).toBe(false);
    expect(hasDanger(report([]))).toBe(false);
  });
});

describe('one shared acknowledgement', () => {
  const lookalikeInput: RiskInput = {
    recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    recipient: {
      kind: 'lookalike',
      match: {
        known: { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C9', label: 'Alice', kind: 'contact' },
        prefixMatch: 5,
        suffixMatch: 0,
      },
    },
    recipientCode: 'eoa',
    recipientIsListedToken: false,
    amountWei: 1n,
    feeWei: 0n,
    balanceWei: 1000n,
    isSelfSend: false,
  };

  it('the same boolean unlocks both the existing lookalike gate and the report gate', () => {
    const risk = assessTransaction(lookalikeInput);
    expect(canSign(lookalikeInput.recipient, false)).toBe(false);
    expect(canSignReport(risk, false)).toBe(false);
    expect(canSign(lookalikeInput.recipient, true)).toBe(true);
    expect(canSignReport(risk, true)).toBe(true);
  });

  it('a danger that is not a lookalike is gated by the report even though canSign allows it', () => {
    const risk = assessTransaction({
      ...lookalikeInput,
      recipient: { kind: 'unknown' },
      recipientIsListedToken: true,
    });
    expect(canSign({ kind: 'unknown' }, false)).toBe(true);
    expect(canSignReport(risk, false)).toBe(false);
  });
});

describe('acknowledgementLabel', () => {
  it('keeps the original sentence when the only danger is a lookalike recipient', () => {
    const r = report([finding('lookalike_recipient', 'danger', 'T')]);
    expect(acknowledgementLabel(r, 'Alice')).toBe(
      'I have checked every character. This is not Alice.',
    );
  });

  it('names the danger otherwise', () => {
    const r = report([finding('burn_address', 'danger', 'This is a burn address')]);
    expect(acknowledgementLabel(r, null)).toContain('This is a burn address');
  });

  it('names every danger when there are several', () => {
    const r = report([
      finding('lookalike_recipient', 'danger', 'Looks like one you know'),
      finding('burn_address', 'danger', 'This is a burn address'),
    ]);
    const label = acknowledgementLabel(r, 'Alice');
    expect(label).toContain('Looks like one you know');
    expect(label).toContain('This is a burn address');
  });

  it('is empty when there is no danger', () => {
    expect(acknowledgementLabel(report([finding('a', 'caution')]), null)).toBe('');
  });
});

describe('copy', () => {
  it('the no-warnings sentence is exact and makes no safety claim', () => {
    expect(NO_WARNINGS_TEXT).toBe('No warnings found. This is not a guarantee.');
  });
});
