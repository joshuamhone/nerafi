import { describe, expect, it } from 'vitest';
import { activityCounterpartyInfo, buildKnown } from './recipientSafety';
import type { Contact } from './contacts';
import type { SentRecipient } from './sentRecipients';
import type { SessionAccount, StoredAccount } from './accounts';
import type { ActivityItem } from './history/types';

const OWN = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const CONTACT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const OTHER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

// Same first and last five hex characters as the base address, different middle.
function lookalikeOf(address: string): string {
  const body = address.slice(2).toLowerCase();
  const middle = body.slice(5, -5).replace(/./g, (c) => (c === '0' ? '1' : '0'));
  return `0x${body.slice(0, 5)}${middle}${body.slice(-5)}`;
}

const accounts: StoredAccount[] = [{ index: 0, name: 'Main', address: OWN }];
const session: SessionAccount[] = [{ index: 0, address: OWN }];
const contacts: Contact[] = [{ address: CONTACT, name: 'Alice', addedAt: 5 }];

function incoming(from: string): ActivityItem {
  return {
    hash: `0x${'1'.repeat(64)}`,
    from,
    to: OWN,
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
    source: 'explorer',
  };
}

function infoFor(from: string, sent: string[]) {
  const sentRecipients: SentRecipient[] = sent.map((address) => ({ address, lastSentAt: 1 }));
  const known = buildKnown(session, accounts, contacts, sentRecipients);
  return activityCounterpartyInfo(incoming(from), known);
}

describe('activity counterparty: lookalike outranks sent before', () => {
  it('(a) a sent sender that looks like a contact is flagged, not named as trusted', () => {
    const poison = lookalikeOf(CONTACT);
    const info = infoFor(poison, [poison]);
    expect(info.poisoning).not.toBeNull();
    expect(info.poisoning?.known.label).toBe('Alice');
    expect(info.poisoning?.known.address).toBe(CONTACT);
    expect(info.name).toBeNull();
  });

  it('(b) a sender that exactly matches a contact shows the contact name, no warning', () => {
    const info = infoFor(CONTACT, [CONTACT]);
    expect(info.name).toBe('Alice');
    expect(info.poisoning).toBeNull();
  });

  it('(c) a sent sender that resembles nothing has no warning and no trusted name', () => {
    // The activity annotation has no "sent before" label of its own: a sent
    // sender is simply unflagged and gets no account/contact name.
    const info = infoFor(OTHER, [OTHER]);
    expect(info.poisoning).toBeNull();
    expect(info.name).toBeNull();
  });

  it('(d) a sender that looks like a verified own account is flagged naming it', () => {
    const info = infoFor(lookalikeOf(OWN), []);
    expect(info.poisoning).not.toBeNull();
    expect(info.poisoning?.known.label).toBe('Main');
    expect(info.name).toBeNull();
  });
});
