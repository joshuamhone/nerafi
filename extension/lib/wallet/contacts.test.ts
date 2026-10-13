import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addContact,
  checkNewContact,
  CONTACTS_KEY,
  loadContacts,
  MAX_CONTACTS,
  parseContact,
  parseContacts,
  removeContact,
  renameContact,
} from './contacts';
import type { KnownAddress } from './lookalike';

const A0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const A1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const A3 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

const LOWERCASE_CHECKSUM_BREAK = '0xf39fd6e51aad88F6F4ce6aB8827279cffFb92266';

const known: KnownAddress[] = [{ address: A0, label: 'Account 1', kind: 'account' }];

beforeEach(() => {
  fakeBrowser.reset();
});

describe('parseContact', () => {
  it('accepts a well-formed contact and checksums the address', () => {
    const parsed = parseContact({ address: A0.toLowerCase(), name: 'Bob', addedAt: 5 });
    expect(parsed).toEqual({ address: A0, name: 'Bob', addedAt: 5 });
  });

  it('rejects unknown keys, wrong types and unnormalized names', () => {
    expect(parseContact({ address: A0, name: 'Bob', addedAt: 5, extra: 1 })).toBeNull();
    expect(parseContact({ address: 'nope', name: 'Bob', addedAt: 5 })).toBeNull();
    expect(parseContact({ address: A0, name: ' Bob ', addedAt: 5 })).toBeNull();
    expect(parseContact({ address: A0, name: 'Bob', addedAt: 'x' })).toBeNull();
    expect(parseContact({ address: A0, name: 'Bob' })).toBeNull();
  });

  it('rejects names that the account-name rules forbid', () => {
    expect(parseContact({ address: A0, name: '', addedAt: 5 })).toBeNull();
    expect(parseContact({ address: A0, name: 'a'.repeat(33), addedAt: 5 })).toBeNull();
    expect(parseContact({ address: A0, name: 'Bo\u0007b', addedAt: 5 })).toBeNull();
  });
});

describe('parseContacts', () => {
  it('accepts an empty list and a valid list', () => {
    expect(parseContacts([])).toEqual([]);
    expect(parseContacts([{ address: A0, name: 'Bob', addedAt: 5 }])).toHaveLength(1);
  });

  it('rejects the whole value on any invalid entry', () => {
    expect(parseContacts([{ address: A0, name: 'Bob', addedAt: 5 }, { address: 'x' }])).toBeNull();
  });

  it('rejects duplicate addresses case-insensitively', () => {
    const list = [
      { address: A0, name: 'Bob', addedAt: 5 },
      { address: A0.toLowerCase(), name: 'Alice', addedAt: 6 },
    ];
    expect(parseContacts(list)).toBeNull();
  });

  it('rejects an over-full list and non-arrays', () => {
    expect(parseContacts(Array.from({ length: MAX_CONTACTS + 1 }, () => null))).toBeNull();
    expect(parseContacts('nope')).toBeNull();
  });
});

describe('loadContacts', () => {
  it('reads an empty list when nothing is stored', async () => {
    expect(await loadContacts()).toEqual([]);
  });

  it('reads an empty list for a malformed stored value', async () => {
    await fakeBrowser.storage.local.set({ [CONTACTS_KEY]: 'not-an-array' });
    expect(await loadContacts()).toEqual([]);
  });
});

describe('addContact', () => {
  it('stores a contact and returns the updated list', async () => {
    const result = await addContact(A0, '  Bob  ', 1_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.contact).toEqual({ address: A0, name: 'Bob', addedAt: 1_000 });
    expect(await loadContacts()).toEqual([{ address: A0, name: 'Bob', addedAt: 1_000 }]);
  });

  it('replaces an existing address rather than duplicating it', async () => {
    await addContact(A0, 'Bob', 1_000);
    await addContact(A0, 'Bobby', 2_000);
    expect(await loadContacts()).toEqual([{ address: A0, name: 'Bobby', addedAt: 2_000 }]);
  });

  it('rejects an invalid name', async () => {
    const result = await addContact(A0, '', 1_000);
    expect(result.ok).toBe(false);
  });
});

describe('renameContact', () => {
  it('renames a stored contact', async () => {
    await addContact(A0, 'Bob', 1_000);
    const result = await renameContact(A0, 'Robert');
    expect(result.ok).toBe(true);
    expect(await loadContacts()).toEqual([{ address: A0, name: 'Robert', addedAt: 1_000 }]);
  });

  it('reports an unknown contact', async () => {
    const result = await renameContact(A1, 'Robert');
    expect(result.ok).toBe(false);
  });
});

describe('removeContact', () => {
  it('removes a stored contact', async () => {
    await addContact(A0, 'Bob', 1_000);
    await addContact(A3, 'Carol', 2_000);
    const contacts = await removeContact(A0);
    expect(contacts).toEqual([{ address: A3, name: 'Carol', addedAt: 2_000 }]);
  });
});

describe('checkNewContact', () => {
  const base = { own: [{ address: A0, name: 'Account 1' }], existing: [], known };

  it('rejects an empty or invalid address', () => {
    expect(checkNewContact('', base)).toEqual({ status: 'error', error: 'Enter an address.' });
    expect(checkNewContact('nope', base).status).toBe('error');
  });

  it('reports a checksum error for a mixed-case address', () => {
    const result = checkNewContact(LOWERCASE_CHECKSUM_BREAK, base);
    expect(result).toEqual({
      status: 'error',
      error: 'This address has a checksum error — check it for typos.',
    });
  });

  it('rejects our own account', () => {
    expect(checkNewContact(A0, base)).toEqual({
      status: 'error',
      error: 'This is your Account 1.',
    });
  });

  it('rejects a duplicate', () => {
    const result = checkNewContact(A1, {
      ...base,
      existing: [{ address: A1, name: 'Bob', addedAt: 1 }],
    });
    expect(result).toEqual({
      status: 'error',
      error: 'This address is already in your address book.',
    });
  });

  it('flags a lookalike of a known address', () => {
    const near = '0xf39fd6e51aad88f6f4ce7ab8827279cfffb92266';
    const result = checkNewContact(near, base);
    expect(result.status).toBe('lookalike');
  });

  it('accepts a fresh address', () => {
    expect(checkNewContact(A3, base)).toEqual({ status: 'ok', address: A3 });
  });
});
