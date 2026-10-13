import { defaultAccountName, type SessionAccount, type StoredAccount } from './accounts';
import type { Contact } from './contacts';
import { findLookalike, type KnownAddress, type LookalikeMatch } from './lookalike';
import type { SentRecipient } from './sentRecipients';
import type { ActivityItem } from './history/types';

// The only addresses allowed into the known set: our own verified accounts,
// saved contacts, and addresses we ourselves have sent to. Addresses that sent
// to us, Blockscout data and anything else from the activity feed are excluded
// on purpose — copying an address from your history is exactly how address
// poisoning works.
export function buildKnown(
  sessionAccounts: SessionAccount[],
  accounts: StoredAccount[],
  contacts: Contact[],
  sentRecipients: SentRecipient[],
): KnownAddress[] {
  const known: KnownAddress[] = [];
  for (const session of sessionAccounts) {
    const stored = accounts.find((account) => account.index === session.index);
    known.push({
      address: session.address,
      label: stored?.name ?? defaultAccountName(session.index),
      kind: 'account',
    });
  }
  for (const contact of contacts) {
    known.push({ address: contact.address, label: contact.name, kind: 'contact' });
  }
  for (const sent of sentRecipients) {
    known.push({ address: sent.address, label: 'an address you have sent to before', kind: 'sent' });
  }
  return known;
}

export type RecipientInfo =
  | { kind: 'own'; name: string }
  | { kind: 'contact'; name: string; addedAt: number }
  | { kind: 'sent' }
  | { kind: 'lookalike'; match: LookalikeMatch }
  | { kind: 'unknown' };

export function classifyRecipient(
  address: string,
  known: KnownAddress[],
  contacts: Contact[],
): RecipientInfo {
  const lower = address.trim().toLowerCase();

  const own = known.find((item) => item.kind === 'account' && item.address.toLowerCase() === lower);
  if (own !== undefined) return { kind: 'own', name: own.label };

  const contact = known.find(
    (item) => item.kind === 'contact' && item.address.toLowerCase() === lower,
  );
  if (contact !== undefined) {
    const stored = contacts.find((item) => item.address.toLowerCase() === lower);
    return { kind: 'contact', name: contact.label, addedAt: stored?.addedAt ?? 0 };
  }

  // Lookalike outranks "sent before": one acknowledged send to a poisoning
  // address must never turn it into a trusted "sent before" address. The
  // candidate is compared against every known address except entries for the
  // candidate itself (findLookalike skips an identical address), so a sent
  // recipient that resembles an account, a contact or another sent recipient is
  // a lookalike every time.
  const match = findLookalike(address, known);
  if (match !== null) return { kind: 'lookalike', match };

  const sent = known.find((item) => item.kind === 'sent' && item.address.toLowerCase() === lower);
  if (sent !== undefined) return { kind: 'sent' };

  return { kind: 'unknown' };
}

// The signing gate: a lookalike recipient cannot be signed until the user has
// acknowledged it. Kept here, not only in the UI, so confirmSend can refuse too.
export function canSign(info: RecipientInfo | null, acknowledged: boolean): boolean {
  return !(info !== null && info.kind === 'lookalike' && !acknowledged);
}

export type CounterpartyInfo = {
  name: string | null;
  poisoning: LookalikeMatch | null;
};

export function activityCounterpartyInfo(
  item: ActivityItem,
  known: KnownAddress[],
): CounterpartyInfo {
  const counterparty = item.direction === 'out' ? item.to : item.from;
  const lower = counterparty?.trim().toLowerCase() ?? null;

  let name: string | null = null;
  if (lower !== null) {
    const named = known.find(
      (entry) =>
        (entry.kind === 'account' || entry.kind === 'contact') &&
        entry.address.toLowerCase() === lower,
    );
    name = named?.label ?? null;
  }

  // Same rule as classifyRecipient: compare against every known address except
  // the sender itself, including sent recipients.
  // Only incoming transactions can be an attempted poisoning; a warning on our
  // own outgoing history would just be noise.
  const poisoning = item.direction === 'in' ? findLookalike(item.from, known) : null;

  return { name, poisoning };
}
