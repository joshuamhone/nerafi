import { describe, expect, it } from 'vitest';
import { buildKnown, canSign, classifyRecipient } from './recipientSafety';
import type { RecipientInfo } from './recipientSafety';
import type { Contact } from './contacts';
import type { SentRecipient } from './sentRecipients';
import type { SessionAccount, StoredAccount } from './accounts';

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

function classify(candidate: string, sent: string[]): RecipientInfo {
  const sentRecipients: SentRecipient[] = sent.map((address) => ({ address, lastSentAt: 1 }));
  const known = buildKnown(session, accounts, contacts, sentRecipients);
  return classifyRecipient(candidate, known, contacts);
}

describe('classification order: lookalike outranks sent before', () => {
  it('(a) a sent recipient that resembles a contact is a lookalike, not sent', () => {
    const poison = lookalikeOf(CONTACT);
    const info = classify(poison, [poison]);
    expect(info.kind).toBe('lookalike');
    if (info.kind === 'lookalike') expect(info.match.known.label).toBe('Alice');
  });

  it('(b) a sent recipient that resembles a verified own account is a lookalike', () => {
    const poison = lookalikeOf(OWN);
    const info = classify(poison, [poison]);
    expect(info.kind).toBe('lookalike');
    if (info.kind === 'lookalike') expect(info.match.known.label).toBe('Main');
  });

  it('(c) two sent recipients that look alike are each a lookalike of the other', () => {
    const first = OTHER;
    const second = lookalikeOf(OTHER);
    const a = classify(first, [first, second]);
    const b = classify(second, [first, second]);
    expect(a.kind).toBe('lookalike');
    expect(b.kind).toBe('lookalike');
    if (a.kind === 'lookalike') expect(a.match.known.address).toBe(second);
    if (b.kind === 'lookalike') expect(b.match.known.address).toBe(first);
  });

  it('(d) a sent recipient that resembles nothing is still sent', () => {
    expect(classify(OTHER, [OTHER])).toEqual({ kind: 'sent' });
  });

  it('(e) an exact contact match is still a contact', () => {
    const info = classify(CONTACT, [CONTACT]);
    expect(info).toEqual({ kind: 'contact', name: 'Alice', addedAt: 5 });
  });

  it('an exact own-account match is still your account', () => {
    expect(classify(OWN, [OWN])).toEqual({ kind: 'own', name: 'Main' });
  });
});

describe('canSign', () => {
  const lookalike = classify(lookalikeOf(CONTACT), []);

  it('is false for a lookalike that has not been acknowledged', () => {
    expect(lookalike.kind).toBe('lookalike');
    expect(canSign(lookalike, false)).toBe(false);
  });

  it('is true for a lookalike that has been acknowledged', () => {
    expect(canSign(lookalike, true)).toBe(true);
  });

  it('is true for every other classification, acknowledged or not', () => {
    const others: Array<RecipientInfo | null> = [
      { kind: 'own', name: 'Main' },
      { kind: 'contact', name: 'Alice', addedAt: 1 },
      { kind: 'sent' },
      { kind: 'unknown' },
      null,
    ];
    for (const info of others) {
      expect(canSign(info, false)).toBe(true);
      expect(canSign(info, true)).toBe(true);
    }
  });
});
