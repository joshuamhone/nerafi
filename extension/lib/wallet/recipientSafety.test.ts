import { describe, expect, it } from 'vitest';
import {
  activityCounterpartyInfo,
  buildKnown,
  classifyRecipient,
} from './recipientSafety';
import type { Contact } from './contacts';
import type { KnownAddress } from './lookalike';
import type { SentRecipient } from './sentRecipients';
import type { SessionAccount, StoredAccount } from './accounts';
import type { ActivityItem } from './history/types';

const A0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const A1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const A2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const A3 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

const NEAR_A1 = '0x70997970c51812dc3a011c7d01b50e0d17dc79c8';

function makeItem(overrides: Partial<ActivityItem>): ActivityItem {
  return {
    hash: `0x${'1'.repeat(64)}`,
    from: A0,
    to: null,
    createdContract: null,
    valueWei: 0n,
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
    source: 'local',
    ...overrides,
  };
}

describe('buildKnown', () => {
  it('labels verified accounts, contacts and sent recipients', () => {
    const session: SessionAccount[] = [
      { index: 0, address: A0 },
      { index: 1, address: A1 },
    ];
    const accounts: StoredAccount[] = [
      { index: 0, name: 'Main', address: A0 },
      { index: 1, name: 'Savings', address: A1 },
    ];
    const contacts: Contact[] = [{ address: A2, name: 'Bob', addedAt: 5 }];
    const sent: SentRecipient[] = [{ address: A3, lastSentAt: 9 }];

    expect(buildKnown(session, accounts, contacts, sent)).toEqual([
      { address: A0, label: 'Main', kind: 'account' },
      { address: A1, label: 'Savings', kind: 'account' },
      { address: A2, label: 'Bob', kind: 'contact' },
      { address: A3, label: 'an address you have sent to before', kind: 'sent' },
    ]);
  });

  it('falls back to a default name when a verified account has no stored name', () => {
    const known = buildKnown([{ index: 2, address: A2 }], [], [], []);
    expect(known).toEqual([{ address: A2, label: 'Account 3', kind: 'account' }]);
  });
});

describe('classifyRecipient', () => {
  const known: KnownAddress[] = [
    { address: A0, label: 'Account 1', kind: 'account' },
    { address: A1, label: 'Bob', kind: 'contact' },
    { address: A2, label: 'an address you have sent to before', kind: 'sent' },
  ];
  const contacts: Contact[] = [{ address: A1, name: 'Bob', addedAt: 5 }];

  it('classifies our own account', () => {
    expect(classifyRecipient(A0.toLowerCase(), known, contacts)).toEqual({
      kind: 'own',
      name: 'Account 1',
    });
  });

  it('classifies a saved contact with its saved date', () => {
    expect(classifyRecipient(A1, known, contacts)).toEqual({
      kind: 'contact',
      name: 'Bob',
      addedAt: 5,
    });
  });

  it('classifies an address we have sent to before', () => {
    expect(classifyRecipient(A2, known, contacts)).toEqual({ kind: 'sent' });
  });

  it('classifies an unknown address', () => {
    expect(classifyRecipient(A3, known, contacts)).toEqual({ kind: 'unknown' });
  });

  it('flags a lookalike, preferring an exact match when there is one', () => {
    const flagged = classifyRecipient(NEAR_A1, known, contacts);
    expect(flagged.kind).toBe('lookalike');
    if (flagged.kind !== 'lookalike') return;
    expect(flagged.match.known.address).toBe(A1);

    expect(classifyRecipient(A1, known, contacts).kind).toBe('contact');
  });
});

describe('activityCounterpartyInfo', () => {
  const known: KnownAddress[] = [
    { address: A0, label: 'Account 1', kind: 'account' },
    { address: A1, label: 'Bob', kind: 'contact' },
  ];

  it('names an incoming counterparty that is known', () => {
    const info = activityCounterpartyInfo(makeItem({ direction: 'in', from: A1 }), known);
    expect(info).toEqual({ name: 'Bob', poisoning: null });
  });

  it('flags an incoming sender that looks like a known address', () => {
    const info = activityCounterpartyInfo(makeItem({ direction: 'in', from: NEAR_A1 }), known);
    expect(info.name).toBeNull();
    expect(info.poisoning?.known.address).toBe(A1);
  });

  it('does not flag outgoing transactions', () => {
    const info = activityCounterpartyInfo(
      makeItem({ direction: 'out', from: A0, to: NEAR_A1 }),
      known,
    );
    expect(info.poisoning).toBeNull();
  });

  it('names an outgoing recipient that is a contact', () => {
    const info = activityCounterpartyInfo(makeItem({ direction: 'out', from: A0, to: A1 }), known);
    expect(info).toEqual({ name: 'Bob', poisoning: null });
  });

  it('names our own account on a self transfer', () => {
    const info = activityCounterpartyInfo(
      makeItem({ direction: 'self', from: A0, to: A0 }),
      known,
    );
    expect(info).toEqual({ name: 'Account 1', poisoning: null });
  });

  it('handles a contract creation with no recipient', () => {
    const info = activityCounterpartyInfo(
      makeItem({ direction: 'out', from: A0, to: null, isContractCall: false }),
      known,
    );
    expect(info).toEqual({ name: null, poisoning: null });
  });
});
