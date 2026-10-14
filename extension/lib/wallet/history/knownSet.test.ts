import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadFirstPages, mergeFeed } from './combined';
import { tokenIdentity } from './display';
import { parseInternalTransfersResponse, parseTokenTransfersResponse } from './transfers';
import { activityCounterpartyInfo, buildKnown } from '../recipientSafety';
import type { SessionAccount, StoredAccount } from '../accounts';
import type { Contact } from '../contacts';
import type { SentRecipient } from '../sentRecipients';

type Raw = { items: Array<Record<string, unknown>>; next_page_params: unknown };

function load(file: string): Raw {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'),
  ) as Raw;
}

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), 'utf8');
}

const OWN = '0x69ffa62060b9e425166f35789C4EeAc69EFFB37b';
const CONTACT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const SENT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

const session: SessionAccount[] = [{ index: 0, address: OWN }];
const accounts: StoredAccount[] = [{ index: 0, name: 'Main', address: OWN }];
const contacts: Contact[] = [{ address: CONTACT, name: 'Alice', addedAt: 1 }];
const sent: SentRecipient[] = [{ address: SENT, lastSentAt: 1 }];

beforeEach(() => {
  fakeBrowser.reset();
});

describe('Blockscout, internal and token data never enters the known set', () => {
  it('leaves the known set exactly as built, after parsing and merging everything', async () => {
    const before = buildKnown(session, accounts, contacts, sent);

    const tokenPage = parseTokenTransfersResponse(load('token-transfers-live.json'), OWN);
    const internalPage = parseInternalTransfersResponse(
      load('internal-transactions-live.json'),
      OWN,
    );
    await loadFirstPages({
      transactions: async () => ({ items: [], nextCursor: null, skipped: 0 }),
      internal: async () => internalPage,
      tokens: async () => tokenPage,
    });
    const merged = mergeFeed([], internalPage.items, tokenPage.items);
    for (const item of tokenPage.items) tokenIdentity(item, []);
    for (const item of merged) activityCounterpartyInfo(item, before);

    const after = buildKnown(session, accounts, contacts, sent);
    expect(after).toEqual(before);

    // None of the counterparties seen in the fetched data is in the known set.
    const known = new Set(after.map((entry) => entry.address.toLowerCase()));
    for (const item of merged) {
      const other = item.direction === 'out' ? item.to : item.from;
      if (other !== null && other.toLowerCase() !== OWN.toLowerCase()) {
        expect(known.has(other.toLowerCase())).toBe(false);
      }
    }
  });

  it('writes nothing to the address book, the sent-recipient list or the token list', async () => {
    const tokenPage = parseTokenTransfersResponse(load('token-transfers-live.json'), OWN);
    mergeFeed([], [], tokenPage.items);
    const stored = await fakeBrowser.storage.local.get(null);
    expect(Object.keys(stored)).toEqual([]);
  });

  it('a transfer from a lookalike of a known address is flagged, not trusted', () => {
    const page = parseTokenTransfersResponse(load('token-transfers-live.json'), OWN);
    const incoming = page.items.find((item) => item.direction === 'in');
    expect(incoming).toBeDefined();
    if (incoming === undefined) return;
    // Pretend the known set holds a contact that this sender resembles.
    const resembled = incoming.from.slice(0, 12) + 'f'.repeat(24) + incoming.from.slice(-6);
    const known = buildKnown(session, accounts, [{ address: resembled, name: 'Bob', addedAt: 1 }], []);
    const info = activityCounterpartyInfo(incoming, known);
    expect(info.poisoning?.known.label).toBe('Bob');
    expect(info.name).toBeNull();
    // Computing that warning did not grow the known set.
    expect(known).toHaveLength(2);
  });

  it('the history and token modules import nothing that can write the known set', () => {
    const files = [
      './blockscout.ts',
      './transfers.ts',
      './combined.ts',
      './display.ts',
      './types.ts',
      '../tokens.ts',
      '../tokenText.ts',
    ];
    const forbidden = [
      'recipientSafety',
      'contacts',
      'sentRecipients',
      'lookalike',
      'accounts',
      'recordSentRecipient',
      'addContact',
    ];
    for (const file of files) {
      const text = source(file);
      const imports = text.split('\n').filter((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line));
      for (const line of imports) {
        for (const word of forbidden) {
          expect(`${file}: ${line}`).not.toContain(`/${word}'`);
        }
      }
      expect(text).not.toContain('nerafi.contacts');
      expect(text).not.toContain('nerafi.sentRecipients');
    }
  });

  it('the token list is only ever written by tokens.ts', () => {
    const tokensSource = source('../tokens.ts');
    expect(tokensSource).toContain("'nerafi.tokens'");
    for (const file of ['./transfers.ts', './combined.ts', './display.ts']) {
      expect(source(file)).not.toContain('nerafi.tokens');
      expect(source(file)).not.toContain('addToken');
    }
  });
});
