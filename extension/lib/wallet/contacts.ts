import { browser } from 'wxt/browser';
import { getAddress, isAddress } from 'viem';
import { normalizeAccountName } from './accounts';
import { findLookalike, type KnownAddress, type LookalikeMatch } from './lookalike';

export const CONTACTS_KEY = 'nerafi.contacts';
export const MAX_CONTACTS = 100;

export type Contact = {
  address: string;
  name: string;
  addedAt: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function parseContact(value: unknown): Contact | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, ['address', 'name', 'addedAt'])) return null;
  if (typeof value.address !== 'string' || !isAddress(value.address)) return null;
  if (typeof value.name !== 'string') return null;
  const nameResult = normalizeAccountName(value.name);
  if (!nameResult.ok || nameResult.name !== value.name) return null;
  if (typeof value.addedAt !== 'number' || !Number.isFinite(value.addedAt)) return null;
  return { address: getAddress(value.address), name: nameResult.name, addedAt: value.addedAt };
}

// Strict: any unknown key, wrong type, invalid address or duplicate address
// (case-insensitive) rejects the whole stored value, which then reads as empty.
export function parseContacts(value: unknown): Contact[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_CONTACTS) return null;
  const contacts: Contact[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const contact = parseContact(item);
    if (contact === null) return null;
    const key = contact.address.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    contacts.push(contact);
  }
  return contacts;
}

export async function loadContacts(): Promise<Contact[]> {
  const stored = await browser.storage.local.get(CONTACTS_KEY);
  return parseContacts(stored[CONTACTS_KEY]) ?? [];
}

export async function saveContacts(contacts: Contact[]): Promise<void> {
  await browser.storage.local.set({ [CONTACTS_KEY]: contacts });
}

export type ContactLookup = {
  own: Array<{ address: string; name: string }>;
  existing: Contact[];
  known: KnownAddress[];
};

export type NewContactResult =
  | { status: 'ok'; address: string }
  | { status: 'lookalike'; address: string; match: LookalikeMatch }
  | { status: 'error'; error: string };

export function checkNewContact(addressInput: string, lookup: ContactLookup): NewContactResult {
  const trimmed = addressInput.trim();
  if (trimmed.length === 0) return { status: 'error', error: 'Enter an address.' };
  if (!isAddress(trimmed, { strict: false })) {
    return { status: 'error', error: 'That is not a valid Ethereum address.' };
  }
  if (!isAddress(trimmed)) {
    return { status: 'error', error: 'This address has a checksum error — check it for typos.' };
  }
  const address = getAddress(trimmed);
  const lower = address.toLowerCase();

  const own = lookup.own.find((item) => item.address.toLowerCase() === lower);
  if (own !== undefined) return { status: 'error', error: `This is your ${own.name}.` };

  const duplicate = lookup.existing.find((item) => item.address.toLowerCase() === lower);
  if (duplicate !== undefined) {
    return { status: 'error', error: 'This address is already in your address book.' };
  }

  const match = findLookalike(address, lookup.known);
  if (match !== null) return { status: 'lookalike', address, match };
  return { status: 'ok', address };
}

export type AddContactResult =
  | { ok: true; contact: Contact; contacts: Contact[] }
  | { ok: false; error: string };

export async function addContact(
  address: string,
  rawName: string,
  now: number = Date.now(),
): Promise<AddContactResult> {
  const nameResult = normalizeAccountName(rawName);
  if (!nameResult.ok) return { ok: false, error: nameResult.error };
  if (!isAddress(address)) return { ok: false, error: 'That is not a valid Ethereum address.' };

  const current = await loadContacts();
  const lower = address.toLowerCase();
  const replacing = current.some((item) => item.address.toLowerCase() === lower);
  if (!replacing && current.length >= MAX_CONTACTS) {
    return { ok: false, error: `Your address book is full (${MAX_CONTACTS} contacts).` };
  }
  const contact: Contact = {
    address: getAddress(address),
    name: nameResult.name,
    addedAt: now,
  };
  const contacts = [...current.filter((item) => item.address.toLowerCase() !== lower), contact];
  await saveContacts(contacts);
  return { ok: true, contact, contacts };
}

export async function renameContact(
  address: string,
  rawName: string,
): Promise<{ ok: true; contact: Contact; contacts: Contact[] } | { ok: false; error: string }> {
  const nameResult = normalizeAccountName(rawName);
  if (!nameResult.ok) return { ok: false, error: nameResult.error };

  const current = await loadContacts();
  const lower = address.trim().toLowerCase();
  const existing = current.find((item) => item.address.toLowerCase() === lower);
  if (existing === undefined) return { ok: false, error: 'That contact is not available.' };

  const contact: Contact = { ...existing, name: nameResult.name };
  const contacts = current.map((item) =>
    item.address.toLowerCase() === lower ? contact : item,
  );
  await saveContacts(contacts);
  return { ok: true, contact, contacts };
}

export async function removeContact(address: string): Promise<Contact[]> {
  const current = await loadContacts();
  const lower = address.trim().toLowerCase();
  const contacts = current.filter((item) => item.address.toLowerCase() !== lower);
  await saveContacts(contacts);
  return contacts;
}
